import { createEmptyNutritionProfile } from '../../src/domain/ingredient/nutrition-profile.utils';
import { attachUsdaFdcProfileMetadata } from '../../src/domain/nutrition-governance/nutrition-governance.utils';
import {
  buildUsdaCandidateConfirmationPlanRows,
  usdaCandidateConfirmationPlanRowsToCsv,
} from '../../scripts/plan-usda-candidate-confirmations';

function completeUsdaProfile() {
  const profile = createEmptyNutritionProfile();
  attachUsdaFdcProfileMetadata(profile, {
    externalId: '173904',
    sourceVersion: 'USDA_FDC:2019-04-01',
    sourceTitle: 'USDA FoodData Central',
    confidenceLevel: 'HIGH',
  });
  profile.macros.energyKcal = 379;
  profile.macros.moisture = 10.84;
  profile.macros.crudeProtein = 13.15;
  profile.macros.crudeFat = 6.52;
  profile.minerals.calcium = 52;
  profile.minerals.phosphorus = 410;
  return profile;
}

describe('USDA candidate confirmation plan', () => {
  it('marks low-risk USDA candidates as confirmable when the profile contract passes', () => {
    const rows = buildUsdaCandidateConfirmationPlanRows([
      {
        ingredient: { id: 'ingredient-1', name: '燕麦' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.95,
            normalizedNutrition: completeUsdaProfile(),
            sourceRecord: {
              sourceKey: 'USDA:173904',
              sourceTitle: 'USDA FoodData Central',
              sourceDetail: { provider: 'USDA FoodData Central' },
              foodName: 'Cereals, oats, regular and quick, not fortified, dry',
              foodNameEn:
                'Cereals, oats, regular and quick, not fortified, dry',
              dataType: 'SR Legacy',
              category: 'Cereal Grains and Pasta',
            },
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        ingredientName: '燕麦',
        candidateId: 'candidate-1',
        fdcId: '173904',
        plannedAction: 'WOULD_CONFIRM',
        contractResult: 'PASS',
        wouldWrite: 'YES',
      }),
    ]);
  });

  it('does not mark review-risk candidates as writable', () => {
    const rows = buildUsdaCandidateConfirmationPlanRows([
      {
        ingredient: { id: 'ingredient-1', name: '燕麦' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'MEDIUM',
            score: 0.72,
            normalizedNutrition: completeUsdaProfile(),
            sourceRecord: {
              sourceKey: 'USDA:173904',
              sourceTitle: 'USDA FoodData Central',
              foodName: 'Cereals, oats, regular and quick, not fortified, dry',
              foodNameEn:
                'Cereals, oats, regular and quick, not fortified, dry',
              dataType: 'SR Legacy',
              category: 'Cereal Grains and Pasta',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toMatchObject({
      plannedAction: 'SKIP_REVIEW',
      wouldWrite: 'NO',
    });
  });

  it('blocks low-risk candidates when the confirmation profile fails the contract', () => {
    const profile = completeUsdaProfile();
    profile.meta.externalId = null;
    profile.meta.sourceVersion = null;
    const rows = buildUsdaCandidateConfirmationPlanRows([
      {
        ingredient: { id: 'ingredient-1', name: '燕麦' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.95,
            normalizedNutrition: profile,
            sourceRecord: {
              sourceKey: '',
              sourceTitle: 'USDA FoodData Central',
              sourceDetail: { provider: 'USDA FoodData Central' },
              foodName: 'Cereals, oats, regular and quick, not fortified, dry',
              foodNameEn:
                'Cereals, oats, regular and quick, not fortified, dry',
              dataType: 'SR Legacy',
              category: 'Cereal Grains and Pasta',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toMatchObject({
      plannedAction: 'BLOCK_CONTRACT',
      contractResult: 'FAIL',
      issueCodes: 'MISSING_SOURCE_META',
      wouldWrite: 'NO',
    });
  });

  it('derives USDA source metadata from source records for legacy candidates', () => {
    const profile = completeUsdaProfile();
    profile.meta.sourceKind = null;
    profile.meta.sourceCode = null;
    profile.meta.externalId = null;
    profile.meta.sourceVersion = null;
    const rows = buildUsdaCandidateConfirmationPlanRows([
      {
        ingredient: { id: 'ingredient-1', name: '燕麦' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.95,
            normalizedNutrition: profile,
            sourceRecord: {
              sourceType: 'USDA',
              sourceKey: 'USDA:173904',
              sourceTitle: 'USDA FoodData Central',
              sourceDetail: {
                provider: 'USDA FoodData Central',
                publishedDate: '2019-04-01',
              },
              foodName:
                'Cereals, oats, regular and quick, not fortified, dry',
              foodNameEn:
                'Cereals, oats, regular and quick, not fortified, dry',
              dataType: 'SR Legacy',
              category: 'Cereal Grains and Pasta',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toMatchObject({
      plannedAction: 'WOULD_CONFIRM',
      contractResult: 'PASS',
      wouldWrite: 'YES',
    });
  });

  it('exports a csv report', () => {
    const csv = usdaCandidateConfirmationPlanRowsToCsv([
      {
        ingredientId: 'ingredient-1',
        ingredientName: '燕麦',
        candidateId: 'candidate-1',
        fdcId: '173904',
        foodName: 'Cereals, oats',
        dataType: 'SR Legacy',
        confidence: 'HIGH',
        score: 0.95,
        riskLevel: 'LOW',
        recommendedAction: 'CONFIRM_FIRST',
        plannedAction: 'WOULD_CONFIRM',
        contractResult: 'PASS',
        issueCodes: '',
        issueDetails: '',
        wouldWrite: 'YES',
      },
    ]);

    expect(csv).toContain('原料ID,原料名称,候选ID,FDC ID');
    expect(csv).toContain('ingredient-1');
  });
});
