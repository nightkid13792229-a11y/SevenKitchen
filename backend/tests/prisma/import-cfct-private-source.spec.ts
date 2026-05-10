import { mapCfctRowToSourceInput } from '../../prisma/import-cfct-private-source';
import { validateReviewedCfctRows } from '../../prisma/import-cfct-private-source';

describe('mapCfctRowToSourceInput', () => {
  it('maps a reviewed CFCT row into a nutrition source input', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第六版 第一册',
      page: 42,
      row: 7,
      foodName: '鸡胸肉',
      category: '畜禽肉类',
      nutrients: {
        energyKcal: 133,
        crudeProtein: 24.6,
        solubleFiber: 1.2,
        iodine: 4,
        phosphorus: 196,
      },
    });

    expect(input).toMatchObject({
      sourceType: 'CFCT',
      externalId: '第六版 第一册:p42:r7',
      sourceTitle: '中国食物成分表 第六版 第一册',
      foodName: '鸡胸肉',
      category: '畜禽肉类',
      sourceDetail: {
        volume: '第六版 第一册',
        page: 42,
        row: 7,
        privateLocalSource: true,
        provider: '中国食物成分表',
        sourceProvider: '中国食物成分表',
      },
    });
    expect(input.normalizedNutrition?.meta).toMatchObject({
      rawBasisType: 'PER_100_G',
      sourceType: 'CFCT',
      sourceProvider: '中国食物成分表',
      confidenceLevel: 'MEDIUM',
    });
    expect(input.normalizedNutrition?.macros.energyKcal).toBe(133);
    expect(input.normalizedNutrition?.macros.crudeProtein).toBe(24.6);
    expect(input.normalizedNutrition?.macros.solubleFiber).toBe(1.2);
    expect(input.normalizedNutrition?.minerals.iodine).toBe(4);
    expect(input.normalizedNutrition?.minerals.phosphorus).toBe(196);
  });

  it('rejects rows without at least one finite mapped nutrient', () => {
    expect(() =>
      validateReviewedCfctRows([
        {
          volume: '第六版 第一册',
          page: 42,
          row: 7,
          foodName: '鸡胸肉',
          nutrients: {},
        },
      ]),
    ).toThrow('at least one mapped nutrient');
  });
});
