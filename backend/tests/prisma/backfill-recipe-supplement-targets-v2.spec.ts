import {
  buildSupplementTargetBackfillReport,
  inferDesignSupplementTargetByIngredientName,
  mapLegacyDesignSupplementTarget,
  mapLegacySupplementTarget,
  planDesignSupplementTargetBackfill,
  planRecipeSupplementTargetBackfill,
} from '../../prisma/backfill-recipe-supplement-targets-v2';

describe('backfill recipe supplement targets v2', () => {
  it.each([
    [
      '碘',
      660,
      {
        fieldPath: 'minerals.iodine',
        label: '碘',
        targetValuePerKg: 660,
        unit: 'μg',
      },
    ],
    [
      '钙',
      2160,
      {
        fieldPath: 'minerals.calcium',
        label: '钙',
        targetValuePerKg: 2160,
        unit: 'mg',
      },
    ],
    [
      '锌',
      17,
      {
        fieldPath: 'minerals.zinc',
        label: '锌',
        targetValuePerKg: 17,
        unit: 'mg',
      },
    ],
    [
      'iron',
      10.4,
      {
        fieldPath: 'minerals.iron',
        label: '铁',
        targetValuePerKg: 10.4,
        unit: 'mg',
      },
    ],
    [
      'copper',
      2.08,
      {
        fieldPath: 'minerals.copper',
        label: '铜',
        targetValuePerKg: 2.08,
        unit: 'mg',
      },
    ],
    [
      '维生素E',
      95,
      {
        fieldPath: 'vitamins.vitaminE',
        label: '维生素 E',
        targetValuePerKg: 95,
        unit: 'IU',
      },
    ],
    [
      '维生素D',
      125,
      {
        fieldPath: 'vitamins.vitaminD',
        label: '维生素 D',
        targetValuePerKg: 125,
        unit: 'IU',
      },
    ],
    [
      'vitaminD',
      159,
      {
        fieldPath: 'vitamins.vitaminD',
        label: '维生素 D',
        targetValuePerKg: 159,
        unit: 'IU',
      },
    ],
    [
      'vitaminB2',
      1.74,
      {
        fieldPath: 'vitamins.vitaminB2',
        label: '维生素 B2',
        targetValuePerKg: 1.74,
        unit: 'mg',
      },
    ],
    [
      '胆碱',
      150,
      {
        fieldPath: 'vitamins.choline',
        label: '胆碱',
        targetValuePerKg: 150,
        unit: 'mg',
      },
    ],
    [
      '牛磺酸',
      0.37,
      {
        fieldPath: 'aminoAcids.taurine',
        label: '牛磺酸',
        targetValuePerKg: 0.37,
        unit: 'mg',
      },
    ],
  ])('maps %s', (key, value, expected) => {
    expect(mapLegacySupplementTarget(key, value)).toEqual(expected);
  });

  it('requires manual review for EPA+DHA', () => {
    expect(mapLegacySupplementTarget('EPA+DHA', 600)).toBeNull();
  });

  it('maps legacy design supplement targets even when only the field is needed', () => {
    expect(mapLegacyDesignSupplementTarget('vitaminD', null)).toEqual({
      fieldPath: 'vitamins.vitaminD',
      nutrientTargetKey: 'vitaminD',
      label: '维生素 D',
      unit: 'IU',
      targetValue: null,
      expressionBasis: null,
    });
  });

  it.each([
    [
      '鸡蛋壳粉',
      {
        fieldPath: 'minerals.calcium',
        nutrientTargetKey: 'calcium',
        label: '钙',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '海藻粉',
      {
        fieldPath: 'minerals.iodine',
        nutrientTargetKey: 'iodine',
        label: '碘',
        unit: 'μg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '双甘氨酸亚铁胶囊',
      {
        fieldPath: 'minerals.iron',
        nutrientTargetKey: 'iron',
        label: '铁',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '双甘氨酸铜片',
      {
        fieldPath: 'minerals.copper',
        nutrientTargetKey: 'copper',
        label: '铜',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '碳酸钙粉',
      {
        fieldPath: 'minerals.calcium',
        nutrientTargetKey: 'calcium',
        label: '钙',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '葡萄糖酸锌片',
      {
        fieldPath: 'minerals.zinc',
        nutrientTargetKey: 'zinc',
        label: '锌',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '牛磺酸胶囊',
      {
        fieldPath: 'aminoAcids.taurine',
        nutrientTargetKey: 'taurine',
        label: '牛磺酸',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
    [
      '胆碱片',
      {
        fieldPath: 'vitamins.choline',
        nutrientTargetKey: 'choline',
        label: '胆碱',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    ],
  ])('infers design target for known supplement name %s', (name, expected) => {
    expect(inferDesignSupplementTargetByIngredientName(name)).toEqual(expected);
  });

  it('plans design recipe item updates from known supplement names when legacy fields are blank', () => {
    expect(
      planDesignSupplementTargetBackfill({
        id: 'design-item-calcium-carbonate',
        ingredientName: '碳酸钙粉',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
      }),
    ).toEqual({
      action: 'update',
      id: 'design-item-calcium-carbonate',
      reason: 'INFERRED_FROM_INGREDIENT_NAME',
      target: {
        fieldPath: 'minerals.calcium',
        nutrientTargetKey: 'calcium',
        label: '钙',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    });
  });

  it('plans design recipe item updates from taurine legacy target fields', () => {
    expect(
      planDesignSupplementTargetBackfill({
        id: 'design-item-taurine',
        ingredientName: '牛磺酸胶囊',
        nutrientTargetKey: '牛磺酸',
        nutrientTargetValue: 0.37,
        supplementTargets: null,
      }),
    ).toEqual({
      action: 'update',
      id: 'design-item-taurine',
      reason: 'LEGACY_TARGET_FIELD',
      target: {
        fieldPath: 'aminoAcids.taurine',
        nutrientTargetKey: 'taurine',
        label: '牛磺酸',
        unit: 'mg',
        targetValue: 0.37,
        expressionBasis: null,
      },
    });
  });

  it('plans design recipe item updates from nutrient gap attribution', () => {
    expect(
      planDesignSupplementTargetBackfill({
        id: 'design-item-attributed',
        ingredientName: '不在名称白名单的补剂',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
        attributedTarget: {
          fieldPath: 'minerals.calcium',
          fieldKey: 'calcium',
          label: '钙',
          unit: 'mg',
          targetValuePerKg: 1200,
          reason: 'CREATES_DEFICIENCY',
        },
      }),
    ).toEqual({
      action: 'update',
      id: 'design-item-attributed',
      reason: 'INFERRED_FROM_NUTRITION_GAP',
      target: {
        fieldPath: 'minerals.calcium',
        nutrientTargetKey: 'calcium',
        label: '钙',
        unit: 'mg',
        targetValue: null,
        expressionBasis: null,
      },
    });
  });

  it('plans design recipe item updates from multiple nutrient gap attributions', () => {
    expect(
      planDesignSupplementTargetBackfill({
        id: 'design-item-attributed-multi',
        ingredientName: '骨粉',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
        attributedTargets: [
          {
            fieldPath: 'minerals.calcium',
            fieldKey: 'calcium',
            label: '钙',
            unit: 'mg',
            targetValuePerKg: 1200,
            reason: 'CREATES_DEFICIENCY',
          },
          {
            fieldPath: 'minerals.phosphorus',
            fieldKey: 'phosphorus',
            label: '磷',
            unit: 'mg',
            targetValuePerKg: 900,
            reason: 'CREATES_DEFICIENCY',
          },
        ],
      }),
    ).toEqual({
      action: 'update',
      id: 'design-item-attributed-multi',
      reason: 'INFERRED_FROM_NUTRITION_GAP',
      target: [
        {
          fieldPath: 'minerals.calcium',
          nutrientTargetKey: 'calcium',
          label: '钙',
          unit: 'mg',
          targetValue: null,
          expressionBasis: null,
        },
        {
          fieldPath: 'minerals.phosphorus',
          nutrientTargetKey: 'phosphorus',
          label: '磷',
          unit: 'mg',
          targetValue: null,
          expressionBasis: null,
        },
      ],
    });
  });

  it('plans official recipe item updates by computing target value from supplement contribution', () => {
    expect(
      planRecipeSupplementTargetBackfill({
        id: 'recipe-item-calcium-carbonate',
        ingredientName: '碳酸钙粉',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
        nutritionProfile: {
          meta: { rawBasisType: 'PER_1_G' },
          minerals: { calcium: 360 },
        },
        exampleWeight: 0.8,
        totalRecipeWeightG: 156.4,
      }),
    ).toEqual({
      action: 'update',
      id: 'recipe-item-calcium-carbonate',
      reason: 'INFERRED_FROM_INGREDIENT_NAME_AND_PROFILE',
      target: {
        fieldPath: 'minerals.calcium',
        label: '钙',
        targetValuePerKg: 1841.432,
        unit: 'mg',
      },
    });
  });

  it('plans official recipe item updates from nutrient gap attribution', () => {
    expect(
      planRecipeSupplementTargetBackfill({
        id: 'recipe-item-attributed',
        ingredientName: '不在名称白名单的补剂',
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
        attributedTarget: {
          fieldPath: 'minerals.zinc',
          fieldKey: 'zinc',
          label: '锌',
          unit: 'mg',
          targetValuePerKg: 18.25,
          reason: 'CREATES_DEFICIENCY',
        },
      }),
    ).toEqual({
      action: 'update',
      id: 'recipe-item-attributed',
      reason: 'INFERRED_FROM_NUTRITION_GAP',
      target: {
        fieldPath: 'minerals.zinc',
        label: '锌',
        targetValuePerKg: 18.25,
        unit: 'mg',
      },
    });
  });

  it('serializes planned updates and manual review rows for production review', () => {
    expect(
      buildSupplementTargetBackfillReport({
        recipeItemsScanned: 2,
        designRecipeItemsScanned: 3,
        plannedUpdates: [
          {
            id: 'recipe-item-calcium',
            recipeId: 'recipe-calcium',
            recipeVersion: 2,
            recipeName: '碳酸钙测试配方',
            ingredientName: '碳酸钙粉',
            reason: 'INFERRED_FROM_INGREDIENT_NAME_AND_PROFILE',
            target: {
              fieldPath: 'minerals.calcium',
              label: '钙',
              targetValuePerKg: 1200,
              unit: 'mg',
            },
          },
        ],
        plannedDesignUpdates: [
          {
            id: 'design-item-taurine',
            designRecipeId: 'design-taurine',
            designRecipeName: '牛磺酸测试设计配方',
            designRecipeStatus: 'PUBLISHED',
            ingredientName: '牛磺酸胶囊',
            reason: 'LEGACY_TARGET_FIELD',
            target: {
              fieldPath: 'aminoAcids.taurine',
              nutrientTargetKey: 'taurine',
              label: '牛磺酸',
              unit: 'mg',
              targetValue: 0.37,
              expressionBasis: null,
            },
          },
        ],
        skippedExisting: 4,
        skippedDesignExisting: 5,
        attributedDesignTargetCount: 1,
        manualReview: [
          {
            table: 'design_recipe_item',
            designRecipeItemId: 'design-item-fish-oil',
            ingredientName: '鱼油胶囊',
            reason: 'MISSING_TARGET_MAPPING',
          },
        ],
      }),
    ).toEqual({
      counts: {
        recipeItemsScanned: 2,
        plannedRecipeItemUpdates: 1,
        skippedRecipeItemsAlreadyHavingV2Targets: 4,
        designRecipeItemsScanned: 3,
        plannedDesignRecipeItemUpdates: 1,
        designRecipeNutrientGapAttributions: 1,
        skippedDesignItemsAlreadyHavingV2Targets: 5,
        manualReviewItems: 1,
      },
      plannedRecipeItemUpdates: [
        {
          table: 'recipe_item',
          recipeItemId: 'recipe-item-calcium',
          recipeId: 'recipe-calcium',
          recipeVersion: 2,
          recipeName: '碳酸钙测试配方',
          ingredientName: '碳酸钙粉',
          reason: 'INFERRED_FROM_INGREDIENT_NAME_AND_PROFILE',
          target: {
            fieldPath: 'minerals.calcium',
            label: '钙',
            targetValuePerKg: 1200,
            unit: 'mg',
          },
        },
      ],
      plannedDesignRecipeItemUpdates: [
        {
          table: 'design_recipe_item',
          designRecipeItemId: 'design-item-taurine',
          designRecipeId: 'design-taurine',
          designRecipeName: '牛磺酸测试设计配方',
          designRecipeStatus: 'PUBLISHED',
          ingredientName: '牛磺酸胶囊',
          reason: 'LEGACY_TARGET_FIELD',
          target: {
            fieldPath: 'aminoAcids.taurine',
            nutrientTargetKey: 'taurine',
            label: '牛磺酸',
            unit: 'mg',
            targetValue: 0.37,
            expressionBasis: null,
          },
        },
      ],
      manualReview: [
        {
          table: 'design_recipe_item',
          designRecipeItemId: 'design-item-fish-oil',
          ingredientName: '鱼油胶囊',
          reason: 'MISSING_TARGET_MAPPING',
        },
      ],
    });
  });
});
