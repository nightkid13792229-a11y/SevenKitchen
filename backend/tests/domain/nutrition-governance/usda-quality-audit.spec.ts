import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  auditUsdaNutritionQualityRows,
  usdaQualityAuditRowsToCsv,
  usdaQualityAuditRowsToMarkdown,
} from '../../../src/domain/nutrition-governance/usda-quality-audit';
import { attachUsdaFdcProfileMetadata } from '../../../src/domain/nutrition-governance/nutrition-governance.utils';

function profile(fdcId = '171077') {
  const value = createEmptyNutritionProfile();
  attachUsdaFdcProfileMetadata(value, {
    externalId: fdcId,
    sourceVersion: 'USDA_FDC:2019-04-01',
    sourceTitle: 'USDA FoodData Central',
    confidenceLevel: 'HIGH',
  });
  value.macros.energyKcal = 120;
  value.macros.moisture = 70;
  value.macros.crudeProtein = 20;
  value.macros.crudeFat = 3;
  value.minerals.calcium = 12;
  value.minerals.phosphorus = 210;
  value.meta.sourceForms = {
    'macros.energyKcal': sourceForm(1008, 'Energy', 120, 'kcal', 'KCAL'),
    'macros.moisture': sourceForm(1051, 'Water', 70, 'g', 'G'),
    'macros.crudeProtein': sourceForm(1003, 'Protein', 20, 'g', 'G'),
    'macros.crudeFat': sourceForm(1004, 'Total lipid (fat)', 3, 'g', 'G'),
    'minerals.calcium': sourceForm(1087, 'Calcium, Ca', 12, 'mg', 'MG'),
    'minerals.phosphorus': sourceForm(1091, 'Phosphorus, P', 210, 'mg', 'MG'),
  };
  return value;
}

function sourceForm(
  sourceNutrientId: number,
  sourceNutrientName: string,
  value: number,
  canonicalUnit: string,
  originalUnit: string,
) {
  return {
    sourceNutrientId,
    sourceNutrientName,
    canonicalValue: value,
    canonicalUnit,
    originalValue: value,
    originalUnit,
    basisType: 'PER_100_G',
  };
}

describe('USDA quality audit', () => {
  it('marks animal ingredients with raw and cooked USDA mappings as pass', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-chicken',
        name: '鸡胸',
        nutritionProfile: profile('171077'),
        nutritionFoodMappings: [
          mapping(true, 'Chicken breast, raw', '171077', '生', profile('171077')),
          mapping(false, 'Chicken breast, cooked, roasted', '171078', '熟', profile('171078')),
        ],
        sourceRecords: [sourceRecord('171077', profile('171077'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'PASS',
      stateCoverage: 'RAW_AND_COOKED_READY',
      issueCodes: [],
    });
  });

  it('asks for a decision when animal ingredients only have a raw profile', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-chicken',
        name: '鸡胸',
        nutritionProfile: profile('171077'),
        nutritionFoodMappings: [
          mapping(true, 'Chicken breast, raw', '171077', '生', profile('171077')),
        ],
        sourceRecords: [sourceRecord('171077', profile('171077'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'NEEDS_USER_DECISION',
      stateCoverage: 'RAW_ONLY_NEEDS_COOKED',
      issueCodes: ['MISSING_COOKED_PROFILE'],
    });
  });

  it('does not require raw/cooked coverage for oils', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-oil',
        name: '橄榄油',
        nutritionProfile: profile('171413'),
        nutritionFoodMappings: [
          mapping(true, 'Oil, olive, salad or cooking', '171413', '油脂', profile('171413')),
        ],
        sourceRecords: [sourceRecord('171413', profile('171413'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'PASS',
      stateCoverage: 'STATE_NOT_APPLICABLE',
    });
  });

  it('does not treat boiled vegetables as oils', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-radish',
        name: '白萝卜',
        nutritionProfile: profile('168451'),
        nutritionFoodMappings: [
          mapping(true, 'Radishes, oriental, raw', '168451', '生', profile('168451')),
          mapping(
            false,
            'Radishes, oriental, cooked, boiled, drained, without salt',
            '168452',
            '熟',
            profile('168452'),
          ),
        ],
        sourceRecords: [sourceRecord('168451', profile('168451'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'PASS',
      stateCoverage: 'RAW_AND_COOKED_READY',
    });
  });

  it('does not require cooked profiles for common raw fruits', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-banana',
        name: '香蕉',
        nutritionProfile: profile('173944'),
        nutritionFoodMappings: [
          mapping(true, 'Bananas, raw', '173944', '生', profile('173944')),
        ],
        sourceRecords: [sourceRecord('173944', profile('173944'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'PASS',
      stateCoverage: 'STATE_NOT_APPLICABLE',
    });
  });

  it('does not require cooked profiles for cucumber raw edible-portion variants', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        nutritionProfile: profile('168409'),
        nutritionFoodMappings: [
          mapping(
            true,
            'Cucumber, with peel, raw',
            '168409',
            '生',
            profile('168409'),
            '带皮',
          ),
          mapping(
            false,
            'Cucumber, peeled, raw',
            '169225',
            '生',
            profile('169225'),
            '去皮',
          ),
        ],
        sourceRecords: [sourceRecord('168409', profile('168409'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'PASS',
      stateCoverage: 'STATE_NOT_APPLICABLE',
    });
  });

  it('flags canonical source form mismatches as fixable data issues', () => {
    const broken = profile('168409');
    broken.macros.energyKcal = 15;
    broken.meta.sourceForms = {
      'macros.energyKcal': {
        sourceNutrientId: 1008,
        sourceNutrientName: 'Energy',
        canonicalValue: 16,
        canonicalUnit: 'kcal',
        originalValue: 16,
        originalUnit: 'KCAL',
        basisType: 'PER_100_G',
      },
    };

    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        nutritionProfile: broken,
        nutritionFoodMappings: [
          mapping(true, 'Cucumber, with peel, raw', '168409', '生', broken),
        ],
        sourceRecords: [sourceRecord('168409', broken)],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'NEEDS_FIX',
      issueCodes: expect.arrayContaining(['SOURCE_FORM_VALUE_MISMATCH']),
    });
  });

  it('flags dry USDA descriptions for names that do not say dry', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-fungus',
        name: '黑木耳',
        nutritionProfile: profile('168580'),
        nutritionFoodMappings: [
          mapping(true, 'Fungi, Cloud ears, dried', '168580', '干', profile('168580')),
        ],
        sourceRecords: [sourceRecord('168580', profile('168580'))],
      },
    ]);

    expect(rows[0]).toMatchObject({
      status: 'NEEDS_USER_DECISION',
      issueCodes: expect.arrayContaining(['DRY_DESCRIPTION_WITHOUT_DRY_NAME']),
    });
  });

  it('exports csv and markdown reports', () => {
    const rows = auditUsdaNutritionQualityRows([
      {
        id: 'ingredient-oil',
        name: '橄榄油',
        nutritionProfile: profile('171413'),
        nutritionFoodMappings: [
          mapping(true, 'Oil, olive, salad or cooking', '171413', '油脂', profile('171413')),
        ],
        sourceRecords: [sourceRecord('171413', profile('171413'))],
      },
    ]);

    expect(usdaQualityAuditRowsToCsv(rows)).toContain('原料ID,原料名称,审核结论');
    expect(usdaQualityAuditRowsToMarkdown(rows)).toContain('USDA 主档案质量审核');
  });
});

function mapping(
  isPrimary: boolean,
  name: string,
  fdcId: string,
  state: string,
  nutritionData: unknown,
  ediblePortionLabel = '标准可食部',
) {
  return {
    isPrimary,
    nutritionFood: {
      name,
      dataSource: 'USDA',
      externalId: `USDA:${fdcId}`,
      status: 'VERIFIED',
      preparationStateLabel: state,
      ediblePortionLabel,
      processingLabel: state === '熟' ? '熟制' : '未加工',
      nutritionData,
    },
  };
}

function sourceRecord(fdcId: string, normalizedNutrition: unknown) {
  return {
    sourceKey: `USDA:${fdcId}`,
    sourceTitle: 'USDA FoodData Central',
    foodName: `USDA ${fdcId}`,
    normalizedNutrition,
  };
}
