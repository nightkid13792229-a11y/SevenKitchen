import {
  buildIngredientSnapshotSyncPlans,
  hasNutritionProfileValues,
} from '../../scripts/sync-primary-nutrition-profile-snapshots';

const profileWithCalcium = {
  meta: { rawBasisType: 'PER_100_G' },
  macros: {},
  minerals: { calcium: 120 },
  vitamins: {},
  fattyAcids: {},
  aminoAcids: {},
};

describe('primary nutrition profile snapshot sync', () => {
  it('detects numeric nutrition values and custom items', () => {
    expect(hasNutritionProfileValues(null)).toBe(false);
    expect(hasNutritionProfileValues({ macros: {} })).toBe(false);
    expect(hasNutritionProfileValues(profileWithCalcium)).toBe(true);
    expect(hasNutritionProfileValues({ customItems: [] })).toBe(false);
    expect(
      hasNutritionProfileValues({ customItems: [{ name: 'EPA+DHA' }] }),
    ).toBe(true);
  });

  it('plans only ingredients with empty snapshots and valid primary mappings', () => {
    const plans = buildIngredientSnapshotSyncPlans([
      {
        id: 'ingredient-missing',
        name: '沙丁鱼',
        type: 'FOOD',
        nutritionProfile: null,
        nutritionFoodMappings: [
          {
            isPrimary: true,
            nutritionFood: {
              id: 'food-sardine',
              displayNameZh: '沙丁鱼（生）',
              name: 'Sardine, raw',
              nutritionData: profileWithCalcium,
            },
          },
        ],
      },
      {
        id: 'ingredient-existing',
        name: '紫薯',
        type: 'FOOD',
        nutritionProfile: profileWithCalcium,
        nutritionFoodMappings: [
          {
            isPrimary: true,
            nutritionFood: {
              id: 'food-purple-sweet-potato',
              displayNameZh: '紫薯（去皮，生）',
              name: 'Purple sweet potato, raw',
              nutritionData: profileWithCalcium,
            },
          },
        ],
      },
      {
        id: 'ingredient-no-primary',
        name: '鸭心',
        type: 'FOOD',
        nutritionProfile: null,
        nutritionFoodMappings: [
          {
            isPrimary: false,
            nutritionFood: {
              id: 'food-duck-heart',
              displayNameZh: '鸭心（生）',
              name: 'Duck heart, raw',
              nutritionData: profileWithCalcium,
            },
          },
        ],
      },
    ]);

    expect(plans).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-missing',
        ingredientName: '沙丁鱼',
        nutritionFoodId: 'food-sardine',
        nutritionFoodName: '沙丁鱼（生）',
      }),
    ]);
  });
});
