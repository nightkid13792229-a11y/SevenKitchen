/**
 * 比价表的展示层：把后端给的数字翻成表里的一行字。
 *
 * 两条规矩：
 * 1. 算不出的排最后，并写明缺哪一格——「算不出」不是「贵」；
 * 2. 复合配方不参与排序，也不给选择按钮。
 */
import type {
  SupplementComparisonDto,
  SupplementOfferDto,
  SupplementOfferMissingDto,
  SupplementPriceBasisDto
} from '@/types/ingredientCreation'

const MISSING_LABELS: Record<SupplementOfferMissingDto, string> = {
  PRICE: '没读到价格',
  UNITS_PER_BOTTLE: '没认出每瓶几粒',
  SERVING_UNITS: '没读到每份几粒',
  AMOUNT: '标签里没有这个营养素',
  COMPOUND_PRODUCT: '复合配方，不参与单价排序'
}

export interface CompareRowView {
  url: string
  name: string
  unitsPerBottle: string
  servingUnits: string
  amount: string
  servings: string
  price: string
  unitPrice: string
  /** 算不出时写在行尾的人话；算得出就是空串 */
  missingText: string
  selectable: boolean
  sameForm: boolean
  compound: boolean
  recommended: boolean
}

/** 表头那句口径：必须写在表上，否则「每 1000mg」会被当成按化合物总量算。 */
export function basisHeader(basis: SupplementPriceBasisDto): string {
  const per =
    basis.unit === 'CFU'
      ? `每 10 亿 ${basis.amountUnitLabel.replace('亿 ', '')}`
      : `每 ${basis.per}${basis.amountUnitLabel}`
  return `按${basis.basisLabel}算，${per} 多少钱`
}

export function missingLabel(code: SupplementOfferMissingDto): string {
  return MISSING_LABELS[code] ?? code
}

function money(value: number | null): string {
  return value === null ? '—' : `¥${value.toFixed(2)}`
}

function count(value: number | null, unit: string): string {
  return value === null ? '—' : `${Math.round(value * 100) / 100} ${unit}`
}

export function toRowViews(comparison: SupplementComparisonDto): CompareRowView[] {
  const { basis } = comparison
  const indexed = comparison.offers.map((offer, index) => ({ offer, index }))

  // 后端已经排过；这里再稳一次，避免将来换排序口径时把「算不出」顶到最前面
  indexed.sort((a, b) => {
    const aPriced = a.offer.pricePerThousand !== null
    const bPriced = b.offer.pricePerThousand !== null
    if (aPriced !== bPriced) {
      return aPriced ? -1 : 1
    }
    return a.index - b.index
  })

  return indexed.map(({ offer }) => ({
    url: offer.url,
    name: offer.name,
    unitsPerBottle: count(offer.unitsPerBottle, '粒'),
    servingUnits: count(offer.servingUnitsPerDose, '粒/份'),
    amount: count(offer.amountPerServing, basis.amountUnitLabel),
    servings: count(offer.servingsPerBottle, '份'),
    price: money(offer.priceCny),
    unitPrice: money(offer.pricePerThousand),
    missingText: offer.missing.map(missingLabel).join('；'),
    selectable: offer.missing.length === 0 && !offer.compound,
    sameForm: offer.sameForm,
    compound: offer.compound,
    recommended: offer.url === comparison.recommendedUrl
  }))
}

export function selectableOffer(
  comparison: SupplementComparisonDto | null,
  url: string
): SupplementOfferDto | null {
  if (!comparison) {
    return null
  }
  return comparison.offers.find((offer) => offer.url === url) ?? null
}
