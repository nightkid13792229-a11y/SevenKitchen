/**
 * Purchasing Domain Enums
 * Phase 1: Purchasing Management Feature
 */

/**
 * 采购清单状态
 */
export enum PurchaseListStatus {
  PENDING = 'PENDING',       // 待采购
  COMPLETED = 'COMPLETED',   // 采购完成
  CANCELLED = 'CANCELLED',   // 已取消
}

/**
 * 报销单状态
 */
export enum ReimbursementStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',      // 待审核
  APPROVED = 'APPROVED',                  // 已批准
  REJECTED = 'REJECTED',                  // 已驳回
  REQUIRES_RESUBMIT = 'REQUIRES_RESUBMIT', // 需重新提交
}

/**
 * 状态机转换规则
 */
export const PURCHASE_LIST_STATUS_TRANSITIONS: Record<PurchaseListStatus, PurchaseListStatus[]> = {
  [PurchaseListStatus.PENDING]: [PurchaseListStatus.COMPLETED, PurchaseListStatus.CANCELLED],
  [PurchaseListStatus.COMPLETED]: [],             // 终态
  [PurchaseListStatus.CANCELLED]: [],             // 终态
};

export const REIMBURSEMENT_STATUS_TRANSITIONS: Record<ReimbursementStatus, ReimbursementStatus[]> = {
  [ReimbursementStatus.PENDING_REVIEW]: [
    ReimbursementStatus.APPROVED,
    ReimbursementStatus.REJECTED,
    ReimbursementStatus.REQUIRES_RESUBMIT
  ],
  [ReimbursementStatus.APPROVED]: [],                           // 终态
  [ReimbursementStatus.REJECTED]: [],                           // 终态
  [ReimbursementStatus.REQUIRES_RESUBMIT]: [ReimbursementStatus.PENDING_REVIEW], // 可重新提交
};
