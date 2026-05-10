import { mapCfctRowToSourceInput } from '../../prisma/import-cfct-private-source';

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
    expect(input.normalizedNutrition?.minerals.phosphorus).toBe(196);
  });
});
