import { describe, expect, it } from 'vitest'
import { basisHeader, toRowViews } from './compareRows'
import type { SupplementComparisonDto, SupplementOfferDto } from '@/types/ingredientCreation'

const basis = {
  nutrientKey: 'minerals.copper',
  unit: 'MG' as const,
  per: 1000,
  basisLabel: '元素量',
  amountUnitLabel: 'mg',
  fieldPaths: ['minerals.copper']
}

function offer(overrides: Partial<SupplementOfferDto> = {}): SupplementOfferDto {
  return {
    url: 'u',
    name: 'Copper',
    priceCny: 100,
    unitsPerBottle: 120,
    servingUnitsPerDose: 2,
    amountPerServing: 2,
    formLevel: 'ORGANIC_CHELATE',
    compound: false,
    servingsPerBottle: 60,
    pricePerServing: 1.67,
    pricePerThousand: 835,
    missing: [],
    sameForm: true,
    ...overrides
  }
}

function comparison(offers: SupplementOfferDto[]): SupplementComparisonDto {
  return {
    offers,
    recommendedUrl: offers[0]?.url ?? null,
    reason: '',
    basis,
    failed: [],
    partial: false
  }
}

describe('basisHeader', () => {
  it('矿物质口径写成「按元素量算，每 1000mg 多少钱」', () => {
    expect(basisHeader(basis)).toBe('按元素量算，每 1000mg 多少钱')
  })

  it('鱼油口径写成 EPA+DHA', () => {
    expect(
      basisHeader({ ...basis, nutrientKey: 'fattyAcids.epa', basisLabel: 'EPA+DHA 合计' })
    ).toBe('按EPA+DHA 合计算，每 1000mg 多少钱')
  })
})

describe('toRowViews', () => {
  it('算不出的排最后，并给出缺哪一格的中文提示', () => {
    const rows = toRowViews(
      comparison([
        offer({ url: 'unknown', priceCny: null, pricePerThousand: null, missing: ['PRICE'] }),
        offer({ url: 'priced', pricePerThousand: 500 })
      ])
    )
    expect(rows.map((row) => row.url)).toEqual(['priced', 'unknown'])
    expect(rows[1]!.missingText).toBe('没读到价格')
    expect(rows[1]!.selectable).toBe(false)
  })

  it('复合配方标「不参与单价排序」，不给选', () => {
    const rows = toRowViews(
      comparison([
        offer({
          url: 'multi',
          compound: true,
          amountPerServing: null,
          pricePerThousand: null,
          missing: ['COMPOUND_PRODUCT', 'AMOUNT']
        })
      ])
    )
    expect(rows[0]!.missingText).toContain('复合配方')
    expect(rows[0]!.selectable).toBe(false)
  })
})
