export interface IngredientDisplaySource {
  name?: string | null
  procurementSkuName?: string | null
  purchaseChannel?: string | null
  brand?: string | null
}

function normalizeDisplayText(value: string | null | undefined): string {
  return String(value || '').trim()
}

function isMeaningfulBrand(value: string): boolean {
  return value !== '' && value !== '无' && value !== '-' && value !== '默认'
}

/**
 * 顾客端展示的食材名称。
 *
 * 使用**食材名**而非采购 SKU 名：采购 SKU 名是采购侧原始商品名
 * （如「土豆 盒马日日鲜去皮新土豆」「鸡胸 生鲜鸡大胸」），含渠道词与重复，
 * 展示给顾客不规整；渠道 / 品牌 / 规格已由下方小字分别呈现。
 */
export function buildIngredientDisplayName(
  ingredient: IngredientDisplaySource,
): string {
  return (
    normalizeDisplayText(ingredient.name) ||
    normalizeDisplayText(ingredient.procurementSkuName) ||
    '-'
  )
}

export function buildIngredientPurchaseChannelText(
  ingredient: IngredientDisplaySource,
): string {
  return normalizeDisplayText(ingredient.purchaseChannel) || '默认来源'
}

export function buildIngredientBrandText(
  ingredient: IngredientDisplaySource,
): string {
  const brand = normalizeDisplayText(ingredient.brand)

  return isMeaningfulBrand(brand) ? brand : '-'
}
