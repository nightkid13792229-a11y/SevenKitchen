export const DIY_SHEET_FOOD_RECOMMENDATION_LABEL = '已选商品'
export const DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL = '已选商品'
export const DIY_SHEET_SPEC_MODAL_TITLE = '选择商品'
export const DIY_SHEET_PURCHASE_LABEL = '已选商品'
export const DIY_SHEET_RECOMMENDATION_ENTRY_TEXT = '点击查看'

export type PurchaseLinkLike = {
  platform?: string | null
  url?: string | null
} | null | undefined

interface SpecRecommendedPurchaseChannelDisplayInput {
  ingredientType?: string | null
  purchaseLink: PurchaseLinkLike
  purchaseChannel?: string | null
}

const PURCHASE_LINK_PLATFORM_LABELS: Record<string, string> = {
  TAOBAO: '淘宝/天猫',
  JD: '京东',
  PINDUODUO: '拼多多',
  IHERB: 'iHerb',
  OTHER: '其他小程序',
  WEBVIEW: '网页链接'
}

const PURCHASE_TIP_BY_PLATFORM: Record<string, string> = {
  TAOBAO: '已复制淘宝/天猫商品链接',
  JD: '已复制京东商品链接',
  PINDUODUO: '已复制拼多多商品链接',
  IHERB: '已复制 iHerb 商品链接',
  OTHER: '已复制商品链接',
  WEBVIEW: '已复制商品链接'
}

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

export function formatFoodSelectedProductDisplayText(
  recommendedProduct?: any,
  fallbackIngredient?: string | { name?: string | null } | null
): string {
  if (!recommendedProduct) {
    return '-'
  }

  const fallbackName = typeof fallbackIngredient === 'string'
    ? fallbackIngredient
    : fallbackIngredient?.name

  return formatSelectedProductDisplayText(recommendedProduct, fallbackName)
}

export function getPurchaseLinkPlatformLabel(purchaseLink: PurchaseLinkLike): string {
  const platform = purchaseLink?.platform?.trim().toUpperCase()
  return platform ? PURCHASE_LINK_PLATFORM_LABELS[platform] || '' : ''
}

export function getRecommendedPurchaseChannelDisplay(
  purchaseLink: PurchaseLinkLike,
  purchaseChannel?: string | null
): string {
  return getPurchaseLinkPlatformLabel(purchaseLink) || purchaseChannel?.trim() || ''
}

export function getPurchaseTipByPlatform(platform?: string | null): string {
  const normalizedPlatform = platform?.trim().toUpperCase()
  return normalizedPlatform
    ? PURCHASE_TIP_BY_PLATFORM[normalizedPlatform] || '已复制商品链接'
    : '已复制商品链接'
}

export function getRecommendationEntryDisplayText(hasRecommendationDetail: boolean): string {
  return hasRecommendationDetail ? DIY_SHEET_RECOMMENDATION_ENTRY_TEXT : '-'
}

export function getSpecRecommendedPurchaseChannelDisplay({
  ingredientType,
  purchaseLink,
  purchaseChannel
}: SpecRecommendedPurchaseChannelDisplayInput): string {
  return ingredientType?.trim().toUpperCase() === 'SUPPLEMENT'
    ? getRecommendedPurchaseChannelDisplay(purchaseLink, purchaseChannel)
    : purchaseChannel?.trim() || ''
}
