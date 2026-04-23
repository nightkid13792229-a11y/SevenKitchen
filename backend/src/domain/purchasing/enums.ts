/**
 * Purchasing Domain Enums
 * Phase 1: Purchasing Management Feature
 */

/**
 * 采购清单状态
 */
export enum PurchaseListStatus {
  PENDING = 'PENDING', // 待采购
  COMPLETED = 'COMPLETED', // 采购完成
}

/**
 * 采购清单类型
 */
export enum PurchaseListKind {
  ORDER_DEMAND = 'ORDER_DEMAND', // 订单缺口采购
  STOCK_REPLENISHMENT = 'STOCK_REPLENISHMENT', // 库存补货采购
}

/**
 * 报销单状态
 */
export enum ReimbursementStatus {
  PENDING_REVIEW = 'PENDING_REVIEW', // 待报销（内部沿用旧枚举名）
  REIMBURSED = 'REIMBURSED', // 已报销
  REJECTED = 'REJECTED', // 已驳回
  REQUIRES_RESUBMIT = 'REQUIRES_RESUBMIT', // 需重新提交
}

/**
 * 状态机转换规则
 */
export const PURCHASE_LIST_STATUS_TRANSITIONS: Record<
  PurchaseListStatus,
  PurchaseListStatus[]
> = {
  [PurchaseListStatus.PENDING]: [PurchaseListStatus.COMPLETED],
  [PurchaseListStatus.COMPLETED]: [], // 终态
};

export const REIMBURSEMENT_STATUS_TRANSITIONS: Record<
  ReimbursementStatus,
  ReimbursementStatus[]
> = {
  [ReimbursementStatus.PENDING_REVIEW]: [
    ReimbursementStatus.REIMBURSED,
    ReimbursementStatus.REJECTED,
    ReimbursementStatus.REQUIRES_RESUBMIT,
  ],
  [ReimbursementStatus.REIMBURSED]: [], // 终态
  [ReimbursementStatus.REJECTED]: [], // 终态
  [ReimbursementStatus.REQUIRES_RESUBMIT]: [ReimbursementStatus.PENDING_REVIEW], // 可重新提交
};
