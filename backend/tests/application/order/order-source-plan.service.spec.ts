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
    displayUnit: 'kg',
    notes: null,
    isDefault: false,
    isActive: true,
    sortOrder: 0,
    safetyStock: 2,
    reorderPoint: 5,
    targetStock: 10,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects the first active food SKU whose channel matches the selected source plan', async () => {
    const ingredient = createFoodIngredient();
    const defaultSku = sku({
      id: 'sku-default',
      name: '山姆鸡胸肉',
      brand: '山姆',
      purchaseChannel: '山姆会员店',
      currentPurchasePrice: 70,
      isDefault: true,
    });
    const wholesaleSku = sku({
      id: 'sku-wholesale',
      name: '批发鸡胸肉',
      brand: '批发品牌',
      productModel: '10kg/箱',
      purchaseChannel: '生鲜批发商',
      currentPurchasePrice: 42,
      isDefault: false,
    });
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [defaultSku, wholesaleSku],
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
    expect(selected.purchaseChannel).toBe('生鲜批发商');
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
      }),
    );
    expect((selected as any).procurementSkuId).toBe('sku-wholesale');
    expect((selected as any).procurementSkuName).toBe('批发鸡胸肉');
  });

  it('falls back to the default SKU when no channel matches the source plan', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        sku({
          id: 'sku-sam',
          purchaseChannel: '山姆会员店',
          currentPurchasePrice: 70,
          isDefault: true,
        }),
        sku({
          id: 'sku-hema',
          purchaseChannel: '盒马',
          currentPurchasePrice: 68,
          isDefault: false,
        }),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.purchaseChannel).toBe('山姆会员店');
    expect(selected.currentPricePerPurchaseUnit).toBe(70);
    expect((selected as any).procurementSkuId).toBe('sku-sam');
  });

  it('falls back to the first active SKU when no channel matches and no SKU is default', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        sku({
          id: 'sku-first',
          purchaseChannel: '普通零售',
          currentPurchasePrice: 66,
          isDefault: false,
        }),
        sku({
          id: 'sku-second',
          purchaseChannel: '盒马',
          currentPurchasePrice: 68,
          isDefault: false,
        }),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'ORGANIC',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.purchaseChannel).toBe('普通零售');
    expect(selected.currentPricePerPurchaseUnit).toBe(66);
    expect((selected as any).procurementSkuId).toBe('sku-first');
  });

  it('returns the original food ingredient when no active SKUs are available', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    expect(result.get(ingredient.id)).toBe(ingredient);
  });

  it('preserves original purchase unit, ratio, and prices when selected SKU has no usable price', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        sku({
          id: 'sku-unpriced-wholesale',
          purchaseChannel: '生鲜批发商',
          purchaseUnit: '箱',
          purchaseToBaseRatio: 10000,
          currentPurchasePrice: null,
          referencePurchasePrice: null,
          referencePricePerPurchaseUnit: null,
        }),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.purchaseChannel).toBe('生鲜批发商');
    expect(selected.purchaseUnit).toBe(ingredient.purchaseUnit);
    expect(selected.purchaseToBaseRatio).toBe(ingredient.purchaseToBaseRatio);
    expect(selected.currentPricePerPurchaseUnit).toBe(
      ingredient.currentPricePerPurchaseUnit,
    );
    expect(selected.effectivePricePerPurchaseUnit).toBe(
      ingredient.effectivePricePerPurchaseUnit,
    );
    expect((selected as any).procurementSkuId).toBe('sku-unpriced-wholesale');
  });

  it('preserves original purchase unit, ratio, and prices when selected SKU has price but no valid ratio', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        sku({
          id: 'sku-priced-missing-ratio',
          purchaseChannel: '生鲜批发商',
          purchaseUnit: '箱',
          purchaseToBaseRatio: null,
          currentPurchasePrice: 320,
        }),
      ],
    });

    const result = await service.applySourcePlanToIngredients(
      [ingredient],
      'WHOLESALE',
    );

    const selected = result.get(ingredient.id)!;
    expect(selected.purchaseChannel).toBe('生鲜批发商');
    expect(selected.purchaseUnit).toBe(ingredient.purchaseUnit);
    expect(selected.purchaseToBaseRatio).toBe(ingredient.purchaseToBaseRatio);
    expect(selected.currentPricePerPurchaseUnit).toBe(
      ingredient.currentPricePerPurchaseUnit,
    );
    expect(selected.effectivePricePerPurchaseUnit).toBe(
      ingredient.effectivePricePerPurchaseUnit,
    );
    expect((selected as any).procurementSkuId).toBe('sku-priced-missing-ratio');
  });

  it('preserves original stock thresholds when the selected SKU has no threshold values', async () => {
    const ingredient = createFoodIngredient();
    procurementSkuService.batchFindActive.mockResolvedValue({
      [ingredient.id]: [
        sku({
          id: 'sku-wholesale',
          purchaseChannel: '生鲜批发商',
          safetyStock: null,
          reorderPoint: null,
          targetStock: null,
        }),
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
        sku({
          id: 'sku-partial-thresholds',
          purchaseChannel: '生鲜批发商',
          safetyStock: 10,
          reorderPoint: null,
          targetStock: null,
        }),
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
    procurementSkuService.batchFindActive.mockResolvedValue({});

    const result = await service.applySourcePlanToIngredients(
      [food, supplement],
      'WHOLESALE',
    );

    expect(procurementSkuService.batchFindActive).toHaveBeenCalledWith([
      food.id,
    ]);
    expect(result.get(food.id)).toBe(food);
    expect(result.get(supplement.id)).toBe(supplement);
  });
});
