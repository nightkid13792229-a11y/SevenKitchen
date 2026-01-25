/**
 * Reimbursement Service
 * 报销审核服务
 * Phase 1: Purchasing Management Feature
 */

import { Injectable, Inject, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { REIMBURSEMENT_REPOSITORY, PURCHASE_LIST_REPOSITORY } from './purchasing.service.tokens';
import type { ReimbursementRepository } from '../../domain/purchasing/reimbursement.repository';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import { ORDER_REPOSITORY } from '../order/order.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ORDER_STATUS_HISTORY_REPOSITORY } from '../order/order.service';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import {
  Reimbursement,
  ReimbursementStatus,
  PurchaseList,
  PurchaseListStatus,
} from '../../domain/purchasing';
import { OrderStatus } from '../../domain';

export interface SubmitReimbursementDto {
  purchaseListIds: string[];
  receiptUrls: string[];
  totalActualCost: number;
  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: Array<{ description: string; amount: number }>;
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
    submittedById: string
  ): Promise<Reimbursement> {
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
      `Submitting reimbursement for ${dto.purchaseListIds.length} purchase lists by user ${submittedById}`
    );

    // 查询所有采购清单（如果有）
    const purchaseLists: PurchaseList[] = [];
    let totalEstimatedCost = 0;

    for (const listId of dto.purchaseListIds) {
      const list = await this.purchaseListRepository.findById(listId);
      if (!list) {
        throw new BadRequestException(`未找到采购清单：${listId}`);
      }

      // 验证采购清单状态
      if (list.status !== PurchaseListStatus.COMPLETED) {
        throw new BadRequestException(
          `采购清单 ${listId} 未完成，当前状态：${list.status}`
        );
      }

      // 验证采购清单未被其他报销单关联
      if (list.reimbursementId) {
        throw new BadRequestException(
          `采购清单 ${listId} 已关联到报销单 ${list.reimbursementId}`
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

    // 计算自定义费用总额
    const customFeesTotal = dto.customFees?.reduce((sum, fee) => sum + (fee.amount || 0), 0) || 0;

    // 验证自定义费用数组中的每一项
    if (dto.customFees && dto.customFees.length > 0) {
      dto.customFees.forEach((fee, index) => {
        if (!fee.description || fee.description.trim() === '') {
          throw new BadRequestException(
            `Custom fee at index ${index} must have a description`
          );
        }
        if (fee.amount < 0) {
          throw new BadRequestException(
            `Custom fee at index ${index} has negative amount`
          );
        }
      });
    }

    // 验证总金额
    const calculatedTotal = purchaseListsTotal +
      (dto.platformShippingFee || 0) +
      (dto.platformPackagingFee || 0) +
      customFeesTotal;

    if (Math.abs(dto.totalActualCost - calculatedTotal) > 0.01) {
      throw new BadRequestException(
        `报销总金额与费用明细不匹配。期望: ¥${calculatedTotal.toFixed(2)}, 实际: ¥${dto.totalActualCost.toFixed(2)}`
      );
    }

    this.logger.log(
      `Validated reimbursement cost details: purchaseLists=¥${purchaseListsTotal}, ` +
      `shipping=¥${dto.platformShippingFee || 0}, packaging=¥${dto.platformPackagingFee || 0}, ` +
      `custom=¥${customFeesTotal}, total=¥${dto.totalActualCost}`
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
      customFees: dto.customFees || [],
    });

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

    this.logger.log(`Reimbursement ${saved.id} (${claimNumber}) submitted successfully`);

    return saved;
  }

  /**
   * 审核报销单
   */
  async reviewReimbursement(
    id: string,
    reviewerId: string,
    dto: ReviewReimbursementDto
  ): Promise<Reimbursement> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    // 验证状态
    if (reimbursement.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `只有待审核状态的报销单可以审核。当前状态：${reimbursement.status}`
      );
    }

    this.logger.log(
      `Reviewer ${reviewerId} reviewing reimbursement ${id} with decision: ${dto.decision}`
    );

    // 审核报销单
    reimbursement.review(reviewerId, dto.decision, dto.comment);

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

    // 如果批准，解锁相关订单的生产排单功能
    if (dto.decision === 'APPROVE') {
      await this.unlockProductionForReimbursement(saved);
    }

    this.logger.log(`Reimbursement ${id} reviewed successfully: ${dto.decision}`);

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
    reimbursement: Reimbursement
  ): Promise<void> {
    const purchaseLists = reimbursement.purchaseLists;
    const orderIds = new Set<string>();

    // 收集所有关联订单ID
    for (const list of purchaseLists) {
      list.sourceOrderIds.forEach(id => orderIds.add(id));
    }

    this.logger.log(
      `Unlocking production for ${orderIds.size} orders after reimbursement ${reimbursement.id} approval`
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
          }
        );

        unlockedCount++;
      }
    }

    this.logger.log(
      `Reimbursement ${reimbursement.id} approved: unlocked ${unlockedCount} orders for production`
    );
  }

  /**
   * 重新提交被驳回的报销单
   */
  async resubmitReimbursement(
    id: string,
    dto: SubmitReimbursementDto
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
        `只有被驳回或需要重新提交的报销单才能重新提交。当前状态：${reimbursement.status}`
      );
    }

    this.logger.log(`Resubmitting reimbursement ${id}`);

    // 重新提交（会清除审核信息）
    reimbursement.resubmit(dto.receiptUrls);

    // 保存报销单
    const saved = await this.reimbursementRepository.save(reimbursement);

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
    const { status, submittedById, startDate, endDate, page = 1, pageSize = 20 } = params;

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
  async getReimbursementDetail(id: string): Promise<Reimbursement> {
    const reimbursement = await this.reimbursementRepository.findById(id);

    if (!reimbursement) {
      throw new BadRequestException(`未找到报销单：${id}`);
    }

    return reimbursement;
  }

  /**
   * 删除报销单
   */
  async deleteReimbursement(
    id: string,
    requesterId: string,
    isAdmin: boolean
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

    // 4. 清空采购清单关联
    await this.purchaseListRepository.clearReimbursementId(id);

    // 5. 删除报销单
    await this.reimbursementRepository.delete(id);

    this.logger.log(`Reimbursement ${id} deleted by user ${requesterId}`);
  }
}
