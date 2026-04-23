import { OrderSourcePlanService } from 'src/order/order-source-plan.service';
import type {
  ProcurementSkuService,
  ProcurementSkuSummary,
} from 'src/ingredient/procurement-sku.service';
import { Ingredient } from 'src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from 'src/domain/ingredient/enums';

describe('OrderSourcePlanService', () => {
  const procurementSkuService = {
    batchFindActive: jest.fn(),
  } as unknown as jest.Mocked<Pick<ProcurementSkuService, 'batchFindActive'>>;

  const service = new OrderSourcePlanService(
    procurementSkuService as unknown as ProcurementSkuService,
  );

  const createFoodIngredient = (id = 'food-1') =>
    new Ingredient(
      id,
      '鸡胸肉',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      true,
      true,
      '原品牌',
      '原规格',
      '山姆会员店',
      null,
      BaseUnit.G,
      'g',
      'kg',
      1000,
      50,
      null,
      null,
      null,
      3,
      6,
      12,
      { edible_yield_rate: 0.8 },
      { protein_g: 23 } as any,
    );

  const createSupplementIngredient = () =>
    new Ingredient(
      'supplement-1',
      '维生素E',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.STOCK_REPLENISHMENT,
      true,
      true,
      '原补剂品牌',
      '原补剂规格',
      '京东',
      null,
      BaseUnit.G,
      'g',
      '瓶',
      100,
      80,
      null,
      null,
      null,
      null,
      null,
      null,
      { active_nutrients: {} } as any,
      null,
    );

  const sku = (
    overrides: Partial<ProcurementSkuSummary>,
  ): ProcurementSkuSummary => ({
    id: 'sku-1',
    ingredientId: 'food-1',
    name: 'SKU 鸡胸肉',
    brand: 'SKU 品牌',
    productModel: '2kg/包',
    purchaseChannel: '山姆会员店',
    supplierName: null,
    purchaseUnit: 'kg',
    purchaseToBaseRatio: 1000,
    currentPurchasePrice: 60,
    referencePurchasePrice: null,
    referencePricePerPurchaseUnit: null,
    notes: null,
    isDefault: false,
    isActive: true,
    sortOrder: 0,
    safetyStock: 2,
    reorderPoint: 5,
    targetStock: 10,
    ...overrides,
  });

  const withSourceTier = (
    procurementSku: ProcurementSkuSummary,
    sourceTier: 'ORGANIC' | 'MARKET_PREMIUM' | 'WHOLESALE' | null,
  ) =>
    ({
      ...procurementSku,
      sourceTier,
    }) as ProcurementSkuSummary & {
      sourceTier: 'ORGANIC' | 'MARKET_PREMIUM' | 'WHOLESALE' | null;
    };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects the tagged food SKU for the selected source plan instead of guessing from channel text', async () => {
    const ingredient = createFoodIngredient();
    const untaggedDefaultSku = withSourceTier(
      sku({
        id: 'sku-default',
        name: '默认鸡胸肉',
        brand: '默认品牌',
        productModel: '5kg/箱',
        purchaseChannel: '普通零售',
        currentPurchasePrice: 70,
        isDefault: true,
      }),
      null,
    );
    const wholesaleSku = withSourceTier(
      sku({
        id: 'sku-wholesale',
        name: '批发鸡胸肉',
        brand: '批发品牌',
        productModel: '10kg/箱',
        purchaseChannel: '普通渠道',
        currentPurchasePrice: 42,
        isDefault: false,
      }),
      'WHOLESALE',
    );
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [untaggedDefaultSku, wholesaleSku],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect(procurementSkuService.batchFindActive).toHaveBeenCalledWith([
      ingredient.id,
    ]);
    expect(selected).not.toBe(ingredient);
    expect(selected.name).toBe(ingredient.name);
    expect(selected.nutritionProfile).toBe(ingredient.nutritionProfile);
    expect(selected.brand).toBe('批发品牌');
    expect(selected.productModel).toBe('10kg/箱');
    expect(selected.purchaseChannel).toBe('普通渠道');
    expect(selected.unitDisplayLabel).toBe(ingredient.unitDisplayLabel);
    expect(selected.currentPricePerPurchaseUnit).toBe(42);
    expect(selected.effectivePricePerPurchaseUnit).toBe(42);
    expect(selected.safetyStock).toBe(ingredient.safetyStock);
    expect(selected.reorderPoint).toBe(ingredient.reorderPoint);
    expect(selected.targetStock).toBe(ingredient.targetStock);
    expect(selected.properties).toEqual(
      expect.objectContaining({
        edible_yield_rate: 0.8,
        procurement_sku_id: 'sku-wholesale',
        procurement_sku_name: '批发鸡胸肉',
        procurement_sku_display_unit: 'kg',
        procurement_sku_source_plan: 'WHOLESALE',
        procurement_sku_source_tier: 'WHOLESALE',
        procurement_sku_fallback_level: 0,
      }),
    );
    expect((selected as any).procurementSkuId).toBe('sku-wholesale');
    expect((selected as any).procurementSkuName).toBe('批发鸡胸肉');
  });

  it('falls back from organic to market premium before wholesale', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-default',
            purchaseChannel: '普通零售',
            currentPurchasePrice: 70,
            isDefault: true,
          }),
          null,
        ),
        withSourceTier(
          sku({
            id: 'sku-market',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 68,
            isDefault: false,
          }),
          'MARKET_PREMIUM',
        ),
        withSourceTier(
          sku({
            id: 'sku-wholesale',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 42,
            isDefault: false,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.currentPricePerPurchaseUnit).toBe(68);
    expect((selected as any).procurementSkuId).toBe('sku-market');
    expect(selected.properties).toEqual(
      expect.objectContaining({
        procurement_sku_source_plan: 'ORGANIC',
        procurement_sku_source_tier: 'MARKET_PREMIUM',
        procurement_sku_fallback_level: 1,
      }),
    );
  });

  it('falls back from market premium to organic before wholesale', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-wholesale',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 42,
            isDefault: false,
          }),
          'WHOLESALE',
        ),
        withSourceTier(
          sku({
            id: 'sku-organic',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 95,
            isDefault: false,
          }),
          'ORGANIC',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'MARKET_PREMIUM',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.currentPricePerPurchaseUnit).toBe(95);
    expect((selected as any).procurementSkuId).toBe('sku-organic');
    expect(selected.properties).toEqual(
      expect.objectContaining({
        procurement_sku_source_plan: 'MARKET_PREMIUM',
        procurement_sku_source_tier: 'ORGANIC',
        procurement_sku_fallback_level: 1,
      }),
    );
  });

  it('throws when a food ingredient has no eligible source-tier procurement SKU', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-default',
            purchaseChannel: '普通零售',
            currentPurchasePrice: 70,
            isDefault: true,
          }),
          null,
        ),
      ],
    });

    await expect(
      service.applySourcePlanToIngredients([ingredient], 'WHOLESALE'),
    ).rejects.toThrow('鸡胸肉');
  });

  it('picks the highest normalized same-tier SKU cost for organic and market premium plans', async () => {
    const ingredient = createFoodIngredient();
    const lowerCostOrganicSku = withSourceTier(
      sku({
        id: 'sku-organic-lower-cost',
        name: '低折算价有机鸡胸肉',
        brand: '有机品牌A',
        productModel: '2kg/包',
        purchaseChannel: '普通渠道',
        currentPurchasePrice: 80,
        purchaseToBaseRatio: 1000,
        isDefault: false,
      }),
      'ORGANIC',
    );
    const defaultHigherCostOrganicSku = withSourceTier(
      sku({
        id: 'sku-organic-default-higher-cost',
        name: '默认但更贵有机鸡胸肉',
        brand: '有机品牌B',
        productModel: '1kg/包',
        purchaseChannel: '普通渠道',
        currentPurchasePrice: 92,
        purchaseToBaseRatio: 1000,
        isDefault: true,
      }),
      'ORGANIC',
    );
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [defaultHigherCostOrganicSku, lowerCostOrganicSku],
    });

    const organicResult = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const organicSelected = organicResult.get(ingredient.id)!;
    expect((organicSelected as any).procurementSkuId).toBe(
      'sku-organic-default-higher-cost',
    );
    expect(organicSelected.currentPricePerPurchaseUnit).toBe(92);

    const marketIngredient = createFoodIngredient('food-2');
    procurementSkuService.batchFindActive.mockResolvedValue({
      [marketIngredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-market-lower-cost',
            ingredientId: marketIngredient.id,
            name: '低折算价商超鸡胸肉',
            currentPurchasePrice: 80,
            purchaseToBaseRatio: 1000,
          }),
          'MARKET_PREMIUM',
        ),
        withSourceTier(
          sku({
            id: 'sku-market-higher-cost',
            ingredientId: marketIngredient.id,
            name: '高折算价商超鸡胸肉',
            currentPurchasePrice: 110,
            purchaseToBaseRatio: 1000,
          }),
          'MARKET_PREMIUM',
        ),
      ],
    });

    const marketResult = await service.applySourcePlanToIngredients(
      [marketIngredient],
      'MARKET_PREMIUM',
    );

    const marketSelected = marketResult.get(marketIngredient.id)!;
    expect((marketSelected as any).procurementSkuId).toBe(
      'sku-market-higher-cost',
    );
    expect(marketSelected.currentPricePerPurchaseUnit).toBe(110);
  });

  it('picks the lowest normalized same-tier SKU cost for wholesale plan', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-wholesale-higher-cost',
            name: '高折算价批发鸡胸肉',
            currentPurchasePrice: 70,
            purchaseToBaseRatio: 1000,
            isDefault: true,
          }),
          'WHOLESALE',
        ),
        withSourceTier(
          sku({
            id: 'sku-wholesale-lower-cost',
            name: '低折算价批发鸡胸肉',
            currentPurchasePrice: 50,
            purchaseToBaseRatio: 1000,
            isDefault: false,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe(
      'sku-wholesale-lower-cost',
    );
    expect(selected.currentPricePerPurchaseUnit).toBe(50);
  });

  it('uses purchase-unit ratio when comparing same-tier SKU cost for high-price plans', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-organic-small-pack',
            name: '小包装有机鸡胸肉',
            currentPurchasePrice: 50,
            purchaseToBaseRatio: 500,
          }),
          'ORGANIC',
        ),
        withSourceTier(
          sku({
            id: 'sku-organic-large-pack',
            name: '大包装有机鸡胸肉',
            currentPurchasePrice: 80,
            purchaseToBaseRatio: 1000,
          }),
          'ORGANIC',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe('sku-organic-small-pack');
    expect(selected.currentPricePerPurchaseUnit).toBe(50);
  });

  it('uses purchase-unit ratio when comparing same-tier SKU cost for wholesale plan', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-wholesale-small-pack',
            name: '小包装批发鸡胸肉',
            currentPurchasePrice: 50,
            purchaseToBaseRatio: 500,
          }),
          'WHOLESALE',
        ),
        withSourceTier(
          sku({
            id: 'sku-wholesale-large-pack',
            name: '大包装批发鸡胸肉',
            currentPurchasePrice: 80,
            purchaseToBaseRatio: 1000,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe(
      'sku-wholesale-large-pack',
    );
    expect(selected.currentPricePerPurchaseUnit).toBe(80);
  });

  it('breaks same-cost SKU ties by name instead of legacy sort order', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-beta',
            name: 'B 有机鸡胸肉',
            currentPurchasePrice: 80,
            purchaseToBaseRatio: 1000,
            sortOrder: 0,
          }),
          'ORGANIC',
        ),
        withSourceTier(
          sku({
            id: 'sku-alpha',
            name: 'A 有机鸡胸肉',
            currentPurchasePrice: 80,
            purchaseToBaseRatio: 1000,
            sortOrder: 99,
          }),
          'ORGANIC',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe('sku-alpha');
  });

  it('skips source-tier SKUs that cannot produce a usable purchase price', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-unpriced-wholesale',
            purchaseChannel: '普通渠道',
            purchaseUnit: '箱',
            purchaseToBaseRatio: 10000,
            currentPurchasePrice: null,
            referencePurchasePrice: null,
            referencePricePerPurchaseUnit: null,
          }),
          'WHOLESALE',
        ),
        withSourceTier(
          sku({
            id: 'sku-market',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 68,
          }),
          'MARKET_PREMIUM',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe('sku-market');
    expect(selected.currentPricePerPurchaseUnit).toBe(68);
    expect(selected.properties).toEqual(
      expect.objectContaining({
        procurement_sku_source_tier: 'MARKET_PREMIUM',
        procurement_sku_fallback_level: 1,
      }),
    );
  });

  it('skips source-tier SKUs that do not have a valid purchase unit ratio', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-priced-missing-ratio',
            purchaseChannel: '普通渠道',
            purchaseUnit: '箱',
            purchaseToBaseRatio: null,
            currentPurchasePrice: 320,
          }),
          'WHOLESALE',
        ),
        withSourceTier(
          sku({
            id: 'sku-market',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 68,
          }),
          'MARKET_PREMIUM',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect((selected as any).procurementSkuId).toBe('sku-market');
    expect(selected.purchaseUnit).toBe('kg');
    expect(selected.purchaseToBaseRatio).toBe(1000);
  });

  it('preserves original stock thresholds when the selected SKU has no threshold values', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-wholesale',
            purchaseChannel: '普通渠道',
            safetyStock: null,
            reorderPoint: null,
            targetStock: null,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.safetyStock).toBe(ingredient.safetyStock);
    expect(selected.reorderPoint).toBe(ingredient.reorderPoint);
    expect(selected.targetStock).toBe(ingredient.targetStock);
  });

  it('preserves original stock thresholds when the selected SKU has partial threshold values', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        withSourceTier(
          sku({
            id: 'sku-partial-thresholds',
            purchaseChannel: '普通渠道',
            safetyStock: 10,
            reorderPoint: null,
            targetStock: null,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.safetyStock).toBe(ingredient.safetyStock);
    expect(selected.reorderPoint).toBe(ingredient.reorderPoint);
    expect(selected.targetStock).toBe(ingredient.targetStock);
  });

  it('leaves non-food ingredients unchanged and only queries food ingredient SKUs', async () => {
    const food = createFoodIngredient();
    const supplement = createSupplementIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [food.id]: [
        withSourceTier(
          sku({
            id: 'sku-wholesale',
            purchaseChannel: '普通渠道',
            currentPurchasePrice: 42,
          }),
          'WHOLESALE',
        ),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [food, supplement],
      'WHOLESALE',
    );

    expect(procurementSkuService.batchFindActive).toHaveBeenCalledWith([
      food.id,
    ]);
    expect((result.get(food.id) as any).procurementSkuId).toBe('sku-wholesale');
    expect(result.get(supplement.id)).toBe(supplement);
  });
});
