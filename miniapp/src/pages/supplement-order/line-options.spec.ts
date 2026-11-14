import { describe, expect, it } from 'vitest'
import { buildPurchaseLineOptions } from './line-options'

function option(overrides: Record<string, any> = {}) {
  return {
    ingredientId: 'a',
    name: '海带片',
    brand: 'NOW FOODS',
    productModel: '150mcg碘/片',
    displayUnit: '片',
    unit: '片',
    amount: 5.13,
    available: true,
    unavailableReason: null,
    isDefault: true,
    concentrations: [],
    ...overrides,
  }
}

function plan(pool: any[]) {
  return {
    items: [
      {
        recipeItemId: 'item-1',
        sourceIngredientId: 'kelp',
        name: '海藻粉',
        preparationMethod: null,
        addTimingLabel: null,
        sortOrder: 0,
        reference: {
          ingredientId: 'kelp',
          name: '海藻粉',
          brand: null,
          productModel: null,
          displayUnit: '平勺',
          amount: 1.7,
          unit: '平勺',
          status: 'OK',
          targets: [],
        },
        recommendedProducts: [],
        repackPool: pool,
      },
    ],
  }
}

describe('buildPurchaseLineOptions', () => {
  it('同一行有多个可售产品时给出换款选项', () => {
    const result = buildPurchaseLineOptions(plan([option(), option({ ingredientId: 'b' })]), [
      { recipeItemId: 'item-1', ingredientId: 'b' },
    ])

    expect(result[0].options.map((item) => item.ingredientId)).toEqual(['a', 'b'])
    expect(result[0].selected!.ingredientId).toBe('b')
  })

  it('只有一个可售产品时不提供换款', () => {
    const result = buildPurchaseLineOptions(plan([option()]), [
      { recipeItemId: 'item-1', ingredientId: 'a' },
    ])

    expect(result[0].options).toHaveLength(1)
    expect(result[0].selected!.ingredientId).toBe('a')
  })

  it('不可用或算不出用量的产品不进入选项', () => {
    const result = buildPurchaseLineOptions(
      plan([
        option({ ingredientId: 'a', available: false }),
        option({ ingredientId: 'b', amount: null }),
        option({ ingredientId: 'c' }),
      ]),
      [{ recipeItemId: 'item-1', ingredientId: 'a' }],
    )

    expect(result[0].options.map((item) => item.ingredientId)).toEqual(['c'])
    expect(result[0].selected!.ingredientId).toBe('c')
  })

  it('计划里没有这一行时给空选项', () => {
    const result = buildPurchaseLineOptions(plan([]), [
      { recipeItemId: 'item-1', ingredientId: 'a' },
    ])

    expect(result[0].options).toEqual([])
    expect(result[0].selected).toBeNull()
  })
})
