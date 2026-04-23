import { auditMissingSupplementConcentrations } from '../src/domain/ingredient/supplement-concentration-audit';

describe('auditMissingSupplementConcentrations', () => {
  it('flags missing target concentrations on primary and alternative supplement ingredients', () => {
    const findings = auditMissingSupplementConcentrations([
      {
        recipeId: 'recipe-1',
        recipeName: '红薯三文鱼鸡胸',
        recipeItemId: 'item-1',
        ingredientId: 'ingredient-primary',
        ingredientName: '洋车前子壳粉',
        supplementTargets: [
          {
            fieldPath: 'macros.fiber',
            label: '膳食纤维',
            targetValuePerKg: 2.5,
            unit: 'g',
          },
        ],
        nutritionProfile: {
          macros: {
            crudeProtein: 1,
          },
        },
        alternativeIngredients: [
          {
            ingredientId: 'ingredient-alt-ok',
            ingredientName: '可替代补剂 A',
            nutritionProfile: {
              macros: {
                fiber: 80,
              },
            },
          },
          {
            ingredientId: 'ingredient-alt-missing',
            ingredientName: '可替代补剂 B',
            nutritionProfile: {
              macros: {
                crudeFat: 1,
              },
            },
          },
        ],
      },
    ])

    expect(findings).toEqual([
      expect.objectContaining({
        recipeId: 'recipe-1',
        recipeName: '红薯三文鱼鸡胸',
        recipeItemId: 'item-1',
        ingredientId: 'ingredient-primary',
        ingredientName: '洋车前子壳粉',
        candidateType: 'PRIMARY',
        fieldPath: 'macros.fiber',
      }),
      expect.objectContaining({
        recipeId: 'recipe-1',
        recipeName: '红薯三文鱼鸡胸',
        recipeItemId: 'item-1',
        ingredientId: 'ingredient-alt-missing',
        ingredientName: '可替代补剂 B',
        candidateType: 'ALTERNATIVE',
        fieldPath: 'macros.fiber',
      }),
    ])
  })

  it('ignores recipe items without supplement targets or with complete concentrations', () => {
    const findings = auditMissingSupplementConcentrations([
      {
        recipeId: 'recipe-2',
        recipeName: '羊肚菌芦笋糙米牛肉',
        recipeItemId: 'item-2',
        ingredientId: 'ingredient-ok',
        ingredientName: '鸡蛋壳粉',
        supplementTargets: [
          {
            fieldPath: 'minerals.calcium',
            label: '钙',
            targetValuePerKg: 1200,
            unit: 'mg',
          },
        ],
        nutritionProfile: {
          minerals: {
            calcium: 380000,
          },
        },
        alternativeIngredients: [],
      },
      {
        recipeId: 'recipe-3',
        recipeName: '无补剂食谱',
        recipeItemId: 'item-3',
        ingredientId: 'ingredient-food',
        ingredientName: '牛霖',
        supplementTargets: [],
        nutritionProfile: null,
        alternativeIngredients: [],
      },
    ])

    expect(findings).toEqual([])
  })
})
