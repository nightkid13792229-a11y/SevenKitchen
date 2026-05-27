import {
  buildCfctFattyAcidProfileReview,
  type CfctFattyAcidProfileReviewInput,
} from '../../../src/domain/nutrition-governance/cfct-fatty-acid-profile-review';

describe('CFCT fatty acid profile review', () => {
  it('reviews every canonical fatty acid field and verifies percent conversions', () => {
    const audit = buildCfctFattyAcidProfileReview([
      cfctProfile({
        externalId: 'CFCT:031306',
        displayNameZh: '北豆腐/老豆腐/卤水豆腐',
        nutritionData: {
          meta: {
            sourceForms: {
              'fattyAcids.saturatedFattyAcids': {
                originalValue: 3.8,
                originalUnit: 'g',
                sourcePage: 198,
                sourceTable: '食物脂肪酸含量',
                cfctFattyAcidTotalG: 7.5,
                cfctUnknownFattyAcidsG: 0,
              },
              'fattyAcids.monounsaturatedFattyAcids': {
                originalValue: 2.9,
                originalUnit: 'g',
                sourcePage: 198,
                sourceTable: '食物脂肪酸含量',
                cfctFattyAcidTotalG: 7.5,
                cfctUnknownFattyAcidsG: 0,
              },
              'fattyAcids.polyunsaturatedFattyAcids': {
                originalValue: 0.6,
                originalUnit: 'g',
                sourcePage: 198,
                sourceTable: '食物脂肪酸含量',
                cfctFattyAcidTotalG: 7.5,
                cfctUnknownFattyAcidsG: 0,
              },
              'fattyAcids.linoleicAcid': {
                sourceNutrientId: 'CFCT_FA_18_2_PERCENT',
                sourceNutrientName: '18:2 / 总脂肪酸',
                originalValue: 7.3,
                originalUnit: '% of total fatty acids',
                canonicalValue: 0.5475,
                canonicalUnit: 'g',
                cfctFattyAcidTotalG: 7.5,
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
              'fattyAcids.alphaLinolenicAcid': {
                sourceNutrientId: 'CFCT_FA_18_3_PERCENT',
                sourceNutrientName: '18:3 / 总脂肪酸',
                originalValue: 0.1,
                originalUnit: '% of total fatty acids',
                canonicalValue: 0.0075,
                canonicalUnit: 'g',
                cfctFattyAcidTotalG: 7.5,
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
              'fattyAcids.arachidonicAcid': {
                sourceNutrientId: 'CFCT_FA_20_4_PERCENT',
                sourceNutrientName: '20:4 / 总脂肪酸',
                originalValue: 0.2,
                originalUnit: '% of total fatty acids',
                canonicalValue: 0.015,
                canonicalUnit: 'g',
                cfctFattyAcidTotalG: 7.5,
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
              'fattyAcids.epa': {
                sourceNutrientId: 'CFCT_FA_20_5_PERCENT',
                sourceNutrientName: '20:5 / 总脂肪酸',
                originalValue: 0.3,
                originalUnit: '% of total fatty acids',
                canonicalValue: 22.5,
                canonicalUnit: 'mg',
                cfctFattyAcidTotalG: 7.5,
                conversionFactor: 1000,
                conversionFactorUnit: 'MG_PER_G',
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
              'fattyAcids.dpa': {
                sourceNutrientId: 'CFCT_FA_22_5_PERCENT',
                sourceNutrientName: '22:5 / 总脂肪酸',
                originalValue: 0.4,
                originalUnit: '% of total fatty acids',
                canonicalValue: 30,
                canonicalUnit: 'mg',
                cfctFattyAcidTotalG: 7.5,
                conversionFactor: 1000,
                conversionFactorUnit: 'MG_PER_G',
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
              'fattyAcids.dha': {
                sourceNutrientId: 'CFCT_FA_22_6_PERCENT',
                sourceNutrientName: '22:6 / 总脂肪酸',
                originalValue: 0.5,
                originalUnit: '% of total fatty acids',
                canonicalValue: 37.5,
                canonicalUnit: 'mg',
                cfctFattyAcidTotalG: 7.5,
                conversionFactor: 1000,
                conversionFactorUnit: 'MG_PER_G',
                sourcePage: 199,
                sourceTable: '食物脂肪酸组成百分比',
                manuallyReviewedColumn: true,
              },
            },
          },
          fattyAcids: {
            saturatedFattyAcids: 3.8,
            monounsaturatedFattyAcids: 2.9,
            polyunsaturatedFattyAcids: 0.6,
            linoleicAcid: 0.5475,
            alphaLinolenicAcid: 0.0075,
            arachidonicAcid: 0.015,
            epa: 22.5,
            dpa: 30,
            dha: 37.5,
          },
        },
      }),
    ]);

    expect(audit.summary).toMatchObject({
      profileCount: 1,
      fieldRowCount: 9,
      enteredFieldCount: 9,
      missingFieldCount: 0,
      highRiskFieldCount: 0,
      percentConversionCheckedCount: 6,
    });
    expect(audit.profileRows[0]).toMatchObject({
      externalId: 'CFCT:031306',
      displayNameZh: '北豆腐/老豆腐/卤水豆腐',
      enteredFieldCount: 9,
      missingFieldCount: 0,
      percentConversionCheckedCount: 6,
      actionZh: '已完成可量化主字段录入；缺失项需保留为待补源或 Tr/未列值证据。',
    });

    const linoleic = audit.fieldRows.find(
      (row) => row.fieldPath === 'fattyAcids.linoleicAcid',
    );
    expect(linoleic).toMatchObject({
      labelZh: '亚油酸',
      currentValue: 0.5475,
      sourceStatusZh: '已录入（CFCT 百分比换算）',
      sourceRiskZh: '低：原始百分比、总脂肪酸基数和换算值可复算',
      originalValue: 7.3,
      convertedValue: 0.5475,
      conversionCheckZh: '通过',
    });

    const saturated = audit.fieldRows.find(
      (row) => row.fieldPath === 'fattyAcids.saturatedFattyAcids',
    );
    expect(saturated).toMatchObject({
      sourceStatusZh: '已录入（CFCT 总量表）',
      sourceRiskZh: '低：字段已有来源页、单位和 CFCT 总量表证据',
      originalValue: 3.8,
      originalUnit: 'g',
      convertedValue: null,
      conversionCheckZh: '不适用',
    });

    const epa = audit.fieldRows.find((row) => row.fieldPath === 'fattyAcids.epa');
    expect(epa).toMatchObject({
      labelZh: 'EPA',
      currentValue: 22.5,
      unit: 'mg',
      sourceStatusZh: '已录入（CFCT 百分比换算）',
      sourceRiskZh: '低：原始百分比、总脂肪酸基数和换算值可复算',
      originalValue: 0.3,
      convertedValue: 22.5,
      conversionCheckZh: '通过',
    });
  });
});

function cfctProfile(
  input: Partial<CfctFattyAcidProfileReviewInput>,
): CfctFattyAcidProfileReviewInput {
  return {
    id: 'nutrition-food-1',
    name: '豆腐（北豆腐）',
    displayNameZh: '北豆腐/老豆腐/卤水豆腐',
    dataSource: 'CFCT',
    externalId: 'CFCT:031306',
    nutritionData: {},
    ...input,
  };
}
