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

export function buildIngredientDisplayName(
  ingredient: IngredientDisplaySource,
): string {
  return (
    normalizeDisplayText(ingredient.procurementSkuName) ||
    normalizeDisplayText(ingredient.name) ||
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
