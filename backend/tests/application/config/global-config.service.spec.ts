import { BadRequestException } from '@nestjs/common';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';

/**
 * GlobalConfigService 的守卫测试。
 *
 * 除 DIY 制作单背景图清理外，2026-10-21 新增「内部生产损耗系数」：
 * 它从 CustomRecipeConfig 迁到 GlobalConfig，必须能读、能写、能校验，
 * 且**只影响之后新建的食谱**，不碰任何已有 Recipe 行。
 */
const buildRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'singleton',
  laborHourlyRate: { toString: () => '30' },
  minOrderWeightG: 1000,
  defaultBatchCapacityG: { toString: () => '5000' },
  minPotWeightG: 2000,
  targetMargin: { toString: () => '0.4' },
  overheadCostPerKg: { toString: () => '2' },
  targetBatchUtilization: { toString: () => '0.8' },
  supplementLossRate: { toString: () => '1.05' },
  productionLossRate: { toString: () => '1.07' },
  autoDeductInventoryOnProduction: false,
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
  vaccineFeatureEnabled: true,
  vaccineFeatureNotice: null,
  healthExtractionDailyLimit: 500,
  ...overrides,
});

const buildService = (row: unknown) => {
  const prisma = {
    globalConfig: {
      findUnique: jest.fn().mockResolvedValue(row),
      upsert: jest
        .fn()
        .mockImplementation(
          async ({
            update,
            create,
          }: {
            update: Record<string, unknown>;
            create: Record<string, unknown>;
          }) => ({
            ...buildRow(),
            ...create,
            ...update,
          }),
        ),
    },
    /**
     * 迁移只改“新建食谱从哪里读”，**不允许**顺手回写已有食谱。
     * 这个 mock 若被调用，下面「不动已有食谱」的测试会红。
     */
    recipe: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const cosService = {
    deleteImageByUrl: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new GlobalConfigService(prisma as any, cosService as any),
    prisma,
    cosService,
  };
};

describe('GlobalConfigService DIY sheet header background cleanup', () => {
  it('deletes the previous DIY sheet header background after replacement', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const newUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/new.jpg';
    const { service, cosService } = buildService(
      buildRow({ diySheetHeaderBgImageUrl: oldUrl }),
    );

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: newUrl });

    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(oldUrl);
  });

  it('deletes the previous DIY sheet header background after removal', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const { service, cosService } = buildService(
      buildRow({ diySheetHeaderBgImageUrl: oldUrl }),
    );

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: null });

    expect(cosService.deleteImageByUrl).toHaveBeenCalledWith(oldUrl);
  });

  it('keeps the previous COS object when the DIY sheet header background is unchanged', async () => {
    const oldUrl =
      'https://cdn.sevenkitchen.example/diy-sheet-header-bg/old.jpg';
    const { service, cosService } = buildService(
      buildRow({ diySheetHeaderBgImageUrl: oldUrl }),
    );

    await service.updateGlobalConfig({ diySheetHeaderBgImageUrl: oldUrl });

    expect(cosService.deleteImageByUrl).not.toHaveBeenCalled();
  });
});

describe('GlobalConfigService · 内部生产损耗系数', () => {
  it('读取时把 Prisma Decimal 转成 number', async () => {
    const { service } = buildService(
      buildRow({ productionLossRate: { toString: () => '1.12' } }),
    );

    const config = await service.getGlobalConfig();

    expect(config.productionLossRate).toBe(1.12);
  });

  it('配置行不存在时返回默认 1.07', async () => {
    const { service } = buildService(null);

    const config = await service.getGlobalConfig();

    expect(config.productionLossRate).toBe(1.07);
  });

  it('库里的值不合法（<1 / >2 / 非数字）时按 1.07 读，不把荒谬值传给新食谱', async () => {
    for (const bad of [
      { toString: () => '0.8' },
      { toString: () => '2.5' },
      null,
      'not-a-number',
    ]) {
      const { service } = buildService(
        buildRow({ productionLossRate: bad }),
      );
      const config = await service.getGlobalConfig();
      expect(config.productionLossRate).toBe(1.07);
    }
  });

  it('保存时接受 1–2 的系数并持久化', async () => {
    const { service, prisma } = buildService(buildRow());

    const config = await service.updateGlobalConfig({
      productionLossRate: 1.15,
    });

    expect(prisma.globalConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ productionLossRate: 1.15 }),
      }),
    );
    expect(config.productionLossRate).toBeCloseTo(1.15);
  });

  it('1 与 2 是允许的边界值', async () => {
    for (const value of [1, 2]) {
      const { service } = buildService(buildRow());
      await expect(
        service.updateGlobalConfig({ productionLossRate: value }),
      ).resolves.toBeDefined();
    }
  });

  it('小于 1 或大于 2 被拒绝，且不会写库', async () => {
    for (const bad of [0.99, 0.5, 2.01, 3, Number.NaN]) {
      const { service, prisma } = buildService(buildRow());
      await expect(
        service.updateGlobalConfig({ productionLossRate: bad }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.globalConfig.upsert).not.toHaveBeenCalled();
    }
  });

  it('不传这个字段时不会覆盖库里已有的值（其它配置照常保存）', async () => {
    const { service, prisma } = buildService(
      buildRow({ productionLossRate: { toString: () => '1.23' } }),
    );

    await service.updateGlobalConfig({ minOrderWeightG: 1200 });

    const update = prisma.globalConfig.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('productionLossRate');
    expect(update.minOrderWeightG).toBe(1200);
  });

  it('★ 保存全局损耗率不会回写已有食谱（迁移只影响之后新建的）', async () => {
    const { service, prisma } = buildService(buildRow());

    await service.updateGlobalConfig({ productionLossRate: 1.2 });

    expect(prisma.recipe.updateMany).not.toHaveBeenCalled();
    expect(prisma.recipe.update).not.toHaveBeenCalled();
  });
});
