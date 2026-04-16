import {
  planRecipeSupplementAlternativesBackfill,
} from '../../prisma/backfill-recipe-supplement-alternatives';
import {
  planSupplementPackagingSingleLayerBackfill,
} from '../../prisma/backfill-supplement-packaging-single-layer';

describe('supplement and packaging single-layer backfill planning', () => {
  it('splits multi-product supplements and archives non-food child records in dry-run output', () => {
    const result = planSupplementPackagingSingleLayerBackfill([
      {
        id: 'supp-legacy',
        name: '补碘补剂',
        type: 'SUPPLEMENT',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 100,
        currentPricePerPurchaseUnit: 82,
        effectivePricePerPurchaseUnit: 82,
        properties: {
          category_type: 'MINERAL',
          active_nutrients: {
            碘: { value: 325, unit: 'μg' }
          }
        },
        nutritionProfile: null,
        recipeItems: [{ id: 'recipe-item-1', ingredientId: 'supp-legacy' }],
        recommendedProducts: [
          {
            id: 'rp-1',
            name: '海带粉胶囊',
            brand: 'Brand A',
            productModel: '325μg/粒',
            purchaseChannel: '京东',
            displayUnit: '粒',
            purchaseLink: { platform: 'JD', url: 'https://jd.example/a' },
            imageUrl: 'https://img.example/a.png',
            activeNutrients: {
              碘: { value: 325, unit: 'μg' }
            },
            isActive: true,
            sortOrder: 0
          },
          {
            id: 'rp-2',
            name: '海带粉片',
            brand: 'Brand B',
            productModel: '150μg/片',
            purchaseChannel: '京东',
            displayUnit: '片',
            purchaseLink: { platform: 'JD', url: 'https://jd.example/b' },
            imageUrl: 'https://img.example/b.png',
            activeNutrients: {
              碘: { value: 150, unit: 'μg' }
            },
            isActive: true,
            sortOrder: 1
          }
        ],
        procurementSkus: []
      }
    ] as any);

    expect(result.flattenIngredientUpdates).toHaveLength(1);
    expect(result.createIngredients).toHaveLength(1);
    expect(result.archiveRecommendedProducts).toEqual(['rp-1', 'rp-2']);
    expect(result.archiveProcurementSkus).toEqual([]);
    expect(result.alternativeSeeds).toContainEqual(
      expect.objectContaining({
        legacyIngredientId: 'supp-legacy',
        recipeItemId: 'recipe-item-1',
        alternativeSourceKeys: expect.arrayContaining(['recommended_product:rp-2'])
      })
    );
    expect(result.createIngredients[0]).toEqual(
      expect.objectContaining({
        legacyIngredientId: 'supp-legacy',
        sourceKey: 'recommended_product:rp-2',
        type: 'SUPPLEMENT',
        name: '海带粉片',
        brand: 'Brand B',
        productModel: '150μg/片',
        diyEnabled: true,
        procurementEnabled: false
      })
    );
  });

  it('creates recipe supplement alternative links from split ingredient groups', () => {
    const result = planRecipeSupplementAlternativesBackfill({
      recipeItems: [
        { id: 'recipe-item-1', ingredientId: 'supp-legacy' },
        { id: 'recipe-item-2', ingredientId: 'supp-other' }
      ],
      groupedIngredients: [
        {
          legacyIngredientId: 'supp-legacy',
          defaultIngredientId: 'supp-legacy',
          alternativeIngredientIds: ['supp-alt-1', 'supp-alt-2']
        }
      ],
      existingAlternatives: [
        { recipeItemId: 'recipe-item-1', alternativeIngredientId: 'supp-alt-1' }
      ]
    });

    expect(result.createLinks).toEqual([
      {
        recipeItemId: 'recipe-item-1',
        alternativeIngredientId: 'supp-alt-2',
        sortOrder: 1
      }
    ]);
    expect(result.skip).toBe(1);
  });
});
