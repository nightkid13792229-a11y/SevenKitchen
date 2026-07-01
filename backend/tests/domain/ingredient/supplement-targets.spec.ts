import {
  calculateSupplementDose,
  validateSupplementTargets,
} from '../../../src/domain/ingredient/supplement-targets';

describe('supplement targets v2 dosing', () => {
  const fishOilProfile = {
    meta: { rawBasisType: 'PER_SERVING' },
    macros: {},
    minerals: {},
    vitamins: {},
    fattyAcids: { epa: 180, dha: 120 },
    aminoAcids: {},
    customItems: [],
  } as any;

  it('calculates single-target supplements from nutrition_profile field path', () => {
    const result = calculateSupplementDose({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
      targets: [
        {
          fieldPath: 'minerals.iodine',
          label: '碘',
          targetValuePerKg: 660,
          unit: 'μg',
        },
      ],
      basisWeightG: 1000,
      lossRate: 1,
    });

    expect(result.amount).toBeCloseTo(4.4, 6);
    expect(result.unit).toBe('serving');
    expect(result.limitingTarget.fieldPath).toBe('minerals.iodine');
  });

  it('converts per-100g supplement profiles to per-gram concentration', () => {
    const result = calculateSupplementDose({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_100_G' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 2000 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
      targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU',
        },
      ],
      basisWeightG: 1000,
      lossRate: 1,
    });

    expect(result.amount).toBeCloseTo(50, 6);
    expect(result.unit).toBe('g');
    expect(result.limitingTarget.concentration).toBe(20);
  });

  it('keeps per-1g supplement profiles as per-gram concentration', () => {
    const result = calculateSupplementDose({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_1_G' },
        macros: {},
        minerals: {},
        vitamins: { vitaminE: 200 },
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
      targets: [
        {
          fieldPath: 'vitamins.vitaminE',
          label: '维生素 E',
          targetValuePerKg: 1000,
          unit: 'IU',
        },
      ],
      basisWeightG: 1000,
      lossRate: 1,
    });

    expect(result.amount).toBeCloseTo(5, 6);
    expect(result.unit).toBe('g');
    expect(result.limitingTarget.concentration).toBe(200);
  });

  it('uses the maximum amount required across multiple targets', () => {
    const result = calculateSupplementDose({
      nutritionProfile: fishOilProfile,
      targets: [
        {
          fieldPath: 'fattyAcids.epa',
          label: 'EPA',
          targetValuePerKg: 360,
          unit: 'mg',
        },
        {
          fieldPath: 'fattyAcids.dha',
          label: 'DHA',
          targetValuePerKg: 360,
          unit: 'mg',
        },
      ],
      basisWeightG: 1000,
      displayUnit: '粒',
      lossRate: 1,
    });

    expect(result.targetBreakdown).toEqual([
      expect.objectContaining({
        fieldPath: 'fattyAcids.epa',
        requiredAmount: 2,
      }),
      expect.objectContaining({
        fieldPath: 'fattyAcids.dha',
        requiredAmount: 3,
      }),
    ]);
    expect(result.amount).toBe(3);
    expect(result.unit).toBe('粒');
    expect(result.limitingTarget.fieldPath).toBe('fattyAcids.dha');
  });

  it('applies loss rate only when requested by caller', () => {
    const result = calculateSupplementDose({
      nutritionProfile: fishOilProfile,
      targets: [
        {
          fieldPath: 'fattyAcids.epa',
          label: 'EPA',
          targetValuePerKg: 360,
          unit: 'mg',
        },
      ],
      basisWeightG: 1000,
      displayUnit: '粒',
      lossRate: 1.05,
    });

    expect(result.amount).toBeCloseTo(2.1, 6);
  });

  it('converts taurine gram concentration to milligram supplement targets', () => {
    const result = calculateSupplementDose({
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: {},
        fattyAcids: {},
        aminoAcids: { taurine: 0.5 },
        customItems: [],
      } as any,
      targets: [
        {
          fieldPath: 'aminoAcids.taurine',
          label: '牛磺酸',
          targetValuePerKg: 370,
          unit: 'mg',
        },
      ],
      basisWeightG: 1000,
      displayUnit: '粒',
      lossRate: 1,
    });

    expect(result.amount).toBeCloseTo(0.74, 6);
    expect(result.unit).toBe('粒');
    expect(result.limitingTarget.concentration).toBe(500);
    expect(result.limitingTarget.concentrationUnit).toBe('mg');
    expect(result.limitingTarget.totalNutrientNeeded).toBe(370);
  });

  it('rejects EPA+DHA as a field path', () => {
    expect(() =>
      validateSupplementTargets([
        {
          fieldPath: 'EPA+DHA',
          label: 'EPA+DHA',
          targetValuePerKg: 600,
          unit: 'mg',
        },
      ]),
    ).toThrow('Unsupported supplement target fieldPath: EPA+DHA');
  });
});
