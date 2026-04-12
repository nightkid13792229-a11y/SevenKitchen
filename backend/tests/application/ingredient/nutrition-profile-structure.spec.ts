import {
  denormalizeNutritionProfileForPersistence,
  normalizeNutritionProfile,
} from '../../../src/domain/ingredient/nutrition-profile.utils';

describe('nutrition profile structure', () => {
  it('normalizes legacy items[] payload into grouped profile', () => {
    const normalized = normalizeNutritionProfile({
      items: [
        {
          nutrientCode: 'protein',
          nutrientName: '粗蛋白',
          value: 18,
          unit: 'g',
          basisType: 'PER_100_G',
        },
        {
          nutrientCode: 'calcium',
          nutrientName: '钙',
          value: 240,
          unit: 'mg',
          basisType: 'PER_100_G',
        },
      ],
    } as any);

    expect(normalized?.meta.rawBasisType).toBe('PER_100_G');
    expect(normalized?.macros.crudeProtein).toBe(18);
    expect(normalized?.minerals.calcium).toBe(240);
  });

  it('keeps structured profile unchanged when already v2', () => {
    const input = {
      meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.22 },
      macros: { crudeProtein: null },
      minerals: { iodine: 150 },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    };

    expect(normalizeNutritionProfile(input as any)).toEqual(input);
  });

  it('serializes normalized profile back to persistence shape', () => {
    const payload = denormalizeNutritionProfileForPersistence({
      meta: { rawBasisType: 'PER_100_G' },
      macros: { crudeProtein: 18 },
      minerals: { calcium: 240 },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any);

    expect(payload?.meta.rawBasisType).toBe('PER_100_G');
    expect(payload?.macros.crudeProtein).toBe(18);
  });
});
