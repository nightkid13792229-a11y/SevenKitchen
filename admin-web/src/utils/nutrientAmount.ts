/**
 * 营养素数值的显示格式（2026-10-28）。
 *
 * ## 为什么需要它
 *
 * 明细弹窗原来一律 `${value.toFixed(1)} ${unit}`。对钾、钙这类「克」级
 * 营养素没问题，但镁这种微量元素单份贡献只有 0.005–0.03 g —— 四舍五入后
 * **整列都是 0.0 g**，用户看到「镁明明有值，每项贡献却是 0」。
 *
 * ## 口径
 *
 * - ≥ 1：保留 1 位小数（14.21 → 14.2）
 * - < 1：保留 **2 位有效数字**（0.777 → 0.78，0.0285 → 0.029，0.0054 → 0.0054）
 * - 恰好 0：显示 0
 *
 * 不自动换单位（g → mg）：同一个弹窗的顶部合计用的是标准单位，
 * 分项换单位会让「合计 0.1 克」和「分项 29 毫克」对不上。
 */
export function formatNutrientAmount(
  amount: number | null | undefined,
  unit?: string | null
): string {
  if (amount == null) return '无数据'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '无数据'

  const abs = Math.abs(value)
  const text =
    abs === 0
      ? '0'
      : abs >= 1
        ? value.toFixed(1)
        : // 2 位有效数字：既不会把微量元素压成 0，也不会给出一串没意义的小数
          String(Number(value.toPrecision(2)))

  const suffix = (unit || '').trim()
  return suffix ? `${text} ${suffix}` : text
}
