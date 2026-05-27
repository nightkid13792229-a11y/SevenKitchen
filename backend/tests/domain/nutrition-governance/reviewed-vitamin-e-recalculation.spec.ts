import { recalculateReviewedVitaminE } from '../../../src/domain/nutrition-governance/reviewed-vitamin-e-recalculation';

const baseProfile = {
  meta: {
    rawBasisType: 'PER_100_G',
    sourceForms: {
      'vitamins.vitaminE': {
        sourceNutrientId: 1109,
        sourceNutrientName: 'Vitamin E (alpha-tocopherol)',
        originalValue: 1,
        originalUnit: 'mg',
        canonicalValue: 1.49,
        canonicalUnit: 'IU',
        basisType: 'PER_100_G',
        vitaminEForm: 'D_ALPHA_TOCOPHEROL',
      },
    },
    conversionNotes: {},
  },
  macros: {},
  minerals: {},
  vitamins: {
    vitaminE: 1.49,
  },
  fattyAcids: {},
  aminoAcids: {},
  customItems: [
    {
      name: 'Tocopherol, beta',
      value: 2,
      unit: 'mg',
      rawBasisType: 'PER_100_G',
      canonicalFieldPath: 'vitamins.vitaminE',
      reviewCategory: 'USDA_VITAMIN_E_RELATED',
      reviewStatus: 'NOT_COUNTED',
      sourceNutrientId: 1125,
    },
    {
      name: 'Tocotrienol, alpha',
      value: 0.4,
      unit: 'mg',
      rawBasisType: 'PER_100_G',
      canonicalFieldPath: 'vitamins.vitaminE',
      reviewCategory: 'USDA_VITAMIN_E_RELATED',
      reviewStatus: 'NOT_COUNTED',
      sourceNutrientId: 1128,
    },
  ],
};

describe('reviewed vitamin E recalculation', () => {
  it('recalculates USDA vitamin E from alpha, beta, gamma, and delta tocopherols', () => {
    const decision = recalculateReviewedVitaminE({
      id: 'food-1',
      name: 'Nuts, test',
      displayNameZh: '测试坚果',
      dataSource: 'USDA',
      externalId: 'USDA:123',
      status: 'VERIFIED',
      nutritionData: baseProfile,
      sourceRecord: {
        id: 'source-1',
        sourceType: 'USDA',
        sourceKey: 'USDA:123',
        rawData: {
          foodNutrients: [
            { nutrient: { id: 1109, name: 'Vitamin E (alpha-tocopherol)', unitName: 'mg' }, amount: 1 },
            { nutrient: { id: 1125, name: 'Tocopherol, beta', unitName: 'mg' }, amount: 2 },
            { nutrient: { id: 1126, name: 'Tocopherol, gamma', unitName: 'mg' }, amount: 3 },
            { nutrient: { id: 1127, name: 'Tocopherol, delta', unitName: 'mg' }, amount: 4 },
          ],
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.recalculatedValueIu).toBeCloseTo(3.18, 6);
    expect(decision.updatedNutritionData?.vitamins.vitaminE).toBeCloseTo(
      3.18,
      6,
    );
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminE'],
    ).toMatchObject({
      sourceNutrientId: 'USDA:1109+1125+1126+1127',
      vitaminEForm: 'FEDIAF_TOCOPHEROL_ACTIVITY',
      conversionStatus: 'COMPONENT_ACTIVITY',
      betaTocopherolIu: 0.66,
      gammaTocopherolIu: 0.03,
      deltaTocopherolIu: 1,
    });
    expect(
      decision.updatedNutritionData?.customItems.map((item) => item.name),
    ).toEqual(['Tocotrienol, alpha']);
  });

  it('keeps alpha-only USDA vitamin E as a lower bound with explicit metadata', () => {
    const decision = recalculateReviewedVitaminE({
      id: 'food-2',
      name: 'Vegetable, test',
      displayNameZh: '测试蔬菜',
      dataSource: 'USDA',
      externalId: 'USDA:456',
      status: 'VERIFIED',
      nutritionData: baseProfile,
      sourceRecord: {
        id: 'source-2',
        sourceType: 'USDA',
        sourceKey: 'USDA:456',
        rawData: {
          foodNutrients: [
            { nutrient: { id: 1109, name: 'Vitamin E (alpha-tocopherol)', unitName: 'mg' }, amount: 1 },
          ],
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.recalculatedValueIu).toBeCloseTo(1.49, 6);
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminE'],
    ).toMatchObject({
      sourceNutrientId: 1109,
      vitaminEForm: 'D_ALPHA_TOCOPHEROL',
      conversionStatus: 'ALPHA_ONLY_LOWER_BOUND',
    });
  });

  it('skips profiles without traceable vitamin E source rows', () => {
    const decision = recalculateReviewedVitaminE({
      id: 'food-3',
      name: 'Food without E',
      displayNameZh: '无维E食材',
      dataSource: 'USDA',
      externalId: 'USDA:789',
      status: 'VERIFIED',
      nutritionData: baseProfile,
      sourceRecord: {
        id: 'source-3',
        sourceType: 'USDA',
        sourceKey: 'USDA:789',
        rawData: { foodNutrients: [] },
      },
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reasonCode).toBe('NO_TRACEABLE_VITAMIN_E_SOURCE');
  });
});
