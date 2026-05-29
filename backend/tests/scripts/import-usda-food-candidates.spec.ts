import {
  buildUsdaCandidateMatch,
  getUsdaSearchTerms,
  mapUsdaSearchFoodToSourceInput,
  selectUsdaFoodsForIngredient,
} from '../../scripts/import-usda-food-candidates';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
} from '../../src/domain/nutrition-governance/nutrition-profile-contract';

const REQUIRED_NUTRIENTS = [
  { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 120 },
  { nutrientId: 1051, nutrientName: 'Water', unitName: 'G', value: 70 },
  { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 20 },
  {
    nutrientId: 1004,
    nutrientName: 'Total lipid (fat)',
    unitName: 'G',
    value: 3,
  },
  { nutrientId: 1087, nutrientName: 'Calcium, Ca', unitName: 'MG', value: 12 },
  {
    nutrientId: 1091,
    nutrientName: 'Phosphorus, P',
    unitName: 'MG',
    value: 210,
  },
];

describe('USDA food candidate import helpers', () => {
  it('builds curated USDA search terms for Chinese food ingredients', () => {
    expect(getUsdaSearchTerms('鸡胸')).toEqual(['chicken breast raw']);
    expect(getUsdaSearchTerms('梨（鲜）')).toEqual(['pear raw']);
    expect(getUsdaSearchTerms('口蘑')).toEqual(['mushrooms white raw']);
    expect(getUsdaSearchTerms('黑木耳')).toEqual(['cloud ears']);
    expect(getUsdaSearchTerms('青口贝')).toEqual(['green lipped mussel raw']);
    expect(getUsdaSearchTerms('西红柿')).toEqual(['tomatoes red ripe raw']);
    expect(getUsdaSearchTerms('燕麦')).toEqual([
      'cereals oats regular quick not fortified dry',
    ]);
    expect(getUsdaSearchTerms('薏仁米')).toEqual(['coix seed raw']);
    expect(getUsdaSearchTerms('鸭胸')).toEqual([
      'duck domesticated meat only raw',
    ]);
    expect(getUsdaSearchTerms('完全未知食材')).toEqual(['完全未知食材']);
  });

  it('maps USDA search foods into nutrition source records', () => {
    const input = mapUsdaSearchFoodToSourceInput({
      food: {
        fdcId: 123,
        description: 'Chicken, broilers or fryers, breast, meat only, raw',
        dataType: 'SR Legacy',
        foodCategory: 'Poultry Products',
        publishedDate: '2019-04-01',
        foodNutrients: REQUIRED_NUTRIENTS,
      },
      searchTerm: 'chicken breast raw',
    });

    expect(input).toMatchObject({
      sourceType: 'USDA',
      externalId: '123',
      sourceTitle: 'USDA FoodData Central',
      foodName: 'Chicken, broilers or fryers, breast, meat only, raw',
      foodNameEn: 'Chicken, broilers or fryers, breast, meat only, raw',
      dataType: 'SR Legacy',
      category: 'Poultry Products',
      sourceDetail: {
        fdcId: '123',
        searchTerm: 'chicken breast raw',
        provider: 'USDA FoodData Central',
      },
    });
    expect(input.normalizedNutrition?.meta).toMatchObject({
      rawBasisType: 'PER_100_G',
      sourceType: 'USDA',
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
      sourceVersion: 'USDA_FDC:2019-04-01',
      externalId: '123',
      confidenceLevel: 'MEDIUM',
    });
    expect(
      validateNutritionProfileContract(input.normalizedNutrition, {
        requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
        allowedRawBasisTypes: ['PER_100_G'],
        requireSourceMeta: true,
      }),
    ).toEqual([]);
    expect(input.normalizedNutrition?.macros.energyKcal).toBe(120);
    expect(input.normalizedNutrition?.macros.moisture).toBe(70);
    expect(input.normalizedNutrition?.macros.crudeProtein).toBe(20);
    expect(input.normalizedNutrition?.macros.crudeFat).toBe(3);
    expect(input.normalizedNutrition?.minerals.calcium).toBe(12);
    expect(input.normalizedNutrition?.minerals.phosphorus).toBe(210);
  });

  it('maps USDA downloaded JSON foods into nutrition source records', () => {
    const input = mapUsdaSearchFoodToSourceInput({
      food: {
        fdcId: 321,
        description: 'Fish, salmon, Atlantic, wild, raw',
        dataType: 'SR Legacy',
        foodCategory: { description: 'Finfish and Shellfish Products' },
        foodNutrients: REQUIRED_NUTRIENTS.map((nutrient) => ({
          nutrient: {
            id: nutrient.nutrientId,
            name: nutrient.nutrientName,
            unitName: nutrient.unitName,
          },
          amount: nutrient.value,
        })),
      },
      searchTerm: 'salmon raw',
    });

    expect(input.category).toBe('Finfish and Shellfish Products');
    expect(input.normalizedNutrition?.meta).toMatchObject({
      sourceVersion: 'USDA_FDC',
      externalId: '321',
      confidenceLevel: 'MEDIUM',
    });
    expect(
      validateNutritionProfileContract(input.normalizedNutrition, {
        requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
        allowedRawBasisTypes: ['PER_100_G'],
        requireSourceMeta: true,
      }),
    ).toEqual([]);
    expect(input.normalizedNutrition?.macros.energyKcal).toBe(120);
    expect(input.normalizedNutrition?.minerals.phosphorus).toBe(210);
  });

  it('prefers raw whole-food USDA results over oil or prepared distractions', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '三文鱼',
      searchTerm: 'salmon raw',
      maxResults: 1,
      foods: [
        {
          fdcId: 1,
          description: 'Fish oil, salmon',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Fish, salmon, Atlantic, wild, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 3,
          description: 'Salmon, canned',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.food.fdcId).toBe(2);
    expect(selected[0]?.score).toBeGreaterThan(0.7);
  });

  it('prefers ordinary white mushrooms over UV-exposed white mushrooms', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '口蘑',
      searchTerm: getUsdaSearchTerms('口蘑')[0] ?? '',
      maxResults: 1,
      foods: [
        {
          fdcId: 1,
          description: 'Mushroom, white, exposed to ultraviolet light, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Mushrooms, white, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([2]);
  });

  it('does not match green-lipped mussel ingredients to blue mussel USDA records', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '青口贝',
      searchTerm: getUsdaSearchTerms('青口贝')[0] ?? '',
      maxResults: 2,
      foods: [
        {
          fdcId: 1,
          description: 'Mollusks, mussel, blue, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Mollusks, mussel, blue, cooked, moist heat',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected).toEqual([]);
  });

  it('prefers ordinary red ripe tomatoes over grape tomatoes', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '西红柿',
      searchTerm: getUsdaSearchTerms('西红柿')[0] ?? '',
      maxResults: 1,
      foods: [
        {
          fdcId: 1,
          description: 'Tomatoes, grape, raw',
          dataType: 'Foundation',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Tomatoes, red, ripe, raw, year round average',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([2]);
  });

  it('prefers domesticated raw duck meat over wild duck breast for default duck breast', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '鸭胸',
      searchTerm: getUsdaSearchTerms('鸭胸')[0] ?? '',
      maxResults: 1,
      foods: [
        {
          fdcId: 1,
          description: 'Duck, wild, breast, meat only, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Duck, domesticated, meat only, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([2]);
    expect(selected[0]?.score).toBeLessThan(0.85);
  });

  it('prefers regular quick not fortified dry oats over USDA food distribution oats', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '燕麦',
      searchTerm: getUsdaSearchTerms('燕麦')[0] ?? '',
      maxResults: 1,
      foods: [
        {
          fdcId: 169705,
          description:
            "Oats (Includes foods for USDA's Food Distribution Program)",
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 173904,
          description: 'Cereals, oats, regular and quick, not fortified, dry',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([173904]);
  });

  it('does not match coix seed ingredients to pearled barley USDA records', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '薏仁米',
      searchTerm: getUsdaSearchTerms('薏仁米')[0] ?? '',
      maxResults: 2,
      foods: [
        {
          fdcId: 170284,
          description: 'Barley, pearled, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 170285,
          description: 'Barley, pearled, cooked',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected).toEqual([]);
  });

  it('rejects partial matches when a multi-word search term only matches a generic word', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '丁香粉',
      searchTerm: 'cloves ground',
      maxResults: 2,
      foods: [
        {
          fdcId: 1,
          description: 'Spices, cloves, ground',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
        {
          fdcId: 2,
          description: 'Chicken, ground, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([1]);
  });

  it('rejects dried USDA foods unless the ingredient name explicitly marks a dry state', () => {
    const foods = [
      {
        fdcId: 1,
        description: 'Fungi, Cloud ears, dried',
        dataType: 'SR Legacy',
        foodNutrients: REQUIRED_NUTRIENTS,
      },
    ];

    expect(
      selectUsdaFoodsForIngredient({
        ingredientName: '黑木耳',
        searchTerm: 'cloud ears',
        maxResults: 2,
        foods,
      }),
    ).toEqual([]);

    expect(
      selectUsdaFoodsForIngredient({
        ingredientName: '干黑木耳',
        searchTerm: 'cloud ears',
        maxResults: 2,
        foods,
      }).map((item) => item.food.fdcId),
    ).toEqual([1]);
  });

  it('allows dried USDA nuts and seeds as their default food state', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '生南瓜籽仁',
      searchTerm: 'pumpkin seeds',
      maxResults: 2,
      foods: [
        {
          fdcId: 1,
          description: 'Seeds, pumpkin and squash seed kernels, dried',
          dataType: 'SR Legacy',
          foodCategory: 'Nut and Seed Products',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([1]);
  });

  it('rejects flour or ground USDA foods unless the ingredient name explicitly marks a powder state', () => {
    const foods = [
      {
        fdcId: 1,
        description: 'Seeds, sesame flour, partially defatted',
        dataType: 'SR Legacy',
        foodNutrients: REQUIRED_NUTRIENTS,
      },
      {
        fdcId: 2,
        description: 'Seeds, sesame meal, partially defatted',
        dataType: 'SR Legacy',
        foodNutrients: REQUIRED_NUTRIENTS,
      },
    ];

    expect(
      selectUsdaFoodsForIngredient({
        ingredientName: '白芝麻',
        searchTerm: 'sesame seeds',
        maxResults: 2,
        foods,
      }),
    ).toEqual([]);

    expect(
      selectUsdaFoodsForIngredient({
        ingredientName: '芝麻粉',
        searchTerm: 'sesame seeds',
        maxResults: 2,
        foods,
      }).map((item) => item.food.fdcId),
    ).toEqual([1, 2]);
  });

  it('ignores null USDA records from downloaded datasets', () => {
    const selected = selectUsdaFoodsForIngredient({
      ingredientName: '三文鱼',
      searchTerm: 'salmon raw',
      maxResults: 1,
      foods: [
        null as never,
        {
          fdcId: 2,
          description: 'Fish, salmon, Atlantic, wild, raw',
          dataType: 'SR Legacy',
          foodNutrients: REQUIRED_NUTRIENTS,
        },
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([2]);
  });

  it('builds a candidate match reason payload for imported USDA foods', () => {
    const match = buildUsdaCandidateMatch({
      ingredientName: '鸡胸',
      searchTerm: 'chicken breast raw',
      foodDescription: 'Chicken, broilers or fryers, breast, meat only, raw',
      score: 0.92,
    });

    expect(match).toEqual({
      score: 0.92,
      reasons: expect.arrayContaining([
        {
          code: 'SOURCE_PRIORITY',
          label: 'USDA 优先来源',
          scoreDelta: 0.15,
        },
        {
          code: 'NAME_PARTIAL',
          label: 'USDA 搜索词匹配: chicken breast raw',
          scoreDelta: 0.77,
        },
      ]),
    });
  });
});
