import {
  hasLegacyProcurementFootprint,
  planProcurementSkuBackfill,
  type LegacyIngredientProcurementSnapshot,
} from '../../prisma/backfill-procurement-sku-defaults.shared';

const createIngredient = (
  overrides: Partial<LegacyIngredientProcurementSnapshot> = {},
): LegacyIngredientProcurementSnapshot => ({
  id: 'ingredient-1',
  name: '猪里脊',
  baseUnit: 'G',
  brand: null,
  productModel: null,
  purchaseChannel: null,
  unitDisplayLabel: '克',
  purchaseUnit: 'G',
  purchaseToBaseRatio: 1,
  currentPricePerPurchaseUnit: 0,
  effectivePricePerPurchaseUnit: null,
  safetyStock: null,
  reorderPoint: null,
  targetStock: null,
  procurementSkus: [],
  ...overrides,
});

describe('procurement sku backfill planning', () => {
  it('skips ingredients without meaningful legacy procurement fields', () => {
    const ingredient = createIngredient();

    expect(hasLegacyProcurementFootprint(ingredient)).toBe(false);
    expect(planProcurementSkuBackfill(ingredient)).toEqual({
      action: 'skip',
      ingredientId: 'ingredient-1',
      reason: 'no legacy procurement footprint',
    });
  });

  it('creates a default procurement sku when none exist', () => {
    const ingredient = createIngredient({
      purchaseChannel: '山姆',
      productModel: '2kg/包',
      purchaseUnit: '包',
      purchaseToBaseRatio: 2,
      currentPricePerPurchaseUnit: 88,
      effectivePricePerPurchaseUnit: 92,
      safetyStock: 10,
      reorderPoint: 20,
      targetStock: 30,
    });

    const result = planProcurementSkuBackfill(ingredient);

    expect(result).toEqual(
      expect.objectContaining({
        action: 'create',
        ingredientId: 'ingredient-1',
        payload: expect.objectContaining({
          name: '猪里脊 2kg/包',
          purchaseChannel: '山姆',
          purchaseUnit: '包',
          purchaseToBaseRatio: 2,
          currentPurchasePrice: 88,
          referencePurchasePrice: 92,
          isDefault: true,
          safetyStock: 10,
          reorderPoint: 20,
          targetStock: 30,
        }),
      }),
    );
  });

  it('fills missing fields on a single existing procurement sku without overwriting populated values', () => {
    const ingredient = createIngredient({
      purchaseChannel: '山姆',
      productModel: '2kg/包',
      purchaseUnit: '包',
      purchaseToBaseRatio: 2,
      currentPricePerPurchaseUnit: 88,
      procurementSkus: [
        {
          id: 'sku-1',
          name: '猪里脊',
          purchaseChannel: null,
          productModel: null,
          purchaseUnit: null,
          purchaseToBaseRatio: null,
          currentPurchasePrice: null,
          referencePurchasePrice: null,
          referencePricePerPurchaseUnit: null,
          notes: null,
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const result = planProcurementSkuBackfill(ingredient);

    expect(result).toEqual({
      action: 'update',
      ingredientId: 'ingredient-1',
      skuId: 'sku-1',
      reason:
        'fill missing fields on the single procurement sku and mark as default',
      payload: {
        productModel: '2kg/包',
        purchaseChannel: '山姆',
        purchaseUnit: '包',
        purchaseToBaseRatio: 2,
        currentPurchasePrice: 88,
        referencePurchasePrice: 88,
        referencePricePerPurchaseUnit: 88,
        notes: 'Backfilled from legacy ingredient procurement fields',
        isDefault: true,
      },
    });
  });

  it('chooses a unique matching procurement sku when multiple skus exist and no default is set', () => {
    const ingredient = createIngredient({
      purchaseChannel: '盒马',
      productModel: '5kg/袋',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 5,
      currentPricePerPurchaseUnit: 120,
      procurementSkus: [
        {
          id: 'sku-sams',
          name: '山姆猪里脊 2kg/包',
          purchaseChannel: '山姆',
          productModel: '2kg/包',
          isDefault: false,
          isActive: true,
        },
        {
          id: 'sku-hema',
          name: '盒马猪里脊 5kg/袋',
          purchaseChannel: '盒马',
          productModel: '5kg/袋',
          isDefault: false,
          isActive: true,
        },
      ],
    });

    const result = planProcurementSkuBackfill(ingredient);

    expect(result).toEqual(
      expect.objectContaining({
        action: 'update',
        skuId: 'sku-hema',
        reason:
          'match legacy fields to an existing procurement sku and mark it as default',
        payload: expect.objectContaining({
          isDefault: true,
          purchaseUnit: '袋',
          purchaseToBaseRatio: 5,
        }),
      }),
    );
  });

  it('skips ambiguous multi-sku ingredients when no safe default can be inferred', () => {
    const ingredient = createIngredient({
      purchaseChannel: '山姆',
      productModel: null,
      purchaseUnit: '袋',
      currentPricePerPurchaseUnit: 88,
      procurementSkus: [
        {
          id: 'sku-1',
          name: '山姆猪里脊 2kg/包',
          purchaseChannel: '山姆',
          productModel: '2kg/包',
          isDefault: false,
          isActive: true,
        },
        {
          id: 'sku-2',
          name: '山姆猪里脊 5kg/袋',
          purchaseChannel: '山姆',
          productModel: '5kg/袋',
          isDefault: false,
          isActive: true,
        },
      ],
    });

    expect(planProcurementSkuBackfill(ingredient)).toEqual({
      action: 'skip',
      ingredientId: 'ingredient-1',
      reason:
        'multiple procurement skus exist and no safe default candidate could be inferred',
    });
  });
});
