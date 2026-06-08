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

export const DEFAULT_ORDER_CYCLE_DAYS = 7
export const ORDER_CYCLE_OPTIONS = [7, 15, 30] as const
export const MIN_ORDER_WEIGHT_G = 1000
export const MIN_PACKAGE_SPEC_G = 30

export const SOURCE_PLAN_OPTIONS: Array<{
  code: IngredientSourcePlanCode
  label: string
  description: string
}> = [
  {
    code: 'ORGANIC',
    label: '有机优先',
    description: '优先采购有机食材，如果没有有机来源，再向下选择。',
  },
  {
    code: 'MARKET_PREMIUM',
    label: '商超优先',
    description: '优先采购山姆、盒马等商超来源的食材，如果没有，再向下选择本地农贸市场或者批发市场的来源。',
  },
  {
    code: 'WHOLESALE',
    label: '批发优先',
    description: '优先采用本地大型食材批发市场来源，包括但不限于成都海吉星、海霸王、美菜网等批发市场。营养价值与有机或者商超来源几乎没有差异，但品控没有大型商超那么严格。',
  },
]

export function buildDefaultPackagePlan(
  input: BuildDefaultPackagePlanInput,
): PackagePlanItem[] {
  const mealsPerDay = normalizePositiveInteger(input.mealsPerDay, 1)
  const days = normalizePositiveInteger(input.days, DEFAULT_ORDER_CYCLE_DAYS)
  const dailyIntakeG = normalizePositiveNumber(input.dailyIntakeG, 0)
  const packageSpecG = Math.max(MIN_PACKAGE_SPEC_G, Math.round(dailyIntakeG / mealsPerDay))

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

function normalizePackageSpecG(value: number | null | undefined): number {
  return normalizePackageRowValue(value)
}

function addPackageRowTotals(
  total: PackagePlanTotal,
  row: PackagePlanRowInput | null | undefined,
): PackagePlanTotal {
  const packageSpecG = normalizePackageSpecG(row?.packageSpecG)
  const packageCount = normalizePackageRowValue(row?.packageCount)

  if (!packageSpecG || !packageCount) {
    return total
  }

  return {
    totalGrams: total.totalGrams + packageSpecG * packageCount,
    totalPackages: total.totalPackages + packageCount,
  }
}
