import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import { attachUsdaFdcProfileMetadata } from '../../../src/domain/nutrition-governance/nutrition-governance.utils';
import {
  buildUsdaIngestionProgressRows,
  usdaIngestionProgressRowsToCsv,
  usdaIngestionProgressRowsToMarkdown,
} from '../../../src/domain/nutrition-governance/usda-ingestion-progress-audit';

function completeUsdaProfile(fdcId = '168409') {
  const profile = createEmptyNutritionProfile();
  attachUsdaFdcProfileMetadata(profile, {
    externalId: fdcId,
    sourceVersion: 'USDA_FDC:2019-04-01',
    sourceTitle: 'USDA FoodData Central',
    confidenceLevel: 'HIGH',
  });
  profile.macros.energyKcal = 15;
  profile.macros.moisture = 95.23;
  profile.macros.crudeProtein = 0.65;
  profile.macros.crudeFat = 0.11;
  profile.minerals.calcium = 16;
  profile.minerals.phosphorus = 24;
  return profile;
}

describe('USDA ingestion progress audit', () => {
  it('marks ingredients with one valid USDA primary mapping as confirmed', () => {
    const rows = buildUsdaIngestionProgressRows([
      {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        nutritionProfile: completeUsdaProfile('168409'),
        nutritionFoodMappings: [
          {
            isPrimary: true,
            nutritionFood: {
              name: 'Cucumber, with peel, raw',
              dataSource: 'USDA',
              externalId: 'USDA:168409',
              status: 'VERIFIED',
              preparationStateLabel: '生',
              ediblePortionLabel: '带皮',
              processingLabel: '未加工',
              nutritionData: completeUsdaProfile('168409'),
            },
          },
        ],
        nutritionCandidates: [],
      },
    ]);

    expect(rows[0]).toMatchObject({
      ingredientName: '黄瓜',
      stage: 'CONFIRMED_USDA_PRIMARY',
      primaryFdcId: '168409',
      primaryFoodName: 'Cucumber, with peel, raw',
      primaryStateLabel: '生 / 带皮 / 未加工',
      nextAction: '已入库；后续只需抽样验收或补充次级档案',
    });
  });

  it('routes ingredients with pending USDA candidates to manual review', () => {
    const rows = buildUsdaIngestionProgressRows([
      {
        id: 'ingredient-pumpkin',
        name: '南瓜',
        nutritionProfile: null,
        nutritionFoodMappings: [],
        nutritionCandidates: [
          {
            id: 'candidate-pumpkin',
            status: 'CANDIDATE',
            confidence: 'HIGH',
            score: 0.98,
            agentReviewStatus: 'NEEDS_HUMAN_REVIEW',
            sourceRecord: {
              sourceKey: 'USDA:168448',
              foodName: 'Pumpkin, raw',
              sourceType: 'USDA',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toMatchObject({
      stage: 'REVIEW_USDA_CANDIDATES',
      pendingUsdaCandidateCount: 1,
      bestCandidateFdcId: '168448',
      bestCandidateName: 'Pumpkin, raw',
      nextAction: '在后台审核 USDA 候选，选择主档案/次级档案后保存',
    });
  });

  it('routes ingredients without USDA candidates to candidate search', () => {
    const rows = buildUsdaIngestionProgressRows([
      {
        id: 'ingredient-missing',
        name: '未知食材',
        nutritionProfile: null,
        nutritionFoodMappings: [],
        nutritionCandidates: [],
      },
    ]);

    expect(rows[0]).toMatchObject({
      stage: 'FIND_USDA_CANDIDATE',
      nextAction: '重新查找 USDA 候选，或手动导入 USDA FDC ID',
    });
  });

  it('flags primary/profile consistency problems before treating a row as complete', () => {
    const rows = buildUsdaIngestionProgressRows([
      {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        nutritionProfile: null,
        nutritionFoodMappings: [
          {
            isPrimary: true,
            nutritionFood: {
              name: 'Cucumber, with peel, raw',
              dataSource: 'USDA',
              externalId: 'USDA:168409',
              status: 'VERIFIED',
              preparationStateLabel: '生',
              ediblePortionLabel: '带皮',
              processingLabel: '未加工',
              nutritionData: completeUsdaProfile('168409'),
            },
          },
        ],
        nutritionCandidates: [],
      },
    ]);

    expect(rows[0]).toMatchObject({
      stage: 'FIX_CONFIRMED_PROFILE',
      issues: ['INGREDIENT_PROFILE_MISSING'],
      nextAction: '修复已入库主档案、Ingredient 快照或营养合同问题',
    });
  });

  it('exports csv and markdown summaries', () => {
    const rows = buildUsdaIngestionProgressRows([
      {
        id: 'ingredient-cucumber',
        name: '黄瓜',
        nutritionProfile: completeUsdaProfile('168409'),
        nutritionFoodMappings: [
          {
            isPrimary: true,
            nutritionFood: {
              name: 'Cucumber, with peel, raw',
              dataSource: 'USDA',
              externalId: 'USDA:168409',
              status: 'VERIFIED',
              preparationStateLabel: '生',
              ediblePortionLabel: '带皮',
              processingLabel: '未加工',
              nutritionData: completeUsdaProfile('168409'),
            },
          },
        ],
        nutritionCandidates: [],
      },
    ]);

    expect(usdaIngestionProgressRowsToCsv(rows)).toContain(
      '原料ID,原料名称,阶段',
    );
    expect(usdaIngestionProgressRowsToMarkdown(rows)).toContain(
      'USDA 候选营养档案入库进度审计',
    );
  });
});
