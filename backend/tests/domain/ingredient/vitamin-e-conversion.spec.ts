import {
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
});
