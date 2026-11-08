import { OrderService } from 'src/application/order/order.service';

/**
 * 员工代客下单前要先看到系统报价，但报价预览不该像顾客结算那样
 * 每次都往 pricing_snapshot 里塞一条 15 分钟后过期的记录。
 */
describe('OrderService previewPricing · STAFF_PREVIEW 只算不存', () => {
  function buildService() {
    const pricingSnapshotRepository = {
      create: jest.fn().mockResolvedValue({ id: 'snap-1' }),
    };
    const dogRepository = {
      findById: jest.fn().mockResolvedValue({ id: 'dog-1', mealsPerDay: 2 }),
    };
    const recipeRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'recipe-1',
        name: '低脂鸡肉南瓜餐',
        items: [],
        energyDensityKcalPerKg: 1200,
        productionLossRate: 0.1,
        batchLaborHours: 2,
        seriesId: null,
      }),
    };
    const pricingService = {
      calculateOrderPrice: jest.fn().mockResolvedValue({
        productPrice: 428,
        costIngredients: 100,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 135,
        weightPackagingG: 0,
        ingredientDetails: [],
        packagingDetails: null,
        laborDetails: null,
        overheadDetails: null,
      }),
    };
    const shippingService = {
      calculateShippingFeePreview: jest
        .fn()
        .mockResolvedValue({ amountShipping: 12, templateId: null }),
    };
    const globalConfigService = {
      getGlobalConfig: jest.fn().mockResolvedValue({ targetMargin: 0.4 }),
    };

    const service = new OrderService(
      { findById: jest.fn(), save: jest.fn() } as any,
      { append: jest.fn(), findByOrderId: jest.fn() } as any,
      recipeRepository as any,
      { findByIds: jest.fn().mockResolvedValue([]) } as any,
      dogRepository as any,
      pricingService as any,
      globalConfigService as any,
      shippingService as any,
      {} as any,
      pricingSnapshotRepository as any,
      {} as any,
    );

    return { service, pricingSnapshotRepository };
  }

  function buildDto(pricingPurpose: 'ORDER' | 'STAFF_PREVIEW') {
    return {
      customerId: 'customer-1',
      dogId: 'dog-1',
      type: 'FRESH_FOOD',
      pricingPurpose,
      items: [
        {
          recipeId: 'recipe-1',
          quantityG: 3136,
          packageCount: 14,
          packageSpecG: 224,
          cycleDays: 7,
        },
      ],
    } as any;
  }

  it('STAFF_PREVIEW 返回金额但不写价格快照', async () => {
    const { service, pricingSnapshotRepository } = buildService();

    const result = await service.previewPricing(buildDto('STAFF_PREVIEW'));

    expect(pricingSnapshotRepository.create).not.toHaveBeenCalled();
    expect(result.amountProduct).toBe(428);
    expect(result.amountShipping).toBe(12);
    expect(result.amountTotal).toBe(440);
  });

  it('ORDER 用途仍然写价格快照（顾客结算不能被改坏）', async () => {
    const { service, pricingSnapshotRepository } = buildService();

    const result = await service.previewPricing(buildDto('ORDER'));

    expect(pricingSnapshotRepository.create).toHaveBeenCalledTimes(1);
    expect(result.snapshotId).toBe('snap-1');
  });
});
