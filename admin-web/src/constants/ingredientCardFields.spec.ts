import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_AFTER_CREATE_FIELDS,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
  isIngredientCardField,
} from './ingredientCardFields'

/**
 * 15 个键的完整有序清单（与后端目录逐项一致）。
 *
 * 单独抄一份、不从目录推导：这样「少一项 / 顺序被调 / 键写错」都必须红，
 * 否则前端手抄本漂移了也没人发现。
 */
const EXPECTED_KEYS_IN_ORDER: readonly string[] = [
  'name',
  'type',
  'notes',
  'tags',
  'baseUnit',
  'unitDisplayLabel',
  'weightG',
  'cfctClass',
  'edibleYieldPercent',
  'mainNutrientsDesc',
  'densityGPerMl',
  'procurementStrategy',
  'labelCategory',
  'labelNames',
  'labelNameSource',
]

/**
 * 15 行期望值：`[key, group, label, stage, valueType]`。
 *
 * 这张表把每一项的分组和值类型也钉死 —— 只比首尾键的话，
 * 「单个重量」和「密度」标签互换、中间字段换组、或者 valueType 写错，
 * 测试都不会红。
 */
const EXPECTED_FIELD_ROWS: ReadonlyArray<
  readonly [string, string, string, string, string]
> = [
  ['name', 'BASIC', '原料名称', 'CREATABLE', 'text'],
  ['type', 'BASIC', '原料类型', 'CREATABLE', 'select'],
  ['notes', 'BASIC', '备注', 'CREATABLE', 'text'],
  ['tags', 'BASIC', '标签分类', 'CREATABLE', 'tags'],
  ['baseUnit', 'MEASURE', '基准单位', 'CREATABLE', 'select'],
  ['unitDisplayLabel', 'MEASURE', '标准单位展示名', 'CREATABLE', 'text'],
  ['weightG', 'MEASURE', '单个重量(克)', 'CREATABLE', 'number'],
  ['cfctClass', 'NUTRITION', 'CFCT分类', 'CREATABLE', 'text'],
  ['edibleYieldPercent', 'NUTRITION', '可食部比率', 'CREATABLE', 'percent'],
  ['mainNutrientsDesc', 'NUTRITION', '主要营养价值', 'CREATABLE', 'text'],
  ['densityGPerMl', 'NUTRITION', '密度(g/ml)', 'CREATABLE', 'number'],
  ['procurementStrategy', 'PURCHASE', '采购策略', 'CREATABLE', 'select'],
  ['labelCategory', 'LABEL', '标签类型', 'CREATABLE', 'select'],
  ['labelNames', 'LABEL', '标签名称', 'CREATABLE', 'string-list'],
  ['labelNameSource', 'LABEL', '名称依据', 'CREATABLE', 'text'],
]

describe('食材原料字段目录', () => {
  it('15 项、5 组、键不重复', () => {
    expect(INGREDIENT_CARD_FIELDS).toHaveLength(15)
    expect(INGREDIENT_CARD_FIELD_GROUPS).toHaveLength(5)
    expect(new Set(INGREDIENT_CARD_FIELDS.map((f) => f.key)).size).toBe(15)
  })

  it('15 个键的顺序与后端完全一致', () => {
    expect(INGREDIENT_CARD_FIELDS.map((f) => f.key)).toEqual(
      EXPECTED_KEYS_IN_ORDER,
    )
  })

  it('15 项逐项钉死：分组、标签、阶段、值类型', () => {
    expect(
      INGREDIENT_CARD_FIELDS.map((f) => [
        f.key,
        f.group,
        f.label,
        f.stage,
        f.valueType,
      ]),
    ).toEqual(EXPECTED_FIELD_ROWS)
  })

  it('没有建完之后才补的字段', () => {
    expect(INGREDIENT_AFTER_CREATE_FIELDS.map((f) => f.key)).toEqual([])
  })

  it('5 组按后端顺序排列', () => {
    expect(INGREDIENT_CARD_FIELD_GROUPS.map((g) => g.key)).toEqual([
      'BASIC',
      'MEASURE',
      'NUTRITION',
      'PURCHASE',
      'LABEL',
    ])
  })

  it('单个重量只在个/件出现，密度只在毫升出现', () => {
    const byKey = new Map(INGREDIENT_CARD_FIELDS.map((f) => [f.key, f]))
    expect(byKey.get('weightG')?.visibleWhenBaseUnit).toBe('PCS')
    expect(byKey.get('densityGPerMl')?.visibleWhenBaseUnit).toBe('ML')
  })

  it('可食部按 10–100 的百分数，文案与标准页一致', () => {
    const edibleYield = INGREDIENT_CARD_FIELDS.find(
      (f) => f.key === 'edibleYieldPercent',
    )!
    expect(edibleYield.valueType).toBe('percent')
    expect(edibleYield.unit).toBe('%')
    expect(edibleYield.hint).toContain('10–100')
  })

  it('受控词表字段都带选项', () => {
    const byKey = new Map(INGREDIENT_CARD_FIELDS.map((f) => [f.key, f]))

    expect(
      byKey.get('procurementStrategy')!.options!.map((o) => [o.value, o.label]),
    ).toEqual([
      ['DAILY_PURCHASE', '日采'],
      ['STOCK_REPLENISHMENT', '库存补货'],
      ['HYBRID', '混合'],
    ])
    expect(
      byKey.get('labelCategory')!.options!.map((o) => [o.value, o.label]),
    ).toEqual([
      ['FEED_MATERIAL', '饲料原料'],
      ['FEED_ADDITIVE', '饲料添加剂'],
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
    expect(isIngredientCardField('brand')).toBe(false)
    expect(isIngredientCardField('')).toBe(false)
  })
})
