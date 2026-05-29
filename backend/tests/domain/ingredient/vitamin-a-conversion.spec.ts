import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
  convertVitaminAToIu,
} from '../../../src/domain/ingredient/vitamin-a-conversion';

describe('vitamin A FEDIAF 2025 dog conversion', () => {
  it('combines retinol and dog beta-carotene activity using FEDIAF factors', () => {
    const calculation = calculateVitaminAActivityIu({
      retinolUg: 30,
      betaCaroteneUg: 449,
    });

    expect(calculation?.valueIu).toBeCloseTo(474.017, 6);
    expect(calculation).toMatchObject({
      status: 'COMPONENT_ACTIVITY',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
      sourceCompound: 'retinol + beta-carotene',
      components: {
        retinolUg: 30,
        retinolIu: 100,
        betaCaroteneUg: 449,
        betaCaroteneIu: 374.017,
      },
    });
  });

  it('converts known vitamin A chemical forms to IU using FEDIAF factors', () => {
    expect(convertVitaminAToIu(344, 'µg', 'VITAMIN_A_ACETATE')).toBeCloseTo(
      1000,
      6,
    );
    expect(convertVitaminAToIu(0.55, 'mg', 'VITAMIN_A_PALMITATE')).toBeCloseTo(
      1000,
      6,
    );
  });

  it('keeps source-declared IU as an explicit fallback when components are absent', () => {
    const calculation = calculateVitaminAActivityIu({
      amount: 7500,
      unit: 'IU',
      form: 'SOURCE_DECLARED_IU',
    });

    expect(calculation).toMatchObject({
      valueIu: 7500,
      status: 'SOURCE_DECLARED_IU_FALLBACK',
      vitaminAForm: 'SOURCE_DECLARED_IU',
      sourceCompound: 'source-declared vitamin A activity',
    });
  });

  it('marks retinol-equivalent values as fallback evidence when components are absent', () => {
    const calculation = calculateVitaminAActivityIu({
      amount: 64,
      unit: 'µg',
      form: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
    });

    expect(calculation?.valueIu).toBeCloseTo(213.333333, 6);
    expect(buildVitaminASourceFormMetadata(calculation!)).toMatchObject({
      vitaminAForm: 'SOURCE_RETINOL_ACTIVITY_EQUIVALENTS',
      conversionStatus: 'SOURCE_EQUIVALENT_FALLBACK',
      conversionFactorSource: 'FEDIAF_2025_TABLE_VII_14',
      retinolUgPerIu: 0.3,
    });
  });
});
