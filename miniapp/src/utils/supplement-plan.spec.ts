import { describe, expect, it } from 'vitest'
import { buildSupplementPlanRows, buildSupplementPurchaseLines } from './supplement-plan'

function diyOption(overrides: Record<string, any> = {}) {
  return {
    ingredientId: 'kelp-powder',
    name: '海藻粉',
    brand: 'NOW FOODS',
    productModel: '450mcg碘/平勺',
    displayUnit: '平勺',
    unit: '平勺',
    amount: 1.709,
    available: true,
    unavailableReason: null,
    isDefault: true,
    purchaseLink: null,
    imageUrl: null,
    ...overrides,
  }
}

function repackOption(overrides: Record<string, any> = {}) {
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
    diyPool: [diyOption()],
    repackPool: [repackOption()],
    ...overrides,
  }
}

describe('buildSupplementPlanRows · 自购口径', () => {
  it('名称列用目标营养素，不用原料名', () => {
    const rows = buildSupplementPlanRows({ items: [item()] })
    expect(rows[0].name).toBe('碘')
  })

  it('产品列与用量都跟着选中的自购款走', () => {
    const rows = buildSupplementPlanRows({
      items: [
        item({
          diyPool: [
            diyOption({ ingredientId: 'a', isDefault: true }),
            diyOption({
              ingredientId: 'b',
              name: '海带片',
              brand: 'NOW FOODS',
              productModel: '150mcg碘/片',
              displayUnit: '片',
              unit: '片',
              amount: 5.13,
              isDefault: false,
            }),
          ],
        }),
      ],
    })

    expect(rows[0].ingredientId).toBe('a')
    expect(rows[0].amount).toBe(1.709)

    const switched = buildSupplementPlanRows(
      { items: [item({ diyPool: [diyOption({ ingredientId: 'a' }), diyOption({ ingredientId: 'b', amount: 5.13 })] })] },
      { 'item-1': 'b' },
    )
    expect(switched[0].ingredientId).toBe('b')
    expect(switched[0].amount).toBe(5.13)
  })

  it('添加时机以中文标签为准，不被食谱行的历史字段抢走', () => {
    // 2026-11-28：后端 addTimingLabel 是「随餐」这类中文；
    // preparationMethod 是食谱行的历史字段，不能盖在时机列上。
    const rows = buildSupplementPlanRows({
      items: [item({ addTimingLabel: '随餐', preparationMethod: 'CHOPPED' })],
    })
    expect(rows[0].preparationMethod).toBe('随餐')

    const legacy = buildSupplementPlanRows({ items: [item()] })
    expect(legacy[0].preparationMethod).toBe('充分搅拌')
  })

  it('没链接的自购款也出现，只是 purchaseLink 为空', () => {
    const rows = buildSupplementPlanRows({
      items: [
        item({
          diyPool: [
            diyOption({ ingredientId: 'a', purchaseLink: null }),
            diyOption({ ingredientId: 'b', purchaseLink: { url: '13:/x' } }),
          ],
        }),
      ],
    })

    expect(rows[0].diyPool).toHaveLength(2)
    expect(rows[0].diyPool[0].purchaseLink).toBeNull()
  })

  it('自购池为空时回退参考产品的名称与用量', () => {
    const rows = buildSupplementPlanRows({ items: [item({ diyPool: [] })] })
    expect(rows[0].hasDiyOptions).toBe(false)
    expect(rows[0].amount).toBe(1.709)
    expect(rows[0].productText).toBe('NOW FOODS / 450mcg碘/平勺')
  })
})

describe('buildSupplementPurchaseLines · 预分装口径', () => {
  it('预分装清单取预分装池默认款，与制作单的自购选择无关', () => {
    const plan = {
      items: [
        item({
          diyPool: [
            diyOption({ ingredientId: 'self-a', name: '海藻粉', amount: 1.709 }),
          ],
          repackPool: [repackOption()],
        }),
      ],
    }
    const rows = buildSupplementPlanRows(plan, { 'item-1': 'self-a' })
    expect(rows[0].ingredientId).toBe('self-a')

    expect(buildSupplementPurchaseLines(plan)).toEqual([
      {
        recipeItemId: 'item-1',
        ingredientId: 'kelp-capsule',
        name: '碘',
        unit: '粒',
        specText: 'NOW FOODS / 325mcg碘/粒',
      },
    ])
  })

  it('没有可售款的补剂不进预分装清单', () => {
    const plan = {
      items: [item({ repackPool: [repackOption({ available: false, amount: null })] })],
    }
    expect(buildSupplementPurchaseLines(plan)).toEqual([])
  })
})
