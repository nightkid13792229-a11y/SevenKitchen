import { USDA_NUTRIENT_MAP } from '../../../src/domain/nutrition-governance/usda-nutrient-map';
import { mapUsdaNutrientsToNutritionProfile } from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

describe('USDA nutrient mapping', () => {
  it('maps iodine with the correct USDA nutrient id', () => {
    expect(USDA_NUTRIENT_MAP).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientId: 1100,
          fieldPath: 'minerals.iodine',
          sourceUnit: 'µg',
        }),
      ]),
    );
    expect(USDA_NUTRIENT_MAP).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nutrientId: 1103,
          fieldPath: 'minerals.iodine',
        }),
      ]),
    );
  });

  it('stores vitamin D activity as IU with source conversion evidence', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'µg' },
        amount: 2.5,
      },
    ]);

    expect(profile.meta).toMatchObject({
      sourceType: 'USDA',
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'USDA_FDC',
      sourceProvider: 'USDA FoodData Central',
    });
    expect(profile.vitamins.vitaminD).toBe(100);
    expect(profile.meta.sourceForms?.['vitamins.vitaminD']).toMatchObject({
      sourceNutrientId: 1114,
      sourceNutrientName: 'Vitamin D (D2 + D3)',
      originalValue: 2.5,
      originalUnit: 'µg',
      canonicalValue: 100,
      canonicalUnit: 'IU',
    });
    expect(profile.meta.conversionNotes?.['vitamins.vitaminD']).toContain(
      '1 µg vitamin D = 40 IU',
    );
  });

  it('stores USDA vitamin E alpha-tocopherol conversion evidence', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: {
          id: 1109,
          name: 'Vitamin E (alpha-tocopherol)',
          unitName: 'mg',
        },
        amount: 1,
      },
    ]);

    expect(profile.vitamins.vitaminE).toBeCloseTo(1 / 0.67, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientId: 1109,
      originalUnit: 'mg',
      canonicalUnit: 'IU',
    });
    expect(profile.meta.conversionNotes?.['vitamins.vitaminE']).toContain(
      '0.67 mg d-alpha-tocopherol',
    );
  });
});
