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

  it('merges supplement variants that share the database unique key', () => {
    const result = planSupplementPackagingSingleLayerBackfill([
      {
        id: 'supp-vitamin-d',
        name: '维生素D',
        type: 'SUPPLEMENT',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        brand: 'NOW FOODS',
        productModel: '维生素D3胶囊，1000IU维D-3/粒，360粒/瓶',
        purchaseChannel: null,
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 360,
        currentPricePerPurchaseUnit: 85,
        effectivePricePerPurchaseUnit: 85,
        diyEnabled: false,
        procurementEnabled: false,
        properties: {
          display_unit: '粒'
        },
        nutritionProfile: null,
        recipeItems: [],
        recommendedProducts: [],
        procurementSkus: [
          {
            id: 'sku-vitamin-d',
            name: '维生素D',
            brand: 'NOW FOODS',
            productModel: '维生素D3胶囊，1000IU维D-3/粒，360粒/瓶',
            purchaseChannel: '京东',
            supplierName: 'NOW FOODS 京东自营',
            purchaseUnit: '瓶',
            purchaseToBaseRatio: 360,
            currentPurchasePrice: 85,
            referencePurchasePrice: 85,
            displayUnit: '瓶',
            isActive: true,
            isDefault: true,
            sortOrder: 0
          }
        ]
      }
    ] as any);

    expect(result.flattenIngredientUpdates).toHaveLength(1);
    expect(result.createIngredients).toHaveLength(0);
    expect(result.archiveProcurementSkus).toEqual(['sku-vitamin-d']);
    expect(result.flattenIngredientUpdates[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'supp-vitamin-d',
        brand: 'NOW FOODS',
        productModel: '维生素D3胶囊，1000IU维D-3/粒，360粒/瓶',
        purchaseChannel: '京东',
        procurementEnabled: true
      })
    );
  });

  it('merges variants whose final concrete names collide after model suffixing', () => {
    const result = planSupplementPackagingSingleLayerBackfill([
      {
        id: 'supp-b-complex',
        name: 'B族维生素',
        type: 'SUPPLEMENT',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 100,
        currentPricePerPurchaseUnit: 90,
        effectivePricePerPurchaseUnit: 90,
        diyEnabled: false,
        procurementEnabled: false,
        properties: {},
        nutritionProfile: null,
        recipeItems: [],
        recommendedProducts: [
          {
            id: 'rp-b-complex',
            name: 'B族维生素',
            brand: 'NOW FOODS',
            productModel: 'B-50胶囊，50mgB族维生素/粒，100粒/瓶',
            purchaseChannel: '京东',
            displayUnit: '粒',
            purchaseLink: { platform: 'JD', url: 'https://jd.example/b' },
            imageUrl: 'https://img.example/b.png',
            activeNutrients: {},
            isActive: true,
            sortOrder: 0
          }
        ],
        procurementSkus: [
          {
            id: 'sku-b-complex',
            name: 'B族维生素 B-50胶囊，50mgB族维生素/粒，100粒/瓶',
            brand: 'NOW FOODS',
            productModel: 'B-50胶囊，50mgB族维生素/粒，100粒/瓶',
            purchaseChannel: '京东',
            supplierName: 'NOW FOODS 京东自营',
            purchaseUnit: '瓶',
            purchaseToBaseRatio: 100,
            currentPurchasePrice: 90,
            referencePurchasePrice: 90,
            displayUnit: '瓶',
            isActive: true,
            isDefault: true,
            sortOrder: 0
          }
        ]
      }
    ] as any);

    expect(result.flattenIngredientUpdates).toHaveLength(1);
    expect(result.createIngredients).toHaveLength(0);
    expect(result.archiveRecommendedProducts).toEqual(['rp-b-complex']);
    expect(result.archiveProcurementSkus).toEqual(['sku-b-complex']);
    expect(result.flattenIngredientUpdates[0]).toEqual(
      expect.objectContaining({
        name: 'B族维生素 B-50胶囊，50mgB族维生素/粒，100粒/瓶',
        brand: 'NOW FOODS',
        productModel: 'B-50胶囊，50mgB族维生素/粒，100粒/瓶',
        diyEnabled: true,
        procurementEnabled: true
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
