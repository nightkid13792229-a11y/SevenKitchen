import { PricingService } from '../../../src/domain/pricing/pricing.service';

describe('PricingService package plan validation', () => {
  it('rejects totalNetFoodWeightG that differs from packagePlan total weight', async () => {
    const packagingService = {
      calculatePackagingCostForPlan: jest.fn(),
      calculatePackagingCost: jest.fn(),
    };
    const service = new PricingService({} as any, packagingService as any);

    await expect(
      service.calculateOrderPrice({
        dog: { mealsPerDay: 2 },
        recipe: {
          id: 'recipe-1',
          productionLossRate: 1,
          batchLaborHours: 0,
          items: [],
        },
        totalNetFoodWeightG: 1200,
        packagePlan: [
          { packageSpecG: 100, packageCount: 2 },
          { packageSpecG: 200, packageCount: 3 },
        ],
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
      }),
    ).rejects.toThrow('packagePlan total weight');

    expect(
      packagingService.calculatePackagingCostForPlan,
    ).not.toHaveBeenCalled();
    expect(packagingService.calculatePackagingCost).not.toHaveBeenCalled();
  });
});
