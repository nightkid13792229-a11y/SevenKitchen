import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
} from '../../../src/domain/nutrition-governance/nutrition-profile-contract';

describe('nutrition profile contract', () => {
  it('accepts a food confirmation profile using registered USDA source metadata before confirmation', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceType = 'USDA';
    profile.meta.sourceKind = 'FOOD_DATABASE';
    profile.meta.sourceCode = 'USDA_FDC';
    profile.meta.sourceProvider = 'USDA FoodData Central';
    profile.meta.sourceVersion = '2026-04';
    profile.meta.externalId = 'fdc-123';
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

  it('requires conversion evidence for product-label active vitamins', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.vitamins.vitaminA = 1200;
    profile.vitamins.vitaminD = 400;
    profile.vitamins.vitaminE = 8;

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          code: 'MISSING_CONVERSION_EVIDENCE',
          fieldPath: 'vitamins.vitaminA',
        }),
        expect.objectContaining({
          severity: 'ERROR',
          code: 'MISSING_CONVERSION_EVIDENCE',
          fieldPath: 'vitamins.vitaminD',
        }),
        expect.objectContaining({
          severity: 'ERROR',
          code: 'MISSING_CONVERSION_EVIDENCE',
          fieldPath: 'vitamins.vitaminE',
        }),
      ]),
    );
  });

  it('warns when food-database active vitamins are missing conversion evidence', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'FOOD_DATABASE';
    profile.vitamins.vitaminD = 400;

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'WARNING',
          code: 'MISSING_CONVERSION_EVIDENCE',
          fieldPath: 'vitamins.vitaminD',
        }),
      ]),
    );
  });

  it('accepts active vitamin conversion evidence from source forms or conversion notes', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.meta.sourceForms = {
      'vitamins.vitaminA': {
        originalValue: 360,
        originalUnit: 'μg RAE',
      },
    };
    profile.meta.conversionNotes = {
      'vitamins.vitaminD': 'Label provided IU directly.',
    };
    profile.vitamins.vitaminA = 1200;
    profile.vitamins.vitaminD = 400;

    const issues = validateNutritionProfileContract(profile);

    const missingEvidenceFields = issues
      .filter((issue) => issue.code === 'MISSING_CONVERSION_EVIDENCE')
      .map((issue) => issue.fieldPath);

    expect(missingEvidenceFields).not.toContain('vitamins.vitaminA');
    expect(missingEvidenceFields).not.toContain('vitamins.vitaminD');
  });

  it('requires a specific vitamin E source form when product labels provide mg values', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.vitamins.vitaminE = 10;
    profile.meta.sourceForms = {
      'vitamins.vitaminE': {
        originalValue: 10,
        originalUnit: 'mg',
        canonicalValue: 10,
        canonicalUnit: 'IU',
      },
    };

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          code: 'VITAMIN_E_FORM_REQUIRED',
          fieldPath: 'vitamins.vitaminE',
        }),
      ]),
    );
  });

  it('accepts product-label vitamin E mg values when source form and conversion factor are recorded', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.vitamins.vitaminE = 100;
    profile.meta.sourceForms = {
      'vitamins.vitaminE': {
        originalValue: 100,
        originalUnit: 'mg',
        canonicalValue: 100,
        canonicalUnit: 'IU',
        vitaminEForm: 'DL_ALPHA_TOCOPHERYL_ACETATE',
        conversionFactor: 1,
        conversionFactorUnit: 'IU_PER_MG',
      },
    };

    const issues = validateNutritionProfileContract(profile);

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VITAMIN_E_FORM_REQUIRED',
          fieldPath: 'vitamins.vitaminE',
        }),
      ]),
    );
  });

  it('requires source-form conversion evidence for product-label vitamin A and D mass values', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.vitamins.vitaminA = 3333;
    profile.vitamins.vitaminD = 400;
    profile.meta.sourceForms = {
      'vitamins.vitaminA': {
        originalValue: 1,
        originalUnit: 'mg',
        canonicalValue: 3333,
        canonicalUnit: 'IU',
      },
      'vitamins.vitaminD': {
        originalValue: 10,
        originalUnit: 'µg',
        canonicalValue: 400,
        canonicalUnit: 'IU',
      },
    };

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          code: 'VITAMIN_A_FORM_REQUIRED',
          fieldPath: 'vitamins.vitaminA',
        }),
        expect.objectContaining({
          severity: 'ERROR',
          code: 'VITAMIN_D_FORM_REQUIRED',
          fieldPath: 'vitamins.vitaminD',
        }),
      ]),
    );
  });

  it('accepts product-label vitamin A and D mass values when source form factors are recorded', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.vitamins.vitaminA = 3333;
    profile.vitamins.vitaminD = 400;
    profile.meta.sourceForms = {
      'vitamins.vitaminA': {
        originalValue: 1,
        originalUnit: 'mg',
        canonicalValue: 3333,
        canonicalUnit: 'IU',
        vitaminAForm: 'RETINOL',
        conversionFactor: 3333,
        conversionFactorUnit: 'IU_PER_MG',
      },
      'vitamins.vitaminD': {
        originalValue: 10,
        originalUnit: 'µg',
        canonicalValue: 400,
        canonicalUnit: 'IU',
        vitaminDForm: 'D3_CHOLECALCIFEROL',
        conversionFactor: 40,
        conversionFactorUnit: 'IU_PER_UG',
      },
    };

    const issues = validateNutritionProfileContract(profile);

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'VITAMIN_A_FORM_REQUIRED' }),
        expect.objectContaining({ code: 'VITAMIN_D_FORM_REQUIRED' }),
      ]),
    );
  });

  it('requires elemental conversion evidence when product-label minerals are recorded from compounds', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceKind = 'PRODUCT_LABEL';
    profile.minerals.calcium = 400;
    profile.meta.sourceForms = {
      'minerals.calcium': {
        originalValue: 1000,
        originalUnit: 'mg',
        canonicalValue: 400,
        canonicalUnit: 'mg',
        sourceCompound: 'calcium carbonate',
      },
    };

    const issues = validateNutritionProfileContract(profile);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'ERROR',
          code: 'MINERAL_ELEMENTAL_FRACTION_REQUIRED',
          fieldPath: 'minerals.calcium',
        }),
      ]),
    );

    profile.meta.sourceForms['minerals.calcium'].elementalFraction = 0.4;
    expect(validateNutritionProfileContract(profile)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MINERAL_ELEMENTAL_FRACTION_REQUIRED',
        }),
      ]),
    );
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
          fieldPath: 'meta.sourceKind',
        }),
      ]),
    );
  });
});
