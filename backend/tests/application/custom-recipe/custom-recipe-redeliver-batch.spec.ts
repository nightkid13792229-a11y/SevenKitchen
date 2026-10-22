import { BadRequestException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 多份订单 · 按选中份重新交付（2026-10-21 · 第三阶段售后）
 *
 * ## 这组测试守着什么
 *
 * 顾客只对其中几份不满意时，后台不能整单重交 —— 那会把没改的份也换成
 * "当前食谱"，等于悄悄改了顾客已经认可的内容。正确行为是：
 *   · 新批次仍然包含**全部**份（否则顾客会看到"买了 3 份只剩 2 份"）；
 *   · 只有被选中的份用**当前食谱**重新生成快照；
 *   · 未选中的份逐字段复制旧批次（内容 / 交付物 / 喂食参数 / 食谱版本）；
 *   · 订单交付时间、自动完成闹钟、老字段 `recipeId` 同步更新；
 *   · 不发任何通知（通知由控制器统一发一条）；
 *   · 不碰老的单份交付表（老订单路径一个字都不改）。
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610210001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: CustomRecipeStatus.DELIVERED,
    recipeId: 'recipe-pk-1',
    recipeQuantity: 3,
    ...overrides,
  };
}

function buildOldSnapshot(index: number) {
  return {
    schemaVersion: 1,
    recipe: {
      recipeId: `CR-OLD-${index}`,
      name: `旧食谱 ${index}`,
      items: [{ name: `旧食材 ${index}` }],
    },
    feeding: {
      dailyIntakeG: 100 + index,
      mealsPerDay: 2,
      perMealG: 50,
      cycleDays: 7,
    },
    nutrition: {
      standard: 'FEDIAF_2025',
      energyDensityKcalPerKg: 3500,
      macros: null,
    },
    shopping: { lines: [], totalNetG: 0 },
    supplements: [],
    steps: [],
    generatedAt: '2026-10-20T02:00:00.000Z',
  };
}

function buildOldFeeding(index: number) {
  return {
    dailyIntakeG: 100 + index,
    mealsPerDay: 2,
    perMealG: 50,
    cycleDays: 7,
  };
}

function buildLatestItem(
  index: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${index}`,
    recipeId: `recipe-pk-${index}`,
    recipeVersion: 1,
    contentSnapshot: buildOldSnapshot(index),
    items: ['RECIPE'],
    feedingParams: buildOldFeeding(index),
    recipe: {
      recipeId: `CR-OLD-${index}`,
      name: `旧食谱 ${index}`,
    },
    ...overrides,
  };
}

function buildLatestBatch(
  items: Array<Record<string, unknown>> = [
    buildLatestItem(1),
    buildLatestItem(2),
    buildLatestItem(3),
  ],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-20T02:00:00.000Z'),
    items,
    ...overrides,
  };
}

function buildRecipe(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `recipe-pk-${index}`,
    recipeId: `CR175910000000${index}`,
    version: 2,
    name: `新食谱 ${index}`,
    coverImageUrl: null,
    energyDensityKcalPerKg: 3620,
    productionLossRate: 1.07,
    nutritionStandard: 'FEDIAF_2025',
    sellingPoint: `卖点 ${index}`,
    nutritionDetailedData: {
      proteinPercent: 30,
      fatPercent: 15,
    },
    isCustomRecipe: true,
    customerOwnerId: 'customer-1',
    customerDogId: 'dog-1',
    items: [
      {
        ratioPercent: 70,
        exampleWeight: 350,
        preparationMethod: '切丁煮熟',
        supplementTargets: null,
        ingredient: {
          id: `ingredient-${index}-1`,
          name: `新食材 ${index}`,
          type: 'FOOD',
        },
      },
      {
        ratioPercent: 30,
        exampleWeight: 150,
        preparationMethod: '出锅前拌入',
        supplementTargets: null,
        ingredient: {
          id: `ingredient-${index}-2`,
          name: '鱼油',
          type: 'SUPPLEMENT',
        },
      },
    ],
    ...overrides,
  };
}

function createService(options: {
  order?: Record<string, unknown>;
  latestBatch?: Record<string, unknown> | null;
  recipes?: Array<Record<string, unknown>>;
  config?: Record<string, unknown>;
}) {
  const recipes = options.recipes ?? [
    buildRecipe(1),
    buildRecipe(2),
    buildRecipe(3),
  ];
  const latestBatch =
    options.latestBatch === undefined
      ? buildLatestBatch()
      : options.latestBatch;

  const orderFindFirst = jest
    .fn()
    .mockResolvedValueOnce(options.order ?? buildOrder())
    /** 之后都是 `resolveRecipe` 的「是否已被别的订单占用」 */
    .mockResolvedValue(null);

  const recipeFindFirst = jest.fn(async ({ where }: any) => {
    const keys: string[] = (where.OR ?? []).flatMap((condition: any) =>
      [condition.recipeId, condition.id].filter(
        (value: unknown): value is string => typeof value === 'string',
      ),
    );
    return (
      recipes.find(
        (recipe) =>
          keys.includes(recipe.id as string) ||
          keys.includes(recipe.recipeId as string),
      ) ?? null
    );
  });

  const dogFindUnique = jest.fn(async ({ select }: any) => {
    if (
      select &&
      Object.prototype.hasOwnProperty.call(select, 'cachedTargetFoodKcal')
    ) {
      return { cachedTargetFoodKcal: 940, mealsPerDay: 2 };
    }
    return {
      name: '豆豆',
      birthday: new Date('2022-01-01T00:00:00.000Z'),
      currentWeightKg: 11.2,
      customBreedName: null,
      breedId: null,
    };
  });

  const txProxy = {
    customRecipeDeliveryBatch: {
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'batch-2',
        ...data,
      })),
    },
    customRecipeDeliveryItem: {
      createMany: jest
        .fn()
        .mockImplementation(async ({ data }: any) => ({ count: data.length })),
    },
    customRecipeOrder: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const legacyDelivery = {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  };

  const prisma = {
    customRecipeOrder: { findFirst: orderFindFirst },
    customRecipeDeliveryBatch: {
      findFirst: jest.fn().mockResolvedValue(latestBatch),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
    },
    customRecipeDeliveryItem: {
      createMany: jest.fn(),
    },
    customRecipeDelivery: legacyDelivery,
    recipe: { findFirst: recipeFindFirst },
    preparationMethod: { findMany: jest.fn().mockResolvedValue([]) },
    dog: { findUnique: dogFindUnique },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txProxy)),
  };

  const configService = {
    getConfig: jest.fn().mockResolvedValue({
      deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
      aftersaleWindowDays: 3,
      ...(options.config ?? {}),
    }),
  };

  const customerMessages = { send: jest.fn().mockResolvedValue(true) };

  const service = new CustomRecipeDeliveryService(
    prisma as unknown as PrismaService,
    configService as unknown as CustomRecipeConfigService,
    customerMessages as any,
  );

  return {
    service,
    prisma,
    txProxy,
    recipeFindFirst,
    orderFindFirst,
    legacyDelivery,
    customerMessages,
  };
}

describe('CustomRecipeDeliveryService · 按选中份重新交付', () => {
  describe('成功路径：2 / 3 份选中', () => {
    it('★ 新批次仍含全部 3 份，只刷新选中的 2 份快照', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, txProxy, recipeFindFirst } = createService({});

      const result = await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        // 故意与批次顺序相反：摘要/通知要按入参顺序，落库要按批次顺序
        deliveryItemIds: ['item-3', 'item-1'],
        deliveredBy: 'admin-1',
        now,
      });

      // ---- 返回值摘要 ----
      expect(result).toMatchObject({
        orderId: 'CR202610210001',
        batchId: 'batch-2',
        version: 2,
        recipeCount: 3,
        selectedItemIds: ['item-3', 'item-1'],
        legacyRecipeId: 'recipe-pk-1',
      });
      expect(result.deliveredAt).toEqual(now);
      expect(result.autoCompleteAt?.toISOString()).toBe(
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      );
      expect(result.selectedRecipes).toEqual([
        {
          deliveryItemId: 'item-3',
          recipeId: 'CR1759100000003',
          recipeName: '新食谱 3',
          itemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
        },
        {
          deliveryItemId: 'item-1',
          recipeId: 'CR1759100000001',
          recipeName: '新食谱 1',
          itemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
        },
      ]);

      // 只给了选中的两份重新生成快照，未选中的一份不查当前食谱
      expect(recipeFindFirst).toHaveBeenCalledTimes(2);

      // ---- 新批次 ----
      const batchCreate = (
        txProxy.customRecipeDeliveryBatch.create as jest.Mock
      ).mock.calls[0][0];
      expect(batchCreate.data).toMatchObject({
        orderId: 'order-pk-1',
        version: 2,
        deliveredBy: 'admin-1',
        deliveredAt: now,
        notifyStatus: 'PENDING',
      });

      // ---- 3 条明细，顺序与最新批次一致 ----
      const itemsCreate = (
        txProxy.customRecipeDeliveryItem.createMany as jest.Mock
      ).mock.calls[0][0];
      expect(itemsCreate.data).toHaveLength(3);
      expect(itemsCreate.data.map((item: any) => item.recipeId)).toEqual([
        'recipe-pk-1',
        'recipe-pk-2',
        'recipe-pk-3',
      ]);
      for (const item of itemsCreate.data) {
        expect(item.batchId).toBe('batch-2');
      }

      // 选中第 1 份：快照用当前食谱（名字、版本、食材都变了）
      expect(itemsCreate.data[0].recipeVersion).toBe(2);
      expect(itemsCreate.data[0].contentSnapshot.recipe.name).toBe('新食谱 1');
      expect(itemsCreate.data[0].contentSnapshot.recipe.items).toHaveLength(2);
      expect(itemsCreate.data[0].feedingParams).toEqual({
        dailyIntakeG: 259.7,
        mealsPerDay: 2,
        perMealG: 129.8,
        cycleDays: 7,
      });

      // 未选中第 2 份：逐字段复制，一个都不重算
      expect(itemsCreate.data[1].recipeVersion).toBe(1);
      expect(itemsCreate.data[1].contentSnapshot).toEqual(buildOldSnapshot(2));
      expect(itemsCreate.data[1].items).toEqual(['RECIPE']);
      expect(itemsCreate.data[1].feedingParams).toEqual(buildOldFeeding(2));

      // 选中第 3 份：同样刷新
      expect(itemsCreate.data[2].recipeVersion).toBe(2);
      expect(itemsCreate.data[2].contentSnapshot.recipe.name).toBe('新食谱 3');
      expect(itemsCreate.data[2].contentSnapshot.recipe.items).toHaveLength(2);

      // ---- 订单：交付时间 / 闹钟 / 老 recipeId ----
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.where).toEqual({ id: 'order-pk-1' });
      expect(orderUpdate.data).toMatchObject({
        status: CustomRecipeStatus.DELIVERED,
        recipeId: 'recipe-pk-1',
        deliveredAt: now,
        autoCompleteAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
    });

    it('★ 自动完成闹钟读售后窗口配置（不是写死 3 天）', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, txProxy } = createService({
        config: { aftersaleWindowDays: 5 },
      });

      const result = await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        deliveryItemIds: ['item-2'],
        deliveredBy: 'admin-1',
        now,
      });

      const expected = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      expect(result.autoCompleteAt).toEqual(expected);
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.autoCompleteAt).toEqual(expected);
    });

    it('全部选中时每份都用当前食谱刷新', async () => {
      const { service, txProxy, recipeFindFirst } = createService({});

      const result = await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        deliveryItemIds: ['item-1', 'item-2', 'item-3'],
        deliveredBy: 'admin-1',
      });

      expect(result.recipeCount).toBe(3);
      expect(result.selectedRecipes.map((item) => item.recipeName)).toEqual([
        '新食谱 1',
        '新食谱 2',
        '新食谱 3',
      ]);
      expect(recipeFindFirst).toHaveBeenCalledTimes(3);

      const itemsCreate = (
        txProxy.customRecipeDeliveryItem.createMany as jest.Mock
      ).mock.calls[0][0];
      expect(
        itemsCreate.data.every((item: any) =>
          item.contentSnapshot.recipe.name.startsWith('新食谱'),
        ),
      ).toBe(true);
    });

    it('COMPLETED 订单也允许重新交付（售后改稿后重交）', async () => {
      const { service, txProxy } = createService({
        order: buildOrder({ status: CustomRecipeStatus.COMPLETED }),
      });

      const result = await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        deliveryItemIds: ['item-2'],
        deliveredBy: 'admin-1',
      });

      expect(result.version).toBe(2);
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.status).toBe(CustomRecipeStatus.DELIVERED);
    });

    it('用订单主键调用同样能定位到订单', async () => {
      const { service } = createService({});

      const result = await service.redeliverBatchItems({
        orderIdOrId: 'order-pk-1',
        deliveryItemIds: ['item-1'],
        deliveredBy: 'admin-1',
      });

      expect(result.orderId).toBe('CR202610210001');
    });

    it('★ 不写老的单份交付表，也不在 service 里发通知', async () => {
      const { service, legacyDelivery, customerMessages } = createService({});

      await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        deliveryItemIds: ['item-2', 'item-3'],
        deliveredBy: 'admin-1',
      });

      expect(legacyDelivery.create).not.toHaveBeenCalled();
      expect(legacyDelivery.findFirst).not.toHaveBeenCalled();
      expect(legacyDelivery.count).not.toHaveBeenCalled();
      expect(customerMessages.send).not.toHaveBeenCalled();
    });
  });

  describe('选中范围必须合法', () => {
    it('空数组 → 400，不建批次', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: [],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不能为空/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('不是数组 → 400', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: 'item-1' as unknown as string[],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('含空字符串 / 非字符串 → 400', async () => {
      const blank = createService({});
      await expect(
        blank.service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1', '  '],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/非空字符串/);
      expect(blank.prisma.$transaction).not.toHaveBeenCalled();

      // 每次调用都会先查一次订单，所以换一个干净的 service 实例
      const notString = createService({});
      await expect(
        notString.service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1', 123] as unknown as string[],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/非空字符串/);
      expect(notString.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('重复 id → 400（重复会让同一份刷新两次并撞唯一约束）', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1', 'item-1'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不能重复/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('超过 5 份 → 400（业务硬上限）', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['1', '2', '3', '4', '5', '6'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/最多重新交付 5 份/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('★ 不属于最新批次的 id（别的订单 / 更早版本）→ 400，且不刷新快照', async () => {
      const { service, prisma, recipeFindFirst } = createService({});

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1', 'item-来自别的订单'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不在本次交付里/);

      expect(recipeFindFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('★ 最新批次按版本号倒序取，不是随便取一条', async () => {
      const { service, prisma } = createService({});

      await service.redeliverBatchItems({
        orderIdOrId: 'CR202610210001',
        deliveryItemIds: ['item-1'],
        deliveredBy: 'admin-1',
      });

      expect(prisma.customRecipeDeliveryBatch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: 'order-pk-1' },
          orderBy: { version: 'desc' },
        }),
      );
    });

    it('没有批次（老订单）→ 400，提示不能按份重交', async () => {
      const { service, prisma } = createService({ latestBatch: null });

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/没有多份交付批次/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('批次没有明细（脏数据）→ 400 而不是 TypeError', async () => {
      const { service, prisma } = createService({
        latestBatch: buildLatestBatch([]),
      });

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/没有明细/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('状态守卫：只有已经交付过的订单能按份重交', () => {
    it.each([
      [CustomRecipeStatus.PENDING_PAYMENT, /还没确认收款/],
      [CustomRecipeStatus.PAID, /还没有交付过/],
      [CustomRecipeStatus.IN_PROGRESS, /还没有交付过/],
      [CustomRecipeStatus.CANCELLED, /已取消/],
    ])('%s 不能按份重新交付', async (status, message) => {
      const { service, prisma } = createService({
        order: buildOrder({ status }),
      });

      await expect(
        service.redeliverBatchItems({
          orderIdOrId: 'CR202610210001',
          deliveryItemIds: ['item-1'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(message);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
