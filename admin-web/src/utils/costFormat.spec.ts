import { describe, expect, it } from 'vitest'
import {
  formatAdaptiveUnitCost,
  formatBaseUnitCost,
  formatInventoryCost,
  formatRecipeIngredientPrice,
  formatUnitCost,
} from './costFormat'

/**
 * 每基准单位成本的显示精度（2026-11-08）。
 *
 * 食材成本在库里是 6 位小数：9.99 ÷ 200g = 0.049950。
 * 页面如果按 2 位显示会变成 ¥0.05，看起来像系统少算了 0.00005。
 */
describe('formatUnitCost', () => {
  it('每克成本保留 6 位，0.04995 不会显示成 0.05', () => {
    expect(formatUnitCost(0.04995)).toBe('¥0.049950')
  })

  it('非食材的采购单位价仍按 2 位显示', () => {
    expect(formatUnitCost(0.04995, 2)).toBe('¥0.05')
  })

  it('缺失值显示「—」，不冒充 0', () => {
    expect(formatUnitCost(null)).toBe('—')
    expect(formatUnitCost(undefined)).toBe('—')
  })
})

describe('formatBaseUnitCost', () => {
  it('食材成本卡 / 成本历史固定 6 位', () => {
    expect(formatBaseUnitCost(0.04995)).toBe('¥0.049950')
  })

  it('0 显示「未定价」，不冒充免费', () => {
    expect(formatBaseUnitCost(0)).toBe('未定价')
    expect(formatBaseUnitCost(null)).toBe('未定价')
  })
})

describe('formatAdaptiveUnitCost', () => {
  it('大于 1 元按 2 位，0.01–1 元按 4 位，小于 0.01 元按 6 位', () => {
    expect(formatAdaptiveUnitCost(2.5)).toBe('¥2.50')
    expect(formatAdaptiveUnitCost(0.1234)).toBe('¥0.1234')
    expect(formatAdaptiveUnitCost(0.004)).toBe('¥0.004000')
  })
})

describe('formatInventoryCost', () => {
  it('库存食材用「采购商品价 ÷ 换算比」显示每克成本', () => {
    expect(
      formatInventoryCost({
        type: 'FOOD',
        baseUnit: 'G',
        currentPricePerPurchaseUnit: 9.99,
        purchaseToBaseRatio: 200,
      }),
    ).toBe('¥0.049950 / g')

    expect(
      formatInventoryCost({
        type: 'FOOD',
        baseUnit: 'G',
        currentPricePerPurchaseUnit: 9.99,
        purchaseToBaseRatio: 200,
        unitCost: 0.04995,
      }),
    ).toBe('¥0.049950 / g')
  })

  it('非食材仍按采购单位显示 2 位', () => {
    expect(
      formatInventoryCost({
        type: 'PACKAGING',
        purchaseUnit: '个',
        currentPricePerPurchaseUnit: 2.5,
        purchaseToBaseRatio: 50,
      }),
    ).toBe('¥2.50 / 个')
  })

  it('没价 / 0 价显示「未定价」，不显示 ¥0.000000 / g', () => {
    expect(
      formatInventoryCost({
        type: 'FOOD',
        baseUnit: 'G',
        currentPricePerPurchaseUnit: 0,
        purchaseToBaseRatio: 200,
      }),
    ).toBe('未定价')
  })
})

describe('formatRecipeIngredientPrice', () => {
  it('食谱原料下拉里的食材单价保留 6 位', () => {
    expect(
      formatRecipeIngredientPrice({
        type: 'FOOD',
        baseUnit: 'G',
        currentPricePerPurchaseUnit: 0.04995,
      }),
    ).toBe('¥0.049950 / g')
  })

  it('补剂仍按采购单位显示 2 位', () => {
    expect(
      formatRecipeIngredientPrice({
        type: 'SUPPLEMENT',
        purchaseUnit: '瓶',
        currentPricePerPurchaseUnit: 128,
      }),
    ).toBe('¥128.00 / 瓶')
  })
})
