/**
 * AI 建档收尾「补一条采购商品」（2026-11-07 成本口径归位）。
 *
 * 为什么要有这一步：食材的成本 = 每基准单位多少钱，而这个数只能由采购结算产生。
 * 没有采购商品 → 买不了 → 成本永远是 0 → 食谱里按「免费」算，售价跟着偏低。
 *
 * 这里只放纯判断，页面只负责把表单值喂进来、把结果发出去。
 */

export type ClosingState = 'MISSING_SKU' | 'MISSING_PRICE' | 'READY'

export interface ClosingInput {
  skuCount: number
  pricePerPackage: number | null | undefined
  netContent: number | null | undefined
}

export function computeClosingState(input: ClosingInput): ClosingState {
  if (!(Number(input.skuCount) > 0)) {
    return 'MISSING_SKU'
  }
  const price = Number(input.pricePerPackage)
  if (!Number.isFinite(price) || price <= 0) {
    return 'MISSING_PRICE'
  }
  return 'READY'
}

export interface ClosingForm {
  name: string
  purchaseChannel: string
  purchaseUnit: string
  packCount: number
  netContentPerPack: number
  currentPurchasePrice: number | null
}

/**
 * 提交体：只发「人话」字段。
 * `purchaseToBaseRatio` 由服务端算（件数 × 净含量）—— 前端算错一次，库存就差几十倍。
 */
export function buildCreateSkuPayload(form: ClosingForm) {
  return {
    name: form.name.trim(),
    purchaseChannel: form.purchaseChannel,
    purchaseUnit: form.purchaseUnit,
    packCount: form.packCount,
    netContentPerPack: form.netContentPerPack,
    currentPurchasePrice: form.currentPurchasePrice,
  }
}

/** 输入框下方的实时换算：让「一件 39.9 元」立刻变成「一克 0.0798 元」 */
export function formatCostPreview(
  pricePerPackage: number | null | undefined,
  netContent: number | null | undefined,
  baseUnitLabel: string,
): string {
  const price = Number(pricePerPackage)
  const net = Number(netContent)
  if (!Number.isFinite(price) || price <= 0) return ''
  if (!Number.isFinite(net) || net <= 0) return ''
  return `≈ ¥${(price / net).toFixed(6)} / ${baseUnitLabel}`
}
