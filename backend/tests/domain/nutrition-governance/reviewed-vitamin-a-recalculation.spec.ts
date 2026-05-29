import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import { recalculateReviewedVitaminA } from '../../../src/domain/nutrition-governance/reviewed-vitamin-a-recalculation';

function baseProfile() {
  const profile = createEmptyNutritionProfile();
  profile.meta.sourceForms = {};
  profile.meta.conversionNotes = {};
  return profile;
}

describe('reviewed vitamin A recalculation', () => {
  it('recalculates a verified USDA profile from retinol and beta-carotene source rows', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 1120;
    profile.meta.sourceForms!['vitamins.vitaminA'] = {
      sourceNutrientId: 1104,
      sourceNutrientName: 'Vitamin A, IU',
      originalValue: 1120,
      originalUnit: 'IU',
      canonicalValue: 1120,
      canonicalUnit: 'IU',
      vitaminAForm: 'USDA_VITAMIN_A_IU',
    };

    const decision = recalculateReviewedVitaminA({
      id: 'food-1',
      name: 'Pumpkin, raw',
      displayNameZh: '南瓜（生）',
      dataSource: 'USDA',
      externalId: 'USDA:168448',
      status: 'VERIFIED',
      nutritionData: profile,
      sourceRecord: {
        id: 'source-1',
        sourceType: 'USDA',
        sourceKey: 'USDA:168448',
        rawData: {
          foodNutrients: [
            { nutrient: { id: 1104, name: 'Vitamin A, IU', unitName: 'IU' }, amount: 1120 },
            { nutrient: { id: 1105, name: 'Retinol', unitName: 'µg' }, amount: 30 },
            { nutrient: { id: 1107, name: 'Carotene, beta', unitName: 'µg' }, amount: 449 },
          ],
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.reasonCode).toBe('COMPONENT_ACTIVITY_RECALCULATED');
    expect(decision.currentValueIu).toBe(1120);
    expect(decision.recalculatedValueIu).toBeCloseTo(474.017, 6);
    expect(decision.updatedNutritionData?.vitamins.vitaminA).toBeCloseTo(
      474.017,
      6,
    );
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      sourceNutrientId: 'USDA:1105+1107',
      sourceNutrientName: 'Vitamin A activity from retinol and beta-carotene',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
      sourceCompound: 'retinol + beta-carotene',
      retinolUg: 30,
      betaCaroteneUg: 449,
    });
  });

  it('marks source-declared IU values as fallback without changing the value', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 900;
    profile.meta.sourceForms!['vitamins.vitaminA'] = {
      sourceNutrientName: '維生素A / 維生素A總量(IU)',
      originalValue: 900,
      originalUnit: 'I.U.',
      canonicalValue: 900,
      canonicalUnit: 'IU',
      vitaminAForm: 'TFDA_VITAMIN_A_TOTAL_IU',
    };

    const decision = recalculateReviewedVitaminA({
      id: 'food-2',
      name: "Quail's egg: hard-boiled",
      displayNameZh: '鹌鹑蛋（水煮，熟）',
      dataSource: 'TFDA',
      externalId: 'TFDA:K0311101',
      status: 'VERIFIED',
      nutritionData: profile,
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.reasonCode).toBe('SOURCE_DECLARED_IU_FALLBACK');
    expect(decision.currentValueIu).toBe(900);
    expect(decision.recalculatedValueIu).toBe(900);
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      vitaminAForm: 'SOURCE_DECLARED_IU',
      sourceCompound: 'source-declared vitamin A activity',
      conversionStatus: 'SOURCE_DECLARED_IU_FALLBACK',
      originalValue: 900,
      originalUnit: 'I.U.',
    });
  });

  it('falls back to USDA source-declared IU when only one component row is available', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 967;
    profile.meta.sourceForms!['vitamins.vitaminA'] = {
      sourceNutrientId: 1104,
      sourceNutrientName: 'Vitamin A, IU',
      originalValue: 967,
      originalUnit: 'IU',
      canonicalValue: 967,
      canonicalUnit: 'IU',
      vitaminAForm: 'USDA_VITAMIN_A_IU',
    };

    const decision = recalculateReviewedVitaminA({
      id: 'food-usda-partial',
      name: 'Cabbage, chinese, cooked',
      displayNameZh: '大白菜/娃娃菜（水煮沥干，不加盐）',
      dataSource: 'USDA',
      externalId: 'USDA:169980',
      status: 'VERIFIED',
      nutritionData: profile,
      sourceRecord: {
        id: 'source-usda-partial',
        sourceType: 'USDA',
        sourceKey: 'USDA:169980',
        rawData: {
          foodNutrients: [
            { nutrient: { id: 1104, name: 'Vitamin A, IU', unitName: 'IU' }, amount: 967 },
            { nutrient: { id: 1105, name: 'Retinol', unitName: 'µg' }, amount: 0 },
          ],
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.reasonCode).toBe('SOURCE_DECLARED_IU_FALLBACK');
    expect(decision.recalculatedValueIu).toBe(967);
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      vitaminAForm: 'SOURCE_DECLARED_IU',
      conversionStatus: 'SOURCE_DECLARED_IU_FALLBACK',
    });
  });

  it('recalculates NZFCD RAE profiles when retinol and beta-carotene components are available', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 213.333333;
    profile.meta.sourceForms!['vitamins.vitaminA'] = {
      sourceNutrientId: 'VITA_RAE',
      sourceNutrientName: 'Vitamin A, retinol activity equivalents',
      originalValue: 64,
      originalUnit: 'µg/100g',
      canonicalValue: 213.333333,
      canonicalUnit: 'IU',
      vitaminAForm: 'RAE',
    };

    const decision = recalculateReviewedVitaminA({
      id: 'food-3',
      name: 'Mussel, green, meat, fresh, raw',
      displayNameZh: '新西兰青口贝肉（生）',
      dataSource: 'NZFCD',
      externalId: 'NZFCD:T1024',
      status: 'VERIFIED',
      nutritionData: profile,
      sourceRecord: {
        id: 'source-3',
        sourceType: 'NZFCD',
        sourceKey: 'NZFCD:T1024',
        rawData: {
          components: [
            { component_code: 'VITA_RAE', component_displayname: 'Vitamin A, FSANZ', num_value: 64, unit_abbr: 'µg/100g' },
            { component_code: 'RETOL', component_displayname: 'Retinol', num_value: 55, unit_abbr: 'µg/100g' },
            { component_code: 'CARTB', component_displayname: 'Beta-carotene', num_value: 94, unit_abbr: 'µg/100g' },
          ],
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.recalculatedValueIu).toBeCloseTo(261.635333, 6);
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      sourceNutrientId: 'NZFCD:RETOL+CARTB',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
      retinolUg: 55,
      betaCaroteneUg: 94,
    });
  });

  it('uses reviewed CFCT retinol and carotene values from source detail', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = null;

    const decision = recalculateReviewedVitaminA({
      id: 'food-4',
      name: '红薯',
      displayNameZh: '红薯/甘薯（生，未加工）',
      dataSource: 'CFCT',
      externalId: 'CFCT:043221',
      status: 'VERIFIED',
      nutritionData: profile,
      sourceRecord: {
        id: 'source-4',
        sourceType: 'CFCT',
        sourceKey: 'CFCT:043221:CHINANUTRI:419',
        sourceDetail: {
          unmappedNutrients: {
            retinolUg: 30,
            caroteneUg: 449,
          },
        },
      },
    });

    expect(decision.action).toBe('UPDATE');
    expect(decision.recalculatedValueIu).toBeCloseTo(474.017, 6);
    expect(
      decision.updatedNutritionData?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_VITAMIN_A_COMPONENTS',
      sourceNutrientName: '视黄醇 / 胡萝卜素',
      cfctCaroteneInterpretedAsBetaCarotene: true,
    });
  });

  it('skips verified profiles without traceable vitamin A source evidence', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 123;

    const decision = recalculateReviewedVitaminA({
      id: 'food-5',
      name: 'Manual food',
      displayNameZh: '手工档案',
      dataSource: 'MANUAL',
      externalId: null,
      status: 'VERIFIED',
      nutritionData: profile,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reasonCode).toBe('NO_TRACEABLE_VITAMIN_A_SOURCE');
    expect(decision.updatedNutritionData).toBeNull();
  });

  it('skips profiles that have not been verified', () => {
    const profile = baseProfile();
    profile.vitamins.vitaminA = 100;

    const decision = recalculateReviewedVitaminA({
      id: 'food-6',
      name: 'Pending food',
      displayNameZh: '未审核档案',
      dataSource: 'USDA',
      externalId: 'USDA:1',
      status: 'PENDING',
      nutritionData: profile,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reasonCode).toBe('NOT_VERIFIED');
  });
});
