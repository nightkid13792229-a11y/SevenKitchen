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

  it('calculates CFCT vitamin E activity from reviewed tocopherol component rows', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第六版 第一册',
      page: 156,
      row: 12,
      foodName: '豆腐（北豆腐）',
      nutrients: {
        vitaminB3: 0.2,
      },
      unmappedNutrients: {
        cfctVitaminETotalAlphaEquivalentMg: 8.4,
        cfctVitaminEAlphaTocopherolMg: 0.46,
        cfctVitaminEBetaGammaTocopherolMg: 5.02,
        cfctVitaminEDeltaTocopherolMg: 2.92,
      },
    });

    expect(input.normalizedNutrition?.vitamins.vitaminE).toBeCloseTo(1.4656, 6);
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['vitamins.vitaminE'],
    ).toMatchObject({
      vitaminEForm: 'FEDIAF_CONSERVATIVE_TOCOPHEROL_ACTIVITY',
      sourceCompound: 'tocopherol component activity',
      originalValue: 8.4,
      canonicalValue: 1.4656,
      alphaTocopherolMg: 0.46,
      betaGammaTocopherolMg: 5.02,
      deltaTocopherolMg: 2.92,
    });
    expect(
      input.normalizedNutrition?.meta.conversionNotes?.['vitamins.vitaminE'],
    ).toContain('β+γ 合并列按 γ-生育酚活性');
  });

  it('calculates CFCT vitamin A activity from reviewed retinol and carotene rows', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第六版 第一册',
      page: 52,
      row: 8,
      foodName: '红薯',
      nutrients: {
        vitaminA: 999,
      },
      unmappedNutrients: {
        cfctRetinolUg: 30,
        cfctCaroteneUg: 449,
      },
    });

    expect(input.normalizedNutrition?.vitamins.vitaminA).toBeCloseTo(
      474.017,
      6,
    );
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['vitamins.vitaminA'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_VITAMIN_A_COMPONENTS',
      sourceNutrientName: '视黄醇 / 胡萝卜素',
      vitaminAForm: 'FEDIAF_DOG_RETINOL_BETA_CAROTENE_ACTIVITY',
      sourceCompound: 'retinol + beta-carotene',
      canonicalValue: 474.017,
      retinolUg: 30,
      betaCaroteneUg: 449,
      cfctCaroteneInterpretedAsBetaCarotene: true,
    });
    expect(
      input.normalizedNutrition?.meta.conversionNotes?.['vitamins.vitaminA'],
    ).toContain('FEDIAF 2025 dog vitamin A activity');
  });

  it('calculates reviewed CFCT fatty acid percent rows from total fatty acids', () => {
    const input = mapCfctRowToSourceInput({
      volume: '第六版 第一册',
      page: 198,
      row: 10,
      foodName: '豆腐（北豆腐）',
      nutrients: {
        saturatedFattyAcids: 3.8,
        monounsaturatedFattyAcids: 2.9,
        polyunsaturatedFattyAcids: 0.6,
      },
      unmappedNutrients: {
        cfctFatG: 8.1,
        cfctFattyAcidTotalG: 7.5,
        cfctLinoleicAcidPercent: 7.3,
        cfctAlphaLinolenicAcidPercent: 0.1,
        cfctArachidonicAcidPercent: 0.2,
        cfctEpaPercent: 0.3,
        cfctDpaPercent: 0.4,
        cfctDhaPercent: 0.5,
      },
    });

    expect(input.normalizedNutrition?.fattyAcids.linoleicAcid).toBeCloseTo(
      0.5475,
      6,
    );
    expect(input.normalizedNutrition?.fattyAcids.alphaLinolenicAcid).toBeCloseTo(
      0.0075,
      6,
    );
    expect(input.normalizedNutrition?.fattyAcids.arachidonicAcid).toBeCloseTo(
      0.015,
      6,
    );
    expect(input.normalizedNutrition?.fattyAcids.epa).toBeCloseTo(22.5, 6);
    expect(input.normalizedNutrition?.fattyAcids.dpa).toBeCloseTo(30, 6);
    expect(input.normalizedNutrition?.fattyAcids.dha).toBeCloseTo(37.5, 6);
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['fattyAcids.linoleicAcid'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_18_2_PERCENT',
      sourceNutrientName: '18:2 / 总脂肪酸',
      originalValue: 7.3,
      originalUnit: '% of total fatty acids',
      canonicalValue: 0.5475,
      canonicalUnit: 'g',
      cfctFattyAcidTotalG: 7.5,
    });
    expect(
      input.normalizedNutrition?.meta.conversionNotes?.[
        'fattyAcids.linoleicAcid'
      ],
    ).toContain('总脂肪酸 × 百分比 ÷ 100');
    expect(
      input.normalizedNutrition?.meta.sourceForms?.[
        'fattyAcids.alphaLinolenicAcid'
      ],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_18_3_PERCENT',
      sourceNutrientName: '18:3 / 总脂肪酸',
      originalValue: 0.1,
      originalUnit: '% of total fatty acids',
      canonicalValue: 0.0075,
      canonicalUnit: 'g',
      cfctFattyAcidTotalG: 7.5,
    });
    expect(
      input.normalizedNutrition?.meta.sourceForms?.[
        'fattyAcids.arachidonicAcid'
      ],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_20_4_PERCENT',
      sourceNutrientName: '20:4 / 总脂肪酸',
      originalValue: 0.2,
      canonicalValue: 0.015,
      canonicalUnit: 'g',
      cfctFattyAcidTotalG: 7.5,
    });
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['fattyAcids.epa'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_20_5_PERCENT',
      sourceNutrientName: '20:5 / 总脂肪酸',
      originalValue: 0.3,
      canonicalValue: 22.5,
      canonicalUnit: 'mg',
      cfctFattyAcidTotalG: 7.5,
      conversionFactor: 1000,
      conversionFactorUnit: 'MG_PER_G',
    });
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['fattyAcids.dpa'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_22_5_PERCENT',
      sourceNutrientName: '22:5 / 总脂肪酸',
      canonicalValue: 30,
      canonicalUnit: 'mg',
    });
    expect(
      input.normalizedNutrition?.meta.sourceForms?.['fattyAcids.dha'],
    ).toMatchObject({
      sourceNutrientId: 'CFCT_FA_22_6_PERCENT',
      sourceNutrientName: '22:6 / 总脂肪酸',
      canonicalValue: 37.5,
      canonicalUnit: 'mg',
    });
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
