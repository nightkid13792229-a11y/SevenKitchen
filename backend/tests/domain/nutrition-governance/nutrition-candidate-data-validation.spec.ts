import { validateNutritionCandidateData } from '../../../src/domain/nutrition-governance/nutrition-candidate-data-validation';
import { mapUsdaNutrientsToNutritionProfile } from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

describe('nutrition candidate data validation', () => {
  it('passes when normalized USDA values match the raw source and conversion rules', () => {
    const rawData = {
      foodNutrients: [
        { nutrient: { id: 1162, name: 'Vitamin C, total ascorbic acid', unitName: 'mg' }, amount: 3.2 },
        { nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'µg' }, amount: 2 },
      ],
    };
    const profile = mapUsdaNutrientsToNutritionProfile(rawData.foodNutrients);

    const result = validateNutritionCandidateData({
      sourceType: 'USDA',
      rawData,
      normalizedNutrition: profile,
    });

    expect(result.status).toBe('PASS');
    expect(result.missingExpectedFields).toHaveLength(0);
    expect(result.mismatchedFields).toHaveLength(0);
    expect(result.checkedFieldCount).toBe(2);
  });

  it('flags source values that should have been mapped but are missing or mismatched', () => {
    const rawData = {
      foodNutrients: [
        { nutrient: { id: 1162, name: 'Vitamin C, total ascorbic acid', unitName: 'mg' }, amount: 3.2 },
        { nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'µg' }, amount: 2 },
      ],
    };
    const profile = mapUsdaNutrientsToNutritionProfile(rawData.foodNutrients);
    profile.vitamins.vitaminC = null;
    profile.vitamins.vitaminD = 40;

    const result = validateNutritionCandidateData({
      sourceType: 'USDA',
      rawData,
      normalizedNutrition: profile,
    });

    expect(result.status).toBe('FAIL');
    expect(result.missingExpectedFields).toEqual([
      expect.objectContaining({
        fieldPath: 'vitamins.vitaminC',
        sourceNutrientName: 'Vitamin C, total ascorbic acid',
      }),
    ]);
    expect(result.mismatchedFields).toEqual([
      expect.objectContaining({
        fieldPath: 'vitamins.vitaminD',
        expectedValue: 80,
        actualValue: 40,
      }),
    ]);
  });
});
