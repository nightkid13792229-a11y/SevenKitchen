import {
  INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS,
  summarizeIngredientCreationProfileCompleteness,
} from '../../../src/application/ingredient-creation/ingredient-creation-completeness';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';

describe('summarizeIngredientCreationProfileCompleteness', () => {
  it('counts non-zero, zero, and empty values separately', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 143;
    profile.macros.crudeProtein = 20;
    profile.macros.crudeFat = 0;
    profile.minerals.calcium = null;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.total).toBe(
      INGREDIENT_CREATION_PROFILE_FIELD_DEFINITIONS.length,
    );
    expect(summary.filled).toBe(3);
    expect(summary.nonZero).toBe(2);
    expect(summary.zero).toBe(1);
    expect(summary.empty).toBe(summary.total - 3);
    expect(summary.missingFields).toEqual(
      expect.arrayContaining([{ fieldPath: 'minerals.calcium', label: '钙' }]),
    );
  });

  it('treats undefined and non-finite numbers as empty', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = Number.NaN;
    profile.macros.moisture = Number.POSITIVE_INFINITY;
    profile.macros.crudeProtein = undefined as any;
    profile.vitamins.vitaminB1 = 0;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.filled).toBe(1);
    expect(summary.zero).toBe(1);
    expect(summary.nonZero).toBe(0);
    expect(summary.empty).toBe(summary.total - 1);
    expect(summary.missingFields).toEqual(
      expect.arrayContaining([
        { fieldPath: 'macros.energyKcal', label: '能量' },
        { fieldPath: 'macros.moisture', label: '水分' },
        { fieldPath: 'macros.crudeProtein', label: '粗蛋白' },
      ]),
    );
  });

  it('summarizes source coverage when fieldSources are present', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 143;
    profile.meta.fieldSources = {
      'macros.energyKcal': {
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    } as any;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.sourceCoverage.filledWithSource).toBe(1);
    expect(summary.sourceCoverage.filledWithoutSource).toBe(0);
    expect(summary.fieldSources).toEqual([
      {
        fieldPath: 'macros.energyKcal',
        label: '能量',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    ]);
  });

  it('separates filled values without field source from those with source', () => {
    const profile = createEmptyNutritionProfile();
    profile.macros.energyKcal = 143;
    profile.minerals.calcium = 0;
    profile.vitamins.vitaminB1 = 0.08;
    profile.meta.fieldSources = {
      'macros.energyKcal': {
        sourceType: 'CFCT',
        sourceKey: 'CFCT:apple',
        confidenceLevel: 'MEDIUM',
        compatibility: 'SAME_SPECIES',
      },
      'vitamins.vitaminB1': {
        sourceType: 'USDA',
        sourceKey: 'USDA:456',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    } as any;

    const summary = summarizeIngredientCreationProfileCompleteness(profile);

    expect(summary.filled).toBe(3);
    expect(summary.sourceCoverage).toEqual({
      filledWithSource: 2,
      filledWithoutSource: 1,
    });
    expect(summary.fieldSources).toEqual([
      {
        fieldPath: 'macros.energyKcal',
        label: '能量',
        sourceType: 'CFCT',
        sourceKey: 'CFCT:apple',
        confidenceLevel: 'MEDIUM',
        compatibility: 'SAME_SPECIES',
      },
      {
        fieldPath: 'vitamins.vitaminB1',
        label: '维生素 B1',
        sourceType: 'USDA',
        sourceKey: 'USDA:456',
        confidenceLevel: 'HIGH',
        compatibility: 'EXACT_FOOD',
      },
    ]);
  });
});
