export type IngredientSourcePlanCode =
  | 'ORGANIC'
  | 'MARKET_PREMIUM'
  | 'WHOLESALE'

export interface PackagePlanItem {
  packageSpecG: number
  packageCount: number
}

export interface BuildDefaultPackagePlanInput {
  dailyIntakeG: number | null | undefined
  mealsPerDay: number | null | undefined
  days: number | null | undefined
}

export interface PackagePlanRowInput {
  packageSpecG?: number | null | undefined
  packageCount?: number | null | undefined
}

export interface PackagePlanTotal {
  totalGrams: number
  totalPackages: number
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

export function buildDefaultPackagePlan(
  input: BuildDefaultPackagePlanInput,
): PackagePlanItem[] {
  const mealsPerDay = normalizePositiveInteger(input.mealsPerDay, 1)
  const days = normalizePositiveInteger(input.days, DEFAULT_ORDER_CYCLE_DAYS)
  const dailyIntakeG = normalizePositiveNumber(input.dailyIntakeG, 0)
  const packageSpecG = Math.max(1, Math.round(dailyIntakeG / mealsPerDay))

  return [
    {
      packageSpecG,
      packageCount: mealsPerDay * days,
    },
  ]
}

export function getPackagePlanTotal(
  plan: Array<PackagePlanRowInput>,
): PackagePlanTotal {
  return plan.reduce(
    (total, row) => ({
      ...addPackageRowTotals(total, row),
    }),
    { totalGrams: 0, totalPackages: 0 },
  )
}

export function isMinimumOrderMet(totalGrams: number): boolean {
  return Number.isFinite(totalGrams) && totalGrams >= MIN_ORDER_WEIGHT_G
}

export function estimateFeedDays(
  totalGrams: number,
  dailyIntakeG: number,
): string {
  if (
    !Number.isFinite(totalGrams)
    || totalGrams <= 0
    || !Number.isFinite(dailyIntakeG)
    || dailyIntakeG <= 0
  ) {
    return '-'
  }

  return (totalGrams / dailyIntakeG).toFixed(1)
}

export function getSourcePlanLabel(code: IngredientSourcePlanCode): string {
  return SOURCE_PLAN_OPTIONS.find((item) => item.code === code)?.label || ''
}

function normalizePositiveInteger(
  value: number | null | undefined,
  fallback: number,
): number {
  const normalized = Math.floor(Number(value))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

function normalizePositiveNumber(
  value: number | null | undefined,
  fallback: number,
): number {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback
}

function normalizePackageRowValue(value: number | null | undefined): number {
  const normalized = Math.floor(Number(value))
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0
}

function addPackageRowTotals(
  total: PackagePlanTotal,
  row: PackagePlanRowInput | null | undefined,
): PackagePlanTotal {
  const packageSpecG = normalizePackageRowValue(row?.packageSpecG)
  const packageCount = normalizePackageRowValue(row?.packageCount)

  if (!packageSpecG || !packageCount) {
    return total
  }

  return {
    totalGrams: total.totalGrams + packageSpecG * packageCount,
    totalPackages: total.totalPackages + packageCount,
  }
}
