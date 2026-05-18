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
        vitaminB3: 0.2,
        vitaminC: 3,
      },
      sourceSegments: [
        {
          kind: 'PRIMARY',
          page: 42,
          row: 7,
          rawOcrText: '鸡胸肉 133 73.2 24.6',
          ocrConfidence: 0.94,
        },
      ],
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
        sourceSegments: [
          {
            kind: 'PRIMARY',
            page: 42,
            row: 7,
            rawOcrText: '鸡胸肉 133 73.2 24.6',
            ocrConfidence: 0.94,
          },
        ],
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
    expect(input.normalizedNutrition?.vitamins.vitaminB3).toBe(0.2);
    expect(input.normalizedNutrition?.vitamins.vitaminC).toBe(3);
  });

  it('maps reviewed CFCT vitamin, fatty acid, and amino acid fields into profile tabs', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第六版 第一册',
      page: 156,
      row: 4,
      foodName: '小麦粉（代表值）',
      nutrients: {
        choline: 46.9,
        vitaminB5: 0.71,
        vitaminB7: 2.3,
        saturatedFattyAcids: 0.5,
        monounsaturatedFattyAcids: 0.3,
        polyunsaturatedFattyAcids: 0.4,
        dha: 1800,
        epa: 120,
        lysine: 0.271,
        leucine: 0.837,
        methionine: 0.174,
      },
    });

    expect(input.normalizedNutrition?.vitamins.choline).toBe(46.9);
    expect(input.normalizedNutrition?.vitamins.vitaminB5).toBe(0.71);
    expect(input.normalizedNutrition?.vitamins.vitaminB7).toBe(2.3);
    expect(input.normalizedNutrition?.fattyAcids.saturatedFattyAcids).toBe(0.5);
    expect(input.normalizedNutrition?.fattyAcids.monounsaturatedFattyAcids).toBe(0.3);
    expect(input.normalizedNutrition?.fattyAcids.polyunsaturatedFattyAcids).toBe(0.4);
    expect(input.normalizedNutrition?.fattyAcids.dha).toBe(1800);
    expect(input.normalizedNutrition?.fattyAcids.epa).toBe(120);
    expect(input.normalizedNutrition?.aminoAcids.lysine).toBe(0.271);
    expect(input.normalizedNutrition?.aminoAcids.leucine).toBe(0.837);
    expect(input.normalizedNutrition?.aminoAcids.methionine).toBe(0.174);
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

  it('rejects CFCT rows that still need OCR review', () => {
    expect(() =>
      validateReviewedCfctRows([
        {
          volume: '第六版 第一册',
          page: 42,
          row: 7,
          foodName: '鸡胸肉',
          nutrients: {
            energyKcal: 133,
          },
          reviewStatus: 'NEEDS_REVIEW',
          qualityFlags: ['CONTINUATION_INCOMPLETE'],
        },
      ]),
    ).toThrow('must be reviewed before import');
  });
});
