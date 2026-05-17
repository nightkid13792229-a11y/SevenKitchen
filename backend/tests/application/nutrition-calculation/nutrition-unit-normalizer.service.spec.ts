import { NutritionUnitNormalizerService } from '../../../src/application/nutrition-calculation/nutrition-unit-normalizer.service';

describe('NutritionUnitNormalizerService', () => {
  const service = new NutritionUnitNormalizerService();

  it('converts mass units between g, mg, and ug', () => {
    expect(service.convertUnit(1000, 'mg', 'g')).toEqual({
      status: 'RESOLVED',
      value: 1,
      unit: 'g',
      reasons: [],
    });
    expect(service.convertUnit(250, 'ug', 'mg')).toEqual({
      status: 'RESOLVED',
      value: 0.25,
      unit: 'mg',
      reasons: [],
    });
  });

  it('normalizes mass unit aliases', () => {
    expect(service.convertUnit(250, 'μg', 'mg')).toMatchObject({
      status: 'RESOLVED',
      value: 0.25,
      unit: 'mg',
      reasons: [],
    });
    expect(service.convertUnit(250, 'mcg', 'ug')).toEqual({
      status: 'RESOLVED',
      value: 250,
      unit: 'ug',
      reasons: [],
    });
  });

  it('converts energy units between kcal and MJ', () => {
    const kcalToMj = service.convertUnit(1000, 'kcal', 'MJ');

    expect(kcalToMj).toMatchObject({
      status: 'RESOLVED',
      unit: 'MJ',
      reasons: [],
    });
    expect(kcalToMj.value).toBeCloseTo(4.184);

    const mjToKcal = service.convertUnit(4.184, 'MJ', 'kcal');

    expect(mjToKcal).toMatchObject({
      status: 'RESOLVED',
      unit: 'kcal',
      reasons: [],
    });
    expect(mjToKcal.value).toBeCloseTo(1000);
  });

  it('normalizes energy unit aliases', () => {
    expect(service.convertUnit(1, 'kilocalorie', 'kcal')).toEqual({
      status: 'RESOLVED',
      value: 1,
      unit: 'kcal',
      reasons: [],
    });

    const result = service.convertUnit(1000, 'kilocalories', 'MJ');

    expect(result).toMatchObject({
      status: 'RESOLVED',
      unit: 'MJ',
      reasons: [],
    });
    expect(result.value).toBeCloseTo(4.184);
  });

  it('returns the original value when normalized units already match', () => {
    expect(service.convertUnit(12, 'mcg', 'ug')).toEqual({
      status: 'RESOLVED',
      value: 12,
      unit: 'ug',
      reasons: [],
    });
  });

  it('returns UNSUPPORTED_UNIT for unsupported conversions', () => {
    expect(service.convertUnit(12, 'g', 'kcal')).toEqual({
      status: 'UNSUPPORTED_UNIT',
      value: null,
      unit: 'kcal',
      reasons: ['Unsupported conversion from g to kcal'],
    });
  });

  it('normalizes nutrient totals to dry matter and energy bases', () => {
    const asFedResult = service.toBasis({
      nutrientTotal: 2,
      nutrientUnit: 'g',
      basis: 'PER_100G_AS_FED',
      totalWeightG: 1000,
      dryMatterG: 400,
      totalEnergyKcal: 1200,
    });

    expect(asFedResult).toMatchObject({
      status: 'RESOLVED',
      unit: 'g',
      basis: 'PER_100G_AS_FED',
      reasons: [],
    });
    expect(asFedResult.value).toBeCloseTo(0.2);

    const dryMatterResult = service.toBasis({
      nutrientTotal: 2,
      nutrientUnit: 'g',
      basis: 'PER_100G_DRY_MATTER',
      totalWeightG: 1000,
      dryMatterG: 400,
      totalEnergyKcal: 1200,
    });

    expect(dryMatterResult).toMatchObject({
      status: 'RESOLVED',
      unit: 'g',
      basis: 'PER_100G_DRY_MATTER',
      reasons: [],
    });
    expect(dryMatterResult.value).toBeCloseTo(0.5);

    const per1000KcalResult = service.toBasis({
      nutrientTotal: 2,
      nutrientUnit: 'g',
      basis: 'PER_1000_KCAL_ME',
      totalWeightG: 1000,
      dryMatterG: 400,
      totalEnergyKcal: 1200,
    });

    expect(per1000KcalResult).toMatchObject({
      status: 'RESOLVED',
      unit: 'g',
      basis: 'PER_1000_KCAL_ME',
      reasons: [],
    });
    expect(per1000KcalResult.value).toBeCloseTo(1.6666666666666667);

    const perMjResult = service.toBasis({
      nutrientTotal: 2,
      nutrientUnit: 'g',
      basis: 'PER_MJ_ME',
      totalWeightG: 1000,
      dryMatterG: 400,
      totalEnergyKcal: 1200,
    });

    expect(perMjResult).toMatchObject({
      status: 'RESOLVED',
      unit: 'g',
      basis: 'PER_MJ_ME',
      reasons: [],
    });
    expect(perMjResult.value).toBeCloseTo(0.398406374501992);
  });

  it('returns MISSING_BASIS when dry matter or energy is absent', () => {
    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_DRY_MATTER',
        totalWeightG: 1000,
        dryMatterG: 0,
        totalEnergyKcal: 1200,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['dryMatterG must be greater than 0'],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_1000_KCAL_ME',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 0,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['totalEnergyKcal must be greater than 0'],
    });
  });

  it('returns MISSING_BASIS when denominators are missing or not finite', () => {
    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_AS_FED',
        totalWeightG: undefined as unknown as number,
        dryMatterG: 400,
        totalEnergyKcal: 1200,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['totalWeightG must be greater than 0'],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_DRY_MATTER',
        totalWeightG: 1000,
        dryMatterG: Number.NaN,
        totalEnergyKcal: 1200,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['dryMatterG must be greater than 0'],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_MJ_ME',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: undefined as unknown as number,
      }),
    ).toMatchObject({
      status: 'MISSING_BASIS',
      value: null,
      reasons: ['totalEnergyKcal must be greater than 0'],
    });
  });
});
