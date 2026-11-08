/**
 * 每基准单位成本的显示（2026-11-08）。
 *
 * 成本在库里按 6 位小数存（9.99 ÷ 200g = 0.049950），但页面曾按
 * 2/4 位显示，0.04995 被四舍五入成 0.05，看起来像算错了。
 *
 * 食材的每克/每毫升成本一律保留 6 位；非食材的采购单位价仍保留 2 位。
 * 缺失值或 0 显示「未定价」，不要冒充免费。
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

/** 食材成本卡 / 成本历史：每克、每毫升，固定 6 位。 */
export function formatBaseUnitCost(value: number | null | undefined): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num) || num <= 0) {
    return '未定价'
  }
  return formatUnitCost(num, 6)
}

/**
 * 非食材的「每基准单位」成本：大于 1 元时 2 位，0.01–1 元 4 位，
 * 小于 0.01 元 6 位。避免 0.004 元/个被压成 ¥0.00。
 */
export function formatAdaptiveUnitCost(
  value: number | null | undefined,
): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num) || num <= 0) {
    return '未定价'
  }
  const abs = Math.abs(num)
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return formatUnitCost(num, digits)
}

export interface InventoryCostRow {
  type?: string | null;
  ingredientType?: string | null;
  baseUnit?: string | null;
  purchaseUnit?: string | null;
  stockUnitLabel?: string | null;
  currentPricePerPurchaseUnit?: number | null;
  purchaseToBaseRatio?: number | null;
  unitCost?: number | null;
}

function isFoodRow(row: {
  type?: string | null;
  ingredientType?: string | null;
}): boolean {
  return row.type === 'FOOD' || row.ingredientType === 'FOOD'
}

function foodUnitLabel(baseUnit: string | null | undefined): string {
  return baseUnit === 'ML' ? 'ml' : 'g'
}

/**
 * 库存总览的「成本」列。
 *
 * 食材：采购商品价 ÷ 一采购单位等于多少克 = 每克成本，固定 6 位；
 * 没有采购商品时后端已经给「每克成本 + 换算比 1」，公式同样成立。
 * 补剂/包材：仍然显示每个采购单位多少钱，保留 2 位。
 *
 * 2026-11-08 复核：库存接口的 currentPricePerPurchaseUnit 是「每个采购单位」
 * 的价（秋刀鱼 9.99/袋），不是每克价；直接显示会把 200g 的价标成 /g。
 */
export function formatInventoryCost(row: InventoryCostRow): string {
  const price = Number(row.currentPricePerPurchaseUnit ?? 0)
  if (!Number.isFinite(price) || price <= 0) {
    return '未定价'
  }

  if (isFoodRow(row)) {
    const ratio = Number(row.purchaseToBaseRatio ?? 1)
    const providedUnitCost = Number(row.unitCost)
    const perBase =
      Number.isFinite(providedUnitCost) && providedUnitCost > 0
        ? providedUnitCost
        : Number.isFinite(ratio) && ratio > 0
          ? price / ratio
          : Number.NaN
    if (!Number.isFinite(perBase) || perBase <= 0) {
      return '未定价'
    }
    return `${formatUnitCost(perBase, 6)} / ${foodUnitLabel(row.baseUnit)}`
  }

  const unit = (row.purchaseUnit || row.stockUnitLabel || '').trim()
  return `${formatUnitCost(price, 2)}${unit ? ` / ${unit}` : ''}`
}

export interface RecipeIngredientPriceRow {
  type?: string | null;
  baseUnit?: string | null;
  purchaseUnit?: string | null;
  currentPricePerPurchaseUnit?: number | null;
}

/**
 * 食谱编辑页原料下拉里的单价。
 *
 * 食材的 currentPricePerPurchaseUnit 是「每克/每毫升」成本，固定 6 位；
 * 补剂/包材是「每个采购单位」的价，保留 2 位。
 */
export function formatRecipeIngredientPrice(
  row: RecipeIngredientPriceRow,
): string {
  const price = Number(row.currentPricePerPurchaseUnit ?? 0)
  if (!Number.isFinite(price) || price <= 0) {
    return '未定价'
  }

  if (row.type === 'FOOD') {
    return `${formatUnitCost(price, 6)} / ${foodUnitLabel(row.baseUnit)}`
  }

  const unit = (row.purchaseUnit || '').trim()
  return `${formatUnitCost(price, 2)}${unit ? ` / ${unit}` : ''}`
}
