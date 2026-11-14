import { describe, expect, it } from 'vitest'
import {
  buildSupplementPlanRows,
  buildSupplementPurchaseLines,
  resolveRowState,
} from './supplement-plan'

function option(overrides: Record<string, any> = {}) {
  return {
    ingredientId: 'kelp-capsule',
    name: '海带粉胶囊',
    brand: 'NOW FOODS',
    productModel: '325mcg碘/粒',
    displayUnit: '粒',
    unit: '粒',
    amount: 2.366,
    available: true,
    unavailableReason: null,
    isDefault: true,
    concentrations: [],
    ...overrides,
  }
}

function item(overrides: Record<string, any> = {}) {
  return {
    recipeItemId: 'item-1',
    sourceIngredientId: 'kelp-powder',
    name: '海藻粉',
    preparationMethod: '充分搅拌',
    addTimingLabel: null,
    sortOrder: 0,
    reference: {
      ingredientId: 'kelp-powder',
      name: '海藻粉',
      brand: 'NOW FOODS',
      productModel: '450mcg碘/平勺',
      displayUnit: '平勺',
      amount: 1.709,
      unit: '平勺',
      status: 'OK',
      targets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          unit: 'μg',
          targetValuePerKg: 624.13,
        },
      ],
    },
    recommendedProducts: [],
    repackPool: [option()],
    ...overrides,
  }
}

describe('resolveRowState', () => {
  it('池子为空 → 仅生产', () => {
    expect(resolveRowState([])).toBe('PRODUCTION_ONLY')
  })

  it('池子有货但都不可用 → 暂不可购买', () => {
    expect(resolveRowState([option({ available: false })])).toBe(
      'TEMP_UNAVAILABLE',
    )
  })

  it('有可用产品 → 可分装', () => {
    expect(resolveRowState([option()])).toBe('REPACK')
  })
})

describe('buildSupplementPlanRows', () => {
  it('池子为空时显示参考产品与参考用量', () => {
    const rows = buildSupplementPlanRows({ items: [item({ repackPool: [] })] })
    expect(rows[0]).toMatchObject({
      state: 'PRODUCTION_ONLY',
      referenceText: 'NOW FOODS / 450mcg碘/平勺',
      amount: 1.709,
      unit: '平勺',
    })
  })

  it('默认选中 isDefault，选中后可放进购买行', () => {
    const rows = buildSupplementPlanRows({
      items: [
        item({
          repackPool: [
            option({ ingredientId: 'a', isDefault: false }),
            option({ ingredientId: 'b', isDefault: true }),
          ],
        }),
      ],
    })

    expect(rows[0].ingredientId).toBe('b')
    expect(buildSupplementPurchaseLines(rows)).toEqual([
      {
        recipeItemId: 'item-1',
        ingredientId: 'b',
        name: '海藻粉',
        unit: '粒',
        specText: 'NOW FOODS / 325mcg碘/粒',
      },
    ])
  })

  it('保存过的选择仍然有效，但下架后回落到默认', () => {
    const rows = buildSupplementPlanRows(
      {
        items: [
          item({
            repackPool: [
              option({ ingredientId: 'a', isDefault: true }),
              option({ ingredientId: 'b', isDefault: false }),
            ],
          }),
        ],
      },
      { 'item-1': 'b' },
    )
    expect(rows[0].ingredientId).toBe('b')

    const fallback = buildSupplementPlanRows(
      {
        items: [
          item({
            repackPool: [
              option({ ingredientId: 'a', isDefault: true }),
              option({ ingredientId: 'b', isDefault: false, available: false }),
            ],
          }),
        ],
      },
      { 'item-1': 'b' },
    )
    expect(fallback[0].ingredientId).toBe('a')
  })

  it('暂不可购买的行不进入购买行', () => {
    const rows = buildSupplementPlanRows({
      items: [item({ repackPool: [option({ available: false })] })],
    })
    expect(rows[0].state).toBe('TEMP_UNAVAILABLE')
    expect(buildSupplementPurchaseLines(rows)).toEqual([])
  })
})
