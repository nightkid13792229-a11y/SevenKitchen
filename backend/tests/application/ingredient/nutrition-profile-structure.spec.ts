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
        {
          nutrientCode: 'p',
          nutrientName: '磷',
          value: 120,
          unit: 'mg',
          basisType: 'PER_100_G',
        },
      ],
    } as any);

    expect(normalized?.meta.rawBasisType).toBe('PER_100_G');
    expect(normalized?.macros.crudeProtein).toBe(18);
    expect(normalized?.minerals.calcium).toBe(240);
    expect(normalized?.minerals.phosphorus).toBe(120);
  });

  it('keeps structured profile unchanged when already v2', () => {
    const input = {
      meta: { rawBasisType: 'PER_SERVING', servingWeightG: 0.22 },
      macros: {
        energyKcal: null,
        moisture: null,
        crudeProtein: null,
        crudeFat: null,
        ash: null,
        carbohydrate: null,
        fiber: null,
        solubleFiber: null,
        insolubleFiber: null,
      },
      minerals: {
        calcium: null,
        phosphorus: null,
        potassium: null,
        sodium: null,
        magnesium: null,
        chloride: null,
        iron: null,
        zinc: null,
        copper: null,
        manganese: null,
        selenium: null,
        iodine: 150,
      },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    };

    expect(normalizeNutritionProfile(input as any)).toEqual(input);
  });

  it('fills missing v2 tab defaults for partial structured input', () => {
    const normalized = normalizeNutritionProfile({
      meta: { rawBasisType: 'PER_100_ML' },
      macros: { crudeProtein: 12 },
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any);

    expect(normalized?.meta.rawBasisType).toBe('PER_100_ML');
    expect(normalized?.macros.crudeProtein).toBe(12);
    expect(normalized?.macros.energyKcal).toBeNull();
    expect(normalized?.minerals.calcium).toBeNull();
  });

  it('defaults structured input rawBasisType to PER_100_G when missing or invalid', () => {
    const missingBasisType = normalizeNutritionProfile({
      meta: {},
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any);

    const invalidBasisType = normalizeNutritionProfile({
      meta: { rawBasisType: 'PER_BAG' },
      macros: {},
      minerals: {},
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any);

    expect(missingBasisType?.meta.rawBasisType).toBe('PER_100_G');
    expect(invalidBasisType?.meta.rawBasisType).toBe('PER_100_G');
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

  it('serializes legacy profile through normalization before persistence', () => {
    const payload = denormalizeNutritionProfileForPersistence({
      items: [
        {
          nutrientCode: 'protein',
          nutrientName: '粗蛋白',
          value: 18,
          unit: 'g',
          basisType: 'PER_100_G',
        },
        {
          nutrientCode: 'p',
          nutrientName: '磷',
          value: 120,
          unit: 'mg',
          basisType: 'PER_100_G',
        },
      ],
    } as any);

    expect(payload?.meta.rawBasisType).toBe('PER_100_G');
    expect(payload?.macros.crudeProtein).toBe(18);
    expect(payload?.minerals.phosphorus).toBe(120);
  });
});
