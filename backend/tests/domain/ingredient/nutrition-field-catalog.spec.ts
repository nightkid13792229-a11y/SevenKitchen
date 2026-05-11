import {
  findNutritionField,
  getNutritionProfileFieldValue,
  listDerivedNutritionFields,
  listSupplementTargetFields,
} from '../../../src/domain/ingredient/nutrition-field-catalog';

describe('nutrition field catalog', () => {
  it('finds standard field definitions by field path', () => {
    expect(findNutritionField('minerals.iodine')).toMatchObject({
      fieldPath: 'minerals.iodine',
      label: '碘',
      unit: 'μg',
    });
    expect(findNutritionField('fattyAcids.epa')).toMatchObject({
      fieldPath: 'fattyAcids.epa',
      label: 'EPA',
      unit: 'mg',
    });
    expect(findNutritionField('vitamins.vitaminE')).toMatchObject({
      fieldPath: 'vitamins.vitaminE',
      label: '维生素 E',
      unit: 'IU',
    });
  });

  it('exposes canonical unit metadata for activity vitamins', () => {
    expect(findNutritionField('vitamins.vitaminD')).toMatchObject({
      fieldPath: 'vitamins.vitaminD',
      unit: 'IU',
      quantityKind: 'ACTIVITY',
      canonicalUnitBasis: 'vitamin_d_activity_iu',
      conversionPolicy: 'SOURCE_FORM_REQUIRED_FOR_LABELS',
    });
    expect(findNutritionField('vitamins.vitaminK')).toMatchObject({
      fieldPath: 'vitamins.vitaminK',
      unit: 'μg',
      quantityKind: 'MASS',
      canonicalUnitBasis: 'vitamin_k_activity_ug',
      conversionPolicy: 'UNIT_CONVERSION',
    });
  });

  it('lists selectable fixed supplement target fields without custom items', () => {
    const paths = listSupplementTargetFields().map((field) => field.fieldPath);
    expect(paths).toContain('minerals.iodine');
    expect(paths).toContain('fattyAcids.epa');
    expect(paths).toContain('fattyAcids.dha');
    expect(paths).not.toContain('customItems.0');
  });

  it('keeps standard supplement target fields free of derived expressions', () => {
    const paths = listSupplementTargetFields().map((field) => field.fieldPath);
    expect(paths).toContain('fattyAcids.epa');
    expect(paths).toContain('fattyAcids.dha');
    expect(paths).not.toContain('derived.epaDha');
    expect(paths).not.toContain('derived.caP');
  });

  it('returns field metadata copies so callers cannot mutate the global catalog', () => {
    const [vitaminD] = listSupplementTargetFields().filter(
      (field) => field.fieldPath === 'vitamins.vitaminD',
    );

    vitaminD.label = 'mutated label';
    (vitaminD.sourceAliases as any[]).push({
      sourceCode: 'MUTATED',
      sourceFieldName: 'Mutated source',
    });

    expect(findNutritionField('vitamins.vitaminD')).toMatchObject({
      label: '维生素 D',
      sourceAliases: [
        {
          sourceCode: 'USDA_FDC',
          sourceNutrientId: 1114,
        },
      ],
    });
    expect(findNutritionField('vitamins.vitaminD')?.sourceAliases).toHaveLength(
      1,
    );
  });

  it('lists derived expressions needed by standards without storing them as profile tabs', () => {
    expect(listDerivedNutritionFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'derived.epaDha',
          sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
          unit: 'mg',
        }),
        expect.objectContaining({
          fieldPath: 'derived.caP',
          sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
          unit: 'ratio',
        }),
      ]),
    );
  });

  it('returns derived metadata copies so callers cannot mutate source paths', () => {
    const epaDha = listDerivedNutritionFields().find(
      (field) => field.fieldPath === 'derived.epaDha',
    );

    (epaDha?.sourceFieldPaths as any[]).push('minerals.sodium');

    expect(
      listDerivedNutritionFields().find(
        (field) => field.fieldPath === 'derived.epaDha',
      )?.sourceFieldPaths,
    ).toEqual(['fattyAcids.epa', 'fattyAcids.dha']);
  });

  it('reads values from structured nutrition profile paths', () => {
    const profile = {
      meta: { rawBasisType: 'PER_SERVING' },
      macros: {},
      minerals: { iodine: 150 },
      vitamins: { vitaminE: 200 },
      fattyAcids: { epa: 180, dha: 120 },
      aminoAcids: {},
      customItems: [],
    } as any;

    expect(getNutritionProfileFieldValue(profile, 'minerals.iodine')).toBe(150);
    expect(getNutritionProfileFieldValue(profile, 'fattyAcids.epa')).toBe(180);
    expect(getNutritionProfileFieldValue(profile, 'vitamins.vitaminE')).toBe(200);
    expect(
      getNutritionProfileFieldValue(profile, 'fattyAcids.unknown'),
    ).toBeUndefined();
  });
});
