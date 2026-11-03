import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS
} from '@/constants/ingredientCardFields'
import { CFCT_CLASS_OPTIONS } from '@/types/ingredient'
import type { IngredientDraft } from '@/types/ingredientCreation'
import { toIngredientCard, toIngredientDraft } from './draftReview'
import {
  buildIngredientCardCells,
  formatCellDisplay,
  ingredientCellValuesEqual,
  isEmptyIngredientCardValue,
  selectOptionsForValue,
  toIngredientDraftFromCells,
  type IngredientCardCell
} from './ingredientCardView'

const BASE_INGREDIENT: IngredientDraft = {
  name: '冷冻三文鱼',
  type: 'FOOD',
  baseUnit: 'G',
  unitDisplayLabel: '克'
}

function cellOf(
  cells: readonly IngredientCardCell[],
  key: IngredientCardCell['key']
): IngredientCardCell {
  const found = cells.find((cell) => cell.key === key)
  if (!found) {
    throw new Error(`字段目录里没有 ${key}`)
  }
  return found
}

describe('buildIngredientCardCells', () => {
  it('15 项全部出现、按目录顺序分组，空格不隐藏', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, [])

    expect(cells).toHaveLength(15)
    expect(cells.map((cell) => cell.key)).toEqual(
      INGREDIENT_CARD_FIELDS.map((field) => field.key)
    )
    expect(new Set(cells.map((cell) => cell.group))).toEqual(
      new Set(INGREDIENT_CARD_FIELD_GROUPS.map((group) => group.key))
    )

    expect(cellOf(cells, 'weightG')).toMatchObject({
      value: null,
      display: '空'
    })
    expect(cellOf(cells, 'labelNames')).toMatchObject({
      value: [],
      display: '空'
    })
    expect(cellOf(cells, 'tags')).toMatchObject({
      value: [],
      display: '空'
    })
  })

  it('单个重量只在个/件出现，密度只在毫升出现', () => {
    const grams = buildIngredientCardCells(BASE_INGREDIENT, [])
    expect(cellOf(grams, 'weightG').visible).toBe(false)
    expect(cellOf(grams, 'densityGPerMl').visible).toBe(false)

    const pieces = buildIngredientCardCells(
      { ...BASE_INGREDIENT, baseUnit: 'PCS' },
      []
    )
    expect(cellOf(pieces, 'weightG').visible).toBe(true)
    expect(cellOf(pieces, 'densityGPerMl').visible).toBe(false)

    const milliliters = buildIngredientCardCells(
      { ...BASE_INGREDIENT, baseUnit: 'ML' },
      []
    )
    expect(cellOf(milliliters, 'weightG').visible).toBe(false)
    expect(cellOf(milliliters, 'densityGPerMl').visible).toBe(true)
  })

  it('0 不显示成空，来源标 AI', () => {
    const cells = buildIngredientCardCells(
      {
        ...BASE_INGREDIENT,
        weightG: 0
      },
      []
    )

    expect(cellOf(cells, 'weightG')).toMatchObject({
      value: 0,
      display: '0',
      sourceLabel: 'AI'
    })
  })

  it('人工标记只落在指定格子，来源改标人工', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, ['cfctClass'])

    expect(cells.filter((cell) => cell.isManual).map((cell) => cell.key)).toEqual(
      ['cfctClass']
    )
    expect(cellOf(cells, 'cfctClass').sourceLabel).toBe('人工')
    expect(cellOf(cells, 'name').sourceLabel).toBe('AI')
    expect(cellOf(cells, 'labelNames').sourceLabel).toBeNull()
  })

  it('建完之后补的只有标签分类', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, [])

    expect(cells.filter((cell) => cell.isAfterCreate).map((cell) => cell.key)).toEqual(
      ['tags']
    )
    expect(cellOf(cells, 'tags').group).toBe('BASIC')
    expect(cellOf(cells, 'tags').kind).toBe('tags')
  })

  it('可食部按 10–100 展示，草稿里仍是 0.1–1 比例', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, edibleYieldRate: 0.75 },
      []
    )

    expect(cellOf(cells, 'edibleYieldPercent').value).toBe(75)
    expect(cellOf(cells, 'edibleYieldPercent').display).toBe('75%')
  })

  it('标签名称是可编辑多选，数组展示成中文顿号', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, labelNames: ['鸡肉', '鸡肝'] },
      []
    )

    expect(cellOf(cells, 'labelNames').kind).toBe('string-list')
    expect(cellOf(cells, 'labelNames').value).toEqual(['鸡肉', '鸡肝'])
    expect(cellOf(cells, 'labelNames').display).toBe('鸡肉、鸡肝')
  })

  it('标签分类只读展示：数组拼成中文顿号，空数组显示空', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, tags: ['高蛋白', '冷冻'] },
      []
    )

    expect(cellOf(cells, 'tags').kind).toBe('tags')
    expect(cellOf(cells, 'tags').value).toEqual(['高蛋白', '冷冻'])
    expect(cellOf(cells, 'tags').display).toBe('高蛋白、冷冻')
  })

  it('CFCT 分类用词表下拉（15 项），不退回自由文本', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, [])
    const cfctClass = cellOf(cells, 'cfctClass')

    expect(cfctClass.kind).toBe('select')
    expect(cfctClass.options).toHaveLength(15)
    expect(cfctClass.options?.map((option) => option.value)).toEqual([
      ...CFCT_CLASS_OPTIONS
    ])
    expect(cfctClass.options?.[0]).toEqual({
      label: CFCT_CLASS_OPTIONS[0],
      value: CFCT_CLASS_OPTIONS[0]
    })
  })

  it('目录自带的 hint 会透出：可食部显示 10–100 口径', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, edibleYieldRate: 0.75 },
      []
    )

    expect(cellOf(cells, 'edibleYieldPercent').hint).toContain('10–100')
  })

  it('未知枚举值原样展示，选项里补上当前值，不静默清空', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, procurementStrategy: 'FUTURE_STRATEGY' as never },
      []
    )
    const strategy = cellOf(cells, 'procurementStrategy')

    expect(strategy.value).toBe('FUTURE_STRATEGY')
    expect(strategy.display).toBe('FUTURE_STRATEGY')
    expect(strategy.hint).toBe('目录外取值，保存时按空处理')
    expect(selectOptionsForValue(strategy.options, strategy.value)).toEqual([
      { label: '日采', value: 'DAILY_PURCHASE' },
      { label: '库存补货', value: 'STOCK_REPLENISHMENT' },
      { label: '混合', value: 'HYBRID' },
      { label: 'FUTURE_STRATEGY', value: 'FUTURE_STRATEGY' }
    ])
  })
})

describe('formatCellDisplay', () => {
  it('百分比、数组、布尔的展示口径', () => {
    expect(formatCellDisplay('edibleYieldPercent', 75)).toBe('75%')
    expect(formatCellDisplay('labelNames', ['鸡肉', '鸡肝'])).toBe('鸡肉、鸡肝')
    expect(formatCellDisplay('tags', ['高蛋白', '冷冻'])).toBe('高蛋白、冷冻')
  })

  it('空值显示「空」，0 显示 0', () => {
    expect(formatCellDisplay('name', '  ')).toBe('空')
    expect(formatCellDisplay('weightG', null)).toBe('空')
    expect(formatCellDisplay('labelNames', [])).toBe('空')
    expect(formatCellDisplay('weightG', 0)).toBe('0')
  })

  it('枚举显示 label，未知值原样展示', () => {
    expect(formatCellDisplay('baseUnit', 'G')).toBe('克')
    expect(formatCellDisplay('procurementStrategy', 'FUTURE_STRATEGY')).toBe(
      'FUTURE_STRATEGY'
    )
  })
})

describe('空值判定与比较', () => {
  it('null / undefined / 空白串 / 空数组算空，0 与 false 不算', () => {
    expect(isEmptyIngredientCardValue(null)).toBe(true)
    expect(isEmptyIngredientCardValue(undefined)).toBe(true)
    expect(isEmptyIngredientCardValue('   ')).toBe(true)
    expect(isEmptyIngredientCardValue([])).toBe(true)
    expect(isEmptyIngredientCardValue(0)).toBe(false)
    expect(isEmptyIngredientCardValue(false)).toBe(false)
    expect(isEmptyIngredientCardValue('0')).toBe(false)
  })

  it('数组按内容比较，标量按严格相等比较', () => {
    expect(ingredientCellValuesEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(ingredientCellValuesEqual(['a'], ['a', 'b'])).toBe(false)
    expect(ingredientCellValuesEqual(false, false)).toBe(true)
    expect(ingredientCellValuesEqual(0, 0)).toBe(true)
    expect(ingredientCellValuesEqual(null, '')).toBe(false)
  })
})

describe('可食部换算只做一次', () => {
  it('表单 75% → 草稿 0.75 → 展示 75%', () => {
    const form = {
      ...toIngredientCard(null),
      name: '冷冻三文鱼',
      edibleYieldPercent: 75
    }

    const draft = toIngredientDraft(form)
    expect(draft.edibleYieldRate).toBe(0.75)

    const cells = buildIngredientCardCells(draft, [])
    expect(cellOf(cells, 'edibleYieldPercent').value).toBe(75)
    expect(cellOf(cells, 'edibleYieldPercent').display).toBe('75%')

    expect(toIngredientCard({ ingredient: draft }).edibleYieldPercent).toBe(75)
  })

  it('从表格再存一次仍是 0.75，不会被除两次或还原成 75', () => {
    const form = {
      ...toIngredientCard(null),
      name: '冷冻三文鱼',
      edibleYieldPercent: 75
    }
    const draft = toIngredientDraft(form)

    const again = toIngredientDraftFromCells(draft, form)
    expect(again.edibleYieldRate).toBe(0.75)
  })
})

describe('toIngredientDraftFromCells', () => {
  it('整张卡保存：可见字段、隐藏保留字段与人工标记一个不少', () => {
    const form = {
      ...toIngredientCard(null),
      name: '冷冻三文鱼',
      weightG: 250,
      densityGPerMl: 1.03,
      labelCategory: 'FEED_MATERIAL',
      labelNames: ['三文鱼'],
      labelNameSource: '饲料原料目录（2023 版）',
      procurementStrategy: 'DAILY_PURCHASE',
      manualFields: ['cfctClass']
    }

    const draft = toIngredientDraftFromCells(null, form)

    for (const field of INGREDIENT_CARD_FIELDS) {
      const draftKey =
        field.key === 'edibleYieldPercent' ? 'edibleYieldRate' : field.key
      expect(draft, `缺字段 ${draftKey}`).toHaveProperty(draftKey)
    }
    expect(draft).toMatchObject({
      name: '冷冻三文鱼',
      weightG: 250,
      densityGPerMl: 1.03,
      labelCategory: 'FEED_MATERIAL',
      labelNames: ['三文鱼'],
      labelNameSource: '饲料原料目录（2023 版）',
      procurementStrategy: 'DAILY_PURCHASE',
      manualFields: ['cfctClass']
    })
  })

  it('类别与英文名是隐藏保留字段，保存时不会被顺手清掉', () => {
    const base: IngredientDraft = {
      ...BASE_INGREDIENT,
      nameEn: 'Salmon',
      category: 'MEAT_ORGAN'
    }

    const draft = toIngredientDraftFromCells(base, { name: '新名字' })

    expect(draft).toMatchObject({
      name: '新名字',
      nameEn: 'Salmon',
      category: 'MEAT_ORGAN',
      unitDisplayLabel: '克'
    })
    expect(draft).not.toHaveProperty('shelfLifeMonths')
  })

  it('品牌/规格/采购/库存已搬到子板块，原料级一律清空', () => {
    const base: IngredientDraft = {
      ...BASE_INGREDIENT,
      brand: '旧品牌',
      productModel: '旧规格',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 500,
      currentPricePerPurchaseUnit: 12,
      safetyStock: 1
    }

    const draft = toIngredientDraftFromCells(base, { name: '新名字' })

    expect(draft).toMatchObject({
      name: '新名字',
      brand: null,
      productModel: null,
      purchaseUnit: null,
      purchaseToBaseRatio: null,
      currentPricePerPurchaseUnit: null,
      safetyStock: null
    })
  })
})
