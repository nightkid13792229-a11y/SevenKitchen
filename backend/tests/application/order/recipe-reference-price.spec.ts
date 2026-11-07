import { Test } from '@nestjs/testing';
import {
  OrderService,
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../../../src/application/order/order.service';
import {
  RECIPE_REPOSITORY,
  DOG_REPOSITORY,
} from '../../../src/application/dog/dog.service';
import { INGREDIENT_REPOSITORY } from '../../../src/application/ingredient/ingredient.service';
import { ADDRESS_REPOSITORY } from '../../../src/application/address/address.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { PricingService } from '../../../src/domain/pricing/pricing.service';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { ShippingService } from '../../../src/application/shipping/shipping.service';

/**
 * 参考价（每 100g）的输入口径。
 *
 * 2026-11-07 拍板：按起订量 1kg = 10 袋 × 100g 的标准分装算包材，
 * 运费按起订量分摊。这里锁的是"传给定价引擎的参数"，
 * 算钱本身由 PricingService 的既有用例保证。
 */
describe('OrderService · computeRecipeReferencePrice', () => {
  const recipeRepo = { findById: jest.fn() };
  const pricing = { calculateOrderPrice: jest.fn() };
  const shipping = { calculateShippingFeePreview: jest.fn() };
  const config = { getGlobalConfig: jest.fn() };
  let service: OrderService;

  const recipe = {
    id: 'recipe-1',
    productionLossRate: 1.05,
    batchLaborHours: 2,
    items: [
      {
        id: 'item-1',
        ingredientId: 'ingredient-1',
        ratioPercent: 100,
        exampleWeight: null,
        preparationMethod: null,
        nutrientTargetKey: null,
        nutrientTargetValue: null,
        supplementTargets: null,
      },
    ],
  };

  const buildService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: RECIPE_REPOSITORY, useValue: recipeRepo },
        { provide: INGREDIENT_REPOSITORY, useValue: {} },
        { provide: PricingService, useValue: pricing },
        { provide: GlobalConfigService, useValue: config },
        { provide: ShippingService, useValue: shipping },
        { provide: ORDER_REPOSITORY, useValue: {} },
        { provide: ORDER_STATUS_HISTORY_REPOSITORY, useValue: {} },
        { provide: DOG_REPOSITORY, useValue: {} },
        { provide: ADDRESS_REPOSITORY, useValue: {} },
        { provide: 'IOrderPricingSnapshotRepository', useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(OrderService);
    jest
      .spyOn(service as any, 'resolveOrderRecipeIngredientMap')
      .mockResolvedValue(
        new Map([['ingredient-1', { id: 'ingredient-1', name: '牛肉' }]]),
      );
    jest
      .spyOn(service as any, 'loadPreparationMethodNameMap')
      .mockResolvedValue(new Map());
    return service;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    recipeRepo.findById.mockResolvedValue(recipe);
    config.getGlobalConfig.mockResolvedValue({ minOrderWeightG: 1000 });
    pricing.calculateOrderPrice.mockResolvedValue({
      productPrice: 200,
      weightPackagingG: 700,
    });
    shipping.calculateShippingFeePreview.mockResolvedValue({
      amountShipping: 30,
    });
  });

  it('按 100g × 10 袋算包材，并按 1kg 摊运费', async () => {
    await buildService();

    const result = await service.computeRecipeReferencePrice('recipe-1');

    expect(pricing.calculateOrderPrice).toHaveBeenCalledWith(
      expect.objectContaining({
        totalNetFoodWeightG: 1000,
        totalPacks: 10,
        singlePackSpecG: 100,
        dailyG: 1000,
        days: 1,
      }),
    );
    expect(shipping.calculateShippingFeePreview).toHaveBeenCalledWith({
      totalWeightG: 1700,
      shippingTemplateId: null,
    });
    expect(result).toEqual({
      recipeId: 'recipe-1',
      pricePer100g: 23,
      amountProduct: 200,
      amountShipping: 30,
    });
  });

  it('起订量改成 1500g 时袋数跟着变', async () => {
    config.getGlobalConfig.mockResolvedValue({ minOrderWeightG: 1500 });
    await buildService();

    await service.computeRecipeReferencePrice('recipe-1');

    expect(pricing.calculateOrderPrice).toHaveBeenCalledWith(
      expect.objectContaining({ totalPacks: 15, singlePackSpecG: 100 }),
    );
  });
});
