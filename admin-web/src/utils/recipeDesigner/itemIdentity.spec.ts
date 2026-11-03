import { describe, expect, it } from 'vitest'
import {
  isSupplementDesignerItem,
  itemIngredientName,
  itemIngredientType
} from './itemIdentity'
import type { DesignerItem } from '@/types/recipeDesigner'

function item(overrides: Partial<DesignerItem> = {}): DesignerItem {
  return {
    id: 'item-1',
    ingredientId: undefined,
    nutritionFoodId: 'food-1',
    weightG: 10,
    nutritionFood: {
      id: 'food-1',
      name: 'Supplement label profile abc',
      mappings: [
        {
          ingredientId: 'ing-1',
          isPrimary: true,
          ingredient: { id: 'ing-1', name: '碳酸钙粉', type: 'SUPPLEMENT' }
        }
      ]
    },
    ...overrides
  } as DesignerItem
}

describe('itemIdentity', () => {
  it('没有 ingredientId 时，从营养档案映射反查标准原料名和类型', () => {
    const value = item()
    expect(itemIngredientName(value)).toBe('碳酸钙粉')
    expect(itemIngredientType(value)).toBe('SUPPLEMENT')
    expect(isSupplementDesignerItem(value)).toBe(true)
  })

  it('有标准原料时优先用标准原料', () => {
    const value = item({
      ingredientId: 'ing-2',
      ingredient: { id: 'ing-2', name: '鸡胸', type: 'FOOD' }
    })
    expect(itemIngredientName(value)).toBe('鸡胸')
    expect(isSupplementDesignerItem(value)).toBe(false)
  })
})
