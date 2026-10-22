/**
 * ② 营养依据站候选卡上的覆盖率文案。
 *
 * 后端只返回百分比与缺失项数（例如 86.7 / 4），页面需要还原成人能读的
 * 「已覆盖 / 总数 · 缺 N」。总数从百分比与缺失数反推，**不写死 30 项**：
 * 必需营养素会随规则版本变化，写死会让 46 项时显示成错误的分母。
 */
export function formatCoverage(percent: number, missing: number): string {
  const safePercent = Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : 0
  const safeMissing = Number.isFinite(missing)
    ? Math.max(0, Math.round(missing))
    : 0

  if (safeMissing === 0) {
    return '全部覆盖 · 缺 0'
  }

  // 覆盖率 = (总数 - 缺失) / 总数；反解总数。百分比是四舍五入后的值，
  // 用缺失数反推再取整能把 86.7%、4 项还原成 30 项而不是 30.07。
  const denominator = 1 - safePercent / 100
  const total =
    denominator > 0
      ? Math.max(safeMissing, Math.round(safeMissing / denominator))
      : safeMissing
  const present = Math.max(0, total - safeMissing)

  return `${present} / ${total} · 缺 ${safeMissing}`
}
