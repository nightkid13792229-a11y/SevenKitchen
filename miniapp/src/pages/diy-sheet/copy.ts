export const DIY_SHEET_FOOD_RECOMMENDATION_LABEL = '已选商品'
export const DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL = '已选商品'
export const DIY_SHEET_SPEC_MODAL_TITLE = '选择商品'
export const DIY_SHEET_PURCHASE_LABEL = '已选商品'

export function formatRecommendationActionLabel(count?: number): string {
  if (!count || count < 1) {
    return ''
  }

  if (count === 1) {
    return '查看商品 〉'
  }

  return `可更换 ${count}项 〉`
}

export function formatSelectedProductDisplayText(product?: any, fallbackName?: string | null): string {
  const parts = [product?.brand, product?.productModel]
    .map(value => String(value || '').trim())
    .filter(value => value && value !== '-')

  if (parts.length > 0) {
    return parts.join(' / ')
  }

  const productName = String(product?.name || '').trim()
  const fallback = String(fallbackName || '').trim()
  if (productName && productName !== '-' && productName !== fallback) {
    return productName
  }

  return '-'
}
