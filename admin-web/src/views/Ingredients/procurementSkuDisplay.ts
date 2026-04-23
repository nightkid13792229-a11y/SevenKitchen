import type { BaseUnit, ProcurementSku } from '../../types/ingredient'

type ProcurementSkuPriceFields = Pick<
  ProcurementSku,
  'currentPurchasePrice' | 'purchaseToBaseRatio'
>

const BASE_UNIT_LABELS: Record<string, string> = {
  G: '克',
  ML: '毫升',
  PCS: '个/件',
}

const getConvertedPriceQuantity = (baseUnit: BaseUnit | string) =>
  baseUnit === 'PCS' ? 1 : 500

export const getProcurementSkuConvertedPriceText = (
  sku: ProcurementSkuPriceFields,
  baseUnit: BaseUnit | string,
  baseUnitDisplayName?: string | null,
): string | null => {
  const price = Number(sku.currentPurchasePrice)
  const ratio = Number(sku.purchaseToBaseRatio)

  if (
    sku.currentPurchasePrice === null ||
    sku.currentPurchasePrice === undefined ||
    !Number.isFinite(price) ||
    !Number.isFinite(ratio) ||
    ratio <= 0
  ) {
    return null
  }

  const quantity = getConvertedPriceQuantity(baseUnit)
  const unitLabel =
    baseUnitDisplayName?.trim() || BASE_UNIT_LABELS[baseUnit] || baseUnit
  const convertedPrice = (price / ratio) * quantity

  return `折算采购价：¥${convertedPrice.toFixed(2)} / ${quantity}${unitLabel}`
}
