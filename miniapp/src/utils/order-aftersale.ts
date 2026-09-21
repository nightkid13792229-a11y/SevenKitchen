/**
 * 订单售后状态统一规则
 * 订单列表页与详情页共用同一套「状态 → 中文名 → 能否售后」判定，避免两处规则不一致。
 *
 * ===== 2026-09-19 售后窗口重新划分 =====
 *
 * 按订单所处阶段划分成三个区间，而不是"全流程都能售后"：
 *
 *   ① 取消窗口：已付款（尚未生成采购清单）
 *      此时我们还没有为这一单花过一分钱 —— 顾客可以随时整单取消、全额退款。
 *      预约制下这个窗口可能长达数天（预约 3 天后制作 → 这 3 天都停在"已付款"）。
 *
 *   ② 锁定期：采购中 / 生产中 / 急冻中
 *      采购清单一生成，我们就开始真金白银投入 —— 不再支持自助取消或退款，
 *      页面改为引导"联系客服"。重做在这一阶段也无意义（东西还没到手）。
 *      ⚠️ 但投诉建议**全程保留**：投诉与订单进度无关，且关闭投诉渠道会把顾客
 *         推向平台投诉或差评，损失更大。
 *
 *   ③ 售后窗口：已发货 / 已完成
 *      真正的"售后服务" —— 破损、变质等品质问题可申请退款或免费重做。
 *      已完成订单限"确认收货后 7 天内"。
 *
 * 法律依据：《消费者权益保护法》第二十五条 —— 消费者定作的商品不适用七日无理由退货；
 * 我们的鲜食按预约定作，属于该范畴。质量问题仍全额负责（比法定要求更宽）。
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

/** ① 取消窗口：已付款、尚未进入采购 —— 我们还没为这一单产生成本 */
const CANCELABLE_STATUSES = ['PAID'];

/** ② 锁定期：已开始为这一单投入，不支持自助退款/重做 */
const LOCKED_STATUSES = ['PURCHASING', 'IN_PRODUCTION', 'FREEZING'];

/** ③ 售后窗口：退款（限已发货/已完成） */
const REFUNDABLE_STATUSES = ['SHIPPED', 'COMPLETED'];

/** ③ 售后窗口：重做（东西已到手才谈得上重做） */
const REMAKEABLE_STATUSES = ['SHIPPED', 'COMPLETED'];

/** 投诉建议：全程可用（与订单进度无关，且不应关闭这一渠道） */
const COMPLAINTABLE_STATUSES = [
  'PAID',
  'PURCHASING',
  'IN_PRODUCTION',
  'FREEZING',
  'SHIPPED',
  'COMPLETED',
];

// 已完成订单：确认收货 7 天后禁止退款/重做（投诉/反馈不受限）
const COMPLETED_AFTERSALE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isCompletedWithinWindow(completedAt?: string | null): boolean {
  if (!completedAt) return true;
  const completed = new Date(completedAt).getTime();
  if (!Number.isFinite(completed)) return true;
  return Date.now() - completed <= COMPLETED_AFTERSALE_WINDOW_MS;
}

/**
 * 是否可以「取消订单」（整单取消 + 全额退款）。
 * 仅限已付款且尚未进入采购的阶段，此时取消对我们零成本。
 */
export function canCancelOrder(status: string): boolean {
  return CANCELABLE_STATUSES.includes(status);
}

/**
 * 是否处于锁定期（采购中 / 生产中 / 急冻中）。
 * 这些状态下不提供自助取消或退款，页面应引导顾客联系客服。
 */
export function isAftersaleLocked(status: string): boolean {
  return LOCKED_STATUSES.includes(status);
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
    canCancelOrder(status) ||
    canApplyRefund(status, completedAt) ||
    canApplyRemake(status, completedAt) ||
    canApplyComplaint(status)
  );
}

/**
 * 售后入口的文案：不同阶段叫法不同，避免让顾客在"取消"场景看到"申请退款"。
 *   · 已付款（未采购）→ 取消订单
 *   · 已发货/已完成   → 申请售后
 *   · 锁定期          → 投诉建议
 */
export function getAftersaleEntryLabel(
  status: string,
  completedAt?: string | null,
): string {
  if (canCancelOrder(status)) return '取消订单';
  if (
    canApplyRefund(status, completedAt) ||
    canApplyRemake(status, completedAt)
  ) {
    return '申请售后';
  }
  if (canApplyComplaint(status)) return '投诉建议';
  return '';
}
