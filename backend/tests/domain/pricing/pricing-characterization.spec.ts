/**
 * PricingService 特征化（characterization）测试
 *
 * 目的：在抽取「单菜成本计算」为可复用方法之前，先把**现有算法的输出逐项锁死**。
 * 试吃装需要「5 道菜合并算成本」，这要求复用现有单菜成本算法；一旦复用过程中
 * 有任何数值漂移，所有鲜食订单的价格都会跟着变。
 *
 * 本文件里的每一个期望值，都是改动前跑现有实现得到的真实值。
 * 重构后必须**一分不差**，否则视为破坏现有生意。
 *
 * ⚠️ 修改本文件的期望值 = 修改线上售价，需明确评审。
 */
import {
  PricingService,
  type GlobalConfig,
  type RecipeItem,
} from '../../../src/domain/pricing/pricing.service';
import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

const globalConfig: GlobalConfig = {
  laborHourlyRate: 30,
  minOrderWeightG: 1000,
  defaultBatchCapacityG: 5000,
  minPotWeightG: 2000,
  targetMargin: 0.4,
  overheadCostPerKg: 2,
  targetBatchUtilization: 0.8,
  supplementLossRate: 1.05,
  defaultProductLabelId: null,
  defaultIcePackId: null,
  defaultShippingTemplateId: null,
  packageExampleImageUrl: null,
  shippingCompanyLogoUrl: null,
  paymentTimeoutMinutes: 30,
  homeHeaderBgImageUrl: null,
  diySheetHeaderBgImageUrl: null,
};

function buildIngredient(params: {
  id: string;
  name: string;
  type: IngredientType;
  /** 元 / 采购单位 */
  pricePerPurchaseUnit: number;
  /** 1 个采购单位 = 多少基础单位 */
  purchaseToBaseRatio: number;
  baseUnit?: BaseUnit;
  properties?: Record<string, any>;
}): Ingredient {
  const baseUnit = params.baseUnit ?? BaseUnit.G;

  return new Ingredient(
    params.id,
    params.name,
    params.type,
    IngredientProcurementStrategy.DAILY_PURCHASE,
    false,
    false,
    null,
    null,
    null,
    null,
    baseUnit,
    baseUnit === BaseUnit.ML ? 'ml' : 'g',
    baseUnit === BaseUnit.G ? 'kg' : 'L',
    params.purchaseToBaseRatio,
    params.pricePerPurchaseUnit,
    null,
    null,
    null,
    null,
    null,
    null,
    (params.properties ?? {}) as any,
    null,
  );
}

/**
 * 三道食材的固定配方：
 *   鸡胸 50%（出肉率 0.9） / 牛腩 30%（出肉率 1.0） / 三文鱼 20%
 * 采购价：¥30/kg、¥60/kg、¥50/kg
 */
function buildRecipeItems(): RecipeItem[] {
  const chicken = buildIngredient({
    id: 'ing-chicken',
    name: '鸡胸肉',
    type: IngredientType.FOOD,
    pricePerPurchaseUnit: 30,
    purchaseToBaseRatio: 1000,
    properties: { edible_yield_rate: 0.9 },
  });
  const beef = buildIngredient({
    id: 'ing-beef',
    name: '牛腩',
    type: IngredientType.FOOD,
    pricePerPurchaseUnit: 60,
    purchaseToBaseRatio: 1000,
    properties: { edible_yield_rate: 1.0 },
  });
  const salmon = buildIngredient({
    id: 'ing-salmon',
    name: '三文鱼',
    type: IngredientType.FOOD,
    pricePerPurchaseUnit: 50,
    purchaseToBaseRatio: 1000,
    properties: { edible_yield_rate: 1.0 },
  });

  return [
    {
      id: 'ri-chicken',
      ingredientId: chicken.id,
      ingredient: chicken,
      ratioPercent: 50,
    },
    {
      id: 'ri-beef',
      ingredientId: beef.id,
      ingredient: beef,
      ratioPercent: 30,
    },
    {
      id: 'ri-salmon',
      ingredientId: salmon.id,
      ingredient: salmon,
      ratioPercent: 20,
    },
  ];
}

/** 抹掉 JS 浮点尾差（如 38.519999999999996 → 38.52），保留 9 位小数 */
function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function buildPackagingServiceMock() {  return {
    calculatePackagingCostForPlan: jest.fn().mockResolvedValue({
      cost: 14,
      weightG: 40,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: '真空袋',
          vacuumBagSpec: '15x20cm',
          labelName: '产品标签',
          labelSpec: 'standard',
          vacuumBagCostPerPack: 0.4,
          labelCostPerPack: 0.3,
          vacuumBagTotalCost: 8,
          labelTotalCost: 6,
          totalCost: 14,
          weightPerPack: 2,
          vacuumBagsCount: 20,
          labelsCount: 20,
        },
        shippingContainers: [
          {
            boxName: '3号泡沫箱',
            boxSpec: '3号',
            thermalBagName: '铝箔保温袋',
            thermalBagSpec: '适配3号',
            icePacks: 5,
            cost: 12,
            weight: 800,
          },
        ],
      },
    }),
    calculatePackagingCost: jest.fn(),
  };
}

describe('PricingService 特征化：现有鲜食单菜定价必须保持不变', () => {
  it('三道食材 + 2000g + 固定分装：成本与售价逐项锁定', async () => {
    const packagingService = buildPackagingServiceMock();
    const service = new PricingService({} as any, packagingService as any);

    const result = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'recipe-standard',
        productionLossRate: 1.07,
        batchLaborHours: 2,
        items: buildRecipeItems(),
      },
      totalNetFoodWeightG: 2000,
      packagePlan: [{ packageSpecG: 100, packageCount: 20 }],
      totalPacks: 20,
      singlePackSpecG: 100,
      globalConfig,
    });

    // ---- 原料成本 ----
    // 鸡胸：净 1.0kg ÷ 0.9 × 1.07 = 1.18888…kg → 1188.888…g × ¥0.03/g
    // 牛腩：净 0.6kg × 1.07 = 0.642kg → 642g × ¥0.06/g
    // 三文鱼：净 0.4kg × 1.07 = 0.428kg → 428g × ¥0.05/g
    expect(result.costIngredients).toBeCloseTo(95.58666666666667, 6);
    expect(result.ingredientDetails).toHaveLength(3);
    expect(
      result.ingredientDetails!.map((item) => ({
        name: item.name,
        netAmount: round9(item.netAmount!),
        amount: round9(item.amount),
        cost: round9(item.cost),
        unitCost: item.unitCost,
      })),
    ).toEqual([
      {
        name: '鸡胸肉',
        netAmount: 1,
        amount: 1.188888889,
        cost: 35.666666667,
        unitCost: 0.03,
      },
      {
        name: '牛腩',
        netAmount: 0.6,
        amount: 0.642,
        cost: 38.52,
        unitCost: 0.06,
      },
      {
        name: '三文鱼',
        netAmount: 0.4,
        amount: 0.428,
        cost: 21.4,
        unitCost: 0.05,
      },
    ]);

    // ---- 人工 / 间接成本 ----
    // 投料毛重 = 2000g × 1.07 = 2.14kg
    // 标准批次产量 = 5000g × 0.8 = 4kg
    // 人工单价 = 30 元/时 × 2 时 ÷ 4kg = 15 元/kg
    expect(result.costLabor).toBeCloseTo(32.1, 6);
    expect(result.laborDetails!.rawInputWeightKg).toBeCloseTo(2.14, 6);
    expect(result.laborDetails!.standardBatchOutputKg).toBeCloseTo(4, 6);
    expect(result.laborDetails!.standardLaborCostPerKg).toBeCloseTo(15, 6);

    // 间接成本 = 2.14kg × ¥2/kg
    expect(result.costOverhead).toBeCloseTo(4.28, 6);
    expect(result.overheadDetails!.overheadCostPerKg).toBe(2);

    // ---- 包材 ----
    expect(result.costPackaging).toBe(14);
    expect(result.weightPackagingG).toBe(40);
    expect(packagingService.calculatePackagingCostForPlan).toHaveBeenCalledTimes(
      1,
    );
    expect(
      packagingService.calculatePackagingCostForPlan,
    ).toHaveBeenCalledWith([{ packageSpecG: 100, packageCount: 20 }], 2000);

    // ---- 成本合计与售价 ----
    // 145.5866… + 32.1 + 4.28 + 14 = 145.9666…
    expect(result.totalProductCost).toBeCloseTo(145.96666666666667, 6);
    // ÷ (1 − 40%) = ÷ 0.6
    expect(result.productPrice).toBeCloseTo(243.2777777777778, 6);
    expect(result.shippingFee).toBe(0);
    expect(result.totalPrice).toBeCloseTo(243.2777777777778, 6);

    // ---- 包材明细透传 ----
    expect(result.packagingDetails!.perPackConsumables.vacuumBagName).toBe(
      '真空袋',
    );
    expect(result.packagingDetails!.shippingContainers).toHaveLength(1);
    expect(result.packagingDetails!.shippingContainers[0].boxName).toBe(
      '3号泡沫箱',
    );
  });

  it('discountRate 只作用于商品价，不作用于运费（复用为试吃倍率的前提）', async () => {
    const packagingService = buildPackagingServiceMock();
    const service = new PricingService({} as any, packagingService as any);

    const full = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'recipe-standard',
        productionLossRate: 1.07,
        batchLaborHours: 2,
        items: buildRecipeItems(),
      },
      totalNetFoodWeightG: 2000,
      packagePlan: [{ packageSpecG: 100, packageCount: 20 }],
      totalPacks: 20,
      singlePackSpecG: 100,
      globalConfig,
    });

    const discounted = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'recipe-standard',
        productionLossRate: 1.07,
        batchLaborHours: 2,
        items: buildRecipeItems(),
      },
      totalNetFoodWeightG: 2000,
      packagePlan: [{ packageSpecG: 100, packageCount: 20 }],
      totalPacks: 20,
      singlePackSpecG: 100,
      discountRate: 0.75,
      globalConfig,
    });

    // 成本一分不变
    expect(discounted.totalProductCost).toBeCloseTo(full.totalProductCost, 6);
    // 售价 = 原价 × 0.75
    expect(discounted.productPrice).toBeCloseTo(full.productPrice * 0.75, 6);
  });
});
