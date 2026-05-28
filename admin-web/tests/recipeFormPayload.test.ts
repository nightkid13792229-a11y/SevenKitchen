import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRecipeSubmitData,
  normalizeRecipeLifeStagesForSubmit,
} from '../src/utils/recipeFormPayload.ts';

const nutritionData = {
  moisture_pct: 75.41,
  protein_dm_pct: 57.03,
  fat_dm_pct: 16.15,
  fiber_dm_pct: 3.4,
  ash_dm_pct: 6.59,
  carbs_dm_pct: 16.83,
  ca_p_ratio: 1.25,
  energy_density_kcal_per_kg: 1084,
};

test('buildRecipeSubmitData strips display-only item objects before saving', () => {
  const submitData = buildRecipeSubmitData(
    {
      name: '十字花科全谷物三文鱼鸡肉',
      coverImageUrl: 'https://img.sevenkitchen.cloud/recipes/cover.jpg',
      detailImages: [],
      designSource: 'Animal Diet Formulator',
      nutritionReportUrl: null,
      nutritionStandard: 'FEDIAF_2021',
      energyDensityKcalPerKg: 1084,
      productionLossRate: 1.05,
      batchLaborHours: 2,
      applicableLifeStages: ['ADULT', 'SENIOR'],
      targetHealthTags: ['tag-1'],
      status: 'DRAFT',
      items: [
        {
          id: 'recipe-item-1',
          ingredientId: 'food-1',
          ingredientName: '生蚝',
          ingredientType: 'FOOD',
          preparationMethod: '去壳、生重、打碎',
          exampleWeight: 15,
          ratioPercent: 5.01,
          nutritionFoodId: 'nutrition-food-1',
          nutritionState: 'RAW',
          nutritionStateLabel: '生',
          nutritionFood: {
            id: 'nutrition-food-1',
            nutritionData: { huge: 'x'.repeat(150_000) },
          },
          ingredient: {
            id: 'food-1',
            properties: { main_nutrients_desc: '展示用' },
          },
        },
        {
          id: 'recipe-item-2',
          ingredientId: 'supplement-1',
          ingredientName: '海藻粉',
          ingredientType: 'SUPPLEMENT',
          preparationMethod: '充分搅拌',
          ingredient: {
            id: 'supplement-1',
            nutritionProfile: { huge: 'x'.repeat(150_000) },
          },
          supplementTargets: [
            {
              fieldPath: 'minerals.iodine',
              label: '碘',
              targetValuePerKg: 320,
              unit: 'μg',
            },
          ],
          supplementAlternativeIngredientIds: ['alt-1', 'alt-1', ''],
          supplementAlternatives: [
            { ingredientId: 'alt-1', ingredientName: '碘钾片' },
          ],
        },
      ],
    } as any,
    nutritionData,
  );

  assert.deepEqual(submitData.applicableLifeStages, [
    'HIGH_ACTIVITY_ADULT',
    'LOW_ACTIVITY_ADULT_OR_SENIOR',
  ]);
  assert.deepEqual(submitData.items, [
    {
      ingredientId: 'food-1',
      preparationMethod: '去壳、生重、打碎',
      exampleWeight: 15,
      ratioPercent: 5.01,
      supplementTargets: [],
      supplementAlternativeIngredientIds: [],
    },
    {
      ingredientId: 'supplement-1',
      preparationMethod: '充分搅拌',
      supplementTargets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          targetValuePerKg: 320,
          unit: 'μg',
        },
      ],
      supplementAlternativeIngredientIds: ['alt-1'],
    },
  ]);
  assert.equal('ingredient' in submitData.items![0], false);
  assert.equal('nutritionFood' in submitData.items![0], false);
  assert.equal('supplementAlternatives' in submitData.items![1], false);
  assert.ok(Buffer.byteLength(JSON.stringify(submitData)) < 10_000);
});

test('normalizeRecipeLifeStagesForSubmit preserves new values and deduplicates mapped legacy values', () => {
  assert.deepEqual(
    normalizeRecipeLifeStagesForSubmit([
      'ADULT',
      'HIGH_ACTIVITY_ADULT',
      'SENIOR',
      'LOW_ACTIVITY_ADULT_OR_SENIOR',
      'PREGNANCY',
      'LACTATION',
    ] as any),
    ['HIGH_ACTIVITY_ADULT', 'LOW_ACTIVITY_ADULT_OR_SENIOR', 'REPRODUCTION'],
  );
});

test('normalizeRecipeLifeStagesForSubmit keeps legacy values when the backend still exposes legacy options', () => {
  assert.deepEqual(
    normalizeRecipeLifeStagesForSubmit(['ADULT', 'SENIOR'] as any, [
      'PUPPY',
      'ADULT',
      'SENIOR',
    ]),
    ['ADULT', 'SENIOR'],
  );
});
