import {
  calculateCfctFattyAcidGFromPercent,
  calculateCfctFattyAcidValueFromPercent,
  buildCfctFattyAcidPercentMetadata,
} from '../../../src/domain/nutrition-governance/cfct-fatty-acid-conversion';

describe('CFCT fatty acid conversion', () => {
  it('converts a single fatty acid percent into g per 100g using total fatty acids', () => {
    expect(
      calculateCfctFattyAcidGFromPercent({
        totalFattyAcidsG: 7.5,
        percentOfTotalFattyAcids: 7.3,
      }),
    ).toBeCloseTo(0.5475, 6);
  });

  it('returns null when the percent column is not a finite reviewed value', () => {
    expect(
      calculateCfctFattyAcidGFromPercent({
        totalFattyAcidsG: 1.8,
        percentOfTotalFattyAcids: null,
      }),
    ).toBeNull();
  });

  it('converts marine fatty acid percent rows into mg per 100g when required by the profile field', () => {
    expect(
      calculateCfctFattyAcidValueFromPercent({
        totalFattyAcidsG: 7.5,
        percentOfTotalFattyAcids: 0.2,
        targetUnit: 'mg',
      }),
    ).toBeCloseTo(15, 6);
  });

  it('builds traceable metadata for CFCT percent-derived fatty acids', () => {
    const metadata = buildCfctFattyAcidPercentMetadata({
      sourceNutrientId: 'CFCT_FA_18_2_PERCENT',
      sourceNutrientName: '18:2 / 总脂肪酸',
      totalFattyAcidsG: 5.4,
      percentOfTotalFattyAcids: 28.4,
      canonicalValueG: 1.5336,
    });

    expect(metadata).toMatchObject({
      sourceNutrientId: 'CFCT_FA_18_2_PERCENT',
      sourceNutrientName: '18:2 / 总脂肪酸',
      originalValue: 28.4,
      originalUnit: '% of total fatty acids',
      canonicalValue: 1.5336,
      canonicalUnit: 'g',
      cfctFattyAcidTotalG: 5.4,
      conversionFormula:
        'single fatty acid g/100g = total fatty acids g/100g * percent / 100',
    });
  });

  it('builds traceable metadata for mg target fields such as EPA, DPA, and DHA', () => {
    const metadata = buildCfctFattyAcidPercentMetadata({
      sourceNutrientId: 'CFCT_FA_20_5_PERCENT',
      sourceNutrientName: '20:5 / 总脂肪酸',
      totalFattyAcidsG: 7.5,
      percentOfTotalFattyAcids: 0.2,
      canonicalValue: 15,
      canonicalUnit: 'mg',
    });

    expect(metadata).toMatchObject({
      sourceNutrientId: 'CFCT_FA_20_5_PERCENT',
      sourceNutrientName: '20:5 / 总脂肪酸',
      originalValue: 0.2,
      originalUnit: '% of total fatty acids',
      canonicalValue: 15,
      canonicalUnit: 'mg',
      cfctFattyAcidTotalG: 7.5,
      conversionFormula:
        'single fatty acid mg/100g = total fatty acids g/100g * percent / 100 * 1000',
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    });
  });
});
