/**
 * Reimbursement Service
 * 报销审核服务
 * Phase 1: Purchasing Management Feature
 */

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  REIMBURSEMENT_REPOSITORY,
  PURCHASE_LIST_REPOSITORY,
} from './purchasing.service.tokens';
import type { ReimbursementRepository } from '../../domain/purchasing/reimbursement.repository';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import { ORDER_REPOSITORY } from '../order/order.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ORDER_STATUS_HISTORY_REPOSITORY } from '../order/order.service';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { IngredientPricingService } from '../ingredient/ingredient-pricing.service';
import {
  Reimbursement,
  ReimbursementStatus,
  PurchaseList,
  PurchaseListStatus,
  REIMBURSEMENT_CUSTOM_FEE_CATEGORIES,
  type ReimbursementCustomFee,
} from '../../domain/purchasing';
import { OrderStatus } from '../../domain';

export interface SubmitReimbursementDto {
  purchaseListIds?: string[];
  receiptUrls: string[];
  totalActualCost: number;
  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: ReimbursementCustomFee[];
}

export interface ReviewReimbursementDto {
  decision: 'APPROVE' | 'REJECT' | 'REQUIRES_RESUBMIT';
  comment?: string;
}

@Injectable()
export class ReimbursementService {
  private readonly logger = new Logger(ReimbursementService.name);

  constructor(
    @Inject(REIMBURSEMENT_REPOSITORY)
    private readonly reimbursementRepository: ReimbursementRepository,
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: OrderStatusHistoryRepository,
    private readonly cosService: TencentCosService,
    private readonly ingredientPricingService: IngredientPricingService,
  ) {}

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

  /**
   * 提交报销申请
   */
  async submitReimbursement(
    dto: SubmitReimbursementDto,
    submittedById: string,
  ): Promise<Reimbursement> {
    const purchaseListIds = dto.purchaseListIds || [];

    // 验证发票照片
    if (dto.receiptUrls.length === 0) {
      throw new BadRequestException('至少需要一张发票照片');
    }

    if (dto.receiptUrls.length > 10) {
      throw new BadRequestException('最多只能上传10张发票照片');
    }

    if (dto.totalActualCost <= 0) {
      throw new BadRequestException('实际采购总额必须大于0');
    }

    this.logger.log(
      `Submitting reimbursement for ${purchaseListIds.length} purchase lists by user ${submittedById}`,
    );

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
      if (list.reimbursementId) {
        throw new BadRequestException(
          `采购清单 ${listId} 已关联到报销单 ${list.reimbursementId}`,
        );
      }

      purchaseLists.push(list);
      totalEstimatedCost += list.totalEstimatedCost;
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

    this.logger.log(
      `Validated reimbursement cost details: purchaseLists=¥${purchaseListsTotal}, ` +
        `shipping=¥${dto.platformShippingFee || 0}, packaging=¥${dto.platformPackagingFee || 0}, ` +
        `custom=¥${customFeesTotal}, total=¥${dto.totalActualCost}`,
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

    this.logger.log(
      `Reimbursement ${saved.id} (${claimNumber}) submitted successfully`,
    );

    return saved;
  }

  /**
   * 审核报销单
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
        `只有待审核状态的报销单可以审核。当前状态：${reimbursement.status}`,
      );
    }

    this.logger.log(
      `Reviewer ${reviewerId} reviewing reimbursement ${id} with decision: ${dto.decision}`,
    );

    // 审核报销单
    reimbursement.review(reviewerId, dto.decision, dto.comment);

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

    if (dto.decision === 'APPROVE') {
      await this.ingredientPricingService.applyApprovedChangesForReimbursement(
        saved.id,
        reviewerId,
        dto.comment,
      );

      // 如果批准，解锁相关订单的生产排单功能
      await this.unlockProductionForReimbursement(saved);
    } else {
      await this.ingredientPricingService.rejectChangesForReimbursement(
        saved.id,
        reviewerId,
        dto.comment,
      );
    }

    this.logger.log(
      `Reimbursement ${id} reviewed successfully: ${dto.decision}`,
    );

    return saved;
  }

  /**
   * 解锁生产排单
   *
   * 逻辑:
   * 1. 找到报销单关联的所有采购清单
   * 2. 找到这些采购清单关联的订单(sourceOrderIds)
   * 3. 将订单状态从 PAID → PURCHASING
   */
  private async unlockProductionForReimbursement(
    reimbursement: Reimbursement,
  ): Promise<void> {
    const purchaseLists = reimbursement.purchaseLists;
    const orderIds = new Set<string>();

    // 收集所有关联订单ID
    for (const list of purchaseLists) {
      list.sourceOrderIds.forEach((id) => orderIds.add(id));
    }

    this.logger.log(
      `Unlocking production for ${orderIds.size} orders after reimbursement ${reimbursement.id} approval`,
    );

    // 批量更新订单状态
    let unlockedCount = 0;
    for (const orderId of orderIds) {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        this.logger.warn(`Order ${orderId} not found, skipping`);
        continue;
      }

      // 仅当订单状态为PAID时才解锁(防止重复解锁)
      if (order.status === OrderStatus.PAID) {
        const fromStatus = order.status;
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);

        // 记录状态历史
        await this.statusHistoryRepository.append(
          order.id,
          fromStatus,
          OrderStatus.PURCHASING,
          'system',
          null,
          {
            reimbursementId: reimbursement.id,
            claimNumber: reimbursement.claimNumber,
            triggeredBy: 'reimbursement_approved',
          },
        );

        unlockedCount++;
      }
    }

    this.logger.log(
      `Reimbursement ${reimbursement.id} approved: unlocked ${unlockedCount} orders for production`,
    );
  }

  /**
   * 重新提交被驳回的报销单
   */
  async resubmitReimbursement(
    id: string,
    dto: SubmitReimbursementDto,
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

    this.logger.log(`Resubmitting reimbursement ${id}`);

    // 重新提交（会清除审核信息）
    reimbursement.resubmit(dto.receiptUrls);

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

    await this.ingredientPricingService.syncPendingChangesForReimbursement(
      saved.id,
      reimbursement.purchaseLists.map((purchaseList) => purchaseList.id),
    );
    await this.ingredientPricingService.autoApproveEligibleChangesForReimbursement(
      saved.id,
    );

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
  async getReimbursementDetail(id: string): Promise<any> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    const priceChanges =
      await this.ingredientPricingService.getPriceChangesForReimbursement(id);

    return {
      ...reimbursement,
      priceChanges,
    };
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
  ): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
    }

    // 2. 状态验证
    if (reimbursement.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new BadRequestException('只有待审核状态可以上传报销凭证');
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
      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: reimbursement.reviewedById,
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

    const saved = await this.reimbursementRepository.save(updated);

    await this.applyPostReimbursedSideEffects(previousStatus, saved);

    this.logger.log(
      `Payment proof uploaded for reimbursement ${id}, status changed to REIMBURSED`,
    );

    return saved;
  }

  /**
   * 上传报销凭证文件（支持多文件上传到COS）
   */
  async uploadPaymentProofFiles(
    id: string,
    files: Express.Multer.File[],
  ): Promise<Reimbursement> {
    // 1. 查询报销单
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException('报销单不存在');
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
    // 只有待审核状态上传凭证后，才自动改为已报销状态
    const finalStatus =
      reimbursement.status === ReimbursementStatus.PENDING_REVIEW
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
      submittedById: reimbursement.submittedById,
      submittedAt: reimbursement.submittedAt,
      reviewedById: reimbursement.reviewedById,
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

    const saved = await this.reimbursementRepository.save(updated);

    await this.applyPostReimbursedSideEffects(previousStatus, saved);

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
    const updated = new Reimbursement({
      id: reimbursement.id,
      claimNumber: reimbursement.claimNumber,
      status: reimbursement.status,
      totalActualCost: reimbursement.totalActualCost,
      totalEstimatedCost: reimbursement.totalEstimatedCost,
      receiptUrls: reimbursement.receiptUrls,
      receiptKeys: reimbursement.receiptKeys,
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

  private async applyPostReimbursedSideEffects(
    previousStatus: ReimbursementStatus,
    reimbursement: Reimbursement,
  ): Promise<void> {
    if (
      previousStatus !== ReimbursementStatus.PENDING_REVIEW ||
      reimbursement.status !== ReimbursementStatus.REIMBURSED
    ) {
      return;
    }

    await this.ingredientPricingService.applyApprovedChangesForReimbursement(
      reimbursement.id,
      reimbursement.reviewedById ?? null,
      reimbursement.reviewComment ??
        '系统在上传报销凭证后自动标记已报销并应用价格变更',
    );
    await this.unlockProductionForReimbursement(reimbursement);
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

    // 3. 状态验证：只有待审核、被驳回、需重新提交状态可以修改
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

    const currentCount = reimbursement.receiptUrls?.length || 0;
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
    const newReceiptKeys = uploadResults.map((r) => r.key);

    // 6. 合并新旧凭证URL
    const updatedUrls = [
      ...(reimbursement.receiptUrls || []),
      ...newReceiptUrls,
    ];
    const updatedKeys = [
      ...(reimbursement.receiptKeys || []),
      ...newReceiptKeys,
    ];

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

    // 3. 状态验证：只有待审核、被驳回、需重新提交状态可以修改
    const editableStatuses = [
      ReimbursementStatus.PENDING_REVIEW,
      ReimbursementStatus.REJECTED,
      ReimbursementStatus.REQUIRES_RESUBMIT,
    ];

    if (!editableStatuses.includes(reimbursement.status)) {
      throw new BadRequestException('当前状态不允许修改支付凭证');
    }

    // 4. 验证索引
    if (!reimbursement.receiptUrls || reimbursement.receiptUrls.length === 0) {
      throw new BadRequestException('没有可删除的支付凭证');
    }

    if (urlIndex < 0 || urlIndex >= reimbursement.receiptUrls.length) {
      throw new BadRequestException('无效的图片索引');
    }

    // 5. 如果有对应的COS key，删除COS中的文件
    const keyToDelete = reimbursement.receiptKeys?.[urlIndex];
    if (keyToDelete) {
      try {
        await this.cosService.deleteImage(keyToDelete);
        this.logger.log(`Deleted COS file: ${keyToDelete}`);
      } catch (error) {
        this.logger.error(`Failed to delete COS file ${keyToDelete}:`, error);
        // 继续执行，不中断流程
      }
    }

    // 7. 从数组中删除指定索引的元素
    const updatedUrls = [...reimbursement.receiptUrls];
    const updatedKeys = reimbursement.receiptKeys
      ? [...reimbursement.receiptKeys]
      : [];

    updatedUrls.splice(urlIndex, 1);
    if (updatedKeys.length > 0) {
      updatedKeys.splice(urlIndex, 1);
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
