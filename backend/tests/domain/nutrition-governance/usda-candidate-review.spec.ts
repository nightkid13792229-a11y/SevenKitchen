import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  buildUsdaCandidateReviewRows,
  usdaCandidateReviewRowsToCsv,
} from '../../../src/domain/nutrition-governance/usda-candidate-review';

function completeProfile() {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = 'USDA';
  profile.macros.energyKcal = 120;
  profile.macros.moisture = 70;
  profile.macros.crudeProtein = 20;
  profile.macros.crudeFat = 3;
  profile.minerals.calcium = 12;
  profile.minerals.phosphorus = 210;
  return profile;
}

describe('USDA candidate review rows', () => {
  it('selects the top candidate and marks clean high-confidence matches as low risk', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-1', name: '鸡胸' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.98,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:171077',
              foodName: 'Chicken, broilers or fryers, breast, meat only, raw',
              dataType: 'SR Legacy',
              category: 'Poultry Products',
            },
          },
          {
            id: 'candidate-2',
            confidence: 'MEDIUM',
            score: 0.72,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:123',
              foodName: 'Chicken, breast, cooked',
            },
          },
        ],
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        ingredientName: '鸡胸',
        bestCandidateId: 'candidate-1',
        bestFoodName: 'Chicken, broilers or fryers, breast, meat only, raw',
        bestScore: 0.98,
        alternativeCandidateCount: 1,
        riskLevel: 'LOW',
        riskFlags: [],
        recommendedAction: 'CONFIRM_FIRST',
      }),
    ]);
  });

  it('flags tied top candidates for manual review', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-2', name: '三文鱼' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.95,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:1',
              foodName: 'Fish, salmon, chinook, raw',
            },
          },
          {
            id: 'candidate-2',
            confidence: 'HIGH',
            score: 0.95,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:2',
              foodName: 'Fish, salmon, chum, raw',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        tiedTopCandidateCount: 2,
        riskLevel: 'MEDIUM',
        recommendedAction: 'REVIEW',
        riskFlags: expect.arrayContaining(['MULTIPLE_TOP_CANDIDATES']),
      }),
    );
  });

  it('flags prepared or salted foods as high risk', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-3', name: '巴旦木' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.9,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:3',
              foodName: 'Nuts, almonds, dry roasted, with salt added',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        riskLevel: 'HIGH',
        recommendedAction: 'CHANGE_OR_CFCT',
        riskFlags: expect.arrayContaining([
          'PREPARED_OR_PROCESSED',
          'ADDED_SALT',
        ]),
      }),
    );
  });

  it('does not treat uncooked or table salt as prepared/salted mismatches', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-4', name: '藜麦' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.9,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:4',
              foodName: 'Quinoa, uncooked',
            },
          },
        ],
      },
      {
        ingredient: { id: 'ingredient-5', name: '食用盐' },
        candidates: [
          {
            id: 'candidate-2',
            confidence: 'HIGH',
            score: 0.9,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:5',
              foodName: 'Salt, table',
            },
          },
        ],
      },
    ]);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientName: '藜麦',
          riskFlags: [],
          riskLevel: 'LOW',
        }),
        expect.objectContaining({
          ingredientName: '食用盐',
          riskFlags: [],
          riskLevel: 'LOW',
        }),
      ]),
    );
  });

  it('flags sweet potato leaves as a root-vegetable mismatch', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-6', name: '红薯' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.98,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:6',
              foodName: 'Sweet potato leaves, raw',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        riskLevel: 'HIGH',
        recommendedAction: 'CHANGE_OR_CFCT',
        riskFlags: expect.arrayContaining(['LEAF_MISMATCH']),
      }),
    );
  });

  it('does not flag culinary herbs with leaf-based USDA descriptions', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-7', name: '香菜' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.98,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:7',
              foodName: 'Coriander (cilantro) leaves, raw',
            },
          },
        ],
      },
    ]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        riskLevel: 'LOW',
        riskFlags: [],
      }),
    );
  });

  it('flags dry or powder USDA descriptions when the ingredient name does not mark that state', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-8', name: '黑木耳' },
        candidates: [
          {
            id: 'candidate-1',
            confidence: 'HIGH',
            score: 0.87,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:8',
              foodName: 'Fungi, Cloud ears, dried',
            },
          },
        ],
      },
      {
        ingredient: { id: 'ingredient-9', name: '丁香粉' },
        candidates: [
          {
            id: 'candidate-2',
            confidence: 'HIGH',
            score: 0.87,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:9',
              foodName: 'Spices, cloves, ground',
            },
          },
        ],
      },
      {
        ingredient: { id: 'ingredient-10', name: '白芝麻' },
        candidates: [
          {
            id: 'candidate-3',
            confidence: 'HIGH',
            score: 0.87,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:10',
              foodName: 'Seeds, sesame flour, partially defatted',
            },
          },
        ],
      },
      {
        ingredient: { id: 'ingredient-11', name: '生南瓜籽仁' },
        candidates: [
          {
            id: 'candidate-4',
            confidence: 'HIGH',
            score: 0.87,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:11',
              foodName: 'Seeds, pumpkin and squash seed kernels, dried',
              category: 'Nut and Seed Products',
            },
          },
        ],
      },
      {
        ingredient: { id: 'ingredient-12', name: '南瓜籽粉' },
        candidates: [
          {
            id: 'candidate-5',
            confidence: 'HIGH',
            score: 0.87,
            normalizedNutrition: completeProfile(),
            sourceRecord: {
              sourceKey: 'USDA:12',
              foodName: 'Seeds, pumpkin seed meal',
              category: 'Nut and Seed Products',
            },
          },
        ],
      },
    ]);

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ingredientName: '黑木耳',
          riskLevel: 'HIGH',
          recommendedAction: 'CHANGE_OR_CFCT',
          riskFlags: expect.arrayContaining(['STATE_MISMATCH']),
        }),
        expect.objectContaining({
          ingredientName: '丁香粉',
          riskLevel: 'LOW',
          riskFlags: [],
        }),
        expect.objectContaining({
          ingredientName: '白芝麻',
          riskLevel: 'HIGH',
          recommendedAction: 'CHANGE_OR_CFCT',
          riskFlags: expect.arrayContaining(['STATE_MISMATCH']),
        }),
        expect.objectContaining({
          ingredientName: '生南瓜籽仁',
          riskLevel: 'LOW',
          riskFlags: [],
        }),
        expect.objectContaining({
          ingredientName: '南瓜籽粉',
          riskLevel: 'LOW',
          riskFlags: [],
        }),
      ]),
    );
  });

  it('keeps food ingredients without candidates in the review queue', () => {
    const rows = buildUsdaCandidateReviewRows([
      {
        ingredient: { id: 'ingredient-4', name: '鸭心' },
        candidates: [],
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientName: '鸭心',
        bestCandidateId: '',
        riskLevel: 'HIGH',
        riskFlags: ['NO_CANDIDATE'],
        recommendedAction: 'CHANGE_OR_CFCT',
      }),
    ]);
  });

  it('exports Chinese CSV headers and review labels', () => {
    const csv = usdaCandidateReviewRowsToCsv([
      {
        ingredientId: 'ingredient-1',
        ingredientName: '鸡胸',
        bestCandidateId: 'candidate-1',
        bestSourceKey: 'USDA:171077',
        bestFdcId: '171077',
        bestFoodName: 'Chicken breast, raw',
        bestCategory: 'Poultry Products',
        bestDataType: 'SR Legacy',
        bestConfidence: 'HIGH',
        bestScore: 0.98,
        alternativeCandidateCount: 1,
        tiedTopCandidateCount: 1,
        riskLevel: 'LOW',
        riskFlags: [],
        recommendedAction: 'CONFIRM_FIRST',
        alternativesSummary: 'USDA:123 Chicken cooked (72%)',
      },
    ]);

    expect(csv.split('\n')[0]).toBe(
      '原料ID,原料名称,最佳候选ID,FDC ID,USDA描述,类别,数据类型,置信度,分数,备选数,同分最佳数,风险等级,风险提示,建议动作,备选摘要',
    );
    expect(csv).toContain('可优先确认');
    expect(csv).toContain('USDA:123 Chicken cooked (72%)');
  });
});
