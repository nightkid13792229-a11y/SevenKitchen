import { describe, expect, it } from 'vitest'
import {
  buildSupplementPurchaseLines,
  buildSupplementRows,
  buildSupplementSelections,
  selectionsFromSaved,
  type ServerCandidateItem
} from './supplement-candidates'

function dosage(amount: number, overrides: Record<string, any> = {}) {
  return {
    status: 'OK',
    amount,
    unit: 'g',
    targets: [
      {
        fieldPath: 'minerals.calcium',
        label: '钙',
        unit: 'mg',
        targetValuePerKg: 2192
      }
    ],
    concentrations: [
      { fieldPath: 'minerals.calcium', value: 353, unit: 'mg' }
    ],
    missingFieldPaths: [],
    ...overrides
  }
}

function item(overrides: Record<string, any> = {}): ServerCandidateItem {
  return {
    recipeItemId: 'item-1',
    sourceIngredientId: 'ing-caco3',
    source: 'EQUIVALENCE_GROUP',
    group: {
      id: 'g1',
      code: 'CALCIUM_MINERAL_SALT',
      name: '钙 · 矿物盐',
      status: 'APPROVED'
    },
    defaultIngredient: {
      ingredientId: 'ing-caco3',
      name: '碳酸钙粉',
      displayUnit: 'g',
      physicalForm: 'POWDER',
      diyEnabled: true,
      supplementRetailEnabled: true,
      selectable: true,
      unavailableReason: null,
      dosage: dosage(9.3)
    },
    candidates: [
      {
        ingredientId: 'ing-caco3',
        name: '碳酸钙粉',
        brand: 'NOW FOODS',
        productModel: '600mg钙/1.7克',
        displayUnit: 'g',
        physicalForm: 'POWDER',
        isDefault: true,
        selectable: true,
        dosage: dosage(9.3)
      },
      {
        ingredientId: 'ing-citrate',
        name: '柠檬酸钙粉',
        brand: 'NOW FOODS',
        productModel: '600mg钙/3克',
        displayUnit: 'g',
        physicalForm: 'POWDER',
        isDefault: false,
        selectable: true,
        dosage: dosage(15.7)
      }
    ],
    fallbackAmount: null,
    unavailableReason: null,
    preparationMethod: '随餐',
    addTimingLabel: null,
    sortOrder: 0,
    ...overrides
  }
}

describe('DIY supplement candidate rows', () => {
  it('defaults to the source ingredient when it is sellable', () => {
    const rows = buildSupplementRows([item()])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recipeItemId: 'item-1',
      ingredientId: 'ing-caco3',
      amount: 9.3,
      purchasable: true,
      productionOnly: false,
      selectionSource: 'DEFAULT',
      choiceLabel: '换一个'
    })
  })

  it('restores the customer selection by ingredient id', () => {
    const rows = buildSupplementRows(
      [item()],
      { 'item-1': 'ing-citrate' }
    )

    expect(rows[0].ingredientId).toBe('ing-citrate')
    expect(rows[0].amount).toBe(15.7)
    expect(rows[0].selectionSource).toBe('EQUIVALENCE_GROUP')
  })

  it('falls back to the first sellable member when the source is production-only', () => {
    const source = item().defaultIngredient
    const rows = buildSupplementRows([
      item({
        defaultIngredient: { ...source, supplementRetailEnabled: false },
        candidates: [
          {
            ingredientId: 'ing-citrate',
            name: '柠檬酸钙粉',
            displayUnit: 'g',
            isDefault: false,
            selectable: true,
            dosage: dosage(15.7)
          }
        ]
      })
    ])

    expect(rows[0].ingredientId).toBe('ing-citrate')
    expect(rows[0].purchasable).toBe(true)
  })

  it('keeps a production-only default when there is no sellable candidate', () => {
    const rows = buildSupplementRows([
      item({
        source: 'DEFAULT_ONLY',
        group: null,
        candidates: [],
        defaultIngredient: {
          ingredientId: 'ing-caco3',
          name: '自制鸡蛋壳粉',
          displayUnit: 'g',
          diyEnabled: true,
          supplementRetailEnabled: false,
          selectable: false,
          unavailableReason: '未开启对外售卖',
          dosage: dosage(9.3)
        }
      })
    ])

    expect(rows[0]).toMatchObject({
      ingredientId: 'ing-caco3',
      purchasable: false,
      productionOnly: true,
      selectionSource: 'DEFAULT'
    })
  })

  it('uses the server ratio fallback when there are no targets', () => {
    const rows = buildSupplementRows([
      item({
        source: 'DEFAULT_ONLY',
        group: null,
        candidates: [],
        fallbackAmount: 30,
        defaultIngredient: {
          ingredientId: 'ing-psyllium',
          name: '洋车前子壳粉',
          displayUnit: 'g',
          diyEnabled: true,
          supplementRetailEnabled: true,
          selectable: true,
          dosage: {
            status: 'NO_TARGETS',
            amount: null,
            unit: 'g',
            targets: [],
            concentrations: [],
            missingFieldPaths: []
          }
        }
      })
    ])

    expect(rows[0].amount).toBe(30)
    expect(rows[0].selectionSource).toBe('RATIO')
  })

  it('builds purchase lines with the selected ingredient and no amount', () => {
    const rows = buildSupplementRows(
      [
        item(),
        item({
          recipeItemId: 'item-2',
          sourceIngredientId: 'ing-psyllium',
          source: 'DEFAULT_ONLY',
          group: null,
          candidates: [],
          defaultIngredient: {
            ingredientId: 'ing-psyllium',
            name: '洋车前子壳粉',
            displayUnit: 'g',
            diyEnabled: true,
            supplementRetailEnabled: false,
            selectable: false,
            dosage: dosage(10)
          }
        })
      ],
      { 'item-1': 'ing-citrate' }
    )

    const lines = buildSupplementPurchaseLines(rows)

    expect(lines).toEqual([
      {
        recipeItemId: 'item-1',
        ingredientId: 'ing-citrate',
        name: '柠檬酸钙粉',
        unit: 'g',
        specText: 'NOW FOODS · 600mg钙/3克'
      }
    ])
    expect(lines[0]).not.toHaveProperty('amount')
  })

  it('serialises the selection for the DIY sheet and reads it back', () => {
    const rows = buildSupplementRows(
      [item()],
      { 'item-1': 'ing-citrate' }
    )
    const saved = buildSupplementSelections(rows)

    expect(saved[0]).toMatchObject({
      recipeItemId: 'item-1',
      ingredientId: 'ing-citrate',
      amount: 15.7,
      unit: 'g',
      source: 'EQUIVALENCE_GROUP',
      groupCode: 'CALCIUM_MINERAL_SALT'
    })
    expect(selectionsFromSaved(saved)).toEqual({
      'item-1': 'ing-citrate'
    })
  })
})
