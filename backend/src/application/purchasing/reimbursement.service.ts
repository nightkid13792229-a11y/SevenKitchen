/**
 * Reimbursement Service
 * 报销服务
 * Phase 1: Purchasing Management Feature
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  REIMBURSEMENT_REPOSITORY,
  PURCHASE_LIST_REPOSITORY,
} from './purchasing.service.tokens';
import type { ReimbursementRepository } from '../../domain/purchasing/reimbursement.repository';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientPricingService } from '../ingredient/ingredient-pricing.service';
import { PurchaseOrderImportService } from './purchase-order-import.service';
import {
  Reimbursement,
  ReimbursementStatus,
  PurchaseList,
  PurchaseListKind,
  PurchaseListStatus,
  REIMBURSEMENT_CUSTOM_FEE_CATEGORIES,
  type ReimbursementCustomFee,
} from '../../domain/purchasing';
import { isWithinRevertWindow } from '../../domain/purchasing/reimbursement-review-window';
import { resolvePurchaseRecordBaseQuantity } from '../../domain/ingredient/unit-price';

export interface SubmitReimbursementDto {
  purchaseListIds?: string[];
  receiptUrls: string[];
  /** 私有目录里的凭证 key（订单截图），与 receiptUrls 合计 1~10 张 */
  receiptKeys?: string[];
  totalActualCost: number;
  /** 凭证金额（订单实付）；不传表示不核对差额 */
  voucherAmount?: number;
  differenceNote?: string;
  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: ReimbursementCustomFee[];
}

export interface ReviewReimbursementDto {
  decision: 'APPROVE' | 'REJECT' | 'REQUIRES_RESUBMIT';
  comment?: string;
}

/** 价格对比里的一条历史采购（折算到同一个展示单位） */
export interface PriceComparisonPoint {
  recordId: string;
  purchasedAt: string;
  procurementSkuId: string | null;
  procurementSkuName: string | null;
  productModel: string | null;
  purchaseChannelName: string | null;
  priceValue: number;
  priceText: string;
  /** 当前这条采购相对这一条历史价的涨跌；0 表示持平 */
  deltaRate: number | null;
  /** 这一行是否正好等于当前单据的「上次单价」 */
  isBaseline: boolean;
}

export interface PurchaseRecordPriceComparisonView {
  current: {
    recordId: string;
    ingredientId: string;
    ingredientName: string;
    procurementSkuId: string | null;
    procurementSkuName: string | null;
    productModel: string | null;
    purchaseChannelName: string | null;
    purchasedAt: string;
    priceValue: number;
    priceText: string;
    unitLabel: string;
    previousPriceValue: number | null;
    previousPriceText: string | null;
    deltaRate: number | null;
  };
  /** 同原料、其他商品：最近 5 条采购流水 */
  sameIngredientOthers: PriceComparisonPoint[];
  /** 同商品：最近 5 条采购流水 */
  sameSkuHistory: PriceComparisonPoint[];
}

interface PreparedReimbursementSubmission {
  purchaseLists: PurchaseList[];
  purchaseListIds: string[];
  totalEstimatedCost: number;
  normalizedCustomFees: ReimbursementCustomFee[];
  purchaseListsTotal: number;
  calculatedTotal: number;
  receiptKeys: string[];
  voucherAmount: number | null;
  differenceAmount: number | null;
}

@Injectable()
export class ReimbursementService {
  private readonly logger = new Logger(ReimbursementService.name);

  constructor(
    @Inject(REIMBURSEMENT_REPOSITORY)
    private readonly reimbursementRepository: ReimbursementRepository,
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    private readonly cosService: TencentCosService,
    private readonly ingredientPricingService: IngredientPricingService,
    private readonly purchaseOrderImportService: PurchaseOrderImportService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 记一条审核事件（2026-11-07）
   * 只追加不改写：状态会被下一次操作覆盖，事件不会。
   */
  private async recordReviewEvent(
    db: { user: any; reimbursementReviewEvent: any },
    params: {
      reimbursementId: string;
      action:
        | 'SUBMIT'
        | 'RESUBMIT'
        | 'APPROVE'
        | 'REJECT'
        | 'REQUIRE_RESUBMIT'
        | 'REVERT';
      actorId?: string | null;
      fromStatus?: ReimbursementStatus | null;
      toStatus?: ReimbursementStatus | null;
      comment?: string | null;
    },
  ): Promise<void> {
    let actorName: string | null = null;

    if (params.actorId) {
      const actor = await db.user
        .findUnique({
          where: { id: params.actorId },
          select: { nickname: true },
        })
        .catch(() => null);
      actorName = actor?.nickname ?? null;
    }

    await db.reimbursementReviewEvent.create({
      data: {
        reimbursementId: params.reimbursementId,
        action: params.action,
        actorId: params.actorId ?? null,
        actorName,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus ?? null,
        comment: params.comment ? params.comment.slice(0, 200) : null,
      },
    });
  }

  /**
   * 生成报销单号
   * 格式: BX + YYYYMMDD + 4位流水号
   * 示例: BX20260110001
   */
  async generateClaimNumber(): Promise<string> {
    const now = new Date();
    // ISO格式日期用于查询 (YYYY-MM-DD)
    const isoDate = now.toISOString().slice(0, 10);
    // 无横杠格式用于单号 (YYYYMMDD)
    const dateString = isoDate.replace(/-/g, '');
    const prefix = `BX${dateString}`;

    // 查询今天已有的报销单数量
    const count = await this.reimbursementRepository.countByDate(isoDate);
    const sequence = String(count + 1).padStart(4, '0');

    return `${prefix}${sequence}`;
  }

  private async prepareReimbursementSubmission(
    dto: SubmitReimbursementDto,
    options?: { reimbursementId?: string },
  ): Promise<PreparedReimbursementSubmission> {
    const purchaseListIds = dto.purchaseListIds || [];

    if (new Set(purchaseListIds).size !== purchaseListIds.length) {
      throw new BadRequestException('同一采购清单不能重复提交');
    }

    // 验证发票照片：公开 URL + 私有 key 合计 1~10 张
    const receiptKeys = (dto.receiptKeys || []).map((key) => key.trim()).filter(Boolean);
    const receiptCount = dto.receiptUrls.length + receiptKeys.length;
    if (receiptCount === 0) {
      throw new BadRequestException('至少需要一张发票照片');
    }
    if (receiptCount > 10) {
      throw new BadRequestException('最多只能上传10张发票照片');
    }

    if (dto.totalActualCost <= 0) {
      throw new BadRequestException('实际采购总额必须大于0');
    }

    // 私有凭证必须来自这些清单下已确认的订单截图，不能拿任意 COS key。
    if (receiptKeys.length > 0) {
      const allowed =
        await this.purchaseOrderImportService.getAllowedReceiptKeys(
          purchaseListIds,
        );
      const invalid = receiptKeys.filter((key) => !allowed.has(key));
      if (invalid.length > 0) {
        throw new BadRequestException(
          '有凭证图片不属于本次采购清单的订单截图，请重新提交',
        );
      }
    }

    // 查询所有采购清单（如果有）
    const purchaseLists: PurchaseList[] = [];
    let totalEstimatedCost = 0;

    for (const listId of purchaseListIds) {
      const list = await this.purchaseListRepository.findById(listId);
      if (!list) {
        throw new BadRequestException(`未找到采购清单：${listId}`);
      }

      // 验证采购清单状态
      if (list.status !== PurchaseListStatus.COMPLETED) {
        throw new BadRequestException(
          `采购清单 ${listId} 未完成，当前状态：${list.status}`,
        );
      }

      // 验证采购清单未被其他报销单关联
      const allowedReimbursementId = options?.reimbursementId;
      if (
        list.reimbursementId &&
        list.reimbursementId !== allowedReimbursementId
      ) {
        throw new BadRequestException(
          `采购清单 ${listId} 已关联到报销单 ${list.reimbursementId}`,
        );
      }

      purchaseLists.push(list);
      totalEstimatedCost += list.totalEstimatedCost;
    }

    // 非日采（补货/包材）不能把运费和包装费算进这条线（2026-11-04 规则）
    const hasDailyList = purchaseLists.some(
      (list) => list.kind === PurchaseListKind.ORDER_DEMAND,
    );
    const hasNonDailyList = purchaseLists.some(
      (list) => list.kind !== PurchaseListKind.ORDER_DEMAND,
    );
    if (
      hasNonDailyList &&
      (Number(dto.platformShippingFee || 0) > 0 ||
        Number(dto.platformPackagingFee || 0) > 0)
    ) {
      if (!hasDailyList) {
        throw new BadRequestException(
          '补货/包材清单不能填运费和包装费，请只记商品金额',
        );
      }
    }

    // 计算采购清单总金额
    const purchaseListsTotal = purchaseLists.reduce((sum, list) => {
      const actualCost = list.totalActualCost ?? list.totalEstimatedCost;
      return sum + Number(actualCost);
    }, 0);

    const normalizedCustomFees =
      dto.customFees?.map((fee) => ({
        category: fee.category,
        description: fee.description?.trim() || undefined,
        amount: fee.amount || 0,
      })) || [];

    // 计算自定义费用总额
    const customFeesTotal = normalizedCustomFees.reduce(
      (sum, fee) => sum + (fee.amount || 0),
      0,
    );

    // 验证自定义费用数组中的每一项
    if (normalizedCustomFees.length > 0) {
      normalizedCustomFees.forEach((fee, index) => {
        if (
          fee.category &&
          !REIMBURSEMENT_CUSTOM_FEE_CATEGORIES.includes(fee.category)
        ) {
          throw new BadRequestException(
            `Custom fee at index ${index} has invalid category`,
          );
        }
        if (!fee.description && !fee.category) {
          throw new BadRequestException(
            `Custom fee at index ${index} must have a category or description`,
          );
        }
        if (fee.amount < 0) {
          throw new BadRequestException(
            `Custom fee at index ${index} has negative amount`,
          );
        }
      });
    }

    // 验证总金额
    const calculatedTotal =
      purchaseListsTotal +
      (dto.platformShippingFee || 0) +
      (dto.platformPackagingFee || 0) +
      customFeesTotal;

    if (Math.abs(dto.totalActualCost - calculatedTotal) > 0.01) {
      throw new BadRequestException(
        `报销总金额与费用明细不匹配。期望: ¥${calculatedTotal.toFixed(2)}, 实际: ¥${dto.totalActualCost.toFixed(2)}`,
      );
    }

    const claimedRounded = Math.round(Number(dto.totalActualCost) * 100) / 100;
    const voucherAmount =
      dto.voucherAmount === undefined || dto.voucherAmount === null
        ? null
        : Math.round(Number(dto.voucherAmount) * 100) / 100;
    if (voucherAmount !== null) {
      if (!Number.isFinite(voucherAmount) || voucherAmount < 0) {
        throw new BadRequestException('凭证金额无效');
      }
      if (voucherAmount < claimedRounded) {
        throw new BadRequestException(
          `报销金额（¥${claimedRounded.toFixed(2)}）不能超过凭证金额（¥${voucherAmount.toFixed(2)}）`,
        );
      }
    }
    const differenceAmount =
      voucherAmount === null
        ? null
        : Math.round((voucherAmount - claimedRounded) * 100) / 100;
    if (differenceAmount !== null && differenceAmount < 0) {
      throw new BadRequestException('差额不能为负');
    }

    this.logger.log(
      `Validated reimbursement cost details: purchaseLists=¥${purchaseListsTotal}, ` +
        `shipping=¥${dto.platformShippingFee || 0}, packaging=¥${dto.platformPackagingFee || 0}, ` +
        `custom=¥${customFeesTotal}, total=¥${dto.totalActualCost}`,
    );

    return {
      purchaseLists,
      purchaseListIds,
      totalEstimatedCost,
      normalizedCustomFees,
      purchaseListsTotal,
      calculatedTotal,
      receiptKeys,
      voucherAmount,
      differenceAmount,
    };
  }

  /**
   * 提交报销申请
   */
  async submitReimbursement(
    dto: SubmitReimbursementDto,
    submittedById: string,
  ): Promise<Reimbursement> {
    const {
      purchaseLists,
      purchaseListIds,
      totalEstimatedCost,
      normalizedCustomFees,
      receiptKeys,
      voucherAmount,
      differenceAmount,
    } = await this.prepareReimbursementSubmission(dto);

    this.logger.log(
      `Submitting reimbursement for ${purchaseListIds.length} purchase lists by user ${submittedById}`,
    );

    // 生成报销单号
    const claimNumber = await this.generateClaimNumber();

    // 创建报销单
    const reimbursement = new Reimbursement({
      claimNumber,
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: dto.totalActualCost,
      totalEstimatedCost,
      receiptUrls: dto.receiptUrls,
      receiptKeys,
      voucherAmount: voucherAmount ?? undefined,
      differenceAmount: differenceAmount ?? undefined,
      differenceNote: dto.differenceNote?.trim() || undefined,
      submittedById,
      submittedAt: new Date(),
      purchaseLists,
      // 新增字段
      platformShippingFee: dto.platformShippingFee,
      platformPackagingFee: dto.platformPackagingFee,
      customFees: normalizedCustomFees,
    });

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

    await this.ingredientPricingService.syncPendingChangesForReimbursement(
      saved.id,
      purchaseListIds,
    );
    await this.ingredientPricingService.autoApproveEligibleChangesForReimbursement(
      saved.id,
    );

    await this.recordReviewEvent(this.prisma, {
      reimbursementId: saved.id,
      action: 'SUBMIT',
      actorId: reimbursement.submittedById,
      toStatus: saved.status,
    });

    this.logger.log(
      `Reimbursement ${saved.id} (${claimNumber}) submitted successfully`,
    );

    return saved;
  }

  /**
   * 处理报销单（兼容旧审核接口）
   */
  async reviewReimbursement(
    id: string,
    reviewerId: string,
    dto: ReviewReimbursementDto,
  ): Promise<Reimbursement> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    // 验证状态
    if (reimbursement.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `只有待审核状态的报销单可以处理。当前状态：${reimbursement.status}`,
      );
    }

    // 2026-11-07：驳回 / 要求补充必须写明原因——员工要看这段说明才知道改什么
    if (dto.decision !== 'APPROVE' && !dto.comment?.trim()) {
      throw new BadRequestException(
        '驳回或要求补充时必须写明原因，员工会看到这段说明',
      );
    }

    // 2026-11-07：通过之前必须已经有报销转账凭证。
    // 手机端把「上传凭证」和「审核通过」拆成两个动作，凭证是付款的证据。
    //
    // 2026-11-08：自己的单例外——老板给自己报销时不存在「转账给自己」这件事，
    // 强求凭证等于把自己的单永久卡死。自审走留痕：备注写「本人审核通过」。
    const isSelfReview =
      !!reimbursement.submittedById &&
      reimbursement.submittedById === reviewerId;
    const hasPaymentProof = (reimbursement.paymentProofUrls?.length ?? 0) > 0;

    if (dto.decision === 'APPROVE' && !isSelfReview && !hasPaymentProof) {
      throw new BadRequestException('请先上传报销转账凭证，再审核通过');
    }

    const reviewComment =
      dto.comment?.trim() ||
      (isSelfReview && !hasPaymentProof ? '本人审核通过（无转账凭证）' : dto.comment);

    this.logger.log(
      `Reviewer ${reviewerId} reviewing reimbursement ${id} with decision: ${dto.decision}`,
    );

    const fromStatus = reimbursement.status;
    reimbursement.review(reviewerId, dto.decision, reviewComment);
    const toStatus = reimbursement.status;

    // 2026-11-07 复审：状态和价格必须一起成功/失败。
    // 以前是「先存 REIMBURSED、再应用价格」，应用失败会留下「已报销但价格没生效」。
    const saved = await this.prisma.$transaction(
      async (tx) => {
        if (dto.decision === 'APPROVE') {
          await this.ingredientPricingService.applyApprovedChangesForReimbursement(
            id,
            reviewerId,
            reviewComment,
            tx,
          );
        } else {
          await this.ingredientPricingService.rejectChangesForReimbursement(
            id,
            reviewerId,
            reviewComment,
            tx,
          );
        }

        await this.recordReviewEvent(tx, {
          reimbursementId: id,
          action:
            dto.decision === 'APPROVE'
              ? 'APPROVE'
              : dto.decision === 'REJECT'
                ? 'REJECT'
                : 'REQUIRE_RESUBMIT',
          actorId: reviewerId,
          fromStatus,
          toStatus,
          comment: reviewComment,
        });

        return this.reimbursementRepository.save(reimbursement, tx);
      },
      { timeout: 20000 },
    );

    this.logger.log(
      `Reimbursement ${id} reviewed successfully: ${dto.decision}`,
    );

    return saved;
  }

  /**
   * 撤销审核（2026-11-07）
   *
   * 已报销的单在 24 小时内可以撤销、回到待审核：
   * - 已生效的价格变更回到「待确认」，原料当前价回退；
   * - 状态回到待审核，付款凭证保留，员工端能看到「审核已撤销」；
   * - reviewedById / reviewedAt 保留，页面按「上次审核」展示，不清空痕迹。
   */
  async revertReimbursement(
    id: string,
    operatorId: string,
    comment?: string,
  ): Promise<Reimbursement> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    if (reimbursement.status !== ReimbursementStatus.REIMBURSED) {
      throw new BadRequestException(
        `只有已报销的报销单可以撤销审核。当前状态：${reimbursement.status}`,
      );
    }

    if (!reimbursement.reviewedAt) {
      throw new BadRequestException('这张报销单没有审核时间，无法撤销审核');
    }

    if (!isWithinRevertWindow(reimbursement.reviewedAt)) {
      throw new BadRequestException(
        '已超过 24 小时撤销窗口，如需修改请联系管理员处理',
      );
    }

    const fromStatus = reimbursement.status;
    const trimmedComment = comment?.trim();
    reimbursement.revertReview(
      trimmedComment ? `审核已撤销：${trimmedComment}` : '审核已撤销',
    );

    // 价格回退 + 变更复位 + 状态回退 在同一个事务里：
    // 任何一步失败都整体回滚，不会留下「价退了、单还是已报销」
    const saved = await this.prisma.$transaction(
      async (tx) => {
        await this.ingredientPricingService.revertApprovedChangesForReimbursement(
          id,
          operatorId,
          tx,
        );

        await this.recordReviewEvent(tx, {
          reimbursementId: id,
          action: 'REVERT',
          actorId: operatorId,
          fromStatus,
          toStatus: reimbursement.status,
          comment: trimmedComment ?? null,
        });

        return this.reimbursementRepository.save(reimbursement, tx);
      },
      { timeout: 20000 },
    );

    this.logger.log(
      `Reimbursement ${id} review reverted by ${operatorId} (reviewed at ${reimbursement.reviewedAt.toISOString()})`,
    );

    return saved;
  }

  /**
   * 重新提交被驳回的报销单
   */
  async resubmitReimbursement(
    id: string,
    dto: SubmitReimbursementDto,
    actorUserId?: string,
    isAdmin = false,
  ): Promise<Reimbursement> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    // 验证状态
    if (
      reimbursement.status !== ReimbursementStatus.REJECTED &&
      reimbursement.status !== ReimbursementStatus.REQUIRES_RESUBMIT
    ) {
      throw new BadRequestException(
        `只有被驳回或需要重新提交的报销单才能重新提交。当前状态：${reimbursement.status}`,
      );
    }

    if (!isAdmin && reimbursement.submittedById !== actorUserId) {
      throw new BadRequestException('只能重新提交本人创建的报销单');
    }

    if (
      dto.receiptUrls.length !== reimbursement.receiptUrls.length ||
      dto.receiptUrls.some((url, index) => reimbursement.receiptUrls[index] !== url)
    ) {
      throw new BadRequestException(
        '重新提交时请通过凭证管理单独增删凭证，不能直接替换凭证链接',
      );
    }

    this.logger.log(`Resubmitting reimbursement ${id}`);

    const {
      purchaseLists,
      purchaseListIds,
      totalEstimatedCost,
      normalizedCustomFees,
      receiptKeys: preparedReceiptKeys,
      voucherAmount,
      differenceAmount,
    } = await this.prepareReimbursementSubmission(dto, {
      reimbursementId: id,
    });

    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: dto.totalActualCost,
      totalEstimatedCost,
      receiptUrls: dto.receiptUrls,
      // 传了就用（已做白名单校验、已 trim），没传才沿用原值。
      receiptKeys:
        dto.receiptKeys !== undefined
          ? preparedReceiptKeys
          : reimbursement.receiptKeys,
      voucherAmount: voucherAmount ?? undefined,
      differenceAmount: differenceAmount ?? undefined,
      differenceNote: dto.differenceNote?.trim() || undefined,
      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists,
      platformShippingFee: dto.platformShippingFee,
      platformPackagingFee: dto.platformPackagingFee,
      customFees: normalizedCustomFees,
      paymentProofUrls: reimbursement.paymentProofUrls,
      paymentProofKeys: reimbursement.paymentProofKeys,
      submittedBy: reimbursement.submittedBy,
      reviewedBy: undefined,
    });

    // 保存报销单
    const saved =
      await this.reimbursementRepository.saveWithPurchaseListReplacement(
        updated,
      );

    await this.ingredientPricingService.syncPendingChangesForReimbursement(
      saved.id,
      purchaseListIds,
    );
    await this.ingredientPricingService.autoApproveEligibleChangesForReimbursement(
      saved.id,
    );

    await this.recordReviewEvent(this.prisma, {
      reimbursementId: saved.id,
      action: 'RESUBMIT',
      actorId: saved.submittedById,
      toStatus: saved.status,
    });

    this.logger.log(`Reimbursement ${id} resubmitted successfully`);

    return saved;
  }

  /**
   * 查询报销单列表
   */
  async getReimbursements(params: {
    status?: ReimbursementStatus;
    submittedById?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Reimbursement[]; total: number }> {
    const {
      status,
      submittedById,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = params;

    const query: any = { page, pageSize };
    if (status) query.status = status;
    if (submittedById) query.submittedById = submittedById;
    if (startDate) query.startDate = new Date(startDate);
    if (endDate) query.endDate = new Date(endDate);

    return this.reimbursementRepository.findMany(query);
  }

  /**
   * 查询报销单详情
   */
  async getReimbursementDetail(
    id: string,
    options: { requesterId?: string; isAdmin?: boolean } = {},
  ): Promise<any> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    if (
      options.requesterId &&
      !options.isAdmin &&
      reimbursement.submittedById !== options.requesterId
    ) {
      throw new ForbiddenException('只能查看自己提交的报销单');
    }

    const priceChanges =
      await this.ingredientPricingService.getPriceChangesForReimbursement(id);

    const receiptSignedUrls = await Promise.all(
      (reimbursement.receiptKeys || []).map((key) =>
        this.cosService.getSignedUrl(key, 3600).catch(() => ''),
      ),
    );

    const reviewEvents = await this.prisma.reimbursementReviewEvent.findMany({
      where: { reimbursementId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        actorId: true,
        actorName: true,
        fromStatus: true,
        toStatus: true,
        comment: true,
        createdAt: true,
      },
    });

    const view: any = { ...reimbursement, priceChanges, reviewEvents };
    view.receiptSignedUrls = receiptSignedUrls.filter(Boolean);
    // 私有对象 key 不下发：只给签名后的可看图。
    delete view.receiptKeys;
    return view;
  }

  /**
   * 一条采购记录的价格对比（2026-11-10）。
   *
   * 口径只有一条：**当前这条采购的折算价 ÷ 每一行历史价的折算价 − 1**。
   * 卡片上的「涨跌」就是它跟「上次单价」那一行的结果，
   * 所以历史里基准价那一行会算出和卡片一模一样的百分比。
   *
   * 两段各取最近 5 条：
   * - 同原料、其他商品（回答「上次单价 3.33 是哪个商品的价格」）
   * - 同商品（回答「这个商品自己有没有涨价」）
   *
   * 驳回的单据不算历史；还没关联报销单的采购记录也不算。
   */
  async getPurchaseRecordPriceComparison(
    purchaseRecordId: string,
    options: { requesterId?: string; isAdmin?: boolean } = {},
  ): Promise<PurchaseRecordPriceComparisonView> {
    const record = (await this.prisma.purchaseRecord.findUnique({
      where: { id: purchaseRecordId },
      include: {
        purchaseList: {
          select: {
            reimbursement: {
              select: { id: true, submittedById: true, status: true },
            },
          },
        },
      },
    })) as any;

    if (!record) {
      throw new NotFoundException(`未找到采购记录：${purchaseRecordId}`);
    }

    const reimbursement = record.purchaseList?.reimbursement;
    if (!reimbursement) {
      throw new BadRequestException('这条采购记录还没有关联报销单');
    }
    if (
      options.requesterId &&
      !options.isAdmin &&
      reimbursement.submittedById !== options.requesterId
    ) {
      throw new ForbiddenException('只能查看自己提交的报销单');
    }

    const ingredient = (await this.prisma.ingredient.findUnique({
      where: { id: record.ingredientId },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        purchaseUnit: true,
        unitDisplayLabel: true,
        purchaseToBaseRatio: true,
        type: true,
      },
    })) as any;

    if (!ingredient) {
      throw new BadRequestException('采购记录关联的原料不存在');
    }

    const baseUnit = `${ingredient.baseUnit || ''}`.toUpperCase();
    const scale = baseUnit === 'G' || baseUnit === 'ML' ? 500 : 1;
    const unitLabel =
      baseUnit === 'G'
        ? '500g'
        : baseUnit === 'ML'
          ? '500ml'
          : ingredient.unitDisplayLabel || ingredient.purchaseUnit || '个';

    const priceChange = (await this.prisma.ingredientPriceChange.findUnique({
      where: { purchaseRecordId: record.id },
      select: { previousEffectivePrice: true, deltaRate: true },
    })) as any;

    const rawPreviousPrice = priceChange
      ? this.toNumber(priceChange.previousEffectivePrice)
      : null;
    const ingredientRatio =
      this.toNumber(ingredient.purchaseToBaseRatio) > 0
        ? this.toNumber(ingredient.purchaseToBaseRatio)
        : 1;
    const previousPerBase =
      rawPreviousPrice !== null &&
      Number.isFinite(rawPreviousPrice) &&
      rawPreviousPrice > 0
        ? rawPreviousPrice / ingredientRatio
        : null;
    const previousPriceValue =
      previousPerBase !== null
        ? this.roundPrice(previousPerBase * scale)
        : null;
    const storedDeltaRate =
      priceChange?.deltaRate !== null && priceChange?.deltaRate !== undefined
        ? this.toNumber(priceChange.deltaRate)
        : null;

    const currentPerBase = this.pricePerBaseUnit(record, ingredient);
    const currentBase = {
      recordId: record.id,
      ingredientId: record.ingredientId,
      ingredientName: ingredient.name,
      procurementSkuId: record.procurementSkuId ?? null,
      procurementSkuName: record.procurementSkuName ?? null,
      productModel: record.productModel ?? null,
      purchaseChannelName:
        record.purchaseChannelName || record.purchaseChannel || null,
      purchasedAt: new Date(record.purchasedAt).toISOString(),
      unitLabel,
      previousPriceValue,
      previousPriceText:
        previousPriceValue !== null
          ? `¥${previousPriceValue.toFixed(2)}/${unitLabel}`
          : null,
      deltaRate: storedDeltaRate,
    };

    // 算不出当前价（数量/金额缺失、又没有可用的兜底）时不 500：
    // 卡片上可能还有「涨跌」，弹层至少要把上次单价和「暂时算不出」说清楚。
    if (currentPerBase === null) {
      return {
        current: {
          ...currentBase,
          priceValue: 0,
          priceText: '—',
        },
        sameIngredientOthers: [],
        sameSkuHistory: [],
      };
    }

    const reimbursementFilter = {
      is: { status: { not: 'REJECTED' as const } },
    };

    // 两条查询各自 take 5：一定要在 SQL 里先按「报销单非驳回」过滤再截断，
    // 不能先取一大把再在内存里筛——高频原料的窗口会被驳回单/草稿/当前商品
    // 占满，第一段直接空掉（2026-11-10 审核）。
    const [sameSkuRows, otherRows] = await Promise.all([
      record.procurementSkuId
        ? this.findRecentPriceHistory(
            {
              ingredientId: record.ingredientId,
              procurementSkuId: record.procurementSkuId,
              id: { not: record.id },
              purchaseList: { reimbursement: reimbursementFilter },
            },
            5,
          )
        : Promise.resolve([] as any[]),
      this.findRecentPriceHistory(
        {
          ingredientId: record.ingredientId,
          id: { not: record.id },
          procurementSkuId: record.procurementSkuId
            ? { not: record.procurementSkuId }
            : { not: null },
          purchaseList: { reimbursement: reimbursementFilter },
        },
        5,
      ),
    ]);

    const toPoint = (row: any): PriceComparisonPoint | null => {
      const perBase = this.pricePerBaseUnit(row, ingredient);
      if (perBase === null) {
        return null;
      }

      const priceValue = this.roundPrice(perBase * scale);
      const isBaseline =
        previousPerBase !== null &&
        Math.abs(perBase - previousPerBase) <= 1e-6;

      return {
        recordId: row.id,
        purchasedAt: new Date(row.purchasedAt).toISOString(),
        procurementSkuId: row.procurementSkuId ?? null,
        procurementSkuName: row.procurementSkuName ?? null,
        productModel: row.productModel ?? null,
        purchaseChannelName:
          row.purchaseChannelName || row.purchaseChannel || null,
        priceValue,
        priceText: `¥${priceValue.toFixed(2)}/${unitLabel}`,
        deltaRate:
          isBaseline && storedDeltaRate !== null
            ? storedDeltaRate
            : perBase > 0
              ? this.roundDelta((currentPerBase - perBase) / perBase)
              : null,
        isBaseline,
      };
    };

    const toPoints = (rows: any[]) =>
      rows
        .map(toPoint)
        .filter((point): point is PriceComparisonPoint => point !== null)
        .slice(0, 5);

    const currentPriceValue = this.roundPrice(currentPerBase * scale);

    return {
      current: {
        ...currentBase,
        priceValue: currentPriceValue,
        priceText: `¥${currentPriceValue.toFixed(2)}/${unitLabel}`,
      },
      sameIngredientOthers: toPoints(otherRows),
      sameSkuHistory: toPoints(sameSkuRows),
    };
  }

  /**
   * 取某原料下最近几条采购流水。
   *
   * 关键：**过滤和 take 都放在 SQL 里**。先取 200 再在内存里筛，
   * 遇到高频原料（每天买、7 个月就 200 条）时窗口会被驳回单/草稿/当前商品
   * 占满，第一段会空掉，基准价行也可能被挤出 5 条。
   */
  private async findRecentPriceHistory(
    where: any,
    take: number,
  ): Promise<any[]> {
    return (await this.prisma.purchaseRecord.findMany({
      where,
      orderBy: [
        { purchasedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take,
      select: {
        id: true,
        purchasedAt: true,
        procurementSkuId: true,
        procurementSkuName: true,
        productModel: true,
        purchaseChannel: true,
        purchaseChannelName: true,
        actualCost: true,
        actualBaseQuantity: true,
        actualQuantity: true,
        purchaseList: {
          select: { reimbursement: { select: { status: true } } },
        },
      },
    })) as any[];
  }

  private toNumber(value: unknown): number {
    if (
      value !== null &&
      value !== undefined &&
      typeof (value as any).toNumber === 'function'
    ) {
      return (value as any).toNumber();
    }
    return Number(value);
  }

  private pricePerBaseUnit(
    record: {
      actualCost?: unknown;
      actualQuantity?: unknown;
      actualBaseQuantity?: unknown;
    },
    ingredient: {
      purchaseToBaseRatio?: unknown;
      type?: unknown;
    },
  ): number | null {
    const cost = this.toNumber(record.actualCost);
    const quantity = resolvePurchaseRecordBaseQuantity(record, ingredient);

    if (!Number.isFinite(cost) || cost <= 0) {
      return null;
    }
    if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
      return null;
    }

    return this.roundPrice(cost / quantity);
  }

  private roundPrice(value: number): number {
    return Number.isFinite(value)
      ? Math.round(value * 1_000_000) / 1_000_000
      : 0;
  }

  private roundDelta(value: number): number {
    return Number.isFinite(value) ? Math.round(value * 10_000) / 10_000 : 0;
  }

  /**
   * 删除报销单
   */
  async deleteReimbursement(
    id: string,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<void> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2. 权限验证
    if (!isAdmin && reimbursement.submittedById !== requesterId) {
      throw new ForbiddenException('您没有权限删除该报销单');
    }

    // 3. 状态验证
    try {
      reimbursement.canBeDeleted();
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }

    // 4. 删除COS中的报销凭证文件
    if (
      reimbursement.paymentProofKeys &&
      reimbursement.paymentProofKeys.length > 0
    ) {
      this.logger.log(
        `Deleting ${reimbursement.paymentProofKeys.length} payment proof files from COS`,
      );
      for (const key of reimbursement.paymentProofKeys) {
        try {
          await this.cosService.deleteImage(key);
          this.logger.log(`Deleted COS file: ${key}`);
        } catch (error) {
          this.logger.error(`Failed to delete COS file ${key}:`, error);
          // 继续删除其他文件，不中断流程
        }
      }
    }

    // 4.1 删除私有凭证；但订单截图属于识别记录，删报销单不能把它删掉
    for (const key of reimbursement.receiptKeys || []) {
      if (key.startsWith('purchase-order-screenshots/')) continue;
      await this.cosService.deleteImage(key).catch((error: any) => {
        this.logger.warn(
          `Failed to delete receipt object ${key}: ${error?.message}`,
        );
      });
    }

    // 5. 清空采购清单关联
    await this.purchaseListRepository.clearReimbursementId(id);

    // 6. 删除报销单
    await this.reimbursementRepository.delete(id);

    this.logger.log(`Reimbursement ${id} deleted by user ${requesterId}`);
  }

  /**
   * 上传报销凭证
   */
  async uploadPaymentProof(
    id: string,
    paymentProofUrls: string[],
    operatorId?: string | null,
  ): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2. 状态验证
    if (reimbursement.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new BadRequestException('只有待报销状态可以上传报销凭证');
    }

    const previousStatus = reimbursement.status;

    // 3. 验证凭证数量
    if (!paymentProofUrls || paymentProofUrls.length === 0) {
      throw new BadRequestException('请至少上传一张报销凭证');
    }

    // 4. 创建新的报销单实体（因为属性是readonly的）
    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: ReimbursementStatus.REIMBURSED,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: reimbursement.receiptUrls,
      receiptKeys: reimbursement.receiptKeys,
      voucherAmount: reimbursement.voucherAmount,
      differenceAmount: reimbursement.differenceAmount,
      differenceNote: reimbursement.differenceNote,

      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: operatorId ?? reimbursement.reviewedById,
      reviewedAt: new Date(),
      reviewComment: reimbursement.reviewComment,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists: reimbursement.purchaseLists,
      platformShippingFee: reimbursement.platformShippingFee,
      platformPackagingFee: reimbursement.platformPackagingFee,
      customFees: reimbursement.customFees,
      paymentProofUrls: paymentProofUrls,
      submittedBy: reimbursement.submittedBy,
      reviewedBy: reimbursement.reviewedBy,
    });

    const saved = await this.completeWithProof(updated, previousStatus);

    this.logger.log(
      `Payment proof uploaded for reimbursement ${id}, status changed to REIMBURSED`,
    );

    return saved;
  }

  /**
   * 上传付款凭证（支持多文件上传到COS）
   *
   * 2026-11-07：新增 autoComplete 开关。
   * - true（默认，保持电脑端旧行为）：上传即完成报销、应用价格变更；
   * - false（手机端新流程）：只把凭证挂上去，状态仍是待审核，
   *   等审核员再点「审核通过」才真正完成。
   */
  async uploadPaymentProofFiles(
    id: string,
    files: Express.Multer.File[],
    operatorId?: string | null,
    options: { autoComplete?: boolean } = {},
  ): Promise<Reimbursement> {
    const autoComplete = options.autoComplete !== false;
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 只有待报销可以上传付款凭证；避免过期页面把凭证挂到已驳回/已报销的单上
    if (reimbursement.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `当前状态（${reimbursement.status}）不能上传付款凭证，请刷新后重试`,
      );
    }

    // 2. 验证凭证数量
    if (!files || files.length === 0) {
      throw new BadRequestException('请至少上传一张报销凭证');
    }

    const previousStatus = reimbursement.status;

    if (files.length > 10) {
      throw new BadRequestException('最多只能上传10张凭证');
    }

    // 3. 上传文件到COS
    const uploadPromises = files.map((file) =>
      this.cosService.uploadImage(
        file,
        file.originalname,
        'reimbursement-payment-proofs',
      ),
    );

    this.logger.log(
      `Uploading ${files.length} payment proof files to COS for reimbursement ${id}`,
    );

    let uploadResults;
    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (error) {
      this.logger.error('Failed to upload files to COS:', error);
      throw new BadRequestException('文件上传失败');
    }

    const paymentProofUrls = uploadResults.map((r) => r.url);
    const paymentProofKeys = uploadResults.map((r) => r.key);

    this.logger.log(
      `Successfully uploaded ${uploadResults.length} files to COS`,
    );

    // 4. 如果已有凭证，合并新旧凭证
    let finalUrls = paymentProofUrls;
    let finalKeys = paymentProofKeys;

    if (
      reimbursement.paymentProofKeys &&
      reimbursement.paymentProofKeys.length > 0
    ) {
      this.logger.log(
        `Merging with existing ${reimbursement.paymentProofKeys.length} payment proof files`,
      );
      // 合并新旧凭证（避免重复）
      finalUrls = [...reimbursement.paymentProofUrls, ...paymentProofUrls];
      finalKeys = [...reimbursement.paymentProofKeys, ...paymentProofKeys];

      // 验证总数不超过10个
      if (finalUrls.length > 10) {
        throw new BadRequestException('报销凭证总数不能超过10张');
      }
    }

    // 5. 创建新的报销单实体（因为属性是readonly的）
    // autoComplete=true 时才把待审核改成已报销；false 只挂附件，状态不动
    const finalStatus = autoComplete
      ? ReimbursementStatus.REIMBURSED
      : reimbursement.status;

    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: finalStatus,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: reimbursement.receiptUrls,
      receiptKeys: reimbursement.receiptKeys,
      voucherAmount: reimbursement.voucherAmount,
      differenceAmount: reimbursement.differenceAmount,
      differenceNote: reimbursement.differenceNote,

      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById:
        finalStatus === ReimbursementStatus.REIMBURSED
          ? (operatorId ?? reimbursement.reviewedById)
          : reimbursement.reviewedById,
      reviewedAt:
        finalStatus === ReimbursementStatus.REIMBURSED
          ? new Date()
          : reimbursement.reviewedAt,
      reviewComment: reimbursement.reviewComment,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists: reimbursement.purchaseLists,
      platformShippingFee: reimbursement.platformShippingFee,
      platformPackagingFee: reimbursement.platformPackagingFee,
      customFees: reimbursement.customFees,
      paymentProofUrls: finalUrls,
      paymentProofKeys: finalKeys,
      submittedBy: reimbursement.submittedBy,
      reviewedBy: reimbursement.reviewedBy,
    });

    const saved = await this.completeWithProof(updated, previousStatus);

    this.logger.log(
      `Payment proof files uploaded for reimbursement ${id}, status: ${finalStatus}`,
    );

    return saved;
  }

  /**
   * 清空报销凭证
   */
  async clearPaymentProof(id: string): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2026-11-07 复审：已报销的单不能走「清空凭证」这条老路。
    // 它不受 24 小时撤销窗口限制，而且会把价格变更标成 REJECTED，
    // 之后重新通过时找不到待生效条目，价格就永远不生效。要改就先用「撤销审核」。
    if (reimbursement.status === ReimbursementStatus.REIMBURSED) {
      throw new BadRequestException(
        '已报销的报销单请先「撤销审核」再改凭证',
      );
    }

    this.logger.log(`Clearing payment proof for reimbursement ${id}`);

    // 2. 如果有COS文件，先删除
    if (
      reimbursement.paymentProofKeys &&
      reimbursement.paymentProofKeys.length > 0
    ) {
      this.logger.log(
        `Deleting ${reimbursement.paymentProofKeys.length} files from COS`,
      );
      try {
        const deletePromises = reimbursement.paymentProofKeys.map((key) =>
          this.cosService.deleteImage(key),
        );
        await Promise.all(deletePromises);
        this.logger.log(
          `Successfully deleted ${reimbursement.paymentProofKeys.length} files from COS`,
        );
      } catch (error) {
        this.logger.error('Failed to delete files from COS:', error);
        // 即使删除失败，也继续清空数据库中的记录
      }
    }

    // 3. 创建新的报销单实体（清空凭证）
    // 已报销的单在这里之前就被拦掉了（改用「撤销审核」），所以状态、审核人、备注都原样保留
    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: reimbursement.status,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: reimbursement.receiptUrls,
      receiptKeys: reimbursement.receiptKeys,
      voucherAmount: reimbursement.voucherAmount,
      differenceAmount: reimbursement.differenceAmount,
      differenceNote: reimbursement.differenceNote,

      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: reimbursement.reviewedById,
      reviewedAt: reimbursement.reviewedAt,
      reviewComment: reimbursement.reviewComment,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists: reimbursement.purchaseLists,
      platformShippingFee: reimbursement.platformShippingFee,
      platformPackagingFee: reimbursement.platformPackagingFee,
      customFees: reimbursement.customFees,
      paymentProofUrls: [],
      paymentProofKeys: [],
      submittedBy: reimbursement.submittedBy,
      reviewedBy: reimbursement.reviewedBy,
    });

    const saved = await this.reimbursementRepository.save(updated);

    this.logger.log(`Payment proof cleared for reimbursement ${id}`);

    return saved;
  }

  /**
   * 上传付款凭证「完成报销」这条路（电脑端主用，2026-11-07 终验 P1-1）
   *
   * 以前是「先存成已报销、再在事务外应用价格」：应用失败会留下
   * 「已报销但价格没生效」，而且不写审核事件，手机端「处理进度」看不到这次通过。
   * 现在和手机端审核走同一套：应用价格 → 写事件 → 保存，放在一个事务里。
   */
  private async completeWithProof(
    reimbursement: Reimbursement,
    previousStatus: ReimbursementStatus,
  ): Promise<Reimbursement> {
    const shouldComplete =
      previousStatus === ReimbursementStatus.PENDING_REVIEW &&
      reimbursement.status === ReimbursementStatus.REIMBURSED;

    if (!shouldComplete) {
      return this.reimbursementRepository.save(reimbursement);
    }

    const comment =
      reimbursement.reviewComment ?? '上传付款凭证后完成报销';

    return this.prisma.$transaction(
      async (tx) => {
        await this.ingredientPricingService.applyApprovedChangesForReimbursement(
          reimbursement.id,
          reimbursement.reviewedById ?? null,
          comment,
          tx,
        );

        await this.recordReviewEvent(tx, {
          reimbursementId: reimbursement.id,
          action: 'APPROVE',
          actorId: reimbursement.reviewedById ?? null,
          fromStatus: previousStatus,
          toStatus: reimbursement.status,
          comment: '上传付款凭证后完成报销',
        });

        return this.reimbursementRepository.save(reimbursement, tx);
      },
      { timeout: 30000 },
    );
  }

  /**
   * 追加支付凭证（发票照片）
   */
  async appendReceiptUrls(
    id: string,
    files: Express.Multer.File[],
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2. 权限验证：只有提交者或管理员可以修改
    if (!isAdmin && reimbursement.submittedById !== requesterId) {
      throw new ForbiddenException('您没有权限修改该报销单');
    }

    // 3. 状态验证：只有待报销、被驳回、需重新提交状态可以修改
    const editableStatuses = [
      ReimbursementStatus.PENDING_REVIEW,
      ReimbursementStatus.REJECTED,
      ReimbursementStatus.REQUIRES_RESUBMIT,
    ];

    if (!editableStatuses.includes(reimbursement.status)) {
      throw new BadRequestException('当前状态不允许修改支付凭证');
    }

    // 4. 验证文件数量
    if (!files || files.length === 0) {
      throw new BadRequestException('请至少上传一张图片');
    }

    const currentCount =
      (reimbursement.receiptUrls?.length || 0) +
      (reimbursement.receiptKeys?.length || 0);
    const newCount = files.length;

    if (currentCount + newCount > 10) {
      throw new BadRequestException(
        `最多只能上传10张图片，当前已有${currentCount}张`,
      );
    }

    // 5. 上传文件到COS
    const uploadPromises = files.map((file) =>
      this.cosService.uploadImage(
        file,
        file.originalname,
        'reimbursement-receipts',
      ),
    );

    this.logger.log(
      `Uploading ${files.length} receipt files to COS for reimbursement ${id}`,
    );

    let uploadResults;
    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (error) {
      this.logger.error('Failed to upload files to COS:', error);
      throw new BadRequestException('文件上传失败');
    }

    const newReceiptUrls = uploadResults.map((r) => r.url);

    // 6. 合并新旧凭证 URL。
    // 追加的公开凭证只存 URL，不再塞 key：key 只留给「订单截图」这类私有凭证，
    // 这样 receiptUrls + receiptKeys 的 10 张上限才是同一套口径。
    const updatedUrls = [
      ...(reimbursement.receiptUrls || []),
      ...newReceiptUrls,
    ];
    const updatedKeys = [...(reimbursement.receiptKeys || [])];

    this.logger.log(
      `Successfully uploaded ${uploadResults.length} files to COS`,
    );

    // 7. 创建新的报销单实体（因为属性是readonly的）
    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: reimbursement.status,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: updatedUrls,
      receiptKeys: updatedKeys,
      voucherAmount: reimbursement.voucherAmount,
      differenceAmount: reimbursement.differenceAmount,
      differenceNote: reimbursement.differenceNote,
      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: reimbursement.reviewedById,
      reviewedAt: reimbursement.reviewedAt,
      reviewComment: reimbursement.reviewComment,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists: reimbursement.purchaseLists,
      platformShippingFee: reimbursement.platformShippingFee,
      platformPackagingFee: reimbursement.platformPackagingFee,
      customFees: reimbursement.customFees,
      paymentProofUrls: reimbursement.paymentProofUrls,
      paymentProofKeys: reimbursement.paymentProofKeys,
      submittedBy: reimbursement.submittedBy,
      reviewedBy: reimbursement.reviewedBy,
    });

    const saved = await this.reimbursementRepository.save(updated);

    this.logger.log(`Receipt URLs appended for reimbursement ${id}`);

    return saved;
  }

  /**
   * 删除支付凭证（发票照片）
   */
  async removeReceiptUrl(
    id: string,
    urlIndex: number,
    requesterId: string,
    isAdmin: boolean,
  ): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2. 权限验证：只有提交者或管理员可以修改
    if (!isAdmin && reimbursement.submittedById !== requesterId) {
      throw new ForbiddenException('您没有权限修改该报销单');
    }

    // 3. 状态验证：只有待报销、被驳回、需重新提交状态可以修改
    const editableStatuses = [
      ReimbursementStatus.PENDING_REVIEW,
      ReimbursementStatus.REJECTED,
      ReimbursementStatus.REQUIRES_RESUBMIT,
    ];

    if (!editableStatuses.includes(reimbursement.status)) {
      throw new BadRequestException('当前状态不允许修改支付凭证');
    }

    // 4. 验证索引：先按公开凭证 URL 找，超出部分按私有 key 找
    const urls = [...(reimbursement.receiptUrls || [])];
    const keys = [...(reimbursement.receiptKeys || [])];
    const total = urls.length + keys.length;

    if (total === 0) {
      throw new BadRequestException('没有可删除的支付凭证');
    }

    if (urlIndex < 0 || urlIndex >= total) {
      throw new BadRequestException('无效的图片索引');
    }

    const updatedUrls = [...urls];
    const updatedKeys = [...keys];

    if (urlIndex < urls.length) {
      const url = urls[urlIndex];
      // 历史数据里公开凭证的 URL 和 key 一一对应；但私有 key（订单截图）绝不按
      // 下标删除——只能按前缀判断，删错会把识别记录的图删掉。
      const candidateKey = keys[urlIndex];
      const legacyPublicKey =
        keys.length === urls.length &&
        candidateKey &&
        candidateKey.startsWith('reimbursement-receipts/')
          ? candidateKey
          : undefined;
      try {
        if (legacyPublicKey) {
          await this.cosService.deleteImage(legacyPublicKey);
        } else {
          await this.cosService.deleteImageByUrlStrict(url);
        }
      } catch (error: any) {
        this.logger.error(`Failed to delete receipt object: ${error?.message}`);
      }
      updatedUrls.splice(urlIndex, 1);
      if (legacyPublicKey) updatedKeys.splice(urlIndex, 1);
    } else {
      const keyIndex = urlIndex - urls.length;
      const key = keys[keyIndex];
      // 订单截图属于识别记录，不能因为删报销凭证就被删掉。
      if (!key.startsWith('purchase-order-screenshots/')) {
        await this.cosService.deleteImage(key).catch((error: any) => {
          this.logger.error(`Failed to delete receipt key: ${error?.message}`);
        });
      }
      updatedKeys.splice(keyIndex, 1);
    }

    this.logger.log(
      `Removed receipt at index ${urlIndex} from reimbursement ${id}`,
    );

    // 8. 创建新的报销单实体（因为属性是readonly的）
    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: reimbursement.status,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: updatedUrls,
      receiptKeys: updatedKeys,
      voucherAmount: reimbursement.voucherAmount,
      differenceAmount: reimbursement.differenceAmount,
      differenceNote: reimbursement.differenceNote,
      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: reimbursement.reviewedById,
      reviewedAt: reimbursement.reviewedAt,
      reviewComment: reimbursement.reviewComment,
      createdAt: reimbursement.createdAt,
      updatedAt: new Date(),
      purchaseLists: reimbursement.purchaseLists,
      platformShippingFee: reimbursement.platformShippingFee,
      platformPackagingFee: reimbursement.platformPackagingFee,
      customFees: reimbursement.customFees,
      paymentProofUrls: reimbursement.paymentProofUrls,
      paymentProofKeys: reimbursement.paymentProofKeys,
      submittedBy: reimbursement.submittedBy,
      reviewedBy: reimbursement.reviewedBy,
    });

    const saved = await this.reimbursementRepository.save(updated);

    this.logger.log(`Receipt URL removed for reimbursement ${id}`);

    return saved;
  }
}
