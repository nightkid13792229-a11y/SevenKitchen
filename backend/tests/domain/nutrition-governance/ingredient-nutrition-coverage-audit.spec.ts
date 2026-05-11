import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import {
  buildIngredientNutritionCoverageRows,
  ingredientNutritionCoverageRowsToCsv,
} from '../../../src/domain/nutrition-governance/ingredient-nutrition-coverage-audit';

describe('ingredient nutrition coverage audit', () => {
  it('flags food ingredients without nutrition profiles as high priority USDA work', () => {
    const rows = buildIngredientNutritionCoverageRows([
      {
        id: 'food-1',
        name: '鸡胸肉',
        type: 'FOOD',
        nutritionProfile: null,
        nutritionCandidates: [],
        supplementNutritionDrafts: [],
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        ingredientId: 'food-1',
        ingredientName: '鸡胸肉',
        ingredientType: 'FOOD',
        hasNutritionProfile: false,
        currentSource: 'UNKNOWN',
        suggestedSource: 'USDA',
        priority: 'HIGH',
        missingKeyFields: expect.arrayContaining([
          'macros.energyKcal',
          'macros.crudeProtein',
          'macros.crudeFat',
          'minerals.calcium',
          'minerals.phosphorus',
        ]),
      }),
    ]);
  });

  it('marks complete USDA food profiles as low priority', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceType = 'USDA';
    profile.meta.sourceTitle = 'USDA FoodData Central';
    profile.macros.energyKcal = 165;
    profile.macros.moisture = 65;
    profile.macros.crudeProtein = 31;
    profile.macros.crudeFat = 3.6;
    profile.minerals.calcium = 15;
    profile.minerals.phosphorus = 220;

    const [row] = buildIngredientNutritionCoverageRows([
      {
        id: 'food-2',
        name: '鸡胸肉',
        type: 'FOOD',
        nutritionProfile: profile,
        nutritionCandidates: [],
        supplementNutritionDrafts: [],
      },
    ]);

    expect(row).toEqual(
      expect.objectContaining({
        hasNutritionProfile: true,
        currentSource: 'USDA',
        currentSourceTitle: 'USDA FoodData Central',
        missingKeyFields: [],
        priority: 'LOW',
      }),
    );
  });

  it('surfaces pending candidates and missing fields for partially covered foods', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceType = 'CFCT';
    profile.macros.energyKcal = 110;
    profile.macros.crudeProtein = 20;
    profile.macros.crudeFat = 2;

    const [row] = buildIngredientNutritionCoverageRows([
      {
        id: 'food-3',
        name: '牛肉',
        type: 'FOOD',
        nutritionProfile: profile,
        nutritionCandidates: [
          {
            confidence: 'HIGH',
            score: 0.91,
            sourceRecord: {
              sourceType: 'USDA',
              foodName: 'Beef, raw',
              sourceKey: 'USDA:123',
            },
          },
        ],
        supplementNutritionDrafts: [],
      },
    ]);

    expect(row).toEqual(
      expect.objectContaining({
        currentSource: 'CFCT',
        missingKeyFields: ['macros.moisture', 'minerals.calcium', 'minerals.phosphorus'],
        priority: 'MEDIUM',
        pendingCandidateCount: 1,
        bestCandidate: 'USDA Beef, raw (91%)',
      }),
    );
  });

  it('routes supplement ingredients to product-label review', () => {
    const [row] = buildIngredientNutritionCoverageRows([
      {
        id: 'supplement-1',
        name: '鱼油',
        type: 'SUPPLEMENT',
        nutritionProfile: null,
        nutritionCandidates: [],
        supplementNutritionDrafts: [
          {
            status: 'DRAFT',
            missingFields: ['servingWeightG'],
          },
        ],
      },
    ]);

    expect(row).toEqual(
      expect.objectContaining({
        ingredientType: 'SUPPLEMENT',
        suggestedSource: 'SUPPLEMENT_LABEL',
        priority: 'HIGH',
        pendingSupplementDraftCount: 1,
        missingKeyFields: expect.arrayContaining([
          'meta.rawBasisType',
          'canonicalNutritionValue',
        ]),
      }),
    );
  });

  it('exports rows as escaped CSV with Chinese headers', () => {
    const csv = ingredientNutritionCoverageRowsToCsv([
      {
        ingredientId: 'food-1',
        ingredientName: '鸡胸肉, 去皮',
        ingredientType: 'FOOD',
        hasNutritionProfile: false,
        currentSource: 'UNKNOWN',
        currentSourceTitle: '',
        missingKeyFields: ['macros.energyKcal', 'minerals.calcium'],
        suggestedSource: 'USDA',
        priority: 'HIGH',
        pendingCandidateCount: 0,
        bestCandidate: '',
        pendingSupplementDraftCount: 0,
        notes: '优先 USDA；必要时使用 CFCT',
      },
    ]);

    expect(csv.split('\n')[0]).toBe(
      '原料ID,原料名称,类型,是否已有营养档案,当前来源,当前来源标题,缺失关键字段,建议数据来源,优先级,待确认候选数,最佳候选,补剂草稿数,备注',
    );
    expect(csv).toContain('"鸡胸肉, 去皮"');
    expect(csv).toContain('macros.energyKcal; minerals.calcium');
  });
});
