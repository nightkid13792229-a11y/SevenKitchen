import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';

/**
 * 交付版本解析（P1）
 *
 * 目的：从交付页进入 DIY / 成品页时，必须按**交付那一刻的版本**取食谱，
 * 而不是最新版。解析失败一律返回 null —— 调用方据此返回 404，
 * 绝不静默回退最新版（那会让顾客看到没交付给他的配方）。
 */
describe('CustomRecipeDeliveryService.resolveDeliveredRecipeVersion', () => {
  function buildService(overrides: {
    order?: unknown;
    batchItem?: unknown;
    single?: unknown;
  }) {
    const prisma = {
      customRecipeOrder: {
        findUnique: jest.fn().mockResolvedValue(overrides.order ?? null),
      },
      customRecipeDeliveryItem: {
        findFirst: jest.fn().mockResolvedValue(overrides.batchItem ?? null),
      },
      customRecipeDelivery: {
        findFirst: jest.fn().mockResolvedValue(overrides.single ?? null),
      },
    };
    const service = new CustomRecipeDeliveryService(
      prisma as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('returns the batch item version for the order owner', async () => {
    const { service, prisma } = buildService({
      order: { id: 'order-db-1', customerId: 'user-1' },
      batchItem: { recipeVersion: 3 },
    });

    const result = await service.resolveDeliveredRecipeVersion({
      orderNo: 'CR202610230224',
      recipeBusinessId: 'recipe-biz-1',
      customerId: 'user-1',
    });

    expect(result).toEqual({ version: 3, source: 'BATCH' });
    expect(prisma.customRecipeDeliveryItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          batch: { orderId: 'order-db-1' },
          recipe: { recipeId: 'recipe-biz-1' },
        }),
      }),
    );
  });

  it('falls back to the single (legacy) delivery version', async () => {
    const { service } = buildService({
      order: { id: 'order-db-2', customerId: 'user-1' },
      batchItem: null,
      single: { recipeVersion: 2 },
    });

    const result = await service.resolveDeliveredRecipeVersion({
      orderNo: 'CR202610230001',
      recipeBusinessId: 'recipe-biz-2',
      customerId: 'user-1',
    });

    expect(result).toEqual({ version: 2, source: 'SINGLE' });
  });

  it('returns null for another customer\'s order', async () => {
    const { service, prisma } = buildService({
      order: { id: 'order-db-3', customerId: 'user-2' },
      batchItem: { recipeVersion: 1 },
    });

    const result = await service.resolveDeliveredRecipeVersion({
      orderNo: 'CR202610230003',
      recipeBusinessId: 'recipe-biz-3',
      customerId: 'user-1',
    });

    expect(result).toBeNull();
    expect(prisma.customRecipeDeliveryItem.findFirst).not.toHaveBeenCalled();
  });

  it('returns null when no delivery matches the recipe', async () => {
    const { service } = buildService({
      order: { id: 'order-db-4', customerId: 'user-1' },
      batchItem: null,
      single: null,
    });

    const result = await service.resolveDeliveredRecipeVersion({
      orderNo: 'CR202610230004',
      recipeBusinessId: 'recipe-biz-4',
      customerId: 'user-1',
    });

    expect(result).toBeNull();
  });

  it('returns null for missing params without querying', async () => {
    const { service, prisma } = buildService({});

    const result = await service.resolveDeliveredRecipeVersion({
      orderNo: '',
      recipeBusinessId: 'recipe-biz-5',
      customerId: 'user-1',
    });

    expect(result).toBeNull();
    expect(prisma.customRecipeOrder.findUnique).not.toHaveBeenCalled();
  });
});
