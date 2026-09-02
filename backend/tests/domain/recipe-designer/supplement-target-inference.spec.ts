import { assessRecipeDraft } from '../../../src/domain/recipe-designer/recipe-assessment';
import {
  inferSupplementTargetByRemoval,
  inferSupplementTargetsByRemoval,
} from '../../../src/domain/recipe-designer/supplement-target-inference';
import type {
  DesignRecipeAssessmentItemInput,
  FediafAssessmentTarget,
} from '../../../src/domain/recipe-designer/types';

const calciumTarget: FediafAssessmentTarget = {
  nutrientKey: 'calcium',
  label: '钙',
  category: 'MINERAL',
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'g',
  minValue: 0.5,
  maxValue: 7.1,
  fieldPaths: ['minerals.calcium'],
};

const zincTarget: FediafAssessmentTarget = {
  nutrientKey: 'zinc',
  label: '锌',
  category: 'MINERAL',
  expressionBasis: 'PER_1000_KCAL_ME',
  unit: 'mg',
  minValue: 10,
  maxValue: 227,
  fieldPaths: ['minerals.zinc'],
};

const baseFood: DesignRecipeAssessmentItemInput = {
  id: 'base-food',
  name: '低钙基础食材',
  ingredientType: 'FOOD',
  weightG: 100,
  nutritionProfile: {
    meta: { rawBasisType: 'PER_100_G' },
    macros: {
      energyKcal: 120,
      moisture: 70,
      crudeProtein: 20,
      crudeFat: 3,
      ash: 1,
      fiber: 0,
    },
    minerals: { calcium: 0, phosphorus: 500, zinc: 0 },
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  },
};

function assess(
  items: DesignRecipeAssessmentItemInput[],
  targets: FediafAssessmentTarget[] = [calciumTarget],
) {
  return assessRecipeDraft({
    scenario: 'ADULT_MER_95',
    targets,
    items,
  });
}

describe('supplement target inference by nutrient gap attribution', () => {
  it('infers a single target when removing the supplement creates one nutrient deficiency', () => {
    const supplement: DesignRecipeAssessmentItemInput = {
      id: 'eggshell',
      name: '鸡蛋壳粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 1,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0 },
        minerals: { calcium: 38000 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
    };
    const fullAssessment = assess([baseFood, supplement]);
    const assessmentWithoutSupplement = assess([baseFood]);

    expect(
      inferSupplementTargetByRemoval({
        itemId: supplement.id,
        itemName: supplement.name,
        itemNutritionProfile: supplement.nutritionProfile,
        itemWeightG: supplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      }),
    ).toEqual({
      fieldPath: 'minerals.calcium',
      fieldKey: 'calcium',
      label: '钙',
      unit: 'mg',
      targetValuePerKg: 3762.376,
      reason: 'CREATES_DEFICIENCY',
    });
  });

  it('does not infer when one supplement creates multiple nutrient deficiencies', () => {
    const supplement: DesignRecipeAssessmentItemInput = {
      id: 'multi-mineral',
      name: '复合矿物粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 1,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0 },
        minerals: { calcium: 38000, zinc: 3000 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
    };
    const targets = [calciumTarget, zincTarget];
    const fullAssessment = assess([baseFood, supplement], targets);
    const assessmentWithoutSupplement = assess([baseFood], targets);

    expect(
      inferSupplementTargetByRemoval({
        itemId: supplement.id,
        itemName: supplement.name,
        itemNutritionProfile: supplement.nutritionProfile,
        itemWeightG: supplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      }),
    ).toBeNull();
  });

  it('infers every directly attributed target when one supplement creates multiple nutrient deficiencies', () => {
    const supplement: DesignRecipeAssessmentItemInput = {
      id: 'multi-mineral',
      name: '复合矿物粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 1,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0 },
        minerals: { calcium: 38000, zinc: 3000 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
    };
    const targets = [calciumTarget, zincTarget];
    const fullAssessment = assess([baseFood, supplement], targets);
    const assessmentWithoutSupplement = assess([baseFood], targets);

    expect(
      inferSupplementTargetsByRemoval({
        itemId: supplement.id,
        itemName: supplement.name,
        itemNutritionProfile: supplement.nutritionProfile,
        itemWeightG: supplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      }),
    ).toEqual([
      {
        fieldPath: 'minerals.calcium',
        fieldKey: 'calcium',
        label: '钙',
        unit: 'mg',
        targetValuePerKg: 3762.376,
        reason: 'CREATES_DEFICIENCY',
      },
      {
        fieldPath: 'minerals.zinc',
        fieldKey: 'zinc',
        label: '锌',
        unit: 'mg',
        targetValuePerKg: 297.03,
        reason: 'CREATES_DEFICIENCY',
      },
    ]);
  });

  it('does not infer when removing the supplement does not create or worsen a nutrient deficiency', () => {
    const supplement: DesignRecipeAssessmentItemInput = {
      id: 'fiber',
      name: '洋车前子壳粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 1,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: { energyKcal: 0, fiber: 80 },
        minerals: {},
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
    };
    const fullAssessment = assess([baseFood, supplement]);
    const assessmentWithoutSupplement = assess([baseFood]);

    expect(
      inferSupplementTargetByRemoval({
        itemId: supplement.id,
        itemName: supplement.name,
        itemNutritionProfile: supplement.nutritionProfile,
        itemWeightG: supplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      }),
    ).toBeNull();
  });

  describe('contribution fallback when no deficiency gap is attributed', () => {
    const vitaminTargets: FediafAssessmentTarget[] = [
      {
        nutrientKey: 'vitaminB1',
        label: '维生素 B1',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 1,
        maxValue: null,
        fieldPaths: ['vitamins.vitaminB1'],
      },
      {
        nutrientKey: 'vitaminB2',
        label: '维生素 B2',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 1,
        maxValue: null,
        fieldPaths: ['vitamins.vitaminB2'],
      },
      {
        nutrientKey: 'vitaminB6',
        label: '维生素 B6',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'mg',
        minValue: 1,
        maxValue: null,
        fieldPaths: ['vitamins.vitaminB6'],
      },
      {
        nutrientKey: 'vitaminB12',
        label: '维生素 B12',
        category: 'VITAMIN',
        expressionBasis: 'PER_1000_KCAL_ME',
        unit: 'μg',
        minValue: 5,
        maxValue: null,
        fieldPaths: ['vitamins.vitaminB12'],
      },
    ];

    const vitaminSufficientFood: DesignRecipeAssessmentItemInput = {
      ...baseFood,
      nutritionProfile: {
        ...baseFood.nutritionProfile,
        vitamins: {
          vitaminB1: 0.6,
          vitaminB2: 0.6,
          vitaminB6: 0.7,
          vitaminB12: 2,
        },
      },
    };

    const yeastLikeSupplement: DesignRecipeAssessmentItemInput = {
      id: 'yeast',
      name: '营养酵母粉',
      ingredientType: 'SUPPLEMENT',
      weightG: 5,
      nutritionProfile: {
        meta: { rawBasisType: 'PER_1_G' },
        macros: { energyKcal: 0, crudeProtein: 0.5 },
        minerals: {},
        vitamins: {
          vitaminB1: 0.6,
          vitaminB2: 0.6,
          vitaminB6: 0.7,
          vitaminB12: 2,
        },
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
    };

    it('infers contributed B-vitamin targets when the recipe is already sufficient', () => {
      const fullAssessment = assess(
        [vitaminSufficientFood, yeastLikeSupplement],
        vitaminTargets,
      );
      const assessmentWithoutSupplement = assess(
        [vitaminSufficientFood],
        vitaminTargets,
      );

      expect(
        inferSupplementTargetsByRemoval({
          itemId: yeastLikeSupplement.id,
          itemName: yeastLikeSupplement.name,
          itemNutritionProfile: yeastLikeSupplement.nutritionProfile,
          itemWeightG: yeastLikeSupplement.weightG,
          totalRecipeWeightG: fullAssessment.totalWeightG,
          fullAssessment,
          assessmentWithoutItem: assessmentWithoutSupplement,
        }),
      ).toEqual([
        {
          fieldPath: 'vitamins.vitaminB1',
          fieldKey: 'vitaminB1',
          label: '维生素 B1',
          unit: 'mg',
          targetValuePerKg: 28.571,
          reason: 'CONTRIBUTES_NUTRIENT',
        },
        {
          fieldPath: 'vitamins.vitaminB12',
          fieldKey: 'vitaminB12',
          label: '维生素 B12',
          unit: 'μg',
          targetValuePerKg: 95.238,
          reason: 'CONTRIBUTES_NUTRIENT',
        },
        {
          fieldPath: 'vitamins.vitaminB2',
          fieldKey: 'vitaminB2',
          label: '维生素 B2',
          unit: 'mg',
          targetValuePerKg: 28.571,
          reason: 'CONTRIBUTES_NUTRIENT',
        },
        {
          fieldPath: 'vitamins.vitaminB6',
          fieldKey: 'vitaminB6',
          label: '维生素 B6',
          unit: 'mg',
          targetValuePerKg: 33.333,
          reason: 'CONTRIBUTES_NUTRIENT',
        },
      ]);
    });

    it('does not include macro nutrients in the contribution fallback', () => {
      const fullAssessment = assess(
        [vitaminSufficientFood, yeastLikeSupplement],
        vitaminTargets,
      );
      const assessmentWithoutSupplement = assess(
        [vitaminSufficientFood],
        vitaminTargets,
      );

      const inferred = inferSupplementTargetsByRemoval({
        itemId: yeastLikeSupplement.id,
        itemName: yeastLikeSupplement.name,
        itemNutritionProfile: yeastLikeSupplement.nutritionProfile,
        itemWeightG: yeastLikeSupplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      });

      expect(
        inferred.some((target) => target.fieldPath === 'macros.crudeProtein'),
      ).toBe(false);
    });

    it('keeps deficiency attribution when removal creates a deficiency', () => {
      // 底方缺少 B12 数据：删除补剂后 B12 归零 → 仍走缺口归因，而非贡献兜底
      const foodWithoutB12: DesignRecipeAssessmentItemInput = {
        ...vitaminSufficientFood,
        nutritionProfile: {
          ...vitaminSufficientFood.nutritionProfile,
          vitamins: { vitaminB1: 0.6, vitaminB2: 0.6, vitaminB6: 0.7 },
        },
      };
      const fullAssessment = assess(
        [foodWithoutB12, yeastLikeSupplement],
        vitaminTargets,
      );
      const assessmentWithoutSupplement = assess(
        [foodWithoutB12],
        vitaminTargets,
      );

      const inferred = inferSupplementTargetsByRemoval({
        itemId: yeastLikeSupplement.id,
        itemName: yeastLikeSupplement.name,
        itemNutritionProfile: yeastLikeSupplement.nutritionProfile,
        itemWeightG: yeastLikeSupplement.weightG,
        totalRecipeWeightG: fullAssessment.totalWeightG,
        fullAssessment,
        assessmentWithoutItem: assessmentWithoutSupplement,
      });

      expect(
        inferred.some((target) => target.reason === 'CONTRIBUTES_NUTRIENT'),
      ).toBe(false);
      expect(
        inferred.find((target) => target.fieldPath === 'vitamins.vitaminB12'),
      ).toMatchObject({ reason: 'CREATES_DEFICIENCY' });
    });
  });
});
