import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
} from '../../../src/application/nutrition-standard/fediaf-2025-dog.data';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';

const REQUIRED_TABLES = [
  'III-3a',
  'III-3b',
  'III-3c',
  'VII-17a',
  'VII-17b',
  'VII-17c',
  'VII-17d',
];

const EXPECTED_TABLE_COUNTS: Record<string, number> = {
  'III-3a': 225,
  'III-3b': 225,
  'III-3c': 225,
  'VII-17a': 264,
  'VII-17b': 132,
  'VII-17c': 135,
  'VII-17d': 135,
};

describe('FEDIAF 2025 dog structured standard data', () => {
  it('declares the canonical FEDIAF 2025 dog version metadata', () => {
    expect(FEDIAF_2025_DOG_STANDARD_VERSION).toEqual(
      expect.objectContaining({
        code: 'FEDIAF_2025_DOG',
        standardCode: 'FEDIAF_2025',
        species: 'DOG',
        publicationMonth: '2025-09',
      }),
    );
  });

  it('contains every required dog source table', () => {
    const tables = [
      ...new Set(
        FEDIAF_2025_DOG_STANDARD_ENTRIES.map((entry) => entry.sourceTable),
      ),
    ].sort();

    expect(tables).toEqual([...REQUIRED_TABLES].sort());
  });

  it('keeps stable expected entry counts for every approved table', () => {
    const tableCounts = FEDIAF_2025_DOG_STANDARD_ENTRIES.reduce<
      Record<string, number>
    >((counts, entry) => {
      counts[entry.sourceTable] = (counts[entry.sourceTable] ?? 0) + 1;
      return counts;
    }, {});

    expect(FEDIAF_2025_DOG_STANDARD_ENTRIES).toHaveLength(1341);
    expect(tableCounts).toEqual(EXPECTED_TABLE_COUNTS);
  });

  it('keeps the database identity unique for every standard entry', () => {
    const identities = new Set<string>();

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      const identity = [
        entry.nutrientCode,
        entry.sourceTable,
        entry.lifeStage,
        entry.basis,
        entry.unit,
      ].join('|');
      expect(identities.has(identity)).toBe(false);
      identities.add(identity);
    }
  });

  it('uses known project field paths and normalized unit symbols', () => {
    const fieldPaths = new Set(
      NUTRITION_FIELD_CATALOG.map((field) => field.fieldPath),
    );

    for (const nutrient of FEDIAF_2025_DOG_NUTRIENTS) {
      if (nutrient.fieldPath) {
        expect(fieldPaths.has(nutrient.fieldPath)).toBe(true);
      }
      if (nutrient.defaultIngredientUnit) {
        expect(nutrient.defaultIngredientUnit).not.toContain('µ');
      }
      expect(nutrient.defaultStandardUnit).not.toContain('µ');
    }

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      expect(entry.unit).not.toContain('µ');
    }
  });

  it('documents rows that have no numeric standard value', () => {
    const emptyValueEntries = FEDIAF_2025_DOG_STANDARD_ENTRIES.filter(
      (entry) =>
        entry.minValue === null &&
        entry.maxValue === null &&
        entry.recommendedValue === null,
    );

    expect(emptyValueEntries.length).toBeGreaterThan(0);
    for (const entry of emptyValueEntries) {
      expect(entry.notes?.trim()).toBeTruthy();
    }
  });

  it('binds every standard entry to a known nutrient definition', () => {
    const nutrientCodes = new Set(
      FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => nutrient.code),
    );

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      expect(nutrientCodes.has(entry.nutrientCode)).toBe(true);
      expect(entry.fediafName.trim()).not.toHaveLength(0);
      expect(entry.unit.trim()).not.toHaveLength(0);
      expect(entry.pdfPage).toBeGreaterThan(0);
    }
  });

  it('keeps source pages aligned with the approved design scope', () => {
    const expectedPages: Record<string, number> = {
      'III-3a': 15,
      'III-3b': 16,
      'III-3c': 17,
      'VII-17a': 73,
      'VII-17b': 74,
      'VII-17c': 75,
      'VII-17d': 76,
    };

    for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
      expect(entry.pdfPage).toBe(expectedPages[entry.sourceTable]);
    }
  });

  it('keeps Annex 7.8 table-specific nutrient names aligned with source markers', () => {
    const expectedNames = [
      ['VII-17a', 'phosphorus', 'Phosphorus'],
      ['VII-17b', 'phosphorus', 'Phosphorus'],
      ['VII-17c', 'phosphorus', 'Phosphorus'],
      ['VII-17d', 'phosphorus', 'Phosphorus'],
      ['VII-17a', 'sodium', 'Sodium*'],
      ['VII-17b', 'sodium', 'Sodium*'],
      ['VII-17c', 'sodium', 'Sodium*'],
      ['VII-17d', 'sodium', 'Sodium*'],
      ['VII-17a', 'chloride', 'Chloride'],
      ['VII-17b', 'chloride', 'Chloride'],
      ['VII-17c', 'chloride', 'Chloride'],
      ['VII-17d', 'chloride', 'Chloride*'],
      ['VII-17a', 'choline', 'Choline*'],
      ['VII-17b', 'choline', 'Choline'],
      ['VII-17c', 'choline', 'Choline'],
      ['VII-17d', 'choline', 'Choline'],
    ] as const;

    for (const [sourceTable, nutrientCode, expectedName] of expectedNames) {
      const names = new Set(
        FEDIAF_2025_DOG_STANDARD_ENTRIES.filter(
          (entry) =>
            entry.sourceType === 'ANNEX_7_8' &&
            entry.sourceTable === sourceTable &&
            entry.nutrientCode === nutrientCode,
        ).map((entry) => entry.fediafName),
      );

      expect([...names]).toEqual([expectedName]);
    }
  });

  it('keeps reproduction separate from puppy-only nutritional maximums', () => {
    const maxByNutrient = (lifeStage: string, nutrientCode: string) =>
      FEDIAF_2025_DOG_STANDARD_ENTRIES.filter(
        (entry) =>
          entry.sourceType === 'ANNEX_7_8' &&
          entry.sourceTable === 'VII-17a' &&
          entry.basis === 'PER_1000_KCAL_ME' &&
          entry.lifeStage === lifeStage &&
          entry.nutrientCode === nutrientCode,
      ).map((entry) => entry.maxValue);

    expect(
      maxByNutrient('EARLY_GROWTH_UNDER_14_WEEKS', 'lysine'),
    ).toEqual([7]);
    expect(maxByNutrient('REPRODUCTION', 'lysine')).toEqual([null]);

    expect(
      maxByNutrient('EARLY_GROWTH_UNDER_14_WEEKS', 'linoleicAcid'),
    ).toEqual([16.25]);
    expect(maxByNutrient('REPRODUCTION', 'linoleicAcid')).toEqual([null]);

    expect(
      maxByNutrient('EARLY_GROWTH_UNDER_14_WEEKS', 'calcium'),
    ).toEqual([4]);
    expect(maxByNutrient('REPRODUCTION', 'calcium')).toEqual([null]);

    expect(
      maxByNutrient('REPRODUCTION', 'calciumPhosphorusRatio'),
    ).toEqual([1.6]);
    expect(maxByNutrient('REPRODUCTION', 'vitaminA')).toEqual([100000]);
  });

  it.each([
    ['VII-17a', 'EARLY_GROWTH_UNDER_14_WEEKS'],
    ['VII-17a', 'REPRODUCTION'],
    ['VII-17b', 'LATE_GROWTH_FROM_14_WEEKS'],
    ['VII-17c', 'ADULT_MER_110'],
    ['VII-17d', 'ADULT_MER_95'],
  ] as const)(
    'uses the fixed FEDIAF 400 kcal per 100g DM conversion for %s %s vitamin D legal maximum',
    (sourceTable, lifeStage) => {
      const vitaminDPer1000 = FEDIAF_2025_DOG_STANDARD_ENTRIES.find(
        (entry) =>
          entry.sourceType === 'ANNEX_7_8' &&
          entry.sourceTable === sourceTable &&
          entry.lifeStage === lifeStage &&
          entry.basis === 'PER_1000_KCAL_ME' &&
          entry.nutrientCode === 'vitaminD',
      );
      const vitaminDPerMj = FEDIAF_2025_DOG_STANDARD_ENTRIES.find(
        (entry) =>
          entry.sourceType === 'ANNEX_7_8' &&
          entry.sourceTable === sourceTable &&
          entry.lifeStage === lifeStage &&
          entry.basis === 'PER_MJ_ME' &&
          entry.nutrientCode === 'vitaminD',
      );

      expect(vitaminDPer1000).toMatchObject({
        maxValue: 568,
        maxType: 'LEGAL_MAX',
        recommendedValue: 800,
      });
      expect(vitaminDPer1000?.notes).toContain('227 IU/100 g DM');
      expect(vitaminDPer1000?.notes).toContain('400 kcal/100 g DM');

      expect(vitaminDPerMj).toMatchObject({
        maxType: 'LEGAL_MAX',
        recommendedValue: 191,
      });
      expect(vitaminDPerMj?.maxValue).toBeCloseTo(135.76, 2);
      expect(vitaminDPerMj?.notes).toContain('227 IU/100 g DM');
      expect(vitaminDPerMj?.notes).toContain('400 kcal/100 g DM');
    },
  );

  it('includes direct, combination, and ratio nutrient mappings', () => {
    expect(FEDIAF_2025_DOG_NUTRIENTS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'calcium',
          fieldPath: 'minerals.calcium',
          isDirect: true,
          isDerived: false,
        }),
        expect.objectContaining({
          code: 'epaDha',
          isDirect: false,
          isDerived: true,
        }),
        expect.objectContaining({
          code: 'calciumPhosphorusRatio',
          isDirect: false,
          isDerived: true,
        }),
      ]),
    );
  });
});
