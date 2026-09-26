/**
 * 试吃装合并定价测试
 *
 * 关键要证明的三件事：
 * 1. 多道菜的成本是**加法**关系（原料逐菜相加）
 * 2. 人工按各道菜自己的 batchLaborHours 分别分摊
 * 3. 包材**只算一次**（否则 5 道菜会算 5 个冷链箱，价格虚高）
 */
import {
  PricingService,
  type GlobalConfig,
  type TastingPackRecipeInput,
} from '../../../src/domain/pricing/pricing.service';
import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

const globalConfig: GlobalConfig = {
  laborHourlyRate: 30,
  // ⚠️ 故意设成 1000：试吃装总净重只有几百克，必须豁免这条校验
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
  diySheetBgImageUrl: null as any,
};

function buildFoodIngredient(id: string, name: string, pricePerKg: number) {
  return new Ingredient(
    id,
    name,
    IngredientType.FOOD,
    IngredientProcurementStrategy.DAILY_PURCHASE,
    false,
    false,
    null,
    null,
    null,
    null,
    BaseUnit.G,
    'g',
    'kg',
    1000,
    pricePerKg,
    null,
    null,
    null,
    null,
    null,
    null,
    { edible_yield_rate: 1 } as any,
    null,
  );
}

function buildPackagingServiceMock(cost = 5, weightG = 20) {
  return {
    calculatePackagingCostForPlan: jest.fn().mockResolvedValue({
      cost,
      weightG,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: '真空袋',
          vacuumBagSpec: '12x17cm',
          labelName: '产品标签',
          labelSpec: 'standard',
          vacuumBagCostPerPack: 0.4,
          labelCostPerPack: 0.3,
          vacuumBagTotalCost: 1.6,
          labelTotalCost: 1.2,
          totalCost: 2.8,
          weightPerPack: 2,
          vacuumBagsCount: 4,
          labelsCount: 4,
        },
        shippingContainers: [
          {
            boxName: '1号泡沫箱',
            boxSpec: '1号',
            thermalBagName: '铝箔保温袋',
            thermalBagSpec: '适配1号',
            icePacks: 3,
            cost: 2.2,
            weight: 600,
          },
        ],
      },
    }),
    calculatePackagingCost: jest.fn(),
  };
}

/**
 * 两道菜：
 *   菜 A：batchLaborHours = 2，原料 ¥30/kg
 *   菜 B：batchLaborHours = 4，原料 ¥60/kg
 * 每道 2 袋 × 80g = 160g
 */
function buildTwoRecipes(): TastingPackRecipeInput[] {
  return [
    {
      recipe: {
        id: 'recipe-a',
        name: '菜A',
        productionLossRate: 1,
        batchLaborHours: 2,
        items: [
          {
            id: 'ri-a',
            ingredientId: 'ing-a',
            ingredient: buildFoodIngredient('ing-a', '鸡胸肉', 30),
            ratioPercent: 100,
          },
        ],
      },
      packageCount: 2,
      packageSpecG: 80,
    },
    {
      recipe: {
        id: 'recipe-b',
        name: '菜B',
        productionLossRate: 1,
        batchLaborHours: 4,
        items: [
          {
            id: 'ri-b',
            ingredientId: 'ing-b',
            ingredient: buildFoodIngredient('ing-b', '牛腩', 60),
            ratioPercent: 100,
          },
        ],
      },
      packageCount: 2,
      packageSpecG: 80,
    },
  ];
}

describe('PricingService.calculateTastingPackPrice', () => {
  it('多道菜成本相加、人工按各菜工时分别分摊、包材只算一次', async () => {
    const packagingService = buildPackagingServiceMock();
    const service = new PricingService({} as any, packagingService as any);

    const result = await service.calculateTastingPackPrice({
      recipes: buildTwoRecipes(),
      tastingMultiplier: 1.25,
      globalConfig,
    });

    // 每道菜净重 160g，总 320g（远低于起订量 1000g，必须不报错）
    expect(result.totalNetFoodWeightG).toBe(320);
    expect(result.totalPacks).toBe(4);

    // 原料：A = 0.16kg × ¥0.03/g × 1000 = 4.8；B = 0.16kg × ¥0.06/g × 1000 = 9.6
    expect(result.costIngredients).toBeCloseTo(14.4, 6);
    expect(result.perRecipe.map((r) => r.costIngredients)).toEqual([
      expect.closeTo(4.8, 6),
      expect.closeTo(9.6, 6),
    ]);

    // 投料毛重：0.16 + 0.16 = 0.32kg
    expect(result.rawInputWeightKg).toBeCloseTo(0.32, 6);

    // 人工：标准批次产量 = 5000g × 0.8 = 4kg
    //   A：0.16kg × (30 × 2 ÷ 4 = 15) = 2.4
    //   B：0.16kg × (30 × 4 ÷ 4 = 30) = 4.8
    expect(result.costLabor).toBeCloseTo(7.2, 6);

    // 间接成本：0.32kg × ¥2/kg
    expect(result.costOverhead).toBeCloseTo(0.64, 6);

    // 包材：只按合并后的一套包材算一次
    expect(result.costPackaging).toBe(5);
    expect(packagingService.calculatePackagingCostForPlan).toHaveBeenCalledTimes(
      1,
    );
    // 两道的 80g 袋合并成一行，袋数相加
    expect(
      packagingService.calculatePackagingCostForPlan,
    ).toHaveBeenCalledWith([{ packageSpecG: 80, packageCount: 4 }], 320);

    // 成本合计 14.4 + 7.2 + 0.64 + 5 = 27.24
    expect(result.totalProductCost).toBeCloseTo(27.24, 6);

    // 实收 = 成本 × 试吃倍率
    expect(result.productPrice).toBeCloseTo(34.05, 6);

    // 划线价 = 成本 ÷ (1 − 40%)
    expect(result.listPrice).toBeCloseTo(45.4, 6);
    expect(result.listPrice).toBeGreaterThan(result.productPrice);
  });

  it('试吃倍率改变时，只有实收变、成本与划线价不变', async () => {
    const service = new PricingService(
      {} as any,
      buildPackagingServiceMock() as any,
    );

    const base = await service.calculateTastingPackPrice({
      recipes: buildTwoRecipes(),
      tastingMultiplier: 1.25,
      globalConfig,
    });
    const cheaper = await service.calculateTastingPackPrice({
      recipes: buildTwoRecipes(),
      tastingMultiplier: 1.0,
      globalConfig,
    });

    expect(cheaper.totalProductCost).toBeCloseTo(base.totalProductCost, 6);
    expect(cheaper.listPrice).toBeCloseTo(base.listPrice, 6);
    expect(cheaper.productPrice).toBeCloseTo(base.totalProductCost, 6);
  });

  it('空组合与非法倍率必须报错，不能静默算出 0 元', async () => {
    const service = new PricingService(
      {} as any,
      buildPackagingServiceMock() as any,
    );

    await expect(
      service.calculateTastingPackPrice({
        recipes: [],
        tastingMultiplier: 1.25,
        globalConfig,
      }),
    ).rejects.toThrow('至少需要一道菜');

    await expect(
      service.calculateTastingPackPrice({
        recipes: buildTwoRecipes(),
        tastingMultiplier: 0,
        globalConfig,
      }),
    ).rejects.toThrow('试吃倍率必须为正数');
  });
});
