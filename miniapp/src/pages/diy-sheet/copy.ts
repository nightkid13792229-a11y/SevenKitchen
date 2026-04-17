export const DIY_SHEET_FOOD_RECOMMENDATION_LABEL = '推荐商品'
export const DIY_SHEET_SUPPLEMENT_RECOMMENDATION_LABEL = '推荐商品'
export const DIY_SHEET_SPEC_MODAL_TITLE = '推荐商品'
export const DIY_SHEET_PURCHASE_LABEL = '推荐商品'
export const DIY_SHEET_RECOMMENDATION_ENTRY_TEXT = '点击查看'

type PurchaseLinkLike = {
  platform?: string | null
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
  TAOBAO: '口令已复制，打开淘宝即可查看商品',
  JD: '口令已复制，打开京东即可查看商品',
  PINDUODUO: '口令已复制，打开拼多多即可查看商品',
  IHERB: '已复制 iHerb 购买链接',
  OTHER: '已复制，打开对应App即可查看',
  WEBVIEW: '已复制购买链接'
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
    ? PURCHASE_TIP_BY_PLATFORM[normalizedPlatform] || '已复制购买链接'
    : '已复制购买链接'
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
