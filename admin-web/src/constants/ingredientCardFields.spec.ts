import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_AFTER_CREATE_FIELDS,
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS,
  isIngredientCardField,
} from './ingredientCardFields'

/**
 * 30 个键的完整有序清单（与后端目录逐项一致）。
 *
 * 单独抄一份、不从目录推导：这样「少一项 / 顺序被调 / 键写错」都必须红，
 * 否则前端手抄本漂移了也没人发现。
 */
const EXPECTED_KEYS_IN_ORDER: readonly string[] = [
  'name',
  'nameEn',
  'type',
  'category',
  'notes',
  'baseUnit',
  'unitDisplayLabel',
  'weightG',
  'maxCapacityG',
  'cfctClass',
  'edibleYieldPercent',
  'mainNutrientsDesc',
  'procurementStrategy',
  'purchaseUnit',
  'purchaseToBaseRatio',
  'currentPricePerPurchaseUnit',
  'brand',
  'productModel',
  'purchaseChannel',
  'safetyStock',
  'reorderPoint',
  'targetStock',
  'diyEnabled',
  'addTiming',
  'productionLossRate',
  'tags',
  'shelfLifeMonths',
  'storageCondition',
  'openedShelfLifeDays',
  'isOilBased',
]

/**
 * 30 行期望值：`[key, group, label, stage, valueType]`。
 *
 * 这张表把每一项的分组和值类型也钉死 —— 只比首尾键的话，
 * 「单块重量」和「最大容量」标签互换、中间字段换组、或者 25 个字段的
 * valueType 写错，测试都不会红。
 */
const EXPECTED_FIELD_ROWS: ReadonlyArray<
  readonly [string, string, string, string, string]
> = [
  ['name', 'BASIC', '名称', 'CREATABLE', 'text'],
  ['nameEn', 'BASIC', '英文名', 'CREATABLE', 'text'],
  ['type', 'BASIC', '类型', 'CREATABLE', 'select'],
  ['category', 'BASIC', '类别', 'CREATABLE', 'select'],
  ['notes', 'BASIC', '备注', 'CREATABLE', 'text'],
  ['baseUnit', 'MEASURE', '基准单位', 'CREATABLE', 'select'],
  ['unitDisplayLabel', 'MEASURE', '展示名', 'CREATABLE', 'text'],
  ['weightG', 'MEASURE', '单块重量', 'CREATABLE', 'number'],
  ['maxCapacityG', 'MEASURE', '最大容量', 'CREATABLE', 'number'],
  ['cfctClass', 'NUTRITION', 'CFCT 分类', 'CREATABLE', 'text'],
  ['edibleYieldPercent', 'NUTRITION', '可食部', 'CREATABLE', 'percent'],
  ['mainNutrientsDesc', 'NUTRITION', '主要营养价值', 'CREATABLE', 'text'],
  ['procurementStrategy', 'PURCHASE', '采购策略', 'CREATABLE', 'select'],
  ['purchaseUnit', 'PURCHASE', '采购单位', 'CREATABLE', 'text'],
  ['purchaseToBaseRatio', 'PURCHASE', '换算倍数', 'CREATABLE', 'number'],
  [
    'currentPricePerPurchaseUnit',
    'PURCHASE',
    '当前采购价',
    'CREATABLE',
    'number',
  ],
  ['brand', 'PURCHASE', '品牌', 'CREATABLE', 'text'],
  ['productModel', 'PURCHASE', '规格', 'CREATABLE', 'text'],
  ['purchaseChannel', 'PURCHASE', '采购渠道', 'CREATABLE', 'text'],
  ['safetyStock', 'STOCK', '安全库存', 'AFTER_CREATE', 'number'],
  ['reorderPoint', 'STOCK', '补货点', 'AFTER_CREATE', 'number'],
  ['targetStock', 'STOCK', '目标库存', 'AFTER_CREATE', 'number'],
  ['diyEnabled', 'USAGE', '用于 DIY', 'CREATABLE', 'boolean'],
  ['addTiming', 'USAGE', '添加时机', 'CREATABLE', 'select'],
  ['productionLossRate', 'USAGE', '生产损耗率', 'CREATABLE', 'multiplier'],
  ['tags', 'USAGE', '标签分类', 'AFTER_CREATE', 'tags'],
  ['shelfLifeMonths', 'STORAGE', '保质期', 'CREATABLE', 'number'],
  ['storageCondition', 'STORAGE', '储存条件', 'CREATABLE', 'text'],
  ['openedShelfLifeDays', 'STORAGE', '开封后效期', 'CREATABLE', 'number'],
  ['isOilBased', 'STORAGE', '内容物油性', 'CREATABLE', 'boolean'],
]

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

  it('30 个键的顺序与后端完全一致', () => {
    expect(INGREDIENT_CARD_FIELDS.map((f) => f.key)).toEqual(
      EXPECTED_KEYS_IN_ORDER,
    )
  })

  it('30 项逐项钉死：分组、标签、阶段、值类型', () => {
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
