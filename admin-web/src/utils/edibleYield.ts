/**
 * 可食部比率：页面按百分比（10–100）填写，库里存 0.1–1.0 的比例。
 *
 * 换算只允许走这两个函数，避免标准原料页、AI 原料档案页各自 ÷100 / ×100
 * 写出两套口径。库内字段（`properties.edible_yield_rate`）与后端实体校验
 * 仍按比例，所以任何写库路径都必须先换成比例。
 */
export const EDIBLE_YIELD_PERCENT_MIN = 10
export const EDIBLE_YIELD_PERCENT_MAX = 100

/** 比例（0.1–1.0）→ 百分比（10–100）；非法值返回 null。 */
export function toEdibleYieldPercent(rate: unknown): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    return null
  }
  return Math.round(rate * 10000) / 100
}

/** 百分比（10–100）→ 比例（0.1–1.0）；非法值返回 null。 */
export function toEdibleYieldRate(percent: unknown): number | null {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return null
  }
  return Math.round(percent * 100) / 10000
}

/** 百分比是否落在 10–100 的合法区间。 */
export function isEdibleYieldPercentInRange(percent: unknown): boolean {
  return (
    typeof percent === 'number' &&
    Number.isFinite(percent) &&
    percent >= EDIBLE_YIELD_PERCENT_MIN &&
    percent <= EDIBLE_YIELD_PERCENT_MAX
  )
}
