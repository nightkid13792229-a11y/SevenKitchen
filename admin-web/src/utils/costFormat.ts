/**
 * 每基准单位成本的显示（2026-11-08）。
 *
 * 成本在库里按 6 位小数存（9.99 ÷ 200g = 0.049950），但页面曾按
 * 2/4 位显示，0.04995 被四舍五入成 0.05，看起来像算错了。
 *
 * 食材的每克/每毫升成本一律保留 6 位；非食材的采购单位价仍保留 2 位。
 * 缺失值显示「—」，不要冒充 0（0 是「免费」，不是「没定价」）。
 */
export function formatUnitCost(
  value: number | null | undefined,
  digits = 6,
): string {
  if (value === null || value === undefined) {
    return '—'
  }

  const num = Number(value)
  if (!Number.isFinite(num)) {
    return '—'
  }

  return `¥${num.toFixed(digits)}`
}
