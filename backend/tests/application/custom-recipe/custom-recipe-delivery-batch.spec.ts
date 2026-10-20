import { BadRequestException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 多份交付批次（2026-10-21 · 第二阶段后端切片）
 *
 * ## 这组测试守着什么
 *
 * 多份订单的钱是按 N 份收的，交付时**少一份都不行**。批次把「这一单交了哪 N 份、
 * 每份当时是什么内容」冻结在一起；老的单份交付（`CustomRecipeDelivery`）继续保留，
 * 订单上的 `recipeId` 只写第一份，给尚未改造的旧页面兜底。
 *
 * 关键约束：
 *   ① 交付的份数必须与订单的 `recipeQuantity` **完全一致**（不能少交、不能多交）；
 *   ② 同一道食谱不能在同一个批次里出现两次；
 *   ③ 每道食谱都必须属于这张订单的顾客 / 狗狗；
 *   ④ 只有 PAID / IN_PROGRESS 可以首次批量交付，重新交付暂不做；
 *   ⑤ 每份都要有自己的内容快照，不能共用一份。
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610210001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: CustomRecipeStatus.PAID,
    recipeId: null,
    recipeQuantity: 2,
    ...overrides,
  };
}

function buildRecipe(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `recipe-pk-${index}`,
    recipeId: `CR175910000000${index}`,
    version: 1,
    name: `多份食谱 ${index}`,
    coverImageUrl: null,
    energyDensityKcalPerKg: 3620,
    productionLossRate: 1.07,
    nutritionStandard: 'FEDIAF_2025',
    isCustomRecipe: true,
    customerOwnerId: 'customer-1',
    customerDogId: 'dog-1',
    items: [
      {
        ratioPercent: 70,
        exampleWeight: 350,
        preparationMethod: '切丁煮熟',
        ingredient: {
          id: `ingredient-${index}-1`,
          name: '鸡胸肉',
          type: 'FOOD',
        },
      },
      {
        ratioPercent: 30,
        exampleWeight: 150,
        preparationMethod: '出锅前拌入',
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
  order?: unknown;
  recipes?: Array<Record<string, unknown>>;
  existingBatchCount?: number;
  config?: Record<string, unknown>;
  /** 模拟「这道食谱已经出现在另一张订单的批次里」 */
  occupiedDeliveryItem?: unknown;
  /** 模拟「这道食谱已经被另一张订单的旧 recipeId 占用」 */
  occupiedOrder?: { recipeId: string; orderId: string };
}) {
  const recipes = options.recipes ?? [buildRecipe(1), buildRecipe(2)];

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

  const txProxy = {
    customRecipeDeliveryBatch: {
      count: jest.fn().mockResolvedValue(options.existingBatchCount ?? 0),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'batch-1',
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

  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn(),
    },
    recipe: {
      findFirst: recipeFindFirst,
    },
    dog: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ cachedTargetFoodKcal: 940, mealsPerDay: 2 }),
    },
    customRecipeDeliveryBatch: {
      count: jest.fn().mockResolvedValue(options.existingBatchCount ?? 0),
      create: jest.fn(),
    },
    customRecipeDeliveryItem: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.occupiedDeliveryItem ?? null),
      createMany: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txProxy)),
  };

  const configService = {
    getConfig: jest.fn().mockResolvedValue({
      deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
      aftersaleWindowDays: 3,
      ...(options.config ?? {}),
    }),
  };

  const service = new CustomRecipeDeliveryService(
    prisma as unknown as PrismaService,
    configService as unknown as CustomRecipeConfigService,
  );

  const orderFindFirst = prisma.customRecipeOrder.findFirst as jest.Mock;
  // 第一次是查订单；之后是 resolveRecipe 里的「是否已被别的单占用」
  orderFindFirst
    .mockResolvedValueOnce(options.order ?? buildOrder())
    .mockImplementation(async ({ where }: any) => {
      if (
        options.occupiedOrder &&
        where?.recipeId === options.occupiedOrder.recipeId
      ) {
        return options.occupiedOrder;
      }
      return null;
    });

  return { service, prisma, txProxy, recipeFindFirst, orderFindFirst };
}

describe('CustomRecipeDeliveryService · 批量交付（多份）', () => {
  describe('成功路径', () => {
    it('★ 2 份：建 1 个批次 + 2 条独立快照，订单转已交付并把第一份写进 recipeId', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, txProxy } = createService({});

      const result = await service.deliverBatch({
        orderIdOrId: 'CR202610210001',
        recipeIds: ['CR1759100000001', 'CR1759100000002'],
        deliveredBy: 'admin-1',
        now,
      });

      // ---- 返回值：一张可直接给后台/顾客看的批次摘要 ----
      expect(result).toMatchObject({
        orderId: 'CR202610210001',
        batchId: 'batch-1',
        version: 1,
        recipeCount: 2,
        legacyRecipeId: 'recipe-pk-1',
      });
      expect(result.deliveredAt).toEqual(now);
      // 自动完成闹钟 = now + 售后窗口 3 天（与老 deliver 同源）
      expect(result.autoCompleteAt?.toISOString()).toBe(
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      );
      expect(result.recipes.map((recipe) => recipe.recipeId)).toEqual([
        'CR1759100000001',
        'CR1759100000002',
      ]);
      expect(result.recipes.map((recipe) => recipe.recipeName)).toEqual([
        '多份食谱 1',
        '多份食谱 2',
      ]);

      // ---- 批次只建一条 ----
      const batchCreate = (
        txProxy.customRecipeDeliveryBatch.create as jest.Mock
      ).mock.calls[0][0];
      expect(batchCreate.data).toMatchObject({
        orderId: 'order-pk-1',
        version: 1,
        deliveredBy: 'admin-1',
        deliveredAt: now,
      });

      // ---- 每份一条 item，各自有自己的快照 ----
      const itemsCreate = (
        txProxy.customRecipeDeliveryItem.createMany as jest.Mock
      ).mock.calls[0][0];
      expect(itemsCreate.data).toHaveLength(2);
      expect(itemsCreate.data.map((item: any) => item.recipeId)).toEqual([
        'recipe-pk-1',
        'recipe-pk-2',
      ]);
      for (const item of itemsCreate.data) {
        expect(item.batchId).toBe('batch-1');
        expect(item.recipeVersion).toBe(1);
        expect(item.contentSnapshot.schemaVersion).toBe(1);
        expect(item.contentSnapshot.recipe.items).toHaveLength(2);
        expect(item.items).toEqual([
          'RECIPE',
          'SHOPPING_SOP',
          'NUTRITION_REPORT',
        ]);
        expect(item.feedingParams).toBeTruthy();
      }

      // 两份快照不能是同一个对象/同一份内容
      expect(itemsCreate.data[0].contentSnapshot.recipe.name).toBe(
        '多份食谱 1',
      );
      expect(itemsCreate.data[1].contentSnapshot.recipe.name).toBe(
        '多份食谱 2',
      );

      // ---- 订单：状态 + 交付时间 + 老字段兼容 ----
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.where).toEqual({ id: 'order-pk-1' });
      expect(orderUpdate.data).toEqual({
        status: CustomRecipeStatus.DELIVERED,
        deliveredAt: now,
        recipeId: 'recipe-pk-1',
        autoCompleteAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      });
    });

    it('★ 自动完成闹钟读的是售后窗口配置，不是写死的天数', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, txProxy } = createService({
        config: { aftersaleWindowDays: 5 },
      });

      const result = await service.deliverBatch({
        orderIdOrId: 'CR202610210001',
        recipeIds: ['CR1759100000001', 'CR1759100000002'],
        deliveredBy: 'admin-1',
        now,
      });

      const expected = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      expect(result.autoCompleteAt).toEqual(expected);
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.autoCompleteAt).toEqual(expected);
    });

    it.each([3, 4])('★ %i 份：全部快照落库，订单写第一份', async (quantity) => {
      const recipes = Array.from({ length: quantity }, (_, index) =>
        buildRecipe(index + 1),
      );
      const { service, txProxy } = createService({
        order: buildOrder({ recipeQuantity: quantity }),
        recipes,
      });

      const result = await service.deliverBatch({
        orderIdOrId: 'CR202610210001',
        recipeIds: recipes.map((recipe) => recipe.recipeId as string),
        deliveredBy: 'admin-1',
      });

      expect(result.recipeCount).toBe(quantity);
      expect(result.recipes).toHaveLength(quantity);

      const itemsCreate = (
        txProxy.customRecipeDeliveryItem.createMany as jest.Mock
      ).mock.calls[0][0];
      expect(itemsCreate.data).toHaveLength(quantity);
      expect(itemsCreate.data.map((item: any) => item.recipeId)).toEqual(
        recipes.map((recipe) => recipe.id),
      );

      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.recipeId).toBe(recipes[0].id);
    });

    it('★ 5 份：全部快照都落库，不能只交其中一部分', async () => {
      const recipes = [1, 2, 3, 4, 5].map((index) => buildRecipe(index));
      const { service, txProxy } = createService({
        order: buildOrder({
          status: CustomRecipeStatus.IN_PROGRESS,
          recipeQuantity: 5,
        }),
        recipes,
      });

      const result = await service.deliverBatch({
        orderIdOrId: 'order-pk-1',
        recipeIds: recipes.map((recipe) => recipe.recipeId as string),
        deliveredBy: 'admin-1',
      });

      expect(result.version).toBe(1);
      expect(result.recipeCount).toBe(5);
      expect(result.recipes).toHaveLength(5);

      const itemsCreate = (
        txProxy.customRecipeDeliveryItem.createMany as jest.Mock
      ).mock.calls[0][0];
      expect(itemsCreate.data).toHaveLength(5);
      expect(itemsCreate.data.map((item: any) => item.recipeId)).toEqual(
        recipes.map((recipe) => recipe.id),
      );

      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.recipeId).toBe('recipe-pk-1');
      expect(orderUpdate.data.status).toBe(CustomRecipeStatus.DELIVERED);
    });

    it('支持用订单主键 / 食谱主键调用（与老 deliver 一致）', async () => {
      const { service } = createService({});

      const result = await service.deliverBatch({
        orderIdOrId: 'order-pk-1',
        recipeIds: ['recipe-pk-1', 'recipe-pk-2'],
        deliveredBy: 'admin-1',
      });

      expect(result.orderId).toBe('CR202610210001');
      expect(result.recipes.map((recipe) => recipe.recipeName)).toEqual([
        '多份食谱 1',
        '多份食谱 2',
      ]);
    });
  });

  describe('份数必须与订单一致', () => {
    it('订单要 2 份，只给了 1 份 → 拒绝，且不写库', async () => {
      const { service, prisma, txProxy } = createService({});

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/需要交付 2 份/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txProxy.customRecipeDeliveryBatch.create).not.toHaveBeenCalled();
    });

    it('订单要 2 份，给了 3 份 → 拒绝（不能多交）', async () => {
      const recipes = [1, 2, 3].map((index) => buildRecipe(index));
      const { service, prisma } = createService({ recipes });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: recipes.map((recipe) => recipe.recipeId as string),
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/需要交付 2 份/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('老订单没有 recipeQuantity 时按 1 份处理', async () => {
      const { service } = createService({
        order: buildOrder({ recipeQuantity: undefined }),
      });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/需要交付 1 份/);
    });

    it.each([0, -1])(
      '订单份数数据损坏（recipeQuantity = %i）→ 400 而不是 TypeError',
      async (quantity) => {
        const { service, prisma } = createService({
          order: buildOrder({ recipeQuantity: quantity }),
        });

        await expect(
          service.deliverBatch({
            orderIdOrId: 'CR202610210001',
            recipeIds: [],
            deliveredBy: 'admin-1',
          }),
        ).rejects.toThrow(/份数配置异常/);

        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );
  });

  describe('食谱不能重复', () => {
    it('同一个食谱 id 传两次 → 拒绝，且不查库/不写库', async () => {
      const { service, prisma, recipeFindFirst } = createService({});

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000001'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(recipeFindFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('同一道食谱用「业务 id + 主键」各传一次，也算重复', async () => {
      const { service, prisma } = createService({});

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'recipe-pk-1'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不能.*重复/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('★ 隐私边界：只能是这张订单的顾客 / 狗狗的食谱', () => {
    it('别人家狗狗的食谱不能混进批次', async () => {
      const recipes = [
        buildRecipe(1),
        buildRecipe(2, { customerDogId: 'dog-别的' }),
      ];
      const { service, prisma } = createService({ recipes });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不属于该订单的顾客/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('别人家顾客的食谱不能混进批次', async () => {
      const recipes = [
        buildRecipe(1),
        buildRecipe(2, { customerOwnerId: 'customer-别的' }),
      ];
      const { service } = createService({ recipes });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('★ 一道食谱只能对应一张定制单（N 份都要查，不只看第一份）', () => {
    it('第二份已经出现在另一张订单的交付批次里 → 400，且不建批次', async () => {
      const { service, prisma, txProxy } = createService({
        occupiedDeliveryItem: {
          recipeId: 'recipe-pk-2',
          recipe: { name: '多份食谱 2' },
          batch: { orderId: 'CR202610010009' },
        },
      });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/已经交付给另一张定制单（CR202610010009）/);

      expect(prisma.customRecipeDeliveryItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipeId: { in: ['recipe-pk-1', 'recipe-pk-2'] },
          }),
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txProxy.customRecipeDeliveryBatch.create).not.toHaveBeenCalled();
    });

    it('第二份被另一张订单的旧 recipeId 占用 → 400', async () => {
      const { service, prisma } = createService({
        occupiedOrder: {
          recipeId: 'recipe-pk-2',
          orderId: 'CR202610010009',
        },
      });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/已经交付给另一张定制单（CR202610010009）/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('状态守卫：只允许首次交付', () => {
    it.each([
      [CustomRecipeStatus.PENDING_PAYMENT, /还没确认收款/],
      [CustomRecipeStatus.DELIVERED, /已经交付过/],
      [CustomRecipeStatus.COMPLETED, /已经交付过/],
      [CustomRecipeStatus.CANCELLED, /已取消/],
    ])('%s 不能批量交付', async (status, message) => {
      const { service, prisma } = createService({
        order: buildOrder({ status }),
      });

      await expect(
        service.deliverBatch({
          orderIdOrId: 'CR202610210001',
          recipeIds: ['CR1759100000001', 'CR1759100000002'],
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(message);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
