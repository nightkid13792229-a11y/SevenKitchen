import type {
  FinalCheckResult,
  NutritionEvidenceEntry,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import {
  runFinalCheck,
  type FinalCheckInput,
} from '../../../src/domain/ingredient-creation/final-check';

function entry(
  overrides: Partial<NutritionEvidenceEntry> = {},
): NutritionEvidenceEntry {
  return {
    fieldPath: 'minerals.calcium',
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

const CLEAN_BASIS: FinalCheckInput['basis'] = {
  profileBasis: 'PER_100_G',
  sourceBasis: 'PER_100_G',
  servingGrams: null,
};

function input(overrides: Partial<FinalCheckInput> = {}): FinalCheckInput {
  return {
    entries: [entry()],
    basis: { ...CLEAN_BASIS },
    macroSumG: 30,
    energyKcal: 350,
    energyFromMacrosKcal: 350,
    coverage: { required: ['RAW'], present: ['RAW'] },
    ...overrides,
  };
}

function codes(result: FinalCheckResult) {
  return {
    blocking: result.blocking.map((item) => item.code),
    exceptionable: result.exceptionable.map((item) => item.code),
    warnings: result.warnings.map((item) => item.code),
  };
}

describe('runFinalCheck', () => {
  it('returns three empty buckets for clean data', () => {
    expect(runFinalCheck(input())).toEqual({
      blocking: [],
      exceptionable: [],
      warnings: [],
    });
  });

  it('surfaces unit-guard findings as blocking', () => {
    const result = runFinalCheck(
      input({
        entries: [
          entry({
            fieldPath: 'minerals.selenium',
            unit: 'mg',
            sourceUnit: 'mg',
          }),
        ],
      }),
    );

    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({
      code: 'UNIT_MISMATCH',
      fieldPath: 'minerals.selenium',
    });
  });

  it('blocks a per-serving source when the profile is per 100g and the serving weight is missing', () => {
    const result = runFinalCheck(
      input({
        basis: {
          profileBasis: 'PER_100_G',
          sourceBasis: 'PER_SERVING',
          servingGrams: null,
        },
      }),
    );

    expect(codes(result).blocking).toEqual(['BASIS_NOT_CONVERTIBLE']);
  });

  it('allows a per-serving source when the serving weight is known', () => {
    const result = runFinalCheck(
      input({
        basis: {
          profileBasis: 'PER_100_G',
          sourceBasis: 'PER_SERVING',
          servingGrams: 45,
        },
      }),
    );

    expect(result.blocking).toEqual([]);
  });

  it('treats a non-positive serving weight as unusable', () => {
    const result = runFinalCheck(
      input({
        basis: {
          profileBasis: 'PER_100_G',
          sourceBasis: 'PER_SERVING',
          servingGrams: 0,
        },
      }),
    );

    expect(codes(result).blocking).toEqual(['BASIS_NOT_CONVERTIBLE']);
  });

  it('marks a macro sum over 100 as exceptionable', () => {
    const result = runFinalCheck(input({ macroSumG: 103.2 }));

    expect(result.exceptionable).toHaveLength(1);
    expect(result.exceptionable[0].code).toBe('MACRO_SUM_OVER_100');

    // USDA 的宏量分别测定、分别四舍五入，合计 101.07~101.23 属正常，3% 容差内不报
    const tolerable = runFinalCheck(input({ macroSumG: 101.23 }));
    expect(
      tolerable.exceptionable.some((item) => item.code === 'MACRO_SUM_OVER_100'),
    ).toBe(false);
  });

  it('does not flag a macro sum of exactly 100', () => {
    expect(
      codes(runFinalCheck(input({ macroSumG: 100 }))).exceptionable,
    ).toEqual([]);
  });

  it('marks a missing required raw profile as exceptionable', () => {
    const result = runFinalCheck(
      input({ coverage: { required: ['RAW'], present: [] } }),
    );

    expect(result.exceptionable).toHaveLength(1);
    expect(result.exceptionable[0].code).toBe('REQUIRED_STATE_MISSING');
    expect(result.exceptionable[0].message).toContain('RAW');
  });

  it('marks every missing required state', () => {
    const result = runFinalCheck(
      input({ coverage: { required: ['RAW', 'COOKED'], present: [] } }),
    );

    expect(codes(result).exceptionable).toEqual([
      'REQUIRED_STATE_MISSING',
      'REQUIRED_STATE_MISSING',
    ]);
  });

  it('warns when the 4/9/4 energy cross-check deviates by more than 10%', () => {
    const result = runFinalCheck(
      input({ energyKcal: 200, energyFromMacrosKcal: 176 }),
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('ENERGY_CROSS_CHECK_DEVIATION');
  });

  it('does not warn at exactly 10% deviation', () => {
    expect(
      codes(
        runFinalCheck(input({ energyKcal: 200, energyFromMacrosKcal: 180 })),
      ).warnings,
    ).toEqual([]);
  });

  it('does not warn at 5% deviation', () => {
    expect(
      codes(
        runFinalCheck(input({ energyKcal: 200, energyFromMacrosKcal: 190 })),
      ).warnings,
    ).toEqual([]);
  });

  it('does not warn when declared energy is null', () => {
    const result = runFinalCheck(
      input({ energyKcal: null, energyFromMacrosKcal: 176 }),
    );

    expect(result.warnings).toEqual([]);
  });

  it('does not warn when declared energy is zero', () => {
    const result = runFinalCheck(
      input({ energyKcal: 0, energyFromMacrosKcal: 176 }),
    );

    expect(result.warnings).toEqual([]);
  });

  it('does not warn when macro-derived energy is null', () => {
    const result = runFinalCheck(
      input({ energyKcal: 200, energyFromMacrosKcal: null }),
    );

    expect(result.warnings).toEqual([]);
  });

  it('warns once per magnitude outlier field, in catalog order', () => {
    const result = runFinalCheck(
      input({
        magnitudeOutlierFields: ['minerals.iron', 'minerals.calcium'],
      }),
    );

    expect(result.warnings.map((item) => [item.code, item.fieldPath])).toEqual([
      ['MAGNITUDE_OUTLIER', 'minerals.calcium'],
      ['MAGNITUDE_OUTLIER', 'minerals.iron'],
    ]);
  });

  it('does not duplicate a repeated outlier field', () => {
    const result = runFinalCheck(
      input({ magnitudeOutlierFields: ['minerals.iron', 'minerals.iron'] }),
    );

    expect(result.warnings).toHaveLength(1);
  });

  it('has no outlier warnings when none are supplied', () => {
    expect(codes(runFinalCheck(input())).warnings).toEqual([]);
  });

  it('keeps the three buckets and their ordering stable', () => {
    const result = runFinalCheck(
      input({
        entries: [
          entry({ fieldPath: 'minerals.selenium', unit: 'mg/kg' }),
          entry({ fieldPath: 'minerals.calcium', unit: 'μg' }),
        ],
        basis: {
          profileBasis: 'PER_100_G',
          sourceBasis: 'PER_SERVING',
          servingGrams: null,
        },
        macroSumG: 103.2,
        energyKcal: 200,
        energyFromMacrosKcal: 176,
        coverage: { required: ['RAW', 'COOKED'], present: [] },
        magnitudeOutlierFields: ['minerals.iron', 'minerals.calcium'],
      }),
    );

    expect(codes(result)).toEqual({
      blocking: ['UNIT_MISMATCH', 'UNIT_NOT_ALLOWED', 'BASIS_NOT_CONVERTIBLE'],
      exceptionable: [
        'MACRO_SUM_OVER_100',
        'REQUIRED_STATE_MISSING',
        'REQUIRED_STATE_MISSING',
      ],
      warnings: [
        'ENERGY_CROSS_CHECK_DEVIATION',
        'MAGNITUDE_OUTLIER',
        'MAGNITUDE_OUTLIER',
      ],
    });
    expect(result.blocking.map((item) => item.fieldPath)).toEqual([
      'minerals.calcium',
      'minerals.selenium',
      undefined,
    ]);
    expect(result.warnings.map((item) => item.fieldPath)).toEqual([
      undefined,
      'minerals.calcium',
      'minerals.iron',
    ]);
  });
});
