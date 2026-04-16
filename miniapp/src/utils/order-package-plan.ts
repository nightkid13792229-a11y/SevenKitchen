export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE'

export interface PackagePlanItem {
  packageSpecG: number
  packageCount: number
}

export const DEFAULT_ORDER_CYCLE_DAYS = 15
export const ORDER_CYCLE_OPTIONS = [7, 15, 30] as const
export const MIN_ORDER_WEIGHT_G = 1000

export const SOURCE_PLAN_OPTIONS: Array<{
  code: IngredientSourcePlanCode
  label: string
  description: string
}> = [
  {
    code: 'ORGANIC',
    label: '尽量有机来源',
    description: '优先匹配有机、生态、认证来源',
  },
  {
    code: 'MARKET_PREMIUM',
    label: '尽量山姆、盒马、沃集鲜',
    description: '默认方案，稳定且品质较好',
  },
  {
    code: 'WHOLESALE',
    label: '生鲜批发商',
    description: '高性价比，适合大规格订购',
  },
]

export function buildDefaultPackagePlan(input: {
  dailyIntakeG: number
  mealsPerDay: number
  days: number
}): PackagePlanItem[] {
  const mealsPerDay = Math.max(1, Math.floor(input.mealsPerDay || 1))
  const packageSpecG = Math.max(
    1,
    Math.round((input.dailyIntakeG || 0) / mealsPerDay),
  )

  return [
    {
      packageSpecG,
      packageCount: mealsPerDay * input.days,
    },
  ]
}

export function getPackagePlanTotal(plan: PackagePlanItem[]) {
  return plan.reduce(
    (total, row) => ({
      totalGrams: total.totalGrams + row.packageSpecG * row.packageCount,
      totalPackages: total.totalPackages + row.packageCount,
    }),
    { totalGrams: 0, totalPackages: 0 },
  )
}

export function isMinimumOrderMet(totalGrams: number): boolean {
  return totalGrams >= MIN_ORDER_WEIGHT_G
}

export function estimateFeedDays(
  totalGrams: number,
  dailyIntakeG: number,
): string {
  if (!dailyIntakeG || dailyIntakeG <= 0) {
    return '-'
  }

  return (totalGrams / dailyIntakeG).toFixed(1)
}

export function getSourcePlanLabel(code: IngredientSourcePlanCode): string {
  return SOURCE_PLAN_OPTIONS.find((item) => item.code === code)?.label || ''
}
