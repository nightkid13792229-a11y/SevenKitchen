import { describe, expect, it } from 'vitest'
import {
  INGREDIENT_CARD_FIELDS,
  INGREDIENT_CARD_FIELD_GROUPS
} from '@/constants/ingredientCardFields'
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
  it('30 项全部出现、按目录顺序分组，空格不隐藏', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, [])

    expect(cells).toHaveLength(30)
    expect(cells.map((cell) => cell.key)).toEqual(
      INGREDIENT_CARD_FIELDS.map((field) => field.key)
    )
    expect(new Set(cells.map((cell) => cell.group))).toEqual(
      new Set(INGREDIENT_CARD_FIELD_GROUPS.map((group) => group.key))
    )

    expect(cellOf(cells, 'maxCapacityG')).toMatchObject({
      value: null,
      display: '空'
    })
    expect(cellOf(cells, 'storageCondition')).toMatchObject({
      value: '',
      display: '空'
    })
    expect(cellOf(cells, 'tags')).toMatchObject({
      value: [],
      display: '空'
    })
  })

  it('0 与 false 不显示成空，来源标 AI', () => {
    const cells = buildIngredientCardCells(
      {
        ...BASE_INGREDIENT,
        currentPricePerPurchaseUnit: 0,
        isOilBased: false
      },
      []
    )

    expect(cellOf(cells, 'currentPricePerPurchaseUnit')).toMatchObject({
      value: 0,
      display: '0',
      sourceLabel: 'AI'
    })
    expect(cellOf(cells, 'isOilBased')).toMatchObject({
      value: false,
      display: '否',
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
    expect(cellOf(cells, 'brand').sourceLabel).toBeNull()
  })

  it('建完之后补的 4 项被标出来，且位于库存 / 用途组', () => {
    const cells = buildIngredientCardCells(BASE_INGREDIENT, [])

    expect(cells.filter((cell) => cell.isAfterCreate).map((cell) => cell.key)).toEqual(
      ['safetyStock', 'reorderPoint', 'targetStock', 'tags']
    )
    expect(cellOf(cells, 'safetyStock').group).toBe('STOCK')
    expect(cellOf(cells, 'tags').group).toBe('USAGE')
    expect(cellOf(cells, 'tags').kind).toBe('tags')
  })

  it('可食部按 0–100 展示，草稿里仍是 0–1 比例', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, edibleYieldRate: 0.75 },
      []
    )

    expect(cellOf(cells, 'edibleYieldPercent').value).toBe(75)
    expect(cellOf(cells, 'edibleYieldPercent').display).toBe('75%')
  })

  it('生产损耗按倍数展示，并给出「= 损耗 5%」提示', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, productionLossRate: 1.05 },
      []
    )

    expect(cellOf(cells, 'productionLossRate')).toMatchObject({
      value: 1.05,
      display: '1.05',
      hint: '= 损耗 5%'
    })
  })

  it('标签只读展示：数组拼成中文顿号，空数组显示空', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, tags: ['高蛋白', '冷冻'] },
      []
    )

    expect(cellOf(cells, 'tags').value).toEqual(['高蛋白', '冷冻'])
    expect(cellOf(cells, 'tags').display).toBe('高蛋白、冷冻')
  })

  it('未知枚举值原样展示，选项里补上当前值，不静默清空', () => {
    const cells = buildIngredientCardCells(
      { ...BASE_INGREDIENT, category: 'FUTURE_CATEGORY' as never },
      []
    )
    const category = cellOf(cells, 'category')

    expect(category.value).toBe('FUTURE_CATEGORY')
    expect(category.display).toBe('FUTURE_CATEGORY')
    expect(category.hint).toBe('目录外取值，保存时按空处理')
    expect(selectOptionsForValue(category.options, category.value)).toEqual([
      { label: '肉/内脏/水产/蛋', value: 'MEAT_ORGAN' },
      { label: '根茎淀粉类蔬菜', value: 'STARCHY_VEGETABLE' },
      { label: '其他', value: 'OTHER' },
      { label: 'FUTURE_CATEGORY', value: 'FUTURE_CATEGORY' }
    ])
  })
})

describe('formatCellDisplay', () => {
  it('百分比、倍数、布尔的展示口径', () => {
    expect(formatCellDisplay('edibleYieldPercent', 75)).toBe('75%')
    expect(formatCellDisplay('productionLossRate', 1.05)).toBe('1.05')
    expect(formatCellDisplay('isOilBased', false)).toBe('否')
    expect(formatCellDisplay('diyEnabled', true)).toBe('是')
  })

  it('空值显示「空」，0 显示 0', () => {
    expect(formatCellDisplay('name', '  ')).toBe('空')
    expect(formatCellDisplay('weightG', null)).toBe('空')
    expect(formatCellDisplay('tags', [])).toBe('空')
    expect(formatCellDisplay('currentPricePerPurchaseUnit', 0)).toBe('0')
  })

  it('枚举显示 label，未知值原样展示', () => {
    expect(formatCellDisplay('baseUnit', 'G')).toBe('克')
    expect(formatCellDisplay('category', 'FUTURE_CATEGORY')).toBe(
      'FUTURE_CATEGORY'
    )
  })

  it('标签拼成中文顿号', () => {
    expect(formatCellDisplay('tags', ['高蛋白', '冷冻'])).toBe('高蛋白、冷冻')
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
  it('整张卡保存：30 个字段与人工标记一个不少', () => {
    const form = {
      ...toIngredientCard(null),
      name: '冷冻三文鱼',
      brand: '挪威海产',
      weightG: 250,
      shelfLifeMonths: 12,
      procurementStrategy: 'DAILY_PURCHASE',
      productionLossRate: 1.05,
      manualFields: ['brand']
    }

    const draft = toIngredientDraftFromCells(null, form)

    for (const field of INGREDIENT_CARD_FIELDS) {
      const draftKey =
        field.key === 'edibleYieldPercent' ? 'edibleYieldRate' : field.key
      expect(draft, `缺字段 ${draftKey}`).toHaveProperty(draftKey)
    }
    expect(Object.keys(draft)).toHaveLength(31)
    expect(draft).toMatchObject({
      name: '冷冻三文鱼',
      brand: '挪威海产',
      weightG: 250,
      shelfLifeMonths: 12,
      procurementStrategy: 'DAILY_PURCHASE',
      productionLossRate: 1.05,
      manualFields: ['brand']
    })
  })

  it('表格里没有的键沿用草稿原值，不会被顺手清掉', () => {
    const base: IngredientDraft = {
      ...BASE_INGREDIENT,
      brand: '旧品牌',
      weightG: 100
    }

    const draft = toIngredientDraftFromCells(base, { name: '新名字' })

    expect(draft).toMatchObject({
      name: '新名字',
      brand: '旧品牌',
      weightG: 100,
      unitDisplayLabel: '克'
    })
    expect(draft).toHaveProperty('shelfLifeMonths')
    expect(draft).toHaveProperty('manualFields')
  })
})
