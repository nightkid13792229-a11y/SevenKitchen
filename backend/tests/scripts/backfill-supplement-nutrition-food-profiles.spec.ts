import {
  buildSupplementNutritionFoodPlan,
  createSupplementNutritionFoodPayload,
} from '../../scripts/backfill-supplement-nutrition-food-profiles';

describe('supplement nutrition food profile backfill', () => {
  it('plans a nutrition food profile for supplements that only have compatible nutrition data', () => {
    const profile = {
      meta: { rawBasisType: 'PER_SERVING', sampleState: 'POWDER' },
      macros: {},
      minerals: { calcium: 200 },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    };

    const plan = buildSupplementNutritionFoodPlan({
      id: 'ingredient-1',
      name: '柠檬酸钙粉',
      brand: 'NOW FOODS',
      productModel: '600mg钙/3克，227克/罐',
      unitDisplayLabel: 'g',
      nutritionProfile: profile,
      nutritionFoodMappings: [],
    });

    expect(plan.action).toBe('create');
    if (plan.action !== 'create') {
      throw new Error('expected create plan');
    }
    expect(plan.nutritionFoodName).toBe(
      'Supplement label profile ingredient-1',
    );
    expect(plan.displayNameZh).toBe(
      '柠檬酸钙粉 · NOW FOODS · 600mg钙/3克，227克/罐',
    );
    expect(plan.preparationState).toBe('POWDER');
  });

  it('skips supplements that already have nutrition food mappings', () => {
    const plan = buildSupplementNutritionFoodPlan({
      id: 'ingredient-1',
      name: '鱼油胶囊',
      brand: 'NOW FOODS',
      productModel: '180粒/瓶',
      unitDisplayLabel: '粒',
      nutritionProfile: { meta: { rawBasisType: 'PER_SERVING' } },
      nutritionFoodMappings: [{ id: 'mapping-1' }],
    });

    expect(plan).toEqual({
      action: 'skip',
      reason: 'already has nutrition food mapping',
      ingredientId: 'ingredient-1',
      ingredientName: '鱼油胶囊',
    });
  });

  it('builds a verified SUPPLEMENT nutrition food payload without mutating the source profile', () => {
    const profile = {
      meta: { rawBasisType: 'PER_SERVING' },
      macros: {},
      minerals: {},
      vitamins: { vitaminD: 1000 },
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    };

    const payload = createSupplementNutritionFoodPayload({
      id: 'ingredient-2',
      name: '维生素D3胶囊',
      brand: 'NOW FOODS',
      productModel: '1000IU维D3/粒，180粒/瓶',
      unitDisplayLabel: '粒',
      nutritionProfile: profile,
      nutritionFoodMappings: [],
    });

    expect(payload).toMatchObject({
      name: 'Supplement label profile ingredient-2',
      displayNameZh: '维生素D3胶囊 · NOW FOODS · 1000IU维D3/粒，180粒/瓶',
      category: 'SUPPLEMENT',
      dataSource: 'SUPPLEMENT_LABEL',
      externalId: 'SUPPLEMENT_LABEL:ingredient-2',
      status: 'VERIFIED',
      preparationState: 'CONCENTRATE',
      preparationStateLabel: '浓缩补剂',
      ediblePortionLabel: '每粒标签标示量',
      processingLabel: '补剂标签导入',
    });
    expect(payload.nutritionData).toEqual(profile);
    expect(payload.nutritionData).not.toBe(profile);
  });
});
