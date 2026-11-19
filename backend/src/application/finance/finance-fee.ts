/**
 * 支付手续费口径
 *
 * 只有线上支付（微信商户号收款）产生手续费：`(实收 − 已退) × 费率`，
 * 四舍五入到分。退款时微信按比例退回已收手续费，所以全额退款后为负数。
 */

/** 默认手续费率 6‰；实际取值以配置项 `finance.wechatFeeRate` 为准 */
export const DEFAULT_WECHAT_FEE_RATE = 0.006;

/** 金额转分，避免浮点误差进到四舍五入 */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * 四舍五入到整数，负数按绝对值取整再带符号（half away from zero），
 * 避免 JS `Math.round` 对负数「向 +∞ 舍入」导致退款/收款手续费不对称。
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * 计算手续费（元）：正数表示支出，负数表示退款时退回的手续费。
 * 每笔独立取整到分，所以多次部分退款之和可能比整单一次退款差 1 分。
 * @param paid 实收金额（元）
 * @param refunded 已退金额（元）
 * @param rate 费率，如 0.006
 */
export function computeFeeAmount(
  paid: number,
  refunded: number,
  rate: number,
): number {
  const netCents = toCents(paid) - toCents(refunded);
  return roundHalfAwayFromZero(netCents * rate) / 100;
}
