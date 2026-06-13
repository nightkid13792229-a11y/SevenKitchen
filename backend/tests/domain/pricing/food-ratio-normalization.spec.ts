import { PricingService } from '../../../src/domain/pricing/pricing.service';
import { Ingredient } from '../../../src/domain/ingredient';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

describe('PricingService FOOD ratio normalization', () => {
  const globalConfig = {
    laborHourlyRate: 0,
    minOrderWeightG: 1,
    defaultBatchCapacityG: 1000,
    minPotWeightG: 0,
    targetMargin: 0,
    overheadCostPerKg: 0,
    targetBatchUtilization: 1,
    supplementLossRate: 1,
    defaultProductLabelId: null,
    defaultIcePackId: null,
    defaultShippingTemplateId: null,
    packageExampleImageUrl: null,
    shippingCompanyLogoUrl: null,
    paymentTimeoutMinutes: 30,
    homeHeaderBgImageUrl: null,
    diySheetHeaderBgImageUrl: null,
  };

  const packagingService = {
    calculatePackagingCost: jest.fn().mockResolvedValue({
      cost: 0,
      weightG: 0,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: '真空袋',
          vacuumBagSpec: '默认',
          labelName: '标签',
          labelSpec: '默认',
          vacuumBagCostPerPack: 0,
          labelCostPerPack: 0,
          weightPerPack: 0,
        },
        shippingContainers: [],
      },
    }),
    calculatePackagingCostForPlan: jest.fn().mockResolvedValue({
      cost: 0,
      weightG: 0,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: '真空袋',
          vacuumBagSpec: '默认',
          labelName: '标签',
          labelSpec: '默认',
          vacuumBagCostPerPack: 0,
          labelCostPerPack: 0,
          weightPerPack: 0,
        },
        shippingContainers: [],
      },
    }),
  };

  function foodIngredient(id: string, name: string) {
    return new Ingredient(
      id,
      name,
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      true,
      true,
      null,
      null,
      null,
      null,
      BaseUnit.G,
      '克',
      'kg',
      1000,
      0,
      0,
      null,
      null,
      null,
      null,
      null,
      { edible_yield_rate: 1 },
      null,
    );
  }

  it('allocates the requested net food weight across FOOD items even when legacy ratios sum below 100', async () => {
    const service = new PricingService({} as any, packagingService as any);

    const result = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'oat-cod-pork-high-activity',
        productionLossRate: 1.05,
        batchLaborHours: 0,
        items: [
          {
            id: 'pork',
            ingredientId: 'pork',
            ingredient: foodIngredient('pork', '猪里脊'),
            ratioPercent: 41.13110539845758,
          },
          {
            id: 'sweet-potato',
            ingredientId: 'sweet-potato',
            ingredient: foodIngredient('sweet-potato', '红薯'),
            ratioPercent: 17.99485861182519,
          },
          {
            id: 'remaining-foods',
            ingredientId: 'remaining-foods',
            ingredient: foodIngredient('remaining-foods', '其它食材'),
            ratioPercent: 40.20565552699229,
          },
        ],
      },
      totalNetFoodWeightG: 2000,
      packagePlan: [{ packageSpecG: 100, packageCount: 20 }],
      globalConfig,
    });

    const foodDetails = result.ingredientDetails!.filter(
      (item) => item.type === 'FOOD',
    );
    const netKg = foodDetails.reduce(
      (sum, item) => sum + (item.netAmount ?? 0),
      0,
    );
    const purchaseKg = foodDetails.reduce(
      (sum, item) => sum + (item.purchaseAmount ?? 0),
      0,
    );

    expect(netKg).toBeCloseTo(2, 10);
    expect(purchaseKg).toBeCloseTo(2.1, 10);
  });
});
