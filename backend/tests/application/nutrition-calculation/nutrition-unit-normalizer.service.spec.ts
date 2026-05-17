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

  it('converts kcal to MJ', () => {
    expect(service.convertUnit(1000, 'kcal', 'MJ')).toEqual({
      status: 'RESOLVED',
      value: 4.184,
      unit: 'MJ',
      reasons: [],
    });
  });

  it('normalizes nutrient totals to dry matter and energy bases', () => {
    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_100G_DRY_MATTER',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 1200,
      }),
    ).toEqual({
      status: 'RESOLVED',
      value: 0.5,
      unit: 'g',
      basis: 'PER_100G_DRY_MATTER',
      reasons: [],
    });

    expect(
      service.toBasis({
        nutrientTotal: 2,
        nutrientUnit: 'g',
        basis: 'PER_1000_KCAL_ME',
        totalWeightG: 1000,
        dryMatterG: 400,
        totalEnergyKcal: 1200,
      }),
    ).toEqual({
      status: 'RESOLVED',
      value: 1.6666666666666667,
      unit: 'g',
      basis: 'PER_1000_KCAL_ME',
      reasons: [],
    });
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
});
