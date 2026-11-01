/**
 * 从"当前分装"反推顾客当初点的是哪个快速天数。
 *
 * 为什么需要：制作单从 2026-11-01 起不再存天数（单位只有袋和克），
 * 所以客人从 DIY 配置页选过的"15 天"在数据里只剩下一串袋规。
 * 补剂下单页要把这个选择原样带过来，就得能认回来。
 *
 * 认法：拿当前分装和 7/15/30 三档的默认分装逐项比对，能对上就是那一档，
 * 对不上就是"自定义分装"。
 *
 * ⚠️ 只用于**界面上的高亮与模式**，绝不参与任何金额或用量计算 ——
 * 袋规本身就是事实，天数只是个"当初选了什么"的回忆。
 */
import {
  ORDER_CYCLE_OPTIONS,
  buildDefaultPackagePlan,
  type PackagePlanItem
} from './order-package-plan'

export interface PackagePlanMode {
  /** 认出来的天数；自定义时为 null */
  cycleDays: number | null
  isCustom: boolean
}

export function inferPackagePlanMode(
  rows: Array<Partial<PackagePlanItem>> | null | undefined,
  context: { dailyIntakeG?: number | null; mealsPerDay?: number | null }
): PackagePlanMode {
  const plan = normalizeRows(rows)
  const dailyIntakeG = Number(context.dailyIntakeG)
  const mealsPerDay = Number(context.mealsPerDay)

  if (plan.length === 0) return { cycleDays: null, isCustom: true }
  if (!Number.isFinite(dailyIntakeG) || dailyIntakeG <= 0) {
    return { cycleDays: null, isCustom: true }
  }
  if (!Number.isFinite(mealsPerDay) || mealsPerDay < 1) {
    return { cycleDays: null, isCustom: true }
  }

  if (plan.length === 1) {
    for (const days of ORDER_CYCLE_OPTIONS) {
      const expected = normalizeRows(
        buildDefaultPackagePlan({ dailyIntakeG, mealsPerDay, days })
      )
      if (expected.length === 1 && sameRow(expected[0], plan[0])) {
        return { cycleDays: days, isCustom: false }
      }
    }
  }

  return { cycleDays: null, isCustom: true }
}

function normalizeRows(
  rows: Array<Partial<PackagePlanItem>> | null | undefined
): PackagePlanItem[] {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => ({
      packageSpecG: Math.floor(Number(row?.packageSpecG)),
      packageCount: Math.floor(Number(row?.packageCount))
    }))
    .filter(
      (row) =>
        Number.isFinite(row.packageSpecG) &&
        row.packageSpecG > 0 &&
        Number.isFinite(row.packageCount) &&
        row.packageCount > 0
    )
}

function sameRow(a: PackagePlanItem, b: PackagePlanItem): boolean {
  return a.packageSpecG === b.packageSpecG && a.packageCount === b.packageCount
}
