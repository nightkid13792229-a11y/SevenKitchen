import {
  classifySupplementImportDuplicates,
  normalizeExtractedSupplementImport,
  validateSupplementImportForConfirm,
} from '../../../src/application/supplement-import/supplement-import-normalizer';

describe('supplement import normalizer', () => {
  it('maps nutrient aliases and converts mass units into catalog units', () => {
    const result = normalizeExtractedSupplementImport(
      {
        ingredient: {
          name: '海藻碘片',
          brand: 'Ocean',
          productSpec: '90片',
          baseUnit: 'PCS',
          unitDisplayLabel: '片',
          weightG: 0.5,
          addTiming: 'BEFORE_MEAL',
          productionLossRate: 1.05,
          categoryType: 'MINERAL',
        },
        nutrition: {
          rawBasisType: 'PER_SERVING',
          servingWeightG: 0.5,
          items: [
            { name: 'Iodine', value: 0.15, unit: 'mg', confidence: 0.98 },
            { name: 'DHA', value: 0.12, unit: 'g', confidence: 0.97 },
          ],
        },
      } as any,
      ['https://cdn.example.com/label.jpg'],
    );

    expect(result.ingredient.name).toBe('海藻碘片');
    expect(result.nutritionProfile.minerals.iodine).toBe(150);
    expect(result.nutritionProfile.fattyAcids.dha).toBe(120);
    expect(result.rejectedNutritionItems).toEqual([]);
  });

  it('rejects unmatched nutrients from core nutrition fields', () => {
    const result = normalizeExtractedSupplementImport(
      {
        ingredient: {
          name: '草本粉',
          brand: 'Herb',
          productSpec: '100g',
          baseUnit: 'G',
          unitDisplayLabel: 'g',
          addTiming: 'BEFORE_MIXING',
          productionLossRate: 1.05,
          categoryType: 'FUNCTIONAL',
        },
        nutrition: {
          rawBasisType: 'PER_100_G',
          items: [
            { name: '神秘活性物', value: 20, unit: 'mg', confidence: 0.99 },
          ],
        },
      } as any,
      [],
    );

    expect(result.nutritionProfile.customItems).toEqual([]);
    expect(result.rejectedNutritionItems[0].reason).toContain(
      '无法匹配系统营养字段',
    );
  });

  it('blocks confirmation when key fields or duplicate resolution are missing', () => {
    const validation = validateSupplementImportForConfirm({
      ingredient: {
        name: '',
        type: 'SUPPLEMENT',
        brand: 'Ocean',
        productSpec: '90片',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        addTiming: 'BEFORE_MEAL',
        productionLossRate: 1.05,
        categoryType: 'MINERAL',
      },
      nutritionProfile: {
        meta: { rawBasisType: 'PER_SERVING', sourceType: 'LABEL' },
        macros: {},
        minerals: { iodine: 150 },
        vitamins: {},
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      },
      duplicateResolution: null,
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'EXACT' }],
    } as any);

    expect(validation.canConfirm).toBe(false);
    expect(validation.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'INGREDIENT_NAME_REQUIRED',
        'DUPLICATE_RESOLUTION_REQUIRED',
      ]),
    );
  });

  it('classifies exact duplicate by name brand and product spec', () => {
    const candidates = classifySupplementImportDuplicates(
      {
        name: '海藻碘片',
        brand: 'Ocean',
        productSpec: '90片',
      },
      [
        {
          id: 'ing-1',
          name: ' 海藻碘片 ',
          brand: 'ocean',
          productModel: '90 片',
        },
      ] as any,
    );

    expect(candidates[0]).toMatchObject({
      ingredientId: 'ing-1',
      matchType: 'EXACT',
    });
  });
});
