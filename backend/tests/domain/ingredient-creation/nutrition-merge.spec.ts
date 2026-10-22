import type {
  MergeConflict,
  MergePlan,
  MergeRow,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import {
  applyManualResolution,
  buildMergePlan,
} from '../../../src/domain/ingredient-creation/nutrition-merge';
import type { SourceNutrition } from '../../../src/domain/ingredient-creation/nutrition-merge';

const PRIMARY_ID = 'source-primary';
const SUPPLEMENT_ID = 'source-supplement';
const OTHER_SUPPLEMENT_ID = 'source-other-supplement';
const UNUSED_SOURCE_ID = 'source-without-values';

const ALL_FIELD_PATHS = NUTRITION_FIELD_CATALOG.map(
  (field) => field.fieldPath as string,
);

function source(
  sourceRecordId: string,
  values: Record<string, number | null | undefined>,
  units?: Record<string, string | null | undefined>,
  sourceValues?: Record<string, number | null | undefined>,
): SourceNutrition {
  return { sourceRecordId, values, units, sourceValues };
}

function rowOf(plan: MergePlan, fieldPath: string): MergeRow | undefined {
  return plan.rows.find((row) => row.fieldPath === fieldPath);
}

function conflictOf(
  plan: MergePlan,
  fieldPath: string,
): MergeConflict | undefined {
  return plan.conflicts.find((conflict) => conflict.fieldPath === fieldPath);
}

describe('buildMergePlan', () => {
  it('keeps primary values and fills only the fields the primary is missing', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 120 }),
      supplementals: [
        source(SUPPLEMENT_ID, {
          'minerals.calcium': 120,
          'minerals.iron': 4.5,
        }),
      ],
    });

    expect(plan.primarySourceRecordId).toBe(PRIMARY_ID);
    expect(rowOf(plan, 'minerals.calcium')).toEqual({
      fieldPath: 'minerals.calcium',
      value: 120,
      unit: 'mg',
      status: 'DIRECT',
      sourceRecordId: PRIMARY_ID,
      sourceValue: 120,
      sourceUnit: 'mg',
    });
    expect(rowOf(plan, 'minerals.iron')).toEqual({
      fieldPath: 'minerals.iron',
      value: 4.5,
      unit: 'mg',
      status: 'FILLED',
      sourceRecordId: SUPPLEMENT_ID,
      sourceValue: 4.5,
      sourceUnit: 'mg',
    });
    expect(plan.conflicts).toEqual([]);
  });

  it('never credits a supplemental source for a field the primary already provides', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'macros.energyKcal': 120 }),
      supplementals: [source(SUPPLEMENT_ID, { 'macros.energyKcal': 120 })],
    });

    expect(rowOf(plan, 'macros.energyKcal')).toMatchObject({
      value: 120,
      status: 'DIRECT',
      sourceRecordId: PRIMARY_ID,
      sourceValue: 120,
    });
    expect(plan.conflicts).toEqual([]);
  });

  it('reports a conflict instead of a final value when the primary and a supplemental disagree', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 5.5 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.iron': 12 })],
    });

    expect(rowOf(plan, 'minerals.iron')).toEqual({
      fieldPath: 'minerals.iron',
      value: null,
      unit: 'mg',
      status: 'CONFLICT',
      sourceRecordId: null,
      sourceValue: null,
      sourceUnit: null,
    });
    expect(plan.rows.filter((row) => row.value !== null)).toEqual([]);
    expect(conflictOf(plan, 'minerals.iron')).toEqual({
      fieldPath: 'minerals.iron',
      candidates: [
        {
          sourceRecordId: PRIMARY_ID,
          value: 5.5,
          unit: 'mg',
          sourceValue: 5.5,
          sourceUnit: 'mg',
        },
        {
          sourceRecordId: SUPPLEMENT_ID,
          value: 12,
          unit: 'mg',
          sourceValue: 12,
          sourceUnit: 'mg',
        },
      ],
    });
  });

  it('reports a conflict when two fill sources disagree and the primary has no value', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 100 }),
      supplementals: [
        source(SUPPLEMENT_ID, { 'macros.crudeProtein': 18 }),
        source(OTHER_SUPPLEMENT_ID, { 'macros.crudeProtein': 22 }),
      ],
    });

    expect(rowOf(plan, 'macros.crudeProtein')).toEqual({
      fieldPath: 'macros.crudeProtein',
      value: null,
      unit: 'g',
      status: 'CONFLICT',
      sourceRecordId: null,
      sourceValue: null,
      sourceUnit: null,
    });
    expect(conflictOf(plan, 'macros.crudeProtein')?.candidates).toEqual([
      {
        sourceRecordId: SUPPLEMENT_ID,
        value: 18,
        unit: 'g',
        sourceValue: 18,
        sourceUnit: 'g',
      },
      {
        sourceRecordId: OTHER_SUPPLEMENT_ID,
        value: 22,
        unit: 'g',
        sourceValue: 22,
        sourceUnit: 'g',
      },
    ]);
    expect(rowOf(plan, 'minerals.calcium')?.value).toBe(100);
  });

  it('marks conflicting rows as CONFLICT with no final value and no credited source', () => {
    const primaryConflict = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 5.5 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.iron': 12 })],
    });
    const fillConflict = buildMergePlan({
      primary: source(PRIMARY_ID, {}),
      supplementals: [
        source(SUPPLEMENT_ID, { 'minerals.iron': 5.5 }),
        source(OTHER_SUPPLEMENT_ID, { 'minerals.iron': 12 }),
      ],
    });

    for (const plan of [primaryConflict, fillConflict]) {
      const row = rowOf(plan, 'minerals.iron');
      expect(row?.status).toBe('CONFLICT');
      expect(row?.value).toBeNull();
      expect(row?.sourceRecordId).toBeNull();
      expect(row?.sourceValue).toBeNull();
      expect(row?.sourceUnit).toBeNull();
    }
  });

  it('fills from the first supplemental when several fill sources agree', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 100 }),
      supplementals: [
        source(SUPPLEMENT_ID, { 'macros.crudeProtein': 18 }),
        source(OTHER_SUPPLEMENT_ID, { 'macros.crudeProtein': 18 }),
      ],
    });

    expect(rowOf(plan, 'macros.crudeProtein')).toMatchObject({
      value: 18,
      status: 'FILLED',
      sourceRecordId: SUPPLEMENT_ID,
      sourceValue: 18,
    });
    expect(plan.conflicts).toEqual([]);
  });

  it('does not fabricate a conflict from floating point noise inside the relative tolerance', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 0.1 + 0.2 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.calcium': 0.3 })],
    });

    expect(plan.conflicts).toEqual([]);
    expect(rowOf(plan, 'minerals.calcium')?.value).toBe(0.1 + 0.2);
    expect(rowOf(plan, 'minerals.calcium')?.status).toBe('DIRECT');
  });

  it('still treats values outside the 1e-6 relative tolerance as a conflict', () => {
    const withinTolerance = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 1000 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.calcium': 1000.0005 })],
    });
    const outsideTolerance = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 1000 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.calcium': 1000.01 })],
    });

    expect(withinTolerance.conflicts).toEqual([]);
    expect(outsideTolerance.conflicts).toHaveLength(1);
  });

  it('treats a 9e-7 relative difference as equal, just inside the tolerance', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 1000 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.calcium': 1000.0009 })],
    });

    expect(plan.conflicts).toEqual([]);
    expect(rowOf(plan, 'minerals.calcium')?.value).toBe(1000);
    expect(rowOf(plan, 'minerals.calcium')?.status).toBe('DIRECT');
  });

  it('treats a 2e-6 relative difference as a conflict, just outside the tolerance', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 1000 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.calcium': 1000.002 })],
    });

    expect(plan.conflicts).toHaveLength(1);
    expect(rowOf(plan, 'minerals.calcium')?.value).toBeNull();
    expect(rowOf(plan, 'minerals.calcium')?.status).toBe('CONFLICT');
  });

  it('treats an absent key or an explicit null as missing, never as zero', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, {
        'minerals.calcium': 100,
        'minerals.iron': null,
      }),
      supplementals: [source(SUPPLEMENT_ID, {})],
    });

    expect(plan.rows.map((row) => row.fieldPath)).toEqual(['minerals.calcium']);
    expect(plan.conflicts).toEqual([]);
    expect(plan.rows.some((row) => row.value === 0)).toBe(false);
    expect(plan.missingFields).toContain('minerals.iron');
    expect(plan.missingFields).not.toContain('minerals.calcium');
    expect(plan.missingFields).toHaveLength(ALL_FIELD_PATHS.length - 1);
  });

  it('lists fields nobody provided in catalog order and keeps conflicts out of missingFields', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 5.5 }),
      supplementals: [
        source(SUPPLEMENT_ID, {
          'minerals.iron': 12,
          'macros.moisture': 70,
        }),
      ],
    });

    expect(plan.rows.map((row) => row.fieldPath)).toEqual([
      'macros.moisture',
      'minerals.iron',
    ]);
    expect(plan.conflicts.map((conflict) => conflict.fieldPath)).toEqual([
      'minerals.iron',
    ]);
    expect(plan.missingFields).toEqual(
      ALL_FIELD_PATHS.filter(
        (fieldPath) =>
          fieldPath !== 'macros.moisture' && fieldPath !== 'minerals.iron',
      ),
    );
    expect(plan.missingFields).not.toContain('minerals.iron');
    expect(plan.missingFields).not.toContain('macros.moisture');
  });

  it('keeps a value of zero that a source actually provided', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 100 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.iron': 0 })],
    });

    const iron = rowOf(plan, 'minerals.iron');
    expect(iron?.value).toBe(0);
    expect(iron?.value).not.toBeNull();
    expect(iron?.status).toBe('FILLED');
    expect(iron?.sourceRecordId).toBe(SUPPLEMENT_ID);
    expect(plan.conflicts).toEqual([]);
  });

  it('treats a provided zero as equal to another provided zero', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 0 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.iron': 0 })],
    });

    expect(rowOf(plan, 'minerals.iron')).toMatchObject({
      value: 0,
      status: 'DIRECT',
      sourceRecordId: PRIMARY_ID,
    });
    expect(plan.conflicts).toEqual([]);
  });

  it('orders rows by the nutrition field catalog, not by source order', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, {
        'vitamins.vitaminA': 5000,
        'macros.moisture': 70,
      }),
      supplementals: [
        source(SUPPLEMENT_ID, {
          'aminoAcids.taurine': 0.2,
          'minerals.calcium': 8,
          'macros.energyKcal': 120,
        }),
      ],
    });

    expect(plan.rows.map((row) => row.fieldPath)).toEqual([
      'macros.energyKcal',
      'macros.moisture',
      'minerals.calcium',
      'vitamins.vitaminA',
      'aminoAcids.taurine',
    ]);
  });

  it('exposes the raw source value on rows while the final value stays in the catalog unit', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 100 }),
      supplementals: [
        source(
          SUPPLEMENT_ID,
          { 'minerals.iodine': 550 },
          { 'minerals.iodine': 'mg' },
          { 'minerals.iodine': 0.55 },
        ),
      ],
    });

    expect(rowOf(plan, 'minerals.iodine')).toEqual({
      fieldPath: 'minerals.iodine',
      value: 550,
      unit: 'μg',
      status: 'FILLED',
      sourceRecordId: SUPPLEMENT_ID,
      sourceValue: 0.55,
      sourceUnit: 'mg',
    });
  });

  it('exposes both catalog-unit values and raw source values in conflict candidates', () => {
    const plan = buildMergePlan({
      primary: source(
        PRIMARY_ID,
        { 'minerals.iodine': 550 },
        { 'minerals.iodine': 'mg' },
        { 'minerals.iodine': 0.55 },
      ),
      supplementals: [
        source(
          SUPPLEMENT_ID,
          { 'minerals.iodine': 600 },
          { 'minerals.iodine': 'mg' },
          { 'minerals.iodine': 0.6 },
        ),
      ],
    });

    expect(conflictOf(plan, 'minerals.iodine')).toEqual({
      fieldPath: 'minerals.iodine',
      candidates: [
        {
          sourceRecordId: PRIMARY_ID,
          value: 550,
          unit: 'μg',
          sourceValue: 0.55,
          sourceUnit: 'mg',
        },
        {
          sourceRecordId: SUPPLEMENT_ID,
          value: 600,
          unit: 'μg',
          sourceValue: 0.6,
          sourceUnit: 'mg',
        },
      ],
    });
    expect(rowOf(plan, 'minerals.iodine')).toMatchObject({
      value: null,
      unit: 'μg',
      status: 'CONFLICT',
      sourceValue: null,
      sourceUnit: null,
    });
  });

  it('ignores field paths outside the nutrition catalog', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, {
        'minerals.iron': 5,
        'manual.notACatalogField': 42,
      }),
      supplementals: [],
    });

    expect(plan.rows.map((row) => row.fieldPath)).toEqual(['minerals.iron']);
  });

  it('returns an empty plan with every field missing when no source provides a value', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, {}),
      supplementals: [source(SUPPLEMENT_ID, {})],
    });

    expect(plan).toEqual({
      primarySourceRecordId: PRIMARY_ID,
      rows: [],
      conflicts: [],
      missingFields: ALL_FIELD_PATHS,
    });
  });
});

describe('applyManualResolution', () => {
  function conflictedPlan(): MergePlan {
    return buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 5.5 }),
      supplementals: [source(SUPPLEMENT_ID, { 'minerals.iron': 12 })],
    });
  }

  it('writes the chosen source value into rows as a manual row and clears the conflict', () => {
    const plan = conflictedPlan();

    const resolved = applyManualResolution(plan, 'minerals.iron', {
      sourceRecordId: SUPPLEMENT_ID,
    });

    expect(rowOf(resolved, 'minerals.iron')).toEqual({
      fieldPath: 'minerals.iron',
      value: 12,
      unit: 'mg',
      status: 'MANUAL',
      sourceRecordId: SUPPLEMENT_ID,
      sourceValue: 12,
      sourceUnit: 'mg',
    });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.primarySourceRecordId).toBe(PRIMARY_ID);
  });

  it('lets a human keep the primary value', () => {
    const resolved = applyManualResolution(conflictedPlan(), 'minerals.iron', {
      sourceRecordId: PRIMARY_ID,
    });

    expect(rowOf(resolved, 'minerals.iron')).toMatchObject({
      value: 5.5,
      status: 'MANUAL',
      sourceRecordId: PRIMARY_ID,
      sourceValue: 5.5,
    });
    expect(resolved.conflicts).toEqual([]);
  });

  it('does not mutate the plan it is given', () => {
    const plan = conflictedPlan();

    applyManualResolution(plan, 'minerals.iron', {
      sourceRecordId: SUPPLEMENT_ID,
    });

    expect(rowOf(plan, 'minerals.iron')?.value).toBeNull();
    expect(plan.conflicts).toHaveLength(1);
  });

  it('throws when the chosen source did not provide the field', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.iron': 5.5 }),
      supplementals: [
        source(SUPPLEMENT_ID, { 'minerals.iron': 12 }),
        source(UNUSED_SOURCE_ID, { 'minerals.calcium': 80 }),
      ],
    });

    expect(() =>
      applyManualResolution(plan, 'minerals.iron', {
        sourceRecordId: UNUSED_SOURCE_ID,
      }),
    ).toThrow(/did not provide/);
    expect(() =>
      applyManualResolution(plan, 'minerals.iron', {
        sourceRecordId: 'source-that-does-not-exist',
      }),
    ).toThrow(/did not provide/);
  });

  it('throws when the field has no unresolved conflict', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, { 'minerals.calcium': 100 }),
      supplementals: [],
    });

    expect(() =>
      applyManualResolution(plan, 'minerals.calcium', {
        sourceRecordId: PRIMARY_ID,
      }),
    ).toThrow(/No unresolved conflict/);
  });

  it('throws when the field is not in the nutrition catalog', () => {
    expect(() =>
      applyManualResolution(conflictedPlan(), 'manual.notACatalogField', {
        sourceRecordId: PRIMARY_ID,
      }),
    ).toThrow(/Unknown nutrition field/);
  });

  it('resolves only the chosen conflict and keeps catalog order stable', () => {
    const plan = buildMergePlan({
      primary: source(PRIMARY_ID, {
        'macros.moisture': 70,
        'minerals.iron': 5.5,
        'vitamins.vitaminA': 5000,
      }),
      supplementals: [
        source(SUPPLEMENT_ID, {
          'macros.crudeProtein': 18,
          'minerals.iron': 12,
          'vitamins.vitaminA': 6000,
        }),
      ],
    });

    expect(plan.rows.map((row) => row.fieldPath)).toEqual([
      'macros.moisture',
      'macros.crudeProtein',
      'minerals.iron',
      'vitamins.vitaminA',
    ]);
    expect(plan.conflicts.map((conflict) => conflict.fieldPath)).toEqual([
      'minerals.iron',
      'vitamins.vitaminA',
    ]);

    const resolved = applyManualResolution(plan, 'minerals.iron', {
      sourceRecordId: SUPPLEMENT_ID,
    });

    expect(resolved.rows.map((row) => row.fieldPath)).toEqual([
      'macros.moisture',
      'macros.crudeProtein',
      'minerals.iron',
      'vitamins.vitaminA',
    ]);
    expect(resolved.conflicts.map((conflict) => conflict.fieldPath)).toEqual([
      'vitamins.vitaminA',
    ]);
    expect(rowOf(resolved, 'vitamins.vitaminA')?.value).toBeNull();
    expect(resolved.missingFields).toEqual(plan.missingFields);
    expect(resolved.missingFields).not.toContain('minerals.iron');
  });

  it('inserts a resolved row in catalog order when the plan had no row for it', () => {
    const plan: MergePlan = {
      primarySourceRecordId: PRIMARY_ID,
      rows: [
        {
          fieldPath: 'minerals.iron',
          value: 5,
          unit: 'mg',
          status: 'DIRECT',
          sourceRecordId: PRIMARY_ID,
          sourceValue: 5,
          sourceUnit: 'mg',
        },
      ],
      conflicts: [
        {
          fieldPath: 'macros.moisture',
          candidates: [
            {
              sourceRecordId: PRIMARY_ID,
              value: 70,
              unit: 'g',
              sourceValue: 70000,
              sourceUnit: 'mg',
            },
            {
              sourceRecordId: SUPPLEMENT_ID,
              value: 68,
              unit: 'g',
              sourceValue: 68000,
              sourceUnit: 'mg',
            },
          ],
        },
      ],
      missingFields: ['macros.energyKcal'],
    };

    const resolved = applyManualResolution(plan, 'macros.moisture', {
      sourceRecordId: SUPPLEMENT_ID,
    });

    expect(resolved.rows.map((row) => row.fieldPath)).toEqual([
      'macros.moisture',
      'minerals.iron',
    ]);
    expect(rowOf(resolved, 'macros.moisture')).toEqual({
      fieldPath: 'macros.moisture',
      value: 68,
      unit: 'g',
      status: 'MANUAL',
      sourceRecordId: SUPPLEMENT_ID,
      sourceValue: 68000,
      sourceUnit: 'mg',
    });
    expect(resolved.conflicts).toEqual([]);
    expect(resolved.missingFields).toEqual(['macros.energyKcal']);
  });
});
