/**
 * Reimbursement Entity
 * 报销单实体
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ReimbursementStatus,
  REIMBURSEMENT_STATUS_TRANSITIONS,
  PurchaseListStatus,
} from './enums';
import { PurchaseList } from './purchase-list.entity';
import { InvalidStateTransitionError } from '../common/errors';

export const REIMBURSEMENT_CUSTOM_FEE_CATEGORIES = [
  'RENT',
  'UTILITIES',
  'TOOLS',
  'SUNDRIES',
  'PAYROLL',
  'OTHER',
] as const;

export type ReimbursementCustomFeeCategory =
  (typeof REIMBURSEMENT_CUSTOM_FEE_CATEGORIES)[number];

export interface ReimbursementCustomFee {
  category?: ReimbursementCustomFeeCategory;
  description?: string;
  amount: number;
}

export interface ReimbursementConstructor {
  id?: string;
  claimNumber: string;
  status?: ReimbursementStatus;
  totalActualCost: number;
  totalEstimatedCost: number;
  receiptUrls: string[];
  receiptKeys?: string[]; // COS对象键（用于删除支付凭证）
  submittedById: string;
  submittedAt: Date;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewComment?: string;
  createdAt?: Date;
  updatedAt?: Date;
  purchaseLists?: PurchaseList[];
  // 新增字段
  platformShippingFee?: number;
  platformPackagingFee?: number;
  customFees?: ReimbursementCustomFee[];
  paymentProofUrls?: string[]; // 报销凭证（管理员上传）
  paymentProofKeys?: string[]; // COS对象键（用于删除）
  // 关联用户对象（非持久化）
  submittedBy?: { id: string; nickname: string; phone: string };
  reviewedBy?: { id: string; nickname: string; phone: string };
}

export class Reimbursement {
  public readonly id: string;
  public readonly claimNumber: string;
  public status: ReimbursementStatus;
  public readonly totalActualCost: number;
  public readonly totalEstimatedCost: number;
  public receiptUrls: string[];
  public readonly receiptKeys: string[]; // COS对象键（用于删除支付凭证）
  public readonly submittedById: string;
  public readonly submittedAt: Date;
  public reviewedById?: string;
  public reviewedAt?: Date;
  public reviewComment?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public purchaseLists: PurchaseList[];

  // 新增属性
  public readonly platformShippingFee?: number;
  public readonly platformPackagingFee?: number;
  public readonly customFees: ReimbursementCustomFee[];
  public readonly paymentProofUrls: string[]; // 报销凭证（管理员上传）
  public readonly paymentProofKeys: string[]; // COS对象键（用于删除）

  // 关联用户对象（非持久化）
  public submittedBy?: { id: string; nickname: string; phone: string };
  public reviewedBy?: { id: string; nickname: string; phone: string };

  constructor(data: ReimbursementConstructor) {
    this.id = data.id || uuidv4();
    this.claimNumber = data.claimNumber;
    this.status = data.status || ReimbursementStatus.PENDING_REVIEW;
    this.totalActualCost = data.totalActualCost;
    this.totalEstimatedCost = data.totalEstimatedCost;
    this.receiptUrls = data.receiptUrls;
    this.receiptKeys = data.receiptKeys || [];
    this.submittedById = data.submittedById;
    this.submittedAt = data.submittedAt;
    this.reviewedById = data.reviewedById;
    this.reviewedAt = data.reviewedAt;
    this.reviewComment = data.reviewComment;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.purchaseLists = data.purchaseLists || [];
    this.platformShippingFee = data.platformShippingFee;
    this.platformPackagingFee = data.platformPackagingFee;
    this.customFees = (data.customFees || []).map((fee) => ({
      category: fee.category,
      description: fee.description?.trim() || undefined,
      amount: fee.amount,
    }));
    this.paymentProofUrls = data.paymentProofUrls || [];
    this.paymentProofKeys = data.paymentProofKeys || [];
    this.submittedBy = data.submittedBy;
    this.reviewedBy = data.reviewedBy;

    this.validateInvariants();
  }

  /**
   * 验证领域不变式
   */
  private validateInvariants(): void {
    if (this.totalActualCost <= 0) {
      throw new Error('Total actual cost must be positive');
    }

    if (this.totalEstimatedCost < 0) {
      throw new Error('Total estimated cost cannot be negative');
    }

    // 如果有采购清单，验证它们都是COMPLETED状态
    if (this.purchaseLists.length > 0) {
      const allCompleted = this.purchaseLists.every(
        (list) => list.status === PurchaseListStatus.COMPLETED,
      );
      if (!allCompleted) {
        throw new Error(
          'All purchase lists must be completed before reimbursement',
        );
      }
    }

    // 验证发票照片数量（最多10张）
    if (this.receiptUrls.length > 10) {
      throw new Error('Maximum 10 receipt photos allowed');
    }

    // 验证平台运费
    if (
      this.platformShippingFee !== undefined &&
      this.platformShippingFee < 0
    ) {
      throw new Error('Platform shipping fee cannot be negative');
    }

    // 验证平台打包费
    if (
      this.platformPackagingFee !== undefined &&
      this.platformPackagingFee < 0
    ) {
      throw new Error('Platform packaging fee cannot be negative');
    }

    // 验证自定义费用
    if (this.customFees.length > 0) {
      this.customFees.forEach((fee, index) => {
        if (
          fee.category &&
          !REIMBURSEMENT_CUSTOM_FEE_CATEGORIES.includes(fee.category)
        ) {
          throw new Error(`Custom fee at index ${index} has invalid category`);
        }

        if (!fee.description && !fee.category) {
          throw new Error(
            `Custom fee at index ${index} must have a category or description`,
          );
        }
        if (fee.amount < 0) {
          throw new Error(`Custom fee at index ${index} has negative amount`);
        }
      });
    }
  }

  /**
   * 审核报销单
   * 状态转换: PENDING_REVIEW → APPROVED/REJECTED/REQUIRES_RESUBMIT
   */
  review(
    reviewerId: string,
    decision: 'APPROVE' | 'REJECT' | 'REQUIRES_RESUBMIT',
    comment?: string,
  ): void {
    if (this.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new InvalidStateTransitionError(
        `Only PENDING_REVIEW reimbursements can be reviewed`,
      );
    }

    const allowedTransitions = REIMBURSEMENT_STATUS_TRANSITIONS[this.status];
    let newStatus: ReimbursementStatus;

    switch (decision) {
      case 'APPROVE':
        newStatus = ReimbursementStatus.REIMBURSED;
        break;
      case 'REJECT':
        newStatus = ReimbursementStatus.REJECTED;
        break;
      case 'REQUIRES_RESUBMIT':
        newStatus = ReimbursementStatus.REQUIRES_RESUBMIT;
        break;
      default:
        throw new Error(`Invalid decision: ${decision}`);
    }

    if (!allowedTransitions.includes(newStatus)) {
      throw new InvalidStateTransitionError(
        `Invalid state transition from ${this.status} to ${newStatus}`,
      );
    }

    this.status = newStatus;
    this.reviewedById = reviewerId;
    this.reviewedAt = new Date();
    this.reviewComment = comment;
    this.updatedAt = new Date();
  }

  /**
   * 重新提交
   * 状态转换: REJECTED/REQUIRES_RESUBMIT → PENDING_REVIEW
   */
  resubmit(newReceiptUrls?: string[]): void {
    const allowedTransitions = REIMBURSEMENT_STATUS_TRANSITIONS[this.status];
    if (!allowedTransitions.includes(ReimbursementStatus.PENDING_REVIEW)) {
      throw new InvalidStateTransitionError(
        `Only REJECTED or REQUIRES_RESUBMIT reimbursements can be resubmitted`,
      );
    }

    this.status = ReimbursementStatus.PENDING_REVIEW;
    this.reviewedById = undefined;
    this.reviewedAt = undefined;
    this.reviewComment = undefined;
    this.updatedAt = new Date();

    // 如果提供了新的发票照片，更新它们
    if (newReceiptUrls) {
      this.receiptUrls = newReceiptUrls;
    }
  }

  /**
   * 检查是否已批准
   */
  isApproved(): boolean {
    return this.status === ReimbursementStatus.REIMBURSED;
  }

  /**
   * 检查是否已驳回
   */
  isRejected(): boolean {
    return this.status === ReimbursementStatus.REJECTED;
  }

  /**
   * 检查是否待审核
   */
  isPendingReview(): boolean {
    return this.status === ReimbursementStatus.PENDING_REVIEW;
  }

  /**
   * 检查是否可以删除
   * 只有待审核、已驳回、需重新提交状态可以删除
   */
  canBeDeleted(): void {
    if (this.status === ReimbursementStatus.REIMBURSED) {
      throw new Error('已报销的报销单不能删除');
    }
  }

  /**
   * 计算成本差异（实际成本 - 预估成本）
   */
  getCostDifference(): number {
    return this.totalActualCost - this.totalEstimatedCost;
  }

  /**
   * 计算成本差异百分比
   */
  getCostDifferencePercentage(): number {
    if (this.totalEstimatedCost === 0) return 0;
    return (this.getCostDifference() / Number(this.totalEstimatedCost)) * 100;
  }

  /**
   * 计算平台费用合计（运费 + 打包费）
   */
  getPlatformFeesTotal(): number {
    return (this.platformShippingFee || 0) + (this.platformPackagingFee || 0);
  }

  /**
   * 计算自定义费用合计
   */
  getCustomFeesTotal(): number {
    if (!this.customFees || this.customFees.length === 0) return 0;
    return this.customFees.reduce((sum, fee) => sum + fee.amount, 0);
  }

  /**
   * 转换为Prisma格式
   */
  toPrisma() {
    return {
      id: this.id,
      claimNumber: this.claimNumber,
      status: this.status,
      totalActualCost: this.totalActualCost,
      totalEstimatedCost: this.totalEstimatedCost,
      receiptUrls: this.receiptUrls,
      receiptKeys: this.receiptKeys,
      submittedById: this.submittedById,
      submittedAt: this.submittedAt,
      reviewedById: this.reviewedById,
      reviewedAt: this.reviewedAt,
      reviewComment: this.reviewComment,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      platformShippingFee: this.platformShippingFee,
      platformPackagingFee: this.platformPackagingFee,
      customFees: this.customFees,
      paymentProofUrls: this.paymentProofUrls,
      paymentProofKeys: this.paymentProofKeys,
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): Reimbursement {
    const purchaseLists =
      data.purchaseLists?.map((list: any) => PurchaseList.fromPrisma(list)) ||
      [];

    return new Reimbursement({
      id: data.id,
      claimNumber: data.claimNumber,
      status: data.status,
      totalActualCost: Number(data.totalActualCost),
      totalEstimatedCost: Number(data.totalEstimatedCost),
      receiptUrls: data.receiptUrls,
      receiptKeys: data.receiptKeys || [],
      submittedById: data.submittedById,
      submittedAt: data.submittedAt,
      reviewedById: data.reviewedById,
      reviewedAt: data.reviewedAt,
      reviewComment: data.reviewComment,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      purchaseLists,
      platformShippingFee: data.platformShippingFee
        ? Number(data.platformShippingFee)
        : undefined,
      platformPackagingFee: data.platformPackagingFee
        ? Number(data.platformPackagingFee)
        : undefined,
      customFees: data.customFees || [],
      paymentProofUrls: data.paymentProofUrls || [],
      paymentProofKeys: data.paymentProofKeys || [],
      // 包含关联的用户对象
      submittedBy: data.submittedBy,
      reviewedBy: data.reviewedBy,
    });
  }
}
