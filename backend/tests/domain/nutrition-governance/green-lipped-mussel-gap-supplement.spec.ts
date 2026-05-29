import {
  applyAcceptedGreenLippedMusselSupplements,
  buildGreenLippedMusselSupplementPlan,
  type GreenLippedMusselProfileSnapshot,
  type SupplementalSourceSnapshot,
} from '../../../src/domain/nutrition-governance/green-lipped-mussel-gap-supplement';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';

const primaryProfile: GreenLippedMusselProfileSnapshot = {
  profileId: 'NZFCD:T1024',
  role: 'PRIMARY',
  stateLabel: '生',
  foodName: 'Mussel, green, meat, fresh, raw',
  values: {
    'vitamins.vitaminB1': 0,
    'aminoAcids.tryptophan': 0.13,
  },
};

const usdaRaw: SupplementalSourceSnapshot = {
  sourceKey: 'USDA:174216',
  sourceType: 'USDA',
  foodName: 'Mollusks, mussel, blue, raw',
  scientificName: 'Mytilus edulis',
  stateLabel: '生',
  compatibility: 'APPROXIMATE_SPECIES',
  values: {
    'vitamins.vitaminB5': 0.5,
    'vitamins.choline': 65,
    'aminoAcids.lysine': 0.889,
  },
};

describe('green-lipped mussel gap supplement planning', () => {
  it('does not treat zero-valued nutrients as missing', () => {
    const plan = buildGreenLippedMusselSupplementPlan({
      profiles: [primaryProfile],
      supplementalSources: [usdaRaw],
    });

    expect(
      plan.rows.find((row) => row.fieldPath === 'vitamins.vitaminB1'),
    ).toBeUndefined();
  });

  it('classifies blue mussel nutrient values as approximate candidates only', () => {
    const plan = buildGreenLippedMusselSupplementPlan({
      profiles: [primaryProfile],
      supplementalSources: [usdaRaw],
    });

    expect(
      plan.rows.find((row) => row.fieldPath === 'vitamins.vitaminB5'),
    ).toMatchObject({
      profileId: 'NZFCD:T1024',
      fieldPath: 'vitamins.vitaminB5',
      recommendedAction: 'REVIEW_APPROXIMATE_SOURCE',
      bestSourceKey: 'USDA:174216',
      compatibility: 'APPROXIMATE_SPECIES',
    });
  });

  it('keeps fields without source values unresolved', () => {
    const plan = buildGreenLippedMusselSupplementPlan({
      profiles: [primaryProfile],
      supplementalSources: [usdaRaw],
    });

    expect(
      plan.rows.find((row) => row.fieldPath === 'minerals.chloride'),
    ).toMatchObject({
      recommendedAction: 'NO_TRUSTED_SOURCE_FOUND',
      bestSourceKey: null,
    });
    expect(
      plan.rows.find((row) => row.fieldPath === 'vitamins.vitaminB7'),
    ).toMatchObject({
      recommendedAction: 'NO_TRUSTED_SOURCE_FOUND',
      bestSourceKey: null,
    });
  });

  it('applies accepted approximate sources only to missing fields and records field-level provenance', () => {
    const profile = createEmptyNutritionProfile();
    profile.meta.sourceType = 'NZFCD';
    profile.meta.sourceCode = 'NZFCD_FOODFILES';
    profile.meta.externalId = 'T1024';
    profile.vitamins.vitaminB1 = 0;
    profile.aminoAcids.tryptophan = 0.13;

    const plan = buildGreenLippedMusselSupplementPlan({
      profiles: [primaryProfile],
      supplementalSources: [usdaRaw],
    });

    const result = applyAcceptedGreenLippedMusselSupplements({
      profile,
      rows: plan.rows,
      acceptedActions: ['REVIEW_APPROXIMATE_SOURCE'],
    });

    expect(result.appliedRows.map((row) => row.fieldPath)).toEqual([
      'vitamins.vitaminB5',
      'vitamins.choline',
      'aminoAcids.lysine',
    ]);
    expect(result.profile.vitamins.vitaminB1).toBe(0);
    expect(result.profile.vitamins.vitaminB5).toBe(0.5);
    expect(result.profile.vitamins.choline).toBe(65);
    expect(result.profile.aminoAcids.lysine).toBe(0.889);
    expect(result.profile.aminoAcids.tryptophan).toBe(0.13);
    expect(result.profile.meta.sourceType).toBe('NZFCD');
    expect(
      result.profile.meta.fieldSources?.['vitamins.vitaminB5'],
    ).toMatchObject({
      sourceRole: 'FIELD_SUPPLEMENT',
      sourceType: 'USDA',
      sourceCode: 'USDA_FDC',
      externalId: '174216',
      sourceTitle: 'Mollusks, mussel, blue, raw',
      compatibility: 'APPROXIMATE_SPECIES',
      canonicalValue: 0.5,
      canonicalUnit: 'mg',
      confidenceLevel: 'MEDIUM',
    });
    expect(
      result.profile.meta.fieldSources?.['vitamins.vitaminB5']?.noteZh,
    ).toBe(
      '近似补源：USDA 174216 blue/common mussel，非绿唇贻贝，仅供计算参考。',
    );
    expect(result.profile.meta.versionNote).toBe(
      '主体来源：NZFCD；缺失字段用 USDA blue/common mussel 近似补源，详见字段来源标签；仅供配方计算参考。氯、B7、牛磺酸等仍为空。',
    );
    expect(result.profile.meta.versionNote?.length).toBeLessThanOrEqual(200);
  });
});
