import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  assessNutritionProfileCompleteness,
  buildFoodNutritionMappingAudit,
} from '../../../src/domain/nutrition-governance/food-nutrition-mapping-audit';

function completeFoodProfile() {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'USDA';
  profile.meta.sourceVersion = 'USDA_FDC:2019-04-01';
  profile.macros.energyKcal = 100;
  profile.macros.moisture = 70;
  profile.macros.crudeProtein = 20;
  profile.macros.crudeFat = 3;
  profile.minerals.calcium = 12;
  profile.minerals.phosphorus = 180;
  return profile;
}

describe('food nutrition mapping audit', () => {
  it('scores nutrient completeness and keeps zero values as present', () => {
    const profile = completeFoodProfile();
    profile.vitamins.vitaminD = 0;
    profile.fattyAcids.epa = 0;

    const result = assessNutritionProfileCompleteness(profile);

    expect(result.criticalMissingFields).toEqual([]);
    expect(result.presentFieldCount).toBeGreaterThanOrEqual(8);
    expect(result.completenessScore).toBeGreaterThan(0);
    expect(result.groupScores.vitamins.present).toBe(1);
    expect(result.groupScores.fattyAcids.present).toBe(1);
  });

  it('breaks completeness into non-zero, zero, and empty field counts', () => {
    const profile = completeFoodProfile();
    profile.vitamins.vitaminD = 0;
    profile.fattyAcids.epa = 0;

    const result = assessNutritionProfileCompleteness(profile);

    expect(result.nonZeroValueFieldCount).toBe(6);
    expect(result.zeroValueFieldCount).toBe(2);
    expect(result.emptyFieldCount).toBe(result.expectedFieldCount - 8);
    expect(result.zeroValueFields).toEqual(
      expect.arrayContaining(['vitamins.vitaminD', 'fattyAcids.epa']),
    );
    expect(result.emptyFields).toContain('macros.ash');
  });

  it('flags zero values without field-level source evidence', () => {
    const profile = completeFoodProfile();
    profile.vitamins.vitaminD = 0;
    profile.vitamins.vitaminC = 0;
    profile.meta.sourceForms = {
      'vitamins.vitaminD': {
        sourceNutrientId: 'VITD',
        sourceNutrientName: 'Vitamin D',
        originalValue: 0,
        originalUnit: 'IU',
        canonicalValue: 0,
        canonicalUnit: 'IU',
        basisType: 'PER_100_G',
      },
    };

    const audit = buildFoodNutritionMappingAudit([
      {
        id: 'ingredient-1',
        name: '鸡胸肉',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: null,
            nutritionFood: {
              id: 'food-1',
              name: 'Chicken breast, raw',
              nameEn: 'Chicken breast, raw',
              displayNameZh: '鸡胸肉（生）',
              dataSource: 'USDA',
              externalId: 'USDA:123',
              status: 'VERIFIED',
              preparationState: 'RAW',
              preparationStateLabel: '生',
              ediblePortionLabel: '去皮去骨',
              processingLabel: '未加工',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          },
        ],
      },
    ]);

    expect(audit.mappingRows[0]).toMatchObject({
      nonZeroValueFieldCount: 6,
      zeroValueFieldCount: 2,
      emptyFieldCount: expect.any(Number),
      zeroValueWithoutSourceCount: 1,
      zeroValueFieldsWithoutSource: 'vitamins.vitaminC',
    });
    expect(audit.completenessRows[0]).toMatchObject({
      nonZeroValueFieldCount: 6,
      zeroValueFieldCount: 2,
      emptyFieldCount: expect.any(Number),
      zeroValueWithoutSourceCount: 1,
      zeroValueFieldsWithoutSource: 'vitamins.vitaminC',
    });
  });

  it('marks missing critical food fields as high risk', () => {
    const profile = completeFoodProfile();
    profile.minerals.phosphorus = null;

    const audit = buildFoodNutritionMappingAudit([
      {
        id: 'ingredient-1',
        name: '鸡胸肉',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: null,
            nutritionFood: {
              id: 'food-1',
              name: 'Chicken breast, raw',
              nameEn: 'Chicken breast, raw',
              displayNameZh: '鸡胸肉（生）',
              dataSource: 'USDA',
              externalId: 'USDA:123',
              status: 'VERIFIED',
              preparationState: 'RAW',
              preparationStateLabel: '生',
              ediblePortionLabel: '去皮去骨',
              processingLabel: '未加工',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          },
        ],
      },
    ]);

    expect(audit.ingredientOverviewRows[0]).toMatchObject({
      ingredientName: '鸡胸肉',
      primaryProfileName: '鸡胸肉（生）',
      overallRiskLevel: 'HIGH',
      recommendedAction: 'REVIEW_BEFORE_APPROVAL',
    });
    expect(audit.completenessRows[0].criticalMissingFields).toContain(
      'minerals.phosphorus',
    );
  });

  it('surfaces shared profiles and non-base primary mappings for manual review', () => {
    const profile = completeFoodProfile();

    const audit = buildFoodNutritionMappingAudit([
      {
        id: 'ingredient-red',
        name: '红薯',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: 'shared generic sweet potato profile',
            nutritionFood: {
              id: 'food-shared',
              name: "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
              nameEn:
                "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
              displayNameZh: '甘薯类（生，未处理）',
              dataSource: 'USDA',
              externalId: 'USDA:168482',
              status: 'VERIFIED',
              preparationState: 'RAW',
              preparationStateLabel: '生',
              ediblePortionLabel: '标准可食部',
              processingLabel: '未加工',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          },
        ],
      },
      {
        id: 'ingredient-purple',
        name: '紫薯',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: 'shared generic sweet potato profile',
            nutritionFood: {
              id: 'food-shared',
              name: "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
              nameEn:
                "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
              displayNameZh: '甘薯类（生，未处理）',
              dataSource: 'USDA',
              externalId: 'USDA:168482',
              status: 'VERIFIED',
              preparationState: 'RAW',
              preparationStateLabel: '生',
              ediblePortionLabel: '标准可食部',
              processingLabel: '未加工',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          },
        ],
      },
      {
        id: 'ingredient-cooked',
        name: '熟鸡胸',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: null,
            nutritionFood: {
              id: 'food-cooked',
              name: 'Chicken breast, stewed',
              nameEn: 'Chicken breast, stewed',
              displayNameZh: '鸡胸肉（炖煮熟制）',
              dataSource: 'USDA',
              externalId: 'USDA:456',
              status: 'VERIFIED',
              preparationState: 'COOKED',
              preparationStateLabel: '熟',
              ediblePortionLabel: '去皮去骨',
              processingLabel: '熟制',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          },
        ],
      },
    ]);

    expect(audit.sharedProfileRows).toEqual([
      expect.objectContaining({
        nutritionFoodId: 'food-shared',
        mappedIngredientNames: '红薯 / 紫薯',
        mappedIngredientCount: 2,
      }),
    ]);
    expect(
      audit.mappingRows.find((row) => row.ingredientName === '熟鸡胸'),
    ).toMatchObject({
      processingMatchStatus: 'PRIMARY_PROCESSING_REVIEW',
      riskLevel: 'HIGH',
    });
    expect(audit.candidateReviewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientName: '红薯',
          currentIssueTypes: expect.stringContaining('SHARED_PROFILE'),
        }),
        expect.objectContaining({
          ingredientName: '熟鸡胸',
          currentIssueTypes: expect.stringContaining(
            'PRIMARY_PROCESSING_REVIEW',
          ),
        }),
      ]),
    );
  });

  it('allows soaked foods to be primary profiles when that is the practical edible state', () => {
    const profile = completeFoodProfile();

    const audit = buildFoodNutritionMappingAudit([
      {
        id: 'ingredient-black-fungus',
        name: '黑木耳',
        mappings: [
          {
            isPrimary: true,
            yieldRate: 1,
            notes: null,
            nutritionFood: {
              id: 'food-soaked-black-fungus',
              name: '木耳（水发）［黑木耳，云耳］',
              nameEn: 'Wood ear fungus, soaked in water',
              displayNameZh: '黑木耳（水发）',
              dataSource: 'CFCT',
              externalId: 'CFCT:051014',
              status: 'VERIFIED',
              preparationState: 'SOAKED',
              preparationStateLabel: '水发',
              ediblePortionLabel: '标准可食部',
              processingLabel: '水发',
              nutritionData: profile,
              verifiedAt: new Date('2026-05-28T00:00:00.000Z'),
            },
          },
        ],
      },
    ]);

    expect(audit.mappingRows[0]).toMatchObject({
      ingredientName: '黑木耳',
      processingMatchStatus: 'PRIMARY_BASE_PROFILE',
    });
    expect(audit.mappingRows[0].issueTypes).not.toContain(
      'PRIMARY_PROCESSING_REVIEW',
    );
    expect(audit.ingredientOverviewRows[0]).toMatchObject({
      ingredientName: '黑木耳',
      overallRiskLevel: 'MEDIUM',
    });
  });

  it('marks food ingredients without mappings as missing nutrition profile work', () => {
    const audit = buildFoodNutritionMappingAudit([
      {
        id: 'ingredient-missing',
        name: '沙丁鱼',
        mappings: [],
      },
    ]);

    expect(audit.ingredientOverviewRows[0]).toMatchObject({
      ingredientName: '沙丁鱼',
      mappingCount: 0,
      issueTypes: 'MISSING_NUTRITION_PROFILE_MAPPING',
      overallRiskLevel: 'HIGH',
      recommendedAction: 'REVIEW_BEFORE_APPROVAL',
    });
    expect(audit.candidateReviewRows[0]).toMatchObject({
      ingredientName: '沙丁鱼',
      currentIssueTypes: 'MISSING_NUTRITION_PROFILE_MAPPING',
    });
  });
});
