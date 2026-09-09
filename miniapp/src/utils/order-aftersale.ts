/**
 * 订单售后状态统一规则（P1-6/7/8）
 * 订单列表页与详情页共用同一套「状态 → 中文名 → 能否售后」判定，避免两处规则不一致。
 */

export const ORDER_STATUS_TEXT: Record<string, string> = {
  INIT: '待确认',
  PENDING_PAYMENT: '待付款',
  PAID: '已付款',
  PURCHASING: '采购中',
  IN_PRODUCTION: '生产中',
  FREEZING: '急冻中',
  SHIPPED: '已发货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  AFTERSALE: '售后中',
};

// 未知状态兜底为"处理中"，禁止英文状态码漏出
export function getOrderStatusText(status?: string | null): string {
  if (!status) return '处理中';
  return ORDER_STATUS_TEXT[status] || '处理中';
}

const REFUNDABLE_STATUSES = [
  'PAID',
  'PURCHASING',
  'IN_PRODUCTION',
  'FREEZING',
  'SHIPPED',
  'COMPLETED',
];

const REMAKEABLE_STATUSES = ['FREEZING', 'SHIPPED', 'COMPLETED'];

const COMPLAINTABLE_STATUSES = [
  'PAID',
  'PURCHASING',
  'IN_PRODUCTION',
  'FREEZING',
  'SHIPPED',
  'COMPLETED',
];

// 已完成订单：收货 7 天后禁止退款/重做（投诉/反馈不受限）
const COMPLETED_AFTERSALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isCompletedWithinWindow(completedAt?: string | null): boolean {
  if (!completedAt) return true;
  const completed = new Date(completedAt).getTime();
  if (!Number.isFinite(completed)) return true;
  return Date.now() - completed <= COMPLETED_AFTERSALE_WINDOW_MS;
}

export function canApplyRefund(
  status: string,
  completedAt?: string | null,
): boolean {
  if (!REFUNDABLE_STATUSES.includes(status)) return false;
  if (status === 'COMPLETED') return isCompletedWithinWindow(completedAt);
  return true;
}

export function canApplyRemake(
  status: string,
  completedAt?: string | null,
): boolean {
  if (!REMAKEABLE_STATUSES.includes(status)) return false;
  if (status === 'COMPLETED') return isCompletedWithinWindow(completedAt);
  return true;
}

export function canApplyComplaint(status: string): boolean {
  return COMPLAINTABLE_STATUSES.includes(status);
}

export function canApplyAftersale(
  status: string,
  completedAt?: string | null,
): boolean {
  return (
    canApplyRefund(status, completedAt) ||
    canApplyRemake(status, completedAt) ||
    canApplyComplaint(status)
  );
}
