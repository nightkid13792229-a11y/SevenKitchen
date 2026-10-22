import type { NutritionEvidenceEntry } from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import {
  checkEntryUnits,
  normalizeUnit,
} from '../../../src/domain/ingredient-creation/unit-guard';

/** `minerals.calcium` 的目录单位是 `mg`。 */
const MILLIGRAM_FIELD = 'minerals.calcium';
/** `minerals.selenium` 的目录单位是 `μg`（希腊字母 μ，U+03BC）。 */
const MICROGRAM_FIELD = 'minerals.selenium';
/** `vitamins.vitaminA` 的目录单位是 `IU`（非质量单位）。 */
const IU_FIELD = 'vitamins.vitaminA';

function entry(
  overrides: Partial<NutritionEvidenceEntry> = {},
): NutritionEvidenceEntry {
  return {
    fieldPath: MILLIGRAM_FIELD,
    finalValue: 100,
    unit: 'mg',
    status: 'DIRECT',
    sourceRecordId: 'source-1',
    sourceValue: 100,
    sourceUnit: 'mg',
    formula: null,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides,
  };
}

function check(entries: readonly NutritionEvidenceEntry[]) {
  return checkEntryUnits(entries, NUTRITION_FIELD_CATALOG);
}

describe('normalizeUnit', () => {
  it.each([
    ['μg', 'µg'],
    ['µg', 'µg'],
    ['mcg', 'µg'],
    ['MCG', 'µg'],
    [' μg ', 'µg'],
    ['g', 'g'],
    ['G', 'g'],
    ['gram', 'g'],
    ['grams', 'g'],
    ['mg', 'mg'],
    ['MG', 'mg'],
    ['kcal', 'kcal'],
    ['KCAL', 'kcal'],
    ['千卡', 'kcal'],
    ['IU', 'IU'],
    ['iu', 'IU'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });

  it.each([['mg/kg'], ['g/100g'], ['MG/KG'], ['oz'], ['%'], [''], ['   ']])(
    'rejects unsupported unit %s',
    (raw) => {
      expect(normalizeUnit(raw)).toBeNull();
    },
  );
});

describe('checkEntryUnits', () => {
  it('accepts the catalog unit together with its documented variants', () => {
    expect(
      check([
        entry({ fieldPath: MICROGRAM_FIELD, unit: 'μg', sourceUnit: 'μg' }),
        entry({ fieldPath: 'minerals.iodine', unit: 'mcg', sourceUnit: 'mcg' }),
        entry({ fieldPath: MILLIGRAM_FIELD, unit: 'MG', sourceUnit: 'MG' }),
        entry({
          fieldPath: 'macros.energyKcal',
          unit: '千卡',
          sourceUnit: '千卡',
        }),
        entry({ fieldPath: IU_FIELD, unit: 'iu', sourceUnit: 'iu' }),
      ]),
    ).toEqual([]);
  });

  it('blocks a value written in mg into a μg field', () => {
    const items = check([
      entry({ fieldPath: MICROGRAM_FIELD, unit: 'mg', sourceUnit: 'mg' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'UNIT_MISMATCH',
      fieldPath: MICROGRAM_FIELD,
    });
  });

  it('blocks a unit that is not in the allowed set', () => {
    const items = check([entry({ fieldPath: MICROGRAM_FIELD, unit: 'mg/kg' })]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'UNIT_NOT_ALLOWED',
      fieldPath: MICROGRAM_FIELD,
    });
  });

  it('blocks a field that is not in the nutrition field catalog', () => {
    const items = check([entry({ fieldPath: 'minerals.unknown', unit: 'mg' })]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'UNIT_NOT_ALLOWED',
      fieldPath: 'minerals.unknown',
    });
  });

  it('accepts a CONVERTED row when mass conversion closes back to the source value', () => {
    expect(
      check([
        entry({
          fieldPath: 'macros.crudeProtein',
          finalValue: 1,
          unit: 'g',
          status: 'CONVERTED',
          sourceValue: 1000,
          sourceUnit: 'mg',
        }),
        entry({
          fieldPath: 'minerals.iron',
          finalValue: 1000,
          unit: 'mg',
          status: 'CONVERTED',
          sourceValue: 1,
          sourceUnit: 'g',
        }),
        entry({
          fieldPath: 'minerals.iron',
          finalValue: 0.2,
          unit: 'mg',
          status: 'CONVERTED',
          sourceValue: 200,
          sourceUnit: 'μg',
        }),
      ]),
    ).toEqual([]);
  });

  it('blocks a CONVERTED row whose mass conversion does not close', () => {
    const items = check([
      entry({
        fieldPath: 'macros.crudeProtein',
        finalValue: 1.2,
        unit: 'g',
        status: 'CONVERTED',
        sourceValue: 1000,
        sourceUnit: 'mg',
        formula: '1000 mg = 1 g',
      }),
    ]);

    expect(items.map((item) => item.code)).toEqual([
      'CONVERSION_NOT_REVERSIBLE',
    ]);
  });

  it('ignores floating point noise inside the 1e-6 conversion tolerance', () => {
    expect(
      check([
        entry({
          fieldPath: 'macros.crudeProtein',
          finalValue: 1.0000005,
          unit: 'g',
          status: 'CONVERTED',
          sourceValue: 1000,
          sourceUnit: 'mg',
        }),
      ]),
    ).toEqual([]);
  });

  it('blocks conversion drift outside the 1e-6 tolerance', () => {
    const items = check([
      entry({
        fieldPath: 'macros.crudeProtein',
        finalValue: 1.000005,
        unit: 'g',
        status: 'CONVERTED',
        sourceValue: 1000,
        sourceUnit: 'mg',
      }),
    ]);

    expect(items.map((item) => item.code)).toEqual([
      'CONVERSION_NOT_REVERSIBLE',
    ]);
  });

  it('accepts a non-mass conversion that records a formula', () => {
    expect(
      check([
        entry({
          fieldPath: IU_FIELD,
          finalValue: 10,
          unit: 'IU',
          status: 'CONVERTED',
          sourceValue: 3,
          sourceUnit: 'µg',
          formula: '1 µg = 3.33 IU',
        }),
      ]),
    ).toEqual([]);
  });

  it.each([null, '', '   '])(
    'blocks a non-mass conversion without a formula (%p)',
    (formula) => {
      const items = check([
        entry({
          fieldPath: IU_FIELD,
          finalValue: 10,
          unit: 'IU',
          status: 'CONVERTED',
          sourceValue: 3,
          sourceUnit: 'µg',
          formula,
        }),
      ]);

      expect(items.map((item) => item.code)).toEqual([
        'CONVERSION_NOT_REVERSIBLE',
      ]);
    },
  );

  it('blocks a CONVERTED row that cannot be reverse-calculated because a value is missing', () => {
    const items = check([
      entry({
        fieldPath: 'macros.crudeProtein',
        finalValue: null,
        unit: 'g',
        status: 'CONVERTED',
        sourceValue: 1000,
        sourceUnit: 'mg',
      }),
    ]);

    expect(items.map((item) => item.code)).toEqual([
      'CONVERSION_NOT_REVERSIBLE',
    ]);
  });

  it('only applies conversion closure to CONVERTED rows', () => {
    expect(
      check([
        entry({
          fieldPath: 'macros.crudeProtein',
          finalValue: 1.2,
          unit: 'g',
          status: 'DIRECT',
          sourceValue: 1000,
          sourceUnit: 'mg',
          formula: null,
        }),
      ]),
    ).toEqual([]);
  });

  it('orders findings by the nutrition field catalog, not by entry order', () => {
    const items = check([
      entry({ fieldPath: MICROGRAM_FIELD, unit: 'mg' }),
      entry({ fieldPath: MILLIGRAM_FIELD, unit: 'μg' }),
    ]);

    expect(items.map((item) => item.fieldPath)).toEqual([
      MILLIGRAM_FIELD,
      MICROGRAM_FIELD,
    ]);
  });

  it('keeps each field in catalog order even when the codes differ', () => {
    const items = check([
      entry({ fieldPath: MICROGRAM_FIELD, unit: 'mg/kg' }),
      entry({ fieldPath: MILLIGRAM_FIELD, unit: 'μg' }),
    ]);

    expect(items.map((item) => [item.fieldPath, item.code])).toEqual([
      [MILLIGRAM_FIELD, 'UNIT_MISMATCH'],
      [MICROGRAM_FIELD, 'UNIT_NOT_ALLOWED'],
    ]);
  });
});
