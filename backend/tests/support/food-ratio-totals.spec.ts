import {
  buildFoodRatioAuditReports,
  buildFoodRatioRepairPlans,
  type FoodRatioAuditRecipe,
} from 'src/support/food-ratio-totals';

function makeRecipe(
  overrides: Partial<FoodRatioAuditRecipe> = {},
): FoodRatioAuditRecipe {
  return {
    id: 'recipe-internal-1',
    recipeId: 'recipe-business-1',
    version: 7,
    name: '燕麦鳕鱼猪肉',
    status: 'PUBLIC',
    seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
    items: [
      {
        id: 'oat-item',
        ratioPercent: 30,
        ingredient: {
          name: '燕麦',
          type: 'FOOD',
        },
      },
      {
        id: 'cod-item',
        ratioPercent: 69.33161953727506,
        ingredient: {
          name: '鳕鱼',
          type: 'FOOD',
        },
      },
      {
        id: 'calcium-item',
        ratioPercent: null,
        ingredient: {
          name: '碳酸钙粉',
          type: 'SUPPLEMENT',
        },
      },
    ],
    ...overrides,
  };
}

describe('food ratio totals audit and repair support', () => {
  it('flags published recipes whose FOOD ratio total is below 100 percent', () => {
    const reports = buildFoodRatioAuditReports([makeRecipe()]);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        recipeId: 'recipe-business-1',
        version: 7,
        foodItemCount: 2,
        isNormalized: false,
      }),
    );
    expect(reports[0].foodRatioTotalPercent).toBeCloseTo(99.33161953727506, 8);
  });

  it('normalizes only FOOD item ratios and leaves supplements out of the repair plan', () => {
    const [plan] = buildFoodRatioRepairPlans([makeRecipe()]);

    expect(plan.updates).toHaveLength(2);
    expect(plan.updates.map((update) => update.recipeItemId)).toEqual([
      'oat-item',
      'cod-item',
    ]);
    expect(
      plan.updates.reduce((sum, update) => sum + update.toRatioPercent, 0),
    ).toBeCloseTo(100, 8);
    expect(plan.updates[0]).toEqual(
      expect.objectContaining({
        fromRatioPercent: 30,
        ingredientName: '燕麦',
      }),
    );
    expect(plan.updates[0].toRatioPercent).toBeCloseTo(
      (30 / 99.33161953727506) * 100,
      8,
    );
  });

  it('does not produce updates when FOOD ratios already sum to 100 percent', () => {
    const [plan] = buildFoodRatioRepairPlans([
      makeRecipe({
        items: [
          {
            id: 'oat-item',
            ratioPercent: 40,
            ingredient: {
              name: '燕麦',
              type: 'FOOD',
            },
          },
          {
            id: 'cod-item',
            ratioPercent: 60,
            ingredient: {
              name: '鳕鱼',
              type: 'FOOD',
            },
          },
        ],
      }),
    ]);

    expect(plan.report.isNormalized).toBe(true);
    expect(plan.updates).toHaveLength(0);
  });
});
