import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_AFTER_CREATE_FIELDS,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
  isIngredientCardField,
} from './ingredientCardFields'

/**
 * 前端原料字段目录（对应后端 `ingredient-card-fields.ts`）。
 *
 * 这组断言锁住三件会悄悄咬人的事：
 *   · 目录与后端同序、同数、同键 —— 少一项就等于页面上「看不见」；
 *   · 建完之后才补的 4 项（库存三项 + 标签）不能被误当成建原料时可填；
 *   · `productionLossRate` 是「倍数」不是 0–1 比例也不是百分数，
 *     这是后端晚修过的一次口径，前端再写错就会显示成 105%。
 */
describe('前端原料字段目录', () => {
  it('30 项、7 组、键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(30)
    expect(INGREDIENT_CARD_FIELD_GROUPS).toHaveLength(7)
    expect(new Set(INGREDIENT_CARD_FIELDS.map((f) => f.key)).size).toBe(30)
  })

  it('建完之后补的正好 4 项', () => {
    expect(INGREDIENT_AFTER_CREATE_FIELDS.map((f) => f.key)).toEqual([
      'safetyStock',
      'reorderPoint',
      'targetStock',
      'tags',
    ])
  })

  it('与后端同序：第一项是名称，最后一项是内容物油性', () => {
    expect(INGREDIENT_CARD_FIELDS[0]?.key).toBe('name')
    expect(
      INGREDIENT_CARD_FIELDS[INGREDIENT_CARD_FIELDS.length - 1]?.key,
    ).toBe('isOilBased')
  })

  it('7 组按后端顺序排列', () => {
    expect(INGREDIENT_CARD_FIELD_GROUPS.map((g) => g.key)).toEqual([
      'BASIC',
      'MEASURE',
      'NUTRITION',
      'PURCHASE',
      'STOCK',
      'USAGE',
      'STORAGE',
    ])
  })

  it('生产损耗率是倍数：1.05 表示损耗 5%，绝不能渲染成 105%', () => {
    const lossRate = INGREDIENT_CARD_FIELDS.find(
      (f) => f.key === 'productionLossRate',
    )!
    expect(lossRate.valueType).toBe('multiplier')
    expect(lossRate.unit).toBe('倍')
    expect(lossRate.hint).toBe('1.05 = 损耗 5%')
  })

  it('可食部是 0–100 的百分数', () => {
    const edibleYield = INGREDIENT_CARD_FIELDS.find(
      (f) => f.key === 'edibleYieldPercent',
    )!
    expect(edibleYield.valueType).toBe('percent')
    expect(edibleYield.hint).toContain('0–100')
  })

  it('受控词表字段都带选项', () => {
    const byKey = new Map(INGREDIENT_CARD_FIELDS.map((f) => [f.key, f]))

    expect(
      byKey.get('addTiming')!.options!.map((o) => [o.value, o.label]),
    ).toEqual([
      ['BEFORE_MIXING', '制作中'],
      ['BEFORE_MEAL', '随餐'],
    ])
    expect(
      byKey.get('procurementStrategy')!.options!.map((o) => [o.value, o.label]),
    ).toEqual([
      ['DAILY_PURCHASE', '按需采购'],
      ['STOCK_REPLENISHMENT', '备货补货'],
      ['HYBRID', '混合'],
    ])
    expect(
      byKey.get('category')!.options!.map((o) => [o.value, o.label]),
    ).toEqual([
      ['MEAT_ORGAN', '肉/内脏/水产/蛋'],
      ['STARCHY_VEGETABLE', '根茎淀粉类蔬菜'],
      ['OTHER', '其他'],
    ])
    expect(byKey.get('baseUnit')!.options!.map((o) => o.value)).toEqual([
      'G',
      'ML',
      'PCS',
    ])
    expect(byKey.get('type')!.options).toEqual([
      { label: '食材', value: 'FOOD' },
    ])
  })

  it('字段类型守卫只认目录内的键', () => {
    expect(isIngredientCardField('edibleYieldPercent')).toBe(true)
    expect(isIngredientCardField('edibleYieldRate')).toBe(false)
    expect(isIngredientCardField('')).toBe(false)
  })
})
