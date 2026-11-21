import {
  emptySupplementDraftPayload,
  normalizeSupplementDraftPayload,
  type SupplementDraftPayload,
} from '../../../src/application/ingredient-creation/supplement-draft.types';
import { buildSupplementProfile } from '../../../src/application/ingredient-creation/supplement-draft-profile';

/** meta 里 amountUnitLabel / servingUnitLabel 没在 NutritionMeta 声明，测试单独取。 */
function metaExtras(profile: ReturnType<typeof buildSupplementProfile>) {
  return profile.meta as unknown as {
    amountUnitLabel?: string;
    servingUnitLabel?: string;
    sourceType?: string;
  };
}

describe('buildSupplementProfile', () => {
  it('PCS：每份 2 粒，EPA 650 → 每粒 325，基准 PER_1_PCS', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
        servingUnitsPerDose: 2,
      },
      nutrition: { servingNutrients: { 'fattyAcids.epa': 650 } },
    });

    const profile = buildSupplementProfile(payload);

    expect(profile.meta.rawBasisType).toBe('PER_1_PCS');
    expect(profile.fattyAcids.epa).toBe(325);
    expect(metaExtras(profile).amountUnitLabel).toBe('粒');
    expect(metaExtras(profile).servingUnitLabel).toBe('粒');
    expect(metaExtras(profile).sourceType).toBe('SUPPLEMENT_LABEL');
  });

  it('粉剂：每份 0.9 g，牛磺酸 0.875 → 每克约 0.972222，基准 PER_1_G', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        servingUnitsPerDose: 0.9,
      },
      nutrition: { servingNutrients: { 'aminoAcids.taurine': 0.875 } },
    });

    const profile = buildSupplementProfile(payload);

    expect(profile.meta.rawBasisType).toBe('PER_1_G');
    expect(profile.aminoAcids.taurine).toBeCloseTo(0.972222, 5);
  });

  it('液体：每份 2.5 ml，锌 12.5 → 每毫升 5，基准 PER_1_ML', () => {
    const payload = normalizeSupplementDraftPayload({
      basic: {
        baseUnit: 'ML',
        unitDisplayLabel: 'ml',
        servingUnitsPerDose: 2.5,
      },
      nutrition: { servingNutrients: { 'minerals.zinc': 12.5 } },
    });

    const profile = buildSupplementProfile(payload);

    expect(profile.meta.rawBasisType).toBe('PER_1_ML');
    expect(profile.minerals.zinc).toBe(5);
  });

  const invalidServingCases: Array<[string, number | null]> = [
    ['缺失', null],
    ['为 0', 0],
    ['为负数', -2],
  ];

  it.each(invalidServingCases)(
    '每份量%s → 不写营养值也不抛错',
    (_label, servingUnitsPerDose) => {
      const payload = normalizeSupplementDraftPayload({
        basic: {
          baseUnit: 'G',
          unitDisplayLabel: 'g',
          servingUnitsPerDose,
        },
        nutrition: { servingNutrients: { 'aminoAcids.taurine': 0.875 } },
      });

      const profile = buildSupplementProfile(payload);

      expect(profile.meta.rawBasisType).toBe('PER_1_G');
      expect(profile.aminoAcids.taurine).toBeNull();
    },
  );

  it('目录外字段与非法数值跳过，其余照常折算', () => {
    const empty = emptySupplementDraftPayload();
    const payload: SupplementDraftPayload = {
      ...empty,
      basic: {
        ...empty.basic,
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        servingUnitsPerDose: 2,
      },
      nutrition: {
        ...empty.nutrition,
        servingNutrients: {
          'bogus.field': 3,
          'minerals.zinc': -1,
          'aminoAcids.taurine': Number.NaN,
          'minerals.iron': 10,
        },
      },
    };

    const profile = buildSupplementProfile(payload);

    expect(profile.minerals.iron).toBe(5);
    expect(profile.minerals.zinc).toBeNull();
    expect(profile.aminoAcids.taurine).toBeNull();
  });
});
