import {
  aggregateDogDesignHistory,
  aggregateDogOrderSummary,
  aggregateRecentEatenIngredients,
  buildDogDesignInsight,
} from '../../../src/domain/recipe-designer/dog-design-insight';

describe('dog-design-insight', () => {
  describe('aggregateDogDesignHistory', () => {
    it('aggregates ingredient usage counts and last-used timestamps', () => {
      const result = aggregateDogDesignHistory([
        {
          id: 'series-1',
          name: '系列一',
          designs: [
            {
              id: 'draft-1',
              updatedAt: '2026-01-01T00:00:00.000Z',
              items: [
                {
                  id: 'item-1',
                  name: '鸡胸肉',
                  ingredientType: 'FOOD',
                  ingredient: { name: '鸡胸肉', type: 'FOOD' },
                },
                {
                  id: 'item-2',
                  name: '鱼油',
                  ingredientType: 'SUPPLEMENT',
                  ingredient: { name: '鱼油', type: 'SUPPLEMENT' },
                },
              ],
            },
            {
              id: 'draft-2',
              updatedAt: '2026-03-01T00:00:00.000Z',
              items: [{ id: 'item-3', name: '鸡胸肉' }],
            },
          ],
        },
        { id: 'series-2', name: '系列一', designs: [] },
      ]);

      expect(result.designCount).toBe(2);
      expect(result.seriesNames).toEqual(['系列一']);
      const chicken = result.ingredients.find(
        (row) => row.name === '鸡胸肉',
      );
      expect(chicken?.count).toBe(2);
      expect(chicken?.lastUsedAt).toBe('2026-03-01T00:00:00.000Z');
      expect(chicken?.ingredientType).toBe('FOOD');
      expect(chicken?.isSupplement).toBe(false);

      const fishOil = result.ingredients.find((row) => row.name === '鱼油');
      expect(fishOil?.count).toBe(1);
      expect(fishOil?.isSupplement).toBe(true);

      expect(result.ingredients[0].name).toBe('鸡胸肉');
    });

    it('uses nutritionFood display names when item name is missing', () => {
      const result = aggregateDogDesignHistory([
        {
          id: 'series-1',
          name: '系列一',
          designs: [
            {
              id: 'draft-1',
              items: [
                {
                  id: 'item-1',
                  nutritionFood: { name: 'chicken-breast', displayNameZh: '鸡胸肉' },
                },
              ],
            },
          ],
        },
      ]);
      expect(result.ingredients.map((row) => row.name)).toEqual(['鸡胸肉']);
    });

    it('returns empty summary for empty history', () => {
      const result = aggregateDogDesignHistory([]);
      expect(result).toEqual({
        designCount: 0,
        seriesNames: [],
        ingredients: [],
        recentEatenIngredients: [],
      });
    });
  });

  describe('aggregateRecentEatenIngredients', () => {
    it('aggregates food items by standard ingredient id and skips supplements/packaging', () => {
      const result = aggregateRecentEatenIngredients([
        {
          id: 'oi-1',
          order: { status: 'FREEZING', freezingSince: '2026-07-01T00:00:00.000Z' },
          recipeSnapshot: {
            items: [
              { ingredient_id: 'ing-chicken', name: '鸡胸肉', ingredient_type: 'FOOD' },
              { ingredient_id: 'ing-fish-oil', name: '鱼油', ingredient_type: 'SUPPLEMENT' },
              { ingredient_id: 'ing-bag', name: '真空袋', ingredient_type: 'PACKAGING' },
            ],
          },
        },
        {
          id: 'oi-2',
          order: { status: 'COMPLETED', completedAt: '2026-07-20T00:00:00.000Z' },
          recipeSnapshot: {
            items: [{ ingredient_id: 'ing-chicken', name: '鸡胸肉', ingredient_type: 'FOOD' }],
          },
        },
        { id: 'oi-3', recipeSnapshot: { items: [{ ingredient_id: 'ing-beef', name: '牛霖', ingredient_type: 'FOOD' }] } },
        { id: 'oi-4', recipeSnapshot: null },
      ]);

      expect(result).toEqual([
        { ingredientId: 'ing-chicken', name: '鸡胸肉', count: 2, lastUsedAt: '2026-07-20T00:00:00.000Z' },
        { ingredientId: 'ing-beef', name: '牛霖', count: 1, lastUsedAt: null },
      ]);
    });

    it('sorts by most recent usage first and falls back to name asc', () => {
      const result = aggregateRecentEatenIngredients([
        {
          id: 'oi-1',
          order: { status: 'FREEZING', freezingSince: '2026-07-01T00:00:00.000Z' },
          recipeSnapshot: { items: [{ ingredient_id: 'a', name: 'A食材', ingredient_type: 'FOOD' }] },
        },
        {
          id: 'oi-2',
          order: { status: 'FREEZING', freezingSince: '2026-07-15T00:00:00.000Z' },
          recipeSnapshot: { items: [{ ingredient_id: 'b', name: 'B食材', ingredient_type: 'FOOD' }] },
        },
      ]);

      expect(result.map((row) => row.ingredientId)).toEqual(['b', 'a']);
    });
  });

  describe('aggregateDogOrderSummary', () => {
    it('extracts recipe names from order item snapshots and dedupes', () => {
      const result = aggregateDogOrderSummary([
        {
          id: 'order-item-1',
          recipeSnapshot: { recipeTitle: '成犬鸡肉配方' },
        },
        {
          id: 'order-item-2',
          recipeSnapshot: { recipeTitle: '成犬鸡肉配方' },
        },
        {
          id: 'order-item-3',
          recipeSnapshot: { name: '幼犬三文鱼配方' },
        },
        { id: 'order-item-4', recipeSnapshot: null },
        { id: 'order-item-5', recipeSnapshot: 'not-an-object' },
      ]);
      expect(result.orderCount).toBe(5);
      expect(result.recipeNames).toEqual([
        '成犬鸡肉配方',
        '幼犬三文鱼配方',
      ]);
    });
  });

  describe('buildDogDesignInsight', () => {
    it('assembles the full insight payload', () => {
      const insight = buildDogDesignInsight({
        dog: {
          id: 'dog-1',
          name: '旺财',
          ownerId: 'customer-1',
          currentWeightKg: 12.5,
          customBreedName: '柯基',
          allergyFoods: '鸡肉',
          pickyFoods: '胡萝卜',
          preferredFoods: '牛肉',
          medicalHistory: '轻度胰腺炎',
        },
        seriesList: [
          {
            id: 'series-1',
            name: '旺财鲜食',
            designs: [
              {
                id: 'draft-1',
                updatedAt: '2026-02-01T00:00:00.000Z',
                items: [{ id: 'item-1', name: '牛肉' }],
              },
            ],
          },
        ],
        orderItems: [{ id: 'oi-1', recipeSnapshot: { recipeTitle: '旺财套餐' } }],
        lifeStageLabel: '成犬（低活动）',
      });

      expect(insight.dog.name).toBe('旺财');
      expect(insight.dog.breedName).toBe('柯基');
      expect(insight.dog.lifeStageLabel).toBe('成犬（低活动）');
      expect(insight.dog.allergyFoods).toBe('鸡肉');
      expect(insight.designHistory.designCount).toBe(1);
      expect(insight.designHistory.ingredients[0].name).toBe('牛肉');
      expect(insight.orderSummary.recipeNames).toEqual(['旺财套餐']);
    });

    it('maps the extended dog profile fields for the design profile panel', () => {
      const insight = buildDogDesignInsight({
        dog: {
          id: 'dog-1',
          name: '旺财',
          currentWeightKg: 12.5,
          gender: 'FEMALE',
          birthday: '2023-04-01T00:00:00.000Z',
          isNeutered: true,
          bcsScore: 5,
          activityLevel: 'NORMAL',
          mealsPerDay: 2,
          treatInputMode: 'EXACT_KCAL',
          treatLevel: 'MODERATE',
          manualTreatKcal: 45,
          cachedTargetFoodKcal: 680,
        },
        seriesList: [],
        orderItems: [],
        lifeStageLabel: '成犬（低活动）',
      });

      expect(insight.dog.gender).toBe('FEMALE');
      expect(insight.dog.ageMonths).toBeGreaterThanOrEqual(38);
      expect(insight.dog.isNeutered).toBe(true);
      expect(insight.dog.bcsScore).toBe(5);
      expect(insight.dog.activityLevel).toBe('NORMAL');
      expect(insight.dog.mealsPerDay).toBe(2);
      expect(insight.dog.treatInputMode).toBe('EXACT_KCAL');
      expect(insight.dog.treatLevel).toBe('MODERATE');
      expect(insight.dog.manualTreatKcal).toBe(45);
      expect(insight.dog.targetFoodKcal).toBe(680);
    });

    it('returns null extended fields when the dog profile lacks them', () => {
      const insight = buildDogDesignInsight({
        dog: { id: 'dog-1', name: '旺财' },
        seriesList: [],
        orderItems: [],
        lifeStageLabel: null,
      });

      expect(insight.dog.gender).toBeNull();
      expect(insight.dog.ageMonths).toBeNull();
      expect(insight.dog.isNeutered).toBeNull();
      expect(insight.dog.bcsScore).toBeNull();
      expect(insight.dog.activityLevel).toBeNull();
      expect(insight.dog.mealsPerDay).toBeNull();
      expect(insight.dog.treatLevel).toBeNull();
      expect(insight.dog.targetFoodKcal).toBeNull();
    });

    it('falls back to breed relation name when custom breed is absent', () => {
      const insight = buildDogDesignInsight({
        dog: {
          id: 'dog-1',
          name: '豆豆',
          ownerId: 'customer-1',
          breed: { name: '拉布拉多' },
        },
        seriesList: [],
        orderItems: [],
        lifeStageLabel: null,
      });
      expect(insight.dog.breedName).toBe('拉布拉多');
    });
  });
});
