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

  it('handles uppercase microgram aliases when converting into catalog units', () => {
    const result = normalizeExtractedSupplementImport(
      {
        ingredient: {
          name: '海藻碘片',
          brand: 'Ocean',
          productSpec: '90片',
          baseUnit: 'PCS',
          unitDisplayLabel: '片',
          addTiming: 'BEFORE_MEAL',
          productionLossRate: 1.05,
          categoryType: 'MINERAL',
        },
        nutrition: {
          rawBasisType: 'PER_SERVING',
          items: [
            { name: 'Iodine', value: 150, unit: 'MCG', confidence: 0.99 },
          ],
        },
      } as any,
      [],
    );

    expect(result.nutritionProfile.minerals.iodine).toBe(150);
    expect(result.rejectedNutritionItems).toEqual([]);
  });

  it('accepts IU values when the catalog unit is IU', () => {
    const result = normalizeExtractedSupplementImport(
      {
        ingredient: {
          name: '维生素D滴剂',
          brand: 'Sun',
          productSpec: '30ml',
          baseUnit: 'ML',
          unitDisplayLabel: 'ml',
          addTiming: 'BEFORE_MEAL',
          productionLossRate: 1.05,
          categoryType: 'VITAMIN',
        },
        nutrition: {
          rawBasisType: 'PER_SERVING',
          items: [
            { name: 'vitamin_d3', value: 400, unit: 'IU', confidence: 0.99 },
          ],
        },
      } as any,
      [],
    );

    expect(result.nutritionProfile.vitamins.vitaminD).toBe(400);
    expect(result.rejectedNutritionItems).toEqual([]);
  });

  it('rejects IU values for mass-based catalog fields', () => {
    const result = normalizeExtractedSupplementImport(
      {
        ingredient: {
          name: '海藻碘片',
          brand: 'Ocean',
          productSpec: '90片',
          baseUnit: 'PCS',
          unitDisplayLabel: '片',
          addTiming: 'BEFORE_MEAL',
          productionLossRate: 1.05,
          categoryType: 'MINERAL',
        },
        nutrition: {
          rawBasisType: 'PER_SERVING',
          items: [{ name: 'Iodine', value: 400, unit: 'IU', confidence: 0.99 }],
        },
      } as any,
      [],
    );

    expect(result.nutritionProfile.minerals.iodine).toBeNull();
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

  it('blocks update resolution when likely duplicate target is missing or not a candidate', () => {
    const missingTarget = validateSupplementImportForConfirm({
      ...validDraft(),
      duplicateResolution: { action: 'UPDATE_EXISTING' },
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'LIKELY' }],
    } as any);
    const nonCandidateTarget = validateSupplementImportForConfirm({
      ...validDraft(),
      duplicateResolution: {
        action: 'UPDATE_EXISTING',
        ingredientId: 'ing-2',
      },
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'LIKELY' }],
    } as any);

    expect(missingTarget.canConfirm).toBe(false);
    expect(nonCandidateTarget.canConfirm).toBe(false);
    expect(missingTarget.errors.map((item) => item.code)).toContain(
      'DUPLICATE_RESOLUTION_REQUIRED',
    );
    expect(nonCandidateTarget.errors.map((item) => item.code)).toContain(
      'DUPLICATE_RESOLUTION_REQUIRED',
    );
  });

  it('blocks update-existing resolution when no server duplicate candidate authorizes the target', () => {
    const noCandidates = validateSupplementImportForConfirm({
      ...validDraft(),
      duplicateResolution: {
        action: 'UPDATE_EXISTING',
        ingredientId: 'forged-supplement-id',
      },
      duplicateCandidates: [],
    } as any);
    const possibleNonCandidate = validateSupplementImportForConfirm({
      ...validDraft(),
      duplicateResolution: {
        action: 'UPDATE_EXISTING',
        ingredientId: 'forged-supplement-id',
      },
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'POSSIBLE' }],
    } as any);

    expect(noCandidates.canConfirm).toBe(false);
    expect(possibleNonCandidate.canConfirm).toBe(false);
    expect(noCandidates.errors.map((item) => item.code)).toContain(
      'DUPLICATE_RESOLUTION_REQUIRED',
    );
    expect(possibleNonCandidate.errors.map((item) => item.code)).toContain(
      'DUPLICATE_RESOLUTION_REQUIRED',
    );
  });

  it('requires production loss rate to be a multiplier of at least one', () => {
    const validation = validateSupplementImportForConfirm({
      ...validDraft(),
      ingredient: {
        ...validDraft().ingredient,
        productionLossRate: 0.03,
      },
    } as any);

    expect(validation.canConfirm).toBe(false);
    expect(validation.errors.map((item) => item.code)).toContain(
      'PRODUCTION_LOSS_RATE_REQUIRED',
    );
  });

  it('allows create-new resolution for likely duplicates', () => {
    const validation = validateSupplementImportForConfirm({
      ...validDraft(),
      duplicateResolution: { action: 'CREATE_NEW' },
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'LIKELY' }],
    } as any);

    expect(validation.canConfirm).toBe(true);
    expect(validation.errors).toEqual([]);
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

  it('does not classify exact duplicates without brand and product spec', () => {
    const candidates = classifySupplementImportDuplicates(
      {
        name: '海藻碘片',
        brand: null,
        productSpec: null,
      },
      [
        {
          id: 'ing-1',
          name: ' 海藻碘片 ',
          brand: null,
          productModel: null,
        },
      ] as any,
    );

    expect(candidates[0]).toMatchObject({
      ingredientId: 'ing-1',
      matchType: 'POSSIBLE',
    });
  });
});

function validDraft() {
  return {
    ingredient: {
      name: '海藻碘片',
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
    duplicateCandidates: [],
    riskFlags: [],
  };
}
