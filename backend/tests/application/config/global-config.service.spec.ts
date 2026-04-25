import { GlobalConfigService } from '../../../src/application/config/global-config.service';

describe('GlobalConfigService DIY sheet header background cleanup', () => {
  const buildService = (existingUrl: string | null) => {
    const prisma = {
      globalConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({
          laborHourlyRate: { toString: () => '30' },
          minOrderWeightG: 1000,
          defaultBatchCapacityG: { toString: () => '5000' },
          minPotWeightG: 2000,
          targetMargin: { toString: () => '0.4' },
          overheadCostPerKg: { toString: () => '2' },
          targetBatchUtilization: { toString: () => '0.8' },
          supplementLossRate: { toString: () => '1.05' },
          defaultProductLabelId: null,
          defaultIcePackId: null,
          defaultShippingTemplateId: null,
          packageExampleImageUrl: null,
          shippingCompanyLogoUrl: null,
          paymentTimeoutMinutes: 30,
          ingredientPriceAutoApproveThreshold: { toString: () => '0.08' },
          equipmentRecommendations: null,
          homeHeaderBgImageUrl: null,
          diySheetHeaderBgImageUrl: null,
        }),
      },
    };
    const cosService = {
      deleteImageByUrl: jest.fn().mockResolvedValue(undefined),
    };

    prisma.globalConfig.findUnique.mockResolvedValue({
      diySheetHeaderBgImageUrl: existingUrl,
    });

    return {
      service: new GlobalConfigService(prisma as any, cosService as any),
      prisma,
      cosService,
    };
  };

  it('deletes the previous DIY sheet header background after replacement', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const newUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/new.jpg';
    const { service, cosService } = buildService(oldUrl);

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: newUrl });

    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(oldUrl);
  });

  it('deletes the previous DIY sheet header background after removal', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const { service, cosService } = buildService(oldUrl);

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: null });

    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(oldUrl);
  });

  it('keeps the previous COS object when the DIY sheet header background is unchanged', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const { service, cosService } = buildService(oldUrl);

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: oldUrl });

    expect(cosService.deleteImageByUrl).not.toHaveBeenCalled();
  });
});
