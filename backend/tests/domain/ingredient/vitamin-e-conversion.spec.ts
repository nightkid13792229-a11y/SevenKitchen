import {
  calculateVitaminEActivityIu,
  convertVitaminEToIu,
  getVitaminEConversion,
} from '../../../src/domain/ingredient/vitamin-e-conversion';

describe('vitamin E conversion', () => {
  it('uses FEDIAF source-form activity factors for alpha-tocopherol forms', () => {
    expect(convertVitaminEToIu(1, 'mg', 'D_ALPHA_TOCOPHEROL')).toBeCloseTo(
      1.49,
      6,
    );
    expect(
      convertVitaminEToIu(1, 'mg', 'D_ALPHA_TOCOPHERYL_ACETATE'),
    ).toBeCloseTo(1.36, 6);
    expect(convertVitaminEToIu(1, 'mg', 'DL_ALPHA_TOCOPHEROL')).toBeCloseTo(
      1.1,
      6,
    );
    expect(
      convertVitaminEToIu(1, 'mg', 'DL_ALPHA_TOCOPHERYL_ACETATE'),
    ).toBeCloseTo(1, 6);
  });

  it('keeps label IU values direct and refuses mg conversion without a known source form', () => {
    expect(convertVitaminEToIu(400, 'IU', 'UNKNOWN')).toBe(400);
    expect(convertVitaminEToIu(100, 'mg', 'UNKNOWN')).toBeNull();
  });

  it('documents conversion metadata for source evidence', () => {
    expect(getVitaminEConversion('D_ALPHA_TOCOPHEROL')).toMatchObject({
      form: 'D_ALPHA_TOCOPHEROL',
      sourceCompound: 'd-α-tocopherol',
      iuPerMg: 1.49,
      source: 'FEDIAF_2025',
    });
  });

  it('sums known tocopherol component activity with FEDIAF factors', () => {
    const result = calculateVitaminEActivityIu({
      alphaTocopherolMg: 1,
      betaTocopherolMg: 2,
      gammaTocopherolMg: 3,
      deltaTocopherolMg: 4,
    });

    expect(result).toMatchObject({
      status: 'COMPONENT_ACTIVITY',
      valueIu: 3.18,
      vitaminEForm: 'FEDIAF_TOCOPHEROL_ACTIVITY',
    });
    expect(result?.components).toMatchObject({
      alphaTocopherolIu: 1.49,
      betaTocopherolIu: 0.66,
      gammaTocopherolIu: 0.03,
      deltaTocopherolIu: 1,
    });
  });

  it('uses gamma activity as the conservative lower bound for combined beta plus gamma rows', () => {
    const result = calculateVitaminEActivityIu({
      alphaTocopherolMg: 0.46,
      betaGammaTocopherolMg: 5.02,
      deltaTocopherolMg: 2.92,
    });

    expect(result).toMatchObject({
      status: 'CONSERVATIVE_BETA_GAMMA_ACTIVITY',
      valueIu: 1.4656,
      vitaminEForm: 'FEDIAF_CONSERVATIVE_TOCOPHEROL_ACTIVITY',
    });
    expect(result?.components.betaGammaTocopherolIu).toBeCloseTo(0.0502, 6);
  });

  it('treats alpha-tocopherol alone as a lower bound instead of estimating missing forms', () => {
    const result = calculateVitaminEActivityIu({
      alphaTocopherolMg: 1,
    });

    expect(result).toMatchObject({
      status: 'ALPHA_ONLY_LOWER_BOUND',
      valueIu: 1.49,
      vitaminEForm: 'D_ALPHA_TOCOPHEROL',
    });
    expect(result?.note).toContain('其他生育酚形态未计入');
  });

  it('uses source alpha-tocopherol equivalents without adding component estimates', () => {
    const result = calculateVitaminEActivityIu({
      alphaTocopherolEquivalentMg: 2,
    });

    expect(result).toMatchObject({
      status: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
      valueIu: 2.98,
      vitaminEForm: 'SOURCE_ALPHA_TOCOPHEROL_EQUIVALENT',
    });
    expect(result?.note).toContain('不额外估算');
  });

  it('refuses ambiguous total vitamin E amounts without a declared activity basis', () => {
    expect(calculateVitaminEActivityIu({ totalVitaminEMg: 8.4 })).toBeNull();
  });
});
