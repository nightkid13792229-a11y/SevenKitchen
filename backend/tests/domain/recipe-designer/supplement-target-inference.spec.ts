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
});
