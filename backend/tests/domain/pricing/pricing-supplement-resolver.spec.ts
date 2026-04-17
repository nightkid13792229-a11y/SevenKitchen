import { PricingService } from '../../../src/domain/pricing/pricing.service';
import { Ingredient } from '../../../src/domain/ingredient';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

describe('PricingService supplement nutrition resolver integration', () => {
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
  } as any;

  const ingredientRepo = {} as any;

  const service = new PricingService(ingredientRepo, packagingService);

  it('uses v2 supplement targets and nutrition_profile concentration', async () => {
    const foodIngredient = new Ingredient(
      'food-1',
      '鸡胸肉',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      false,
      false,
      null,
      null,
      null,
      null,
      BaseUnit.G,
      '克',
      'kg',
      1000,
      20,
      20,
      null,
      null,
      null,
      null,
      null,
      {
        cfct_class: '禽肉类',
        edible_yield_rate: 1,
        main_nutrients_desc: '高蛋白',
      },
      null,
    );

    const supplementIngredient = new Ingredient(
      'supp-1',
      '维生素E-200',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      true,
      true,
      'NOW FOODS',
      '维生素E-200',
      '京东',
      null,
      BaseUnit.PCS,
      '粒',
      '瓶',
      100,
      50,
      50,
      null,
      null,
      null,
      null,
      null,
      {
        category_type: 'VITAMIN',
        add_timing: 'BEFORE_MEAL',
        production_loss_rate: 1,
      },
      {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: {
          vitaminE: 200,
        },
        fattyAcids: {},
        aminoAcids: {},
        customItems: [],
      } as any,
    );

    const result = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'recipe-1',
        productionLossRate: 1,
        batchLaborHours: 0,
        items: [
          {
            id: 'recipe-item-food-1',
            ingredientId: foodIngredient.id,
            ingredient: foodIngredient,
            ratioPercent: 100,
          },
          {
            id: 'recipe-item-supp-1',
            ingredientId: supplementIngredient.id,
            ingredient: supplementIngredient,
            supplementTargets: [
              {
                fieldPath: 'vitamins.vitaminE',
                label: '维生素 E',
                targetValuePerKg: 1000,
                unit: 'IU',
              },
            ],
          },
        ],
      },
      dailyG: 1000,
      days: 1,
      globalConfig: {
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
      },
      singlePackSpecG: 500,
    });

    const supplementDetail = result.ingredientDetails?.find(
      (item) => item.type === 'SUPPLEMENT',
    );

    expect(supplementDetail?.amount).toBeCloseTo(5, 6);
    expect(supplementDetail?.recipeItemId).toBe('recipe-item-supp-1');
    expect(supplementDetail?.displayUnit).toBe('粒');
    expect(supplementDetail?.calculation).toContain('200IU');
  });

  it('uses maximum required amount for multi-target supplements', async () => {
    const foodIngredient = new Ingredient(
      'food-1',
      '鸡胸肉',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      false,
      false,
      null,
      null,
      null,
      null,
      BaseUnit.G,
      '克',
      'kg',
      1000,
      20,
      20,
      null,
      null,
      null,
      null,
      null,
      {
        cfct_class: '禽肉类',
        edible_yield_rate: 1,
        main_nutrients_desc: '高蛋白',
      },
      null,
    );

    const fishOilIngredient = new Ingredient(
      'supp-fish-oil',
      '鱼油胶囊',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      true,
      true,
      'NOW FOODS',
      '鱼油胶囊',
      '京东',
      null,
      BaseUnit.PCS,
      '粒',
      '瓶',
      100,
      50,
      50,
      null,
      null,
      null,
      null,
      null,
      {
        category_type: 'FATTY_ACID',
        add_timing: 'BEFORE_MEAL',
        production_loss_rate: 1,
      },
      {
        meta: { rawBasisType: 'PER_SERVING' },
        macros: {},
        minerals: {},
        vitamins: {},
        fattyAcids: {
          epa: 180,
          dha: 120,
        },
        aminoAcids: {},
        customItems: [],
      } as any,
    );

    const result = await service.calculateOrderPrice({
      dog: { mealsPerDay: 2 },
      recipe: {
        id: 'recipe-1',
        productionLossRate: 1,
        batchLaborHours: 0,
        items: [
          {
            id: 'recipe-item-food-1',
            ingredientId: foodIngredient.id,
            ingredient: foodIngredient,
            ratioPercent: 100,
          },
          {
            id: 'recipe-item-supp-1',
            ingredientId: fishOilIngredient.id,
            ingredient: fishOilIngredient,
            supplementTargets: [
              {
                fieldPath: 'fattyAcids.epa',
                label: 'EPA',
                targetValuePerKg: 360,
                unit: 'mg',
              },
              {
                fieldPath: 'fattyAcids.dha',
                label: 'DHA',
                targetValuePerKg: 360,
                unit: 'mg',
              },
            ],
          },
        ],
      },
      dailyG: 1000,
      days: 1,
      globalConfig: {
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
      },
      singlePackSpecG: 500,
    });

    const supplementDetail = result.ingredientDetails?.find(
      (item) => item.type === 'SUPPLEMENT',
    );

    expect(supplementDetail?.amount).toBeCloseTo(3, 6);
    expect(supplementDetail?.displayUnit).toBe('粒');
    expect(supplementDetail?.calculation).toContain('DHA');
  });
});
