/**
 * 补剂三口径 · 制作单展示映射（2026-11-15）
 *
 * 服务端给的是「参考产品 + 预分装池 + 推荐商品」三块，这里只负责：
 *   · 决定每一行落到哪一种状态（可分装 / 暂不可购买 / 仅生产）；
 *   · 挑出默认的预分装产品；
 *   · 生成预分装购买行。
 *
 * 顾客不选我们生产/分装用哪款——选中项只用于「买哪一款」。
 */

export interface SupplementRepackOption {
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  displayUnit: string
  unit: string
  amount: number | null
  available: boolean
  unavailableReason: string | null
  isDefault: boolean
  concentrations?: Array<{ fieldPath: string; value: number; unit: string }>
}

export interface SupplementRecommendedProduct {
  id: string
  name: string
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  purchaseLink: any
  imageUrl: string | null
  displayUnit: string | null
}

export interface SupplementPlanReference {
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  displayUnit: string
  amount: number | null
  unit: string
  status: string
  targets: Array<{
    fieldPath: string
    label: string
    unit: string
    targetValuePerKg: number
  }>
}

export interface SupplementPlanItem {
  recipeItemId: string
  sourceIngredientId: string
  name: string
  preparationMethod: string | null
  addTimingLabel: string | null
  sortOrder: number
  reference: SupplementPlanReference
  recommendedProducts: SupplementRecommendedProduct[]
  repackPool: SupplementRepackOption[]
}

export interface SupplementPlanResponse {
  totalWeightG: number
  weightSource: 'DIY_SHEET' | 'QUERY'
  recipeVersion: number
  items: SupplementPlanItem[]
}

export type SupplementRowState = 'REPACK' | 'TEMP_UNAVAILABLE' | 'PRODUCTION_ONLY'

export interface SupplementPlanRow {
  recipeItemId: string
  ingredientId: string
  sourceIngredientId: string
  name: string
  brand: string
  productModel?: string
  referenceText: string
  /** 制作单展示用量：永远按参考产品算，不跟着预分装款走 */
  amount: number
  unit: string
  displayUnit: string
  /** 预分装那一款自己的用量/单位（下单前参考） */
  repackAmount: number
  repackDisplayUnit: string
  /** 参考产品的营养目标（营养信息弹窗/打印用） */
  targets: Array<{
    fieldPath: string
    label: string
    unit: string
    targetValuePerKg: number
  }>
  state: SupplementRowState
  recommendedProducts: SupplementRecommendedProduct[]
  repackPool: SupplementRepackOption[]
  selectedRepackIngredientId: string
  preparationMethod: string
  targetSummary: string
}

export interface SupplementPurchaseLine {
  recipeItemId: string
  ingredientId: string
  name: string
  unit: string
  specText: string
}

function productText(product: {
  name?: string | null
  brand?: string | null
  productModel?: string | null
}): string {
  const parts = [product?.brand, product?.productModel]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value && value !== '-')
  if (parts.length > 0) return parts.join(' / ')
  const name = String(product?.name ?? '').trim()
  return name && name !== '-' ? name : '-'
}

export function resolveRowState(
  pool: SupplementRepackOption[] | undefined,
): SupplementRowState {
  if (!pool || pool.length === 0) return 'PRODUCTION_ONLY'
  return pool[0]?.available ? 'REPACK' : 'TEMP_UNAVAILABLE'
}

function pickDefaultOption(
  item: SupplementPlanItem,
  selections: Record<string, string | undefined>,
): SupplementRepackOption | null {
  const pool = item.repackPool || []
  const wanted = selections[item.recipeItemId]
  if (wanted) {
    const selected = pool.find(
      (option) => option.ingredientId === wanted && option.available,
    )
    if (selected) return selected
  }
  return (
    pool.find((option) => option.isDefault && option.available) ??
    pool.find((option) => option.available) ??
    pool[0] ??
    null
  )
}

export function buildSupplementPlanRows(
  plan: Pick<SupplementPlanResponse, 'items'> | null | undefined,
  selections: Record<string, string | undefined> = {},
): SupplementPlanRow[] {
  return [...(plan?.items || [])]
    .sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0))
    .map((item) => {
      const state = resolveRowState(item.repackPool)
      const selected = pickDefaultOption(item, selections)
      return {
        recipeItemId: item.recipeItemId,
        ingredientId: selected?.ingredientId ?? item.reference.ingredientId,
        sourceIngredientId: item.sourceIngredientId,
        name: item.name,
        brand: selected?.brand || '-',
        productModel: selected?.productModel || undefined,
        referenceText: productText(item.reference),
        // 制作单这一行讲的是「这份配方按哪款产品算」，必须用参考产品的量和单位；
        // 预分装款只在下单行里用（两款浓度不同，混用会补错量）。
        amount: item.reference.amount ?? 0,
        unit: item.reference.unit,
        displayUnit: item.reference.displayUnit,
        repackAmount: selected?.amount ?? 0,
        repackDisplayUnit: selected?.displayUnit || '',
        targets: item.reference.targets || [],
        state,
        recommendedProducts: item.recommendedProducts || [],
        repackPool: item.repackPool || [],
        selectedRepackIngredientId: selected?.ingredientId || '',
        preparationMethod: item.preparationMethod || item.addTimingLabel || '',
        targetSummary: (item.reference.targets || [])
          .map(
            (target) => `${target.label} ${target.targetValuePerKg}${target.unit}/kg`,
          )
          .join('、'),
      }
    })
}

/** 购买行：只带有可售产品、且用量大于 0 的行。 */
export function buildSupplementPurchaseLines(
  rows: SupplementPlanRow[],
): SupplementPurchaseLine[] {
  return rows
    .filter((row) => row.state === 'REPACK' && row.repackAmount > 0)
    .map((row) => {
      const selected = row.repackPool.find(
        (option) => option.ingredientId === row.ingredientId,
      )
      const specText = selected ? productText(selected) : ''
      return {
        recipeItemId: row.recipeItemId,
        ingredientId: row.ingredientId,
        name: row.name,
        unit: row.repackDisplayUnit || row.displayUnit,
        specText: specText && specText !== row.name ? specText : '',
      }
    })
}


/** 从制作单存档恢复「每行选了哪个产品」 */
export function selectionsFromSaved(saved: unknown): Record<string, string> {
  if (!Array.isArray(saved)) return {}
  const result: Record<string, string> = {}
  for (const item of saved) {
    const recipeItemId = String((item as any)?.recipeItemId ?? '').trim()
    const ingredientId = String((item as any)?.ingredientId ?? '').trim()
    if (recipeItemId && ingredientId) result[recipeItemId] = ingredientId
  }
  return result
}
