/**
 * Reimbursement Entity
 * 报销单实体
 */

import { v4 as uuidv4 } from 'uuid';
import { ReimbursementStatus, REIMBURSEMENT_STATUS_TRANSITIONS, PurchaseListStatus } from './enums';
import { PurchaseList } from './purchase-list.entity';
import { InvalidStateTransitionError } from '../common/errors';

export interface ReimbursementConstructor {
  id?: string;
  claimNumber: string;
  status?: ReimbursementStatus;
  totalActualCost: number;
  totalEstimatedCost: number;
  receiptUrls: string[];
  submittedById: string;
  submittedAt: Date;
  reviewedById?: string;
  reviewedAt?: Date;
  reviewComment?: string;
  createdAt?: Date;
  updatedAt?: Date;
  purchaseLists?: PurchaseList[];
}

export class Reimbursement {
  public readonly id: string;
  public readonly claimNumber: string;
  public status: ReimbursementStatus;
  public readonly totalActualCost: number;
  public readonly totalEstimatedCost: number;
  public readonly receiptUrls: string[];
  public readonly submittedById: string;
  public readonly submittedAt: Date;
  public reviewedById?: string;
  public reviewedAt?: Date;
  public reviewComment?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public purchaseLists: PurchaseList[];

  constructor(data: ReimbursementConstructor) {
    this.id = data.id || uuidv4();
    this.claimNumber = data.claimNumber;
    this.status = data.status || ReimbursementStatus.PENDING_REVIEW;
    this.totalActualCost = data.totalActualCost;
    this.totalEstimatedCost = data.totalEstimatedCost;
    this.receiptUrls = data.receiptUrls;
    this.submittedById = data.submittedById;
    this.submittedAt = data.submittedAt;
    this.reviewedById = data.reviewedById;
    this.reviewedAt = data.reviewedAt;
    this.reviewComment = data.reviewComment;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.purchaseLists = data.purchaseLists || [];

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

    if (this.purchaseLists.length === 0) {
      throw new Error('Reimbursement must have at least one purchase list');
    }

    // 验证所有采购清单都是COMPLETED状态
    const allCompleted = this.purchaseLists.every(
      list => list.status === PurchaseListStatus.COMPLETED
    );
    if (!allCompleted) {
      throw new Error('All purchase lists must be completed before reimbursement');
    }

    // 验证发票照片数量（最多10张）
    if (this.receiptUrls.length > 10) {
      throw new Error('Maximum 10 receipt photos allowed');
    }
  }

  /**
   * 审核报销单
   * 状态转换: PENDING_REVIEW → APPROVED/REJECTED/REQUIRES_RESUBMIT
   */
  review(
    reviewerId: string,
    decision: 'APPROVE' | 'REJECT' | 'REQUIRES_RESUBMIT',
    comment?: string
  ): void {
    if (this.status !== ReimbursementStatus.PENDING_REVIEW) {
      throw new InvalidStateTransitionError(
        `Only PENDING_REVIEW reimbursements can be reviewed`
      );
    }

    const allowedTransitions = REIMBURSEMENT_STATUS_TRANSITIONS[this.status];
    let newStatus: ReimbursementStatus;

    switch (decision) {
      case 'APPROVE':
        newStatus = ReimbursementStatus.APPROVED;
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
        `Invalid state transition from ${this.status} to ${newStatus}`
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
        `Only REJECTED or REQUIRES_RESUBMIT reimbursements can be resubmitted`
      );
    }

    this.status = ReimbursementStatus.PENDING_REVIEW;
    this.reviewedById = undefined;
    this.reviewedAt = undefined;
    this.reviewComment = undefined;
    this.updatedAt = new Date();

    // 如果提供了新的发票照片，更新它们
    if (newReceiptUrls) {
      (this.receiptUrls as string[]) = newReceiptUrls;
    }
  }

  /**
   * 检查是否已批准
   */
  isApproved(): boolean {
    return this.status === ReimbursementStatus.APPROVED;
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
      submittedById: this.submittedById,
      submittedAt: this.submittedAt,
      reviewedById: this.reviewedById,
      reviewedAt: this.reviewedAt,
      reviewComment: this.reviewComment,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): Reimbursement {
    const purchaseLists = data.purchaseLists?.map(
      (list: any) => PurchaseList.fromPrisma(list)
    ) || [];

    return new Reimbursement({
      id: data.id,
      claimNumber: data.claimNumber,
      status: data.status,
      totalActualCost: Number(data.totalActualCost),
      totalEstimatedCost: Number(data.totalEstimatedCost),
      receiptUrls: data.receiptUrls,
      submittedById: data.submittedById,
      submittedAt: data.submittedAt,
      reviewedById: data.reviewedById,
      reviewedAt: data.reviewedAt,
      reviewComment: data.reviewComment,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      purchaseLists,
    });
  }
}
