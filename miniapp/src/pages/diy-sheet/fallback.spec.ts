import { describe, expect, it } from 'vitest'
import {
  buildFallbackFoodIngredientItems,
  collectFoodIngredientIdsForRecommendations,
  getDiySheetPricePreviewWarning
} from './fallback'

describe('diy-sheet fallback helpers', () => {
  it('builds fallback food items from recipe detail when pricing preview is unavailable', () => {
    const result = buildFallbackFoodIngredientItems([
      {
        ingredientId: 'food-1',
        ingredientType: 'FOOD',
        ratioPercent: 60,
        nutritionStateLabel: '熟重',
        preparationMethod: '去油筋、切块',
        ingredient: {
          id: 'food-1',
          name: '牛霖',
          type: 'FOOD',
          brand: '无',
          productModel: '精修牛霖',
          purchaseChannel: '本地市场'
        }
      },
      {
        ingredientId: 'supp-1',
        ingredientType: 'SUPPLEMENT',
        nutrientTargetKey: 'macros.fiber'
      },
      {
        ingredientId: 'food-2',
        ingredientType: 'FOOD',
        ratio: 40,
        preparationMethod: '蒸熟后捣碎',
        ingredient: {
          id: 'food-2',
          name: '红薯',
          type: 'FOOD'
        }
      }
    ], 700)

    expect(result).toEqual([
      expect.objectContaining({
        ingredientId: 'food-1',
        name: '牛霖',
        type: 'FOOD',
        nutritionStateLabel: '熟重',
        preparationMethod: '去油筋、切块',
        netAmount: 0.42,
        brand: '无',
        productModel: '精修牛霖',
        purchaseChannel: '本地市场'
      }),
      expect.objectContaining({
        ingredientId: 'food-2',
        name: '红薯',
        type: 'FOOD',
        preparationMethod: '蒸熟后捣碎',
        netAmount: 0.28
      })
    ])
  })

  it('falls back to recipe food ingredient ids when price preview ingredient details are missing', () => {
    expect(collectFoodIngredientIdsForRecommendations({
      pricingBreakdown: {
        ingredientDetails: [
          { type: 'FOOD', ingredientId: 'priced-food-1' },
          { type: 'SUPPLEMENT', ingredientId: 'supp-1' },
          { type: 'FOOD', ingredientId: 'priced-food-1' }
        ]
      }
    }, [
      { ingredientId: 'recipe-food-1', ingredientType: 'FOOD' }
    ])).toEqual(['priced-food-1'])

    expect(collectFoodIngredientIdsForRecommendations(null, [
      { ingredientId: 'recipe-food-1', ingredientType: 'FOOD' },
      { ingredientId: 'recipe-food-2', ingredientType: 'FOOD' },
      { ingredientId: 'recipe-food-1', ingredientType: 'FOOD' },
      { ingredientId: 'recipe-supp-1', ingredientType: 'SUPPLEMENT' }
    ])).toEqual(['recipe-food-1', 'recipe-food-2'])
  })

  it('surfaces a specific warning for missing supplement concentration errors', () => {
    expect(
      getDiySheetPricePreviewWarning(
        new Error('Missing concentration for supplement target: macros.fiber')
      )
    ).toBe('当前食谱的补剂营养浓度未配置完整，暂时仅展示食材清单。')

    expect(
      getDiySheetPricePreviewWarning(new Error('network timeout'))
    ).toBe('补剂和精确采购量暂时无法计算，当前先展示食材清单。')
  })
})
