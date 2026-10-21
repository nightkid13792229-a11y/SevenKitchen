/**
 * 定制订单的退款分流（2026-10-21 · 代客定制食谱订单 Task 5）。
 *
 * ## 为什么必须有这个文件
 *
 * 代客单是**线下收款**：钱不在微信支付里，但订单状态同样是 `PAID`。
 * 原来的取消/退款只按“状态是不是 PAID/IN_PROGRESS”判断，于是
 * 线下单取消时会去调 `createCustomRecipeRefund` —— 微信侧没有这笔交易，
 * 轻则退款失败、顾客被卡住，重则退错钱。
 *
 * 判断“这笔钱是不是微信在线收的”不能再散落在控制器/页面里：
 *   · 后台取消、后台补退款、顾客自助取消、线下退款登记，**四处**都要问同一个问题；
 *   · 判定散开后，加一个线下渠道就一定会漏一处（这个仓库已经多次踩过）。
 *
 * 所以这里只放**纯函数与常量**：不依赖 Nest、不碰数据库，测试可直接穷举。
 */

/** 线下收款渠道：钱没有进微信支付，绝不能走微信原路退款 */
export const OFFLINE_PAYMENT_CHANNELS = [
  'OFFLINE_WECHAT',
  'OFFLINE_ALIPAY',
  'OTHER',
] as const;

export type OfflinePaymentChannel =
  (typeof OFFLINE_PAYMENT_CHANNELS)[number];

/** 线下退款方式：与收款渠道同一套取值（现金暂不单列，现金记 OTHER） */
export const OFFLINE_REFUND_METHODS = OFFLINE_PAYMENT_CHANNELS;

export type OfflineRefundMethod = OfflinePaymentChannel;

/** 线下退款的退款渠道标记，写进 `CustomRecipeOrder.refundChannel` */
export const OFFLINE_REFUND_CHANNEL = 'OFFLINE';

/**
 * 退款方式的中文（写日志/取消原因用；页面另有自己的一份展示文案）。
 *
 * 后端只在这里维护一份，避免“记录里写 OFFLINE_WECHAT、取消原因里写微信退款”
 * 这种对不上的情况。
 */
export const OFFLINE_REFUND_METHOD_TEXT: Record<string, string> = {
  OFFLINE_WECHAT: '线下微信退款',
  OFFLINE_ALIPAY: '线下支付宝退款',
  OTHER: '其他线下方式退款',
};

export function normalizePaymentChannel(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

export function isOfflinePaymentChannel(value: unknown): boolean {
  const channel = normalizePaymentChannel(value);
  return (OFFLINE_PAYMENT_CHANNELS as readonly string[]).includes(channel);
}

export function isValidOfflineRefundMethod(value: unknown): boolean {
  return (OFFLINE_REFUND_METHODS as readonly string[]).includes(
    normalizePaymentChannel(value),
  );
}

/**
 * 这张单的钱是不是**线下**收的（⇒ 不能调微信退款）。
 *
 * 两条命中任一即可：
 *   1. `paymentChannel` 是 OFFLINE_WECHAT / OFFLINE_ALIPAY / OTHER；
 *   2. `orderSource = ASSISTED` 且 `paymentConfirmedAt` 有值 ——
 *      代客单的钱只可能是线下收的（代客下单接口已禁止 WECHAT_ONLINE），
 *      即使历史数据漏了 `paymentChannel`，也不能把它当线上单退款。
 *
 * 老的自助单（`paymentChannel` 为 null）仍按线上处理 —— 它们确实走过微信支付，
 * 这个兜底不能反过来把正常退款也挡掉。
 */
export function isOfflinePaidCustomRecipeOrder(order: {
  paymentChannel?: string | null;
  orderSource?: string | null;
  paymentConfirmedAt?: Date | string | null;
}): boolean {
  if (isOfflinePaymentChannel(order?.paymentChannel)) return true;

  const source = String(order?.orderSource ?? '').trim().toUpperCase();
  return source === 'ASSISTED' && Boolean(order?.paymentConfirmedAt);
}

/**
 * 线下退款的上限：**实收多少最多退多少**。
 *
 * 订单上的 `amount` 是服务端报价；线下实收记在 `actualPaidAmount`。
 * 老数据/异常数据没有实收时退回 `amount`，但绝不会返回负数。
 */
export function resolveOfflineRefundCap(order: {
  amount?: unknown;
  actualPaidAmount?: unknown;
}): number {
  const actual = Number(order?.actualPaidAmount);
  if (Number.isFinite(actual) && actual > 0) return actual;

  const quoted = Number(order?.amount);
  if (Number.isFinite(quoted) && quoted > 0) return quoted;

  return 0;
}

/**
 * 取消原因（会记录在订单上，客服以后能看懂当时为什么关单）。
 *
 * 例：`线下退款登记：线下微信退款 ¥280.00（微信转账退回）`
 */
export function buildOfflineRefundCancellationReason(input: {
  amount: number;
  method: string;
  note?: string | null;
}): string {
  const method = normalizePaymentChannel(input.method);
  const methodText = OFFLINE_REFUND_METHOD_TEXT[method] || method || '线下退款';
  const base = `线下退款登记：${methodText} ¥${Number(input.amount).toFixed(2)}`;
  const note = String(input.note ?? '').trim();
  return note ? `${base}（${note}）` : base;
}
