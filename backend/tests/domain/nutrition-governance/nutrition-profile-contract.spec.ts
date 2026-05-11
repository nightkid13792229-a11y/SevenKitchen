import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
} from '../../../src/domain/nutrition-governance/nutrition-profile-contract';

describe('nutrition profile contract', () => {
  it('accepts a food confirmation profile using the internal v2 structure', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceType = 'USDA';
    profile.meta.sourceTitle = 'USDA FoodData Central';
    profile.meta.sourceProvider = 'USDA FoodData Central';
    profile.meta.confidenceLevel = 'HIGH';
    profile.macros.energyKcal = 120;
    profile.macros.moisture = 70;
    profile.macros.crudeProtein = 20;
    profile.macros.crudeFat = 3;
    profile.minerals.calcium = 12;
    profile.minerals.phosphorus = 210;

    expect(
      validateNutritionProfileContract(profile, {
        requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
        allowedRawBasisTypes: ['PER_100_G'],
        requireSourceMeta: true,
      }),
    ).toEqual([]);
  });

  it('rejects legacy items arrays before confirmation', () => {
    const issues = validateNutritionProfileContract({
      items: [
        {
          nutrientName: 'Protein',
          value: 20,
          unit: 'g',
          basisType: 'PER_100_G',
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LEGACY_PROFILE' }),
      ]),
    );
  });

  it('detects raw USDA nutrient names leaking into profile tabs', () => {
    const profile = createEmptyNutritionProfile() as unknown as {
      macros: Record<string, unknown>;
    };
    profile.macros['Total lipid (fat)'] = 3;

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RAW_SOURCE_FIELD_LEAK',
          fieldPath: 'macros.Total lipid (fat)',
        }),
      ]),
    );
  });

  it('requires food confirmation fields, per-100g basis, and source metadata', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.rawBasisType = 'PER_SERVING';
    profile.macros.energyKcal = 120;

    const issues = validateNutritionProfileContract(profile, {
      requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
      allowedRawBasisTypes: ['PER_100_G'],
      requireSourceMeta: true,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_RAW_BASIS' }),
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          fieldPath: 'macros.crudeProtein',
        }),
        expect.objectContaining({
          code: 'MISSING_SOURCE_META',
          fieldPath: 'meta.sourceType',
        }),
      ]),
    );
  });
});
