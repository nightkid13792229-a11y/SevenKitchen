import type {
  MergePlan,
  MergeRow,
  NutritionEvidenceEntry,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import {
  buildEvidenceLedger,
  type EvidenceLedgerSource,
} from '../../../src/domain/ingredient-creation/evidence-ledger';

const PRIMARY_SOURCE_ID = 'source-primary';

function row(overrides: Partial<MergeRow> = {}): MergeRow {
  return {
    fieldPath: 'minerals.iron',
    value: 4.5,
    unit: 'mg',
    status: 'DIRECT',
    sourceRecordId: PRIMARY_SOURCE_ID,
    sourceValue: 4.5,
    sourceUnit: 'mg',
    ...overrides,
  };
}

function plan(rows: MergeRow[], missingFields: string[] = []): MergePlan {
  return {
    primarySourceRecordId: PRIMARY_SOURCE_ID,
    rows,
    conflicts: [],
    missingFields,
  };
}

function source(
  normalizedNutrition: unknown,
  sourceRecordId = PRIMARY_SOURCE_ID,
): EvidenceLedgerSource {
  return { sourceRecordId, normalizedNutrition };
}

function entryOf(
  entries: NutritionEvidenceEntry[],
  fieldPath: string,
): NutritionEvidenceEntry | undefined {
  return entries.find((entry) => entry.fieldPath === fieldPath);
}

describe('buildEvidenceLedger', () => {
  it('restores the original value and formula from meta.fieldSources', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.selenium',
        value: 550,
        unit: 'µg',
        sourceValue: 0.55,
        sourceUnit: 'mg',
      }),
    ]);
    const sources = [
      source({
        meta: {
          fieldSources: {
            'minerals.selenium': {
              originalValue: 0.55,
              originalUnit: 'mg',
              canonicalValue: 550,
              canonicalUnit: 'µg',
              basisType: 'PER_100_G',
            },
          },
          sourceForms: {
            'minerals.selenium': {
              originalValue: 999,
              originalUnit: 'mg',
              canonicalValue: 999,
              canonicalUnit: 'mg',
            },
          },
        },
      }),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    expect(result.entries).toEqual([
      {
        fieldPath: 'minerals.selenium',
        finalValue: 550,
        unit: 'µg',
        status: 'CONVERTED',
        sourceRecordId: PRIMARY_SOURCE_ID,
        sourceValue: 0.55,
        sourceUnit: 'mg',
        formula: '0.55 mg → 550 µg',
        confirmedBy: null,
        confirmedAt: null,
      },
    ]);
    expect(result.missingProvenance).toEqual([]);
  });

  it('falls back to meta.sourceForms when fieldSources is missing', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.selenium',
        value: 550,
        unit: 'µg',
        sourceValue: 550,
        sourceUnit: 'µg',
      }),
    ]);
    const sources = [
      source({
        meta: {
          sourceForms: {
            'minerals.selenium': {
              originalValue: 0.55,
              originalUnit: 'mg',
              canonicalValue: 550,
              canonicalUnit: 'µg',
            },
          },
        },
      }),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    expect(entryOf(result.entries, 'minerals.selenium')).toMatchObject({
      status: 'CONVERTED',
      sourceValue: 0.55,
      sourceUnit: 'mg',
      formula: '0.55 mg → 550 µg',
    });
    expect(result.missingProvenance).toEqual([]);
  });

  it('marks CONVERTED when the canonical value differs even if the units match', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.iron',
        value: 550,
        unit: 'mg',
        sourceValue: 550,
        sourceUnit: 'mg',
      }),
    ]);
    const sources = [
      source({
        meta: {
          fieldSources: {
            'minerals.iron': {
              originalValue: 0.55,
              originalUnit: 'mg',
              canonicalValue: 550,
              canonicalUnit: 'mg',
            },
          },
        },
      }),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    expect(entryOf(result.entries, 'minerals.iron')).toMatchObject({
      status: 'CONVERTED',
      sourceValue: 0.55,
      sourceUnit: 'mg',
      formula: '0.55 mg → 550 mg',
    });
  });

  it('keeps the row status when the source form records no conversion', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'macros.crudeProtein',
        value: 18,
        unit: 'g',
        status: 'FILLED',
        sourceRecordId: 'source-supplement',
        sourceValue: 18,
        sourceUnit: 'g',
      }),
    ]);
    const sources = [
      source(
        {
          meta: {
            fieldSources: {
              'macros.crudeProtein': {
                originalValue: 18,
                originalUnit: 'g',
                canonicalValue: 18,
                canonicalUnit: 'g',
              },
            },
          },
        },
        'source-supplement',
      ),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    expect(entryOf(result.entries, 'macros.crudeProtein')).toMatchObject({
      status: 'FILLED',
      sourceRecordId: 'source-supplement',
      sourceValue: 18,
      sourceUnit: 'g',
      formula: null,
    });
    expect(result.missingProvenance).toEqual([]);
  });

  it('keeps MANUAL status for manually resolved rows without conversion info', () => {
    const mergePlan = plan([
      row({
        status: 'MANUAL' as unknown as MergeRow['status'],
        sourceValue: 4.5,
        sourceUnit: 'mg',
      }),
    ]);

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: {} })],
    });

    expect(result.entries[0]).toMatchObject({
      fieldPath: 'minerals.iron',
      status: 'MANUAL',
      sourceValue: 4.5,
      sourceUnit: 'mg',
      formula: null,
    });
  });

  it('falls back to the row sourceValue/sourceUnit when the profile has no provenance', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.iron',
        value: 4.5,
        sourceValue: 4.5,
        sourceUnit: 'mg',
      }),
    ]);

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: { sampleState: 'RAW' } })],
    });

    expect(entryOf(result.entries, 'minerals.iron')).toMatchObject({
      status: 'DIRECT',
      sourceRecordId: PRIMARY_SOURCE_ID,
      sourceValue: 4.5,
      sourceUnit: 'mg',
      formula: null,
    });
    expect(result.missingProvenance).toEqual([]);
  });

  it('emits evidence and records missing provenance when no source info is available', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.iron',
        value: 4.5,
        sourceValue: null,
        sourceUnit: null,
      }),
    ]);

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: {} })],
    });

    expect(result.entries).toEqual([
      {
        fieldPath: 'minerals.iron',
        finalValue: 4.5,
        unit: 'mg',
        status: 'DIRECT',
        sourceRecordId: PRIMARY_SOURCE_ID,
        sourceValue: null,
        sourceUnit: null,
        formula: null,
        confirmedBy: null,
        confirmedAt: null,
      },
    ]);
    expect(result.missingProvenance).toEqual(['minerals.iron']);
  });

  it('parses numeric string original values', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.selenium',
        value: 550,
        unit: 'µg',
        sourceValue: 550,
        sourceUnit: 'µg',
      }),
    ]);
    const sources = [
      source({
        meta: {
          fieldSources: {
            'minerals.selenium': {
              originalValue: '0.55',
              originalUnit: 'mg',
              canonicalValue: 550,
              canonicalUnit: 'µg',
            },
          },
        },
      }),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    expect(entryOf(result.entries, 'minerals.selenium')).toMatchObject({
      status: 'CONVERTED',
      sourceValue: 0.55,
      sourceUnit: 'mg',
      formula: '0.55 mg → 550 µg',
    });
    expect(result.missingProvenance).toEqual([]);
  });

  it('treats an unparseable original value as missing and never writes 0', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.selenium',
        value: 550,
        unit: 'µg',
        sourceValue: 550,
        sourceUnit: 'µg',
      }),
    ]);
    const sources = [
      source({
        meta: {
          fieldSources: {
            'minerals.selenium': {
              originalValue: 'n/a',
              originalUnit: 'mg',
              canonicalValue: 550,
              canonicalUnit: 'µg',
            },
          },
        },
      }),
    ];

    const result = buildEvidenceLedger({ plan: mergePlan, sources });

    const entry = entryOf(result.entries, 'minerals.selenium');
    expect(entry).toMatchObject({
      finalValue: 550,
      status: 'DIRECT',
      sourceValue: null,
      sourceUnit: 'mg',
      formula: null,
    });
    expect(entry?.sourceValue).not.toBe(0);
    expect(result.missingProvenance).toEqual(['minerals.selenium']);
  });

  it('skips conflict rows and rows without a final value', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.iron',
        value: null,
        status: 'CONFLICT',
        sourceRecordId: null,
        sourceValue: null,
        sourceUnit: null,
      }),
      row({
        fieldPath: 'minerals.calcium',
        value: null,
        sourceValue: null,
        sourceUnit: null,
      }),
      row({
        fieldPath: 'minerals.zinc',
        value: 1.2,
        sourceValue: 1.2,
        sourceUnit: 'mg',
      }),
    ]);

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: {} })],
    });

    expect(result.entries.map((entry) => entry.fieldPath)).toEqual([
      'minerals.zinc',
    ]);
    expect(result.missingProvenance).toEqual([]);
  });

  it('does not report plan.missingFields as missing provenance', () => {
    const mergePlan = plan(
      [
        row({
          fieldPath: 'minerals.iron',
          value: 4.5,
          sourceValue: 4.5,
          sourceUnit: 'mg',
        }),
      ],
      ['minerals.selenium'],
    );

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: {} })],
    });

    expect(result.entries.map((entry) => entry.fieldPath)).toEqual([
      'minerals.iron',
    ]);
    expect(result.missingProvenance).toEqual([]);
  });

  it('keeps rows in plan order and orders deduped missing provenance by field catalog', () => {
    const mergePlan = plan([
      row({
        fieldPath: 'minerals.iron',
        value: 4.5,
        sourceValue: null,
        sourceUnit: null,
      }),
      row({
        fieldPath: 'macros.energyKcal',
        value: 120,
        unit: 'kcal',
        sourceValue: null,
        sourceUnit: null,
      }),
      row({
        fieldPath: 'minerals.iron',
        value: 4.5,
        sourceValue: null,
        sourceUnit: null,
      }),
    ]);

    const result = buildEvidenceLedger({
      plan: mergePlan,
      sources: [source({ meta: {} })],
    });

    expect(result.entries.map((entry) => entry.fieldPath)).toEqual([
      'minerals.iron',
      'macros.energyKcal',
      'minerals.iron',
    ]);
    expect(result.missingProvenance).toEqual([
      'macros.energyKcal',
      'minerals.iron',
    ]);
  });
});
