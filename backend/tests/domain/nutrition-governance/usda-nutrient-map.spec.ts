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

    expect(profile.vitamins.vitaminE).toBeCloseTo(1.49, 6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminE']).toMatchObject({
      sourceNutrientId: 1109,
      sourceNutrientName: 'Vitamin E (alpha-tocopherol)',
      originalUnit: 'mg',
      canonicalValue: 1.49,
      canonicalUnit: 'IU',
      vitaminEForm: 'D_ALPHA_TOCOPHEROL',
      sourceCompound: 'd-α-tocopherol',
      conversionFactor: 1.49,
      conversionFactorUnit: 'IU_PER_MG',
    });
    expect(profile.meta.conversionNotes?.['vitamins.vitaminE']).toContain(
      'd-α-tocopherol 1 mg = 1.49 IU',
    );
  });

  it('keeps non-primary USDA vitamin E compounds as review-only source items', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: {
          id: 1109,
          name: 'Vitamin E (alpha-tocopherol)',
          unitName: 'mg',
        },
        amount: 1,
      },
      {
        nutrient: { id: 1125, name: 'Tocopherol, beta', unitName: 'mg' },
        amount: 0.2,
      },
      {
        nutrient: { id: 1126, name: 'Tocopherol, gamma', unitName: 'mg' },
        amount: 0.3,
      },
      {
        nutrient: { id: 1128, name: 'Tocotrienol, alpha', unitName: 'mg' },
        amount: 0.4,
      },
      {
        nutrient: { id: 1131, name: 'Tocotrienol, delta', unitName: 'mg' },
        amount: 0.5,
      },
      {
        nutrient: { id: 1242, name: 'Vitamin E, added', unitName: 'mg' },
        amount: 0.6,
      },
    ]);

    expect(profile.vitamins.vitaminE).toBeCloseTo(1.49, 6);
    expect(profile.customItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Tocopherol, beta',
          value: 0.2,
          unit: 'mg',
          sourceNutrientId: 1125,
          reviewCategory: 'USDA_VITAMIN_E_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
        expect.objectContaining({
          name: 'Tocotrienol, alpha',
          value: 0.4,
          unit: 'mg',
          sourceNutrientId: 1128,
          reviewCategory: 'USDA_VITAMIN_E_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
        expect.objectContaining({
          name: 'Vitamin E, added',
          value: 0.6,
          unit: 'mg',
          sourceNutrientId: 1242,
          reviewCategory: 'USDA_VITAMIN_E_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
      ]),
    );
    expect(
      profile.customItems.find((item) => item.name === 'Tocotrienol, delta')
        ?.note,
    ).toContain('未计入维生素 E 达标值');
  });

  it('does not clutter USDA vitamin E review items with zero amounts', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: { id: 1128, name: 'Tocotrienol, alpha', unitName: 'mg' },
        amount: 0,
      },
      {
        nutrient: { id: 1129, name: 'Tocotrienol, beta', unitName: 'mg' },
        amount: 0.1,
      },
    ]);

    expect(profile.customItems).toEqual([
      expect.objectContaining({
        name: 'Tocotrienol, beta',
        value: 0.1,
        reviewStatus: 'NOT_COUNTED',
      }),
    ]);
  });

  it('maps USDA vitamin C and vitamin K values into the preview profile', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: {
          id: 1162,
          name: 'Vitamin C, total ascorbic acid',
          unitName: 'mg',
        },
        amount: 3.2,
      },
      {
        nutrient: {
          id: 1185,
          name: 'Vitamin K (phylloquinone)',
          unitName: 'µg',
        },
        amount: 7.2,
      },
    ]);

    expect(profile.vitamins.vitaminC).toBe(3.2);
    expect(profile.vitamins.vitaminK).toBe(7.2);
    expect(profile.meta.sourceForms?.['vitamins.vitaminC']).toMatchObject({
      sourceNutrientId: 1162,
      sourceNutrientName: 'Vitamin C, total ascorbic acid',
      originalValue: 3.2,
      canonicalValue: 3.2,
      canonicalUnit: 'mg',
    });
    expect(profile.meta.sourceForms?.['vitamins.vitaminK']).toMatchObject({
      sourceNutrientId: 1185,
      sourceNutrientName: 'Vitamin K (phylloquinone)',
      originalValue: 7.2,
      canonicalValue: 7.2,
      canonicalUnit: 'μg',
    });
  });

  it('keeps USDA vitamin A, D and K related forms visible without double-counting them', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: { id: 1104, name: 'Vitamin A, IU', unitName: 'IU' },
        amount: 1120,
      },
      {
        nutrient: { id: 1106, name: 'Vitamin A, RAE', unitName: 'µg' },
        amount: 56,
      },
      {
        nutrient: { id: 1107, name: 'Carotene, beta', unitName: 'µg' },
        amount: 449,
      },
      {
        nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'µg' },
        amount: 2.5,
      },
      {
        nutrient: { id: 1112, name: 'Vitamin D3 (cholecalciferol)', unitName: 'µg' },
        amount: 1.2,
      },
      {
        nutrient: { id: 1185, name: 'Vitamin K (phylloquinone)', unitName: 'µg' },
        amount: 41.6,
      },
      {
        nutrient: { id: 1183, name: 'Vitamin K (Menaquinone-4)', unitName: 'µg' },
        amount: 8.5,
      },
    ]);

    expect(profile.vitamins.vitaminA).toBe(1120);
    expect(profile.vitamins.vitaminD).toBe(100);
    expect(profile.vitamins.vitaminK).toBe(41.6);
    expect(profile.meta.sourceForms?.['vitamins.vitaminA']).toMatchObject({
      sourceNutrientName: 'Vitamin A, IU',
      sourceCompound: 'USDA vitamin A activity',
      originalUnit: 'IU',
      canonicalUnit: 'IU',
    });
    expect(profile.meta.sourceForms?.['vitamins.vitaminD']).toMatchObject({
      sourceNutrientName: 'Vitamin D (D2 + D3)',
      sourceCompound: 'Vitamin D (D2 + D3)',
      conversionFactor: 40,
      conversionFactorUnit: 'IU_PER_UG',
    });
    expect(profile.customItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Vitamin A, RAE',
          canonicalFieldPath: 'vitamins.vitaminA',
          reviewCategory: 'USDA_VITAMIN_A_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
        expect.objectContaining({
          name: 'Carotene, beta',
          canonicalFieldPath: 'vitamins.vitaminA',
          reviewCategory: 'USDA_VITAMIN_A_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
        expect.objectContaining({
          name: 'Vitamin D3 (cholecalciferol)',
          canonicalFieldPath: 'vitamins.vitaminD',
          reviewCategory: 'USDA_VITAMIN_D_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
        expect.objectContaining({
          name: 'Vitamin K (Menaquinone-4)',
          canonicalFieldPath: 'vitamins.vitaminK',
          reviewCategory: 'USDA_VITAMIN_K_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
      ]),
    );
  });

  it('maps USDA essential and long-chain fatty acids with unit evidence', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      {
        nutrient: { id: 1269, name: 'PUFA 18:2', unitName: 'g' },
        amount: 0.5,
      },
      {
        nutrient: { id: 1316, name: 'PUFA 18:2 n-6 c,c', unitName: 'g' },
        amount: 0.45,
      },
      {
        nutrient: { id: 1270, name: 'PUFA 18:3', unitName: 'g' },
        amount: 0.04,
      },
      {
        nutrient: { id: 1404, name: 'PUFA 18:3 n-3 c,c,c (ALA)', unitName: 'g' },
        amount: 0.03,
      },
      {
        nutrient: { id: 1271, name: 'PUFA 20:4', unitName: 'g' },
        amount: 0.11,
      },
      {
        nutrient: { id: 1278, name: 'PUFA 20:5 n-3 (EPA)', unitName: 'g' },
        amount: 0.064,
      },
      {
        nutrient: { id: 1280, name: 'PUFA 22:5 n-3 (DPA)', unitName: 'g' },
        amount: 0.032,
      },
      {
        nutrient: { id: 1272, name: 'PUFA 22:6 n-3 (DHA)', unitName: 'g' },
        amount: 0.004,
      },
      {
        nutrient: { id: 1405, name: 'PUFA 20:3 n-3', unitName: 'g' },
        amount: 0.001,
      },
    ]);

    expect(profile.fattyAcids.linoleicAcid).toBe(0.45);
    expect(profile.fattyAcids.alphaLinolenicAcid).toBe(0.03);
    expect(profile.fattyAcids.arachidonicAcid).toBe(0.11);
    expect(profile.fattyAcids.epa).toBe(64);
    expect(profile.fattyAcids.dpa).toBe(32);
    expect(profile.fattyAcids.dha).toBe(4);
    expect(profile.meta.sourceForms?.['fattyAcids.epa']).toMatchObject({
      sourceNutrientName: 'PUFA 20:5 n-3 (EPA)',
      originalValue: 0.064,
      originalUnit: 'g',
      canonicalValue: 64,
      canonicalUnit: 'mg',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    });
    expect(profile.meta.sourceForms?.['fattyAcids.linoleicAcid']).toMatchObject({
      sourceNutrientName: 'PUFA 18:2 n-6 c,c',
    });
    expect(profile.customItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'PUFA 20:3 n-3',
          canonicalFieldPath: 'fattyAcids',
          reviewCategory: 'USDA_FATTY_ACID_RELATED',
          reviewStatus: 'NOT_COUNTED',
        }),
      ]),
    );
  });

  it('maps USDA amino acid nutrient ids beyond leucine', () => {
    const profile = mapUsdaNutrientsToNutritionProfile([
      { nutrient: { id: 1210, name: 'Tryptophan', unitName: 'g' }, amount: 0.007 },
      { nutrient: { id: 1211, name: 'Threonine', unitName: 'g' }, amount: 0.012 },
      { nutrient: { id: 1212, name: 'Isoleucine', unitName: 'g' }, amount: 0.012 },
      { nutrient: { id: 1214, name: 'Lysine', unitName: 'g' }, amount: 0.025 },
      { nutrient: { id: 1215, name: 'Methionine', unitName: 'g' }, amount: 0.012 },
      { nutrient: { id: 1216, name: 'Cystine', unitName: 'g' }, amount: 0.007 },
      { nutrient: { id: 1217, name: 'Phenylalanine', unitName: 'g' }, amount: 0.031 },
      { nutrient: { id: 1218, name: 'Tyrosine', unitName: 'g' }, amount: 0.002 },
      { nutrient: { id: 1219, name: 'Valine', unitName: 'g' }, amount: 0.012 },
      { nutrient: { id: 1220, name: 'Arginine', unitName: 'g' }, amount: 0.031 },
      { nutrient: { id: 1221, name: 'Histidine', unitName: 'g' }, amount: 0.002 },
      { nutrient: { id: 1224, name: 'Glutamic acid', unitName: 'g' }, amount: 0.204 },
      { nutrient: { id: 1225, name: 'Glycine', unitName: 'g' }, amount: 0.025 },
      { nutrient: { id: 1226, name: 'Proline', unitName: 'g' }, amount: 0.012 },
    ]);

    expect(profile.aminoAcids).toMatchObject({
      arginine: 0.031,
      lysine: 0.025,
      methionine: 0.012,
      cystine: 0.007,
      tryptophan: 0.007,
      threonine: 0.012,
      isoleucine: 0.012,
      valine: 0.012,
      phenylalanine: 0.031,
      tyrosine: 0.002,
      histidine: 0.002,
      glutamicAcid: 0.204,
      glycine: 0.025,
      proline: 0.012,
    });
    expect(profile.meta.sourceForms?.['aminoAcids.arginine']).toMatchObject({
      sourceNutrientId: 1220,
      sourceNutrientName: 'Arginine',
    });
  });
});
