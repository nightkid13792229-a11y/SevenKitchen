import { resolveSupplementConcentration } from '../../../src/domain/ingredient/supplement-concentration-resolver';

describe('supplement concentration resolver', () => {
  it('returns per gram concentration for PER_1_G profiles', () => {
    expect(
      resolveSupplementConcentration(
        {
          meta: { rawBasisType: 'PER_1_G' },
          vitamins: { vitaminE: 200 },
        } as any,
        'vitamins.vitaminE',
      ),
    ).toMatchObject({
      concentrationPerUnit: 200,
      doseUnit: 'g',
      concentrationPerG: 200,
    });
  });

  it('converts PER_100_G profiles to per gram concentration', () => {
    expect(
      resolveSupplementConcentration(
        {
          meta: { rawBasisType: 'PER_100_G' },
          vitamins: { vitaminE: 2000 },
        } as any,
        'vitamins.vitaminE',
      ),
    ).toMatchObject({
      concentrationPerUnit: 20,
      doseUnit: 'g',
      concentrationPerG: 20,
    });
  });

  it('uses serving weight to expose per serving and per gram concentration', () => {
    expect(
      resolveSupplementConcentration(
        {
          meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.5 },
          vitamins: { vitaminE: 100 },
        } as any,
        'vitamins.vitaminE',
      ),
    ).toMatchObject({
      concentrationPerUnit: 100,
      doseUnit: 'serving',
      servingWeightG: 0.5,
      concentrationPerG: 200,
    });
  });

  it('returns undefined for unsupported explicit basis types', () => {
    expect(
      resolveSupplementConcentration(
        {
          meta: { rawBasisType: 'PER_TABLESPOON' },
          vitamins: { vitaminE: 100 },
        } as any,
        'vitamins.vitaminE',
      ),
    ).toBeUndefined();
  });
});
