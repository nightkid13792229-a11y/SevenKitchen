/**
 * 财务口径公共常量（小程序端）。
 *
 * 起账日、线下收款方式这类"全系统必须一份"的常量放这里：
 * 后台财务页、手工记账、订单详情各自写一遍，迟早会漂移。
 */

/**
 * 财务起账日（设计 2026-11-19 §4.8）。
 *
 * 后端不统计这一天的订单/退款/手工账；小程序里的日期选择、月份选择也必须裁到这一天。
 * 早于起账日的登记会直接掉出账期 —— 记了等于没记，所以 UI 要拦住。
 */
export const FINANCE_START_DATE = '2026-11-01'

/** 起账月（`YYYY-MM`）：月报/月份选择器用它当最小值 */
export const FINANCE_START_MONTH = FINANCE_START_DATE.slice(0, 7)

/**
 * 线下收款方式（钱进老板个人账户，不产生微信手续费）。
 *
 * ⚠️ 必须与后端 `finance-categories.OFFLINE_PAYMENT_METHODS` 完全一致（含顺序）：
 * `ADMIN` 是后台手动确认，`OFFLINE` 是 2026-06 起旧代客单的写法，历史数据还在。
 */
export const OFFLINE_PAYMENT_METHODS = [
  'ADMIN',
  'OFFLINE_WECHAT',
  'OFFLINE_ALIPAY',
  'OTHER',
  'OFFLINE',
] as const

export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number]

/** 某个支付方式是否算线下收款（财务、退款、改价共用这一份口径） */
export function isOfflinePaymentMethod(
  method?: string | null,
): method is OfflinePaymentMethod {
  return (
    typeof method === 'string' &&
    (OFFLINE_PAYMENT_METHODS as readonly string[]).includes(method)
  )
}

/** 财务可记账日期区间：`[FINANCE_START_DATE, todayKey]`，格式不对也按越界处理 */
export function isFinanceDateInRange(
  dateKey: string,
  todayKey: string,
): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
    dateKey >= FINANCE_START_DATE &&
    dateKey <= todayKey
  )
}
