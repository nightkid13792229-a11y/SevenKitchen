/**
 * 代客下单确认页用的纯函数。
 *
 * 放在这里的唯一理由：这两条规则值得被单独盯住 ——
 * 「不足 1000g 要抬天数」和「实收与报价差一分钱也算不一致」。
 * 页面只负责展示与调用，不再各写一遍判断。
 */

/** 成品鲜食最低订购量（克），与顾客端 `usePackagePlan` 同一口径 */
export const MIN_ASSISTED_ORDER_G = 1000

/** 金额比较容差：分以下是浮点误差，不算不一致 */
const AMOUNT_EPSILON = 0.005

/**
 * 默认订购天数不满足最低订购量时，抬到刚好够的最小天数。
 *
 * 后端定价对 1000g 是硬校验，抬天数是唯一不改变克重口径的解法；
 * 静默放过只会让员工在下单那一刻收到一个看不懂的 400。
 */
export function resolveDaysForMinOrder(
  dailyIntakeG: number,
  days: number,
  minOrderG: number = MIN_ASSISTED_ORDER_G,
): { days: number; raised: boolean } {
  const daily = Number(dailyIntakeG)
  const currentDays = Number(days)
  const minG = Number(minOrderG)

  if (!Number.isFinite(daily) || daily <= 0) {
    throw new Error('每日克数不合法，无法判断最低订购量')
  }
  if (!Number.isFinite(currentDays) || currentDays < 1) {
    throw new Error('订购天数不合法')
  }

  const totalG = daily * currentDays
  if (totalG >= minG) {
    return { days: currentDays, raised: false }
  }
  return { days: Math.ceil(minG / daily), raised: true }
}

/** 实收金额与系统报价是否不一致（不一致就必须写原因） */
export function needsAmountAdjustReason(
  systemAmount: number,
  actualAmount: number,
): boolean {
  const system = Number(systemAmount)
  const actual = Number(actualAmount)
  if (!Number.isFinite(system) || !Number.isFinite(actual)) return false
  return Math.abs(system - actual) > AMOUNT_EPSILON
}

/**
 * 抬天数直到"分装计划总重"够最低订购量。
 *
 * 为什么不能直接 `minOrderG / dailyIntakeG` 取整：真正提交的克数不是
 * `daily × days`，而是分装计划的总和（每袋克数要取整、还要按餐次拆），
 * 3 餐的时候按天数算够 1000g、实际拆出来可能只有 990g，后端定价照样拒。
 * 所以这里接受一个"给定天数能算出的总重"回调，按真实总重往上试。
 */
export function resolveDaysUntilMinOrder(
  startDaysInput: number,
  totalGForDays: (days: number) => number,
  minOrderGInput: number = MIN_ASSISTED_ORDER_G,
  maxDaysInput = 90,
): { days: number; raised: boolean } {
  const startDays = Math.max(1, Math.floor(Number(startDaysInput) || 1))
  const minOrderG = Number(minOrderGInput)
  const maxDays = Math.max(startDays, Number(maxDaysInput) || 90)

  if (!Number.isFinite(minOrderG) || minOrderG <= 0) {
    throw new Error('最低订购量不合法')
  }
  if (totalGForDays(startDays) >= minOrderG) {
    return { days: startDays, raised: false }
  }

  for (let days = startDays + 1; days <= maxDays; days += 1) {
    if (totalGForDays(days) >= minOrderG) {
      return { days, raised: true }
    }
  }
  return { days: maxDays, raised: true }
}
