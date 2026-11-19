/**
 * 订单线下退款登记：金额/日期口径（设计 2026-11-19 §4.2 / §6.6）。
 *
 * 这些计算原来散在页面里，回归 spec 只能读源码字符串，断言不到"默认金额 = 剩余"、
 * "超额拦下"这类行为。抽成纯函数后，页面和测试用同一份口径。
 *
 * 金额一律换算成整数分再比较：`776.54 + 100 = 876.5400000000001`
 * 这类浮点误差会把刚好退满的合法登记误判成超额（后端也踩过）。
 */

import { FINANCE_START_DATE, isFinanceDateInRange } from '../constants/finance'

export interface OfflineRefundAmountLike {
  amount?: number | string | null
}

function toCents(value: unknown): number {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) : 0
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

/** 已登记退款合计（元） */
export function sumOfflineRefundAmounts(
  items: OfflineRefundAmountLike[] | undefined | null,
): number {
  return fromCents(
    (items || []).reduce((sum, item) => sum + toCents(item?.amount), 0),
  )
}

/** 还能退多少：实收 − 已登记，最小 0 */
export function resolveOfflineRefundRemaining(
  paidAmount: unknown,
  refundedAmount: unknown,
): number {
  return Math.max(0, fromCents(toCents(paidAmount) - toCents(refundedAmount)))
}

/**
 * 打开弹层时的默认金额：把「还能退的钱」全部填上。
 * 老板多数情况退一部分，再自己改小；默认空着更容易漏填或退错。
 */
export function resolveOfflineRefundDefaultAmount(
  paidAmount: unknown,
  refundedAmount: unknown,
): string {
  return resolveOfflineRefundRemaining(paidAmount, refundedAmount).toFixed(2)
}

export type OfflineRefundAmountValidation =
  | { ok: true; amount: number }
  | { ok: false; message: string }

/**
 * 提交前校验本次退款金额：空/非数字/非正数/超过两位小数/超过剩余都在前端拦下，
 * 不把明显超额的请求发给后端（后端仍会再校验一次）。
 */
export function validateOfflineRefundAmount(
  raw: unknown,
  remaining: number,
): OfflineRefundAmountValidation {
  const text = String(raw ?? '').trim()
  if (!text || !/^\d*\.?\d*$/.test(text)) {
    return { ok: false, message: '请输入正确的退款金额' }
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: '请输入正确的退款金额' }
  }
  const cents = Math.round(value * 100)
  if (Math.abs(cents - value * 100) > 1e-6) {
    return { ok: false, message: '退款金额最多两位小数' }
  }
  const remainingCents = toCents(remaining)
  if (cents > remainingCents) {
    return {
      ok: false,
      message: `退款金额超过剩余可退 ¥${fromCents(remainingCents).toFixed(2)}`,
    }
  }
  return { ok: true, amount: fromCents(cents) }
}

/**
 * 退款日期必须在 `[起账日, 今天]` 内。
 * 早于起账日会掉出账期、晚于今天会落到未来月份，两种都不能提交。
 */
export function validateOfflineRefundDate(
  dateKey: string,
  todayKey: string,
): { ok: true } | { ok: false; message: string } {
  if (!isFinanceDateInRange(dateKey, todayKey)) {
    return {
      ok: false,
      message: `退款日期需在 ${FINANCE_START_DATE} 至今天之间`,
    }
  }
  return { ok: true }
}
