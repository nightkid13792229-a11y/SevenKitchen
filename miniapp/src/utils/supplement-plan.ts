/**
 * 补剂三口径 · 制作单展示映射（2026-11-15 v2）
 *
 * 顾客在制作单上选的是「他自己去买、自己做」的那瓶（自购推荐）；
 * 我们分装寄给他的那瓶由预分装池决定，两者互不影响。
 *
 *   · 名称列 = 目标营养素（碘/钙/EPA+DHA…），没有目标的回退原料名；
 *   · 产品列 = 自购池里选中的那一款（等价组 ∩ 允许 DIY 推荐，有没有链接都列）；
 *   · 用量   = 跟着选中的自购款算；
 *   · 预分装清单单独算，取预分装池（等价组 ∩ 已上架）的默认款。
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

export interface SupplementDiyOption {
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
  purchaseLink: any
  imageUrl: string | null
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
  diyPool: SupplementDiyOption[]
  repackPool: SupplementRepackOption[]
}

export interface SupplementPlanResponse {
  totalWeightG: number
  weightSource: 'DIY_SHEET' | 'QUERY'
  recipeVersion: number
  items: SupplementPlanItem[]
}

export interface SupplementPlanRow {
  recipeItemId: string
  sourceIngredientId: string
  /** 目标营养素（名称列） */
  name: string
  /** 选中的自购产品 */
  ingredientId: string
  brand: string
  productModel?: string
  productText: string
  amount: number
  unit: string
  displayUnit: string
  targets: Array<{
    fieldPath: string
    label: string
    unit: string
    targetValuePerKg: number
  }>
  preparationMethod: string
  targetSummary: string
  diyPool: SupplementDiyOption[]
  selectedDiyIngredientId: string
  hasDiyOptions: boolean
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

function nutrientName(item: SupplementPlanItem): string {
  const labels = Array.from(
    new Set(
      (item.reference?.targets || [])
        .map((target) => String(target.label ?? '').trim())
        .filter(Boolean),
    ),
  )
  return labels.length > 0 ? labels.join(' + ') : item.name
}

function pickDiyOption(
  item: SupplementPlanItem,
  selections: Record<string, string | undefined>,
): SupplementDiyOption | null {
  const pool = item.diyPool || []
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
      const selected = pickDiyOption(item, selections)
      const amount = selected?.amount ?? item.reference.amount ?? 0
      const unit = selected?.unit || item.reference.unit
      return {
        recipeItemId: item.recipeItemId,
        sourceIngredientId: item.sourceIngredientId,
        name: nutrientName(item),
        ingredientId: selected?.ingredientId ?? item.reference.ingredientId,
        brand: selected?.brand || '-',
        productModel: selected?.productModel || undefined,
        productText: selected ? productText(selected) : productText(item.reference),
        amount,
        unit,
        displayUnit: selected?.displayUnit || item.reference.displayUnit,
        targets: item.reference.targets || [],
        // 2026-11-28：这一列是「建议添加时机」，以 addTimingLabel（中文）为准；
        // preparationMethod 是食谱行的历史字段，只在没有时机标签时兜底。
        preparationMethod: item.addTimingLabel || item.preparationMethod || '',
        targetSummary: (item.reference.targets || [])
          .map(
            (target) => `${target.label} ${target.targetValuePerKg}${target.unit}/kg`,
          )
          .join('、'),
        diyPool: item.diyPool || [],
        selectedDiyIngredientId: selected?.ingredientId || '',
        hasDiyOptions: (item.diyPool || []).length > 0,
      }
    })
}

/**
 * 预分装购买行：**与制作单的选择无关**，取预分装池（等价组 ∩ 已上架）
 * 的默认款，由服务端在下单时再算一次量。
 */
export function buildSupplementPurchaseLines(
  plan: Pick<SupplementPlanResponse, 'items'> | null | undefined,
): SupplementPurchaseLine[] {
  return [...(plan?.items || [])]
    .map((item) => {
      const pool = item.repackPool || []
      const selected =
        pool.find((option) => option.isDefault && option.available) ??
        pool.find((option) => option.available)
      if (!selected || !selected.amount || selected.amount <= 0) return null
      const name = nutrientName(item)
      const specText = productText(selected)
      return {
        recipeItemId: item.recipeItemId,
        ingredientId: selected.ingredientId,
        name,
        unit: selected.displayUnit,
        specText: specText && specText !== name ? specText : '',
      }
    })
    .filter((line): line is SupplementPurchaseLine => line !== null)
}

/** 从制作单存档恢复「每行选了哪个自购产品」 */
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
