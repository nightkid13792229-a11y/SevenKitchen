import {
  findNutritionField,
  getNutritionProfileFieldValue,
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

  it('lists selectable fixed supplement target fields without custom items', () => {
    const paths = listSupplementTargetFields().map((field) => field.fieldPath);
    expect(paths).toContain('minerals.iodine');
    expect(paths).toContain('fattyAcids.epa');
    expect(paths).toContain('fattyAcids.dha');
    expect(paths).not.toContain('customItems.0');
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
