import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 交付服务 · 测试（2026-10-16，批次 2.1）
 *
 * ## 这组测试守着什么
 *
 * 交付是**不可逆**的动作：食谱一旦交出去，顾客手机上就有了。
 * 所以下面三类断言最重要：
 *
 *   ① **隐私边界** —— 绝不能把别人家狗的定制食谱交付出去
 *      （2026-09-28 专门修过，那次的教训不能再犯）
 *   ② **一道食谱只能一张单** —— 复用会让两单共用一份产出，
 *      而 ¥150 抵扣额度是绑在那道食谱上的
 *   ③ **交付 = 冻结** —— 快照必须落库，且喂食量由**后端**算，不是前端传的
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610160001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: CustomRecipeStatus.IN_PROGRESS,
    recipeId: null,
    updatedAt: new Date('2026-10-16T10:00:00+08:00'),
    ...overrides,
  };
}

function buildRecipe(overrides: Record<string, unknown> = {}) {
  return {
    id: 'recipe-pk-1',
    recipeId: 'CR1759000000000',
    version: 1,
    name: '豆豆的减重食谱',
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
        ingredient: { name: '鸡胸肉', type: 'FOOD' },
      },
      {
        ratioPercent: 30,
        exampleWeight: 150,
        preparationMethod: '出锅前拌入',
        ingredient: { name: '鱼油', type: 'SUPPLEMENT' },
      },
    ],
    ...overrides,
  };
}

function createService(options: {
  order?: unknown;
  recipe?: unknown;
  occupied?: unknown;
  dog?: unknown;
  existingDeliveryCount?: number;
  config?: Record<string, unknown>;
}) {
  const txProxy = {
    customRecipeDelivery: {
      count: jest
        .fn()
        .mockResolvedValue(options.existingDeliveryCount ?? 0),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'delivery-1',
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    customRecipeOrder: {
      update: jest.fn().mockResolvedValue({}),
    },
  };

  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
      update: jest.fn().mockResolvedValue({}),
    },
    recipe: {
      findFirst: jest.fn().mockResolvedValue(options.recipe ?? buildRecipe()),
    },
    dog: {
      /**
       * ⚠️ 这里**不能**用 `options.dog ?? 默认值` —— `??` 会把显式传进来的
       * `null`（"这只狗查不到"）也替换成默认值，于是那条测试测的是别的东西。
       * 我自己就踩了：测试红了才发现"取不到档案"这一支压根没跑到。
       */
      findUnique: jest.fn().mockResolvedValue(
        'dog' in options
          ? options.dog
          : { cachedTargetFoodKcal: 940, mealsPerDay: 2 },
      ),
    },
    customRecipeDelivery: {
      count: jest.fn().mockResolvedValue(options.existingDeliveryCount ?? 0),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'delivery-1',
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txProxy)),
  };

  const configService = {
    getConfig: jest.fn().mockResolvedValue({
      deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP', 'NUTRITION_REPORT'],
      autoCompleteDays: 3,
      ...(options.config ?? {}),
    }),
  };

  const service = new CustomRecipeDeliveryService(
    prisma as unknown as PrismaService,
    configService as unknown as CustomRecipeConfigService,
  );

  // 唯一约束那条检查走的是 prisma.customRecipeOrder.findFirst 的第二次调用
  const orderFindFirst = prisma.customRecipeOrder.findFirst as jest.Mock;
  orderFindFirst
    .mockResolvedValueOnce(options.order ?? buildOrder())
    .mockResolvedValue(options.occupied ?? null);

  return { service, prisma, txProxy, configService, orderFindFirst };
}

describe('CustomRecipeDeliveryService', () => {
  describe('交付成功路径', () => {
    it('★ 交付 = 冻结：快照落库，且版本号为 1', async () => {
      const { service, txProxy } = createService({});

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      expect(result.version).toBe(1);
      expect(result.redelivered).toBe(false);
      expect(result.recipeBizId).toBe('CR1759000000000');

      const createArg = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0];
      const snapshot = createArg.data.contentSnapshot;
      expect(snapshot.schemaVersion).toBe(1);
      expect(snapshot.recipe.name).toBe('豆豆的减重食谱');
      expect(snapshot.recipe.items).toHaveLength(2);
    });

    it('★ 喂食量由**后端**算：每天需要 940 kcal ÷ 3620 kcal/kg × 1000 ≈ 259.7g', async () => {
      const { service, txProxy } = createService({});

      await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      const snapshot = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0].data.contentSnapshot;

      expect(snapshot.feeding.dailyIntakeG).toBeCloseTo(259.7, 1);
      expect(snapshot.feeding.mealsPerDay).toBe(2);
      expect(snapshot.feeding.perMealG).toBeCloseTo(129.8, 1);
    });

    it('★ 取不到狗狗档案时喂食量为 null —— 不猜', async () => {
      const { service, txProxy } = createService({ dog: null });

      await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      const snapshot = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0].data.contentSnapshot;
      // 猜一个"每天 250g"会让顾客照着喂，喂错是我们造成的
      expect(snapshot.feeding.dailyIntakeG).toBeNull();
      expect(snapshot.feeding.perMealG).toBeNull();
    });

    it('订单转已交付，并设置自动完成闹钟（交付时间 + 配置天数）', async () => {
      const now = new Date('2026-10-16T10:00:00+08:00');
      const { service, txProxy } = createService({});

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
        now,
      });

      const updateArg = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(updateArg.data.status).toBe(CustomRecipeStatus.DELIVERED);
      expect(updateArg.data.deliveredAt).toEqual(now);
      // 3 天后
      expect(result.autoCompleteAt?.toISOString()).toBe(
        new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      );
    });

    it('★ 采购清单进了快照，且用的是库里的损耗系数', async () => {
      const { service, txProxy } = createService({});

      await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
        cycleDays: 14,
      });

      const snapshot = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0].data.contentSnapshot;

      // 每天 259.7g × 14 天 = 3635.8g
      expect(snapshot.shopping.totalNetG).toBeCloseTo(3635.8, 0);
      expect(snapshot.shopping.lines).toHaveLength(2);
      // 鸡胸肉占 70%：净 2545.1g，采购 2545.1 × 1.07 = 2723.3g
      const chicken = snapshot.shopping.lines.find(
        (line: { name: string }) => line.name === '鸡胸肉',
      );
      /**
       * 容差给到 0.5 而不是 0.05：`purchaseG` 在计算时保留 1 位小数
       * （2723.257 → 2723.2），与未取整的乘积差 0.057。
       * 这是**取整本身造成的**，不是算错。
       */
      expect(chicken.purchaseG).toBeCloseTo(chicken.netG * 1.07, 0);
      // 对外给的是系数（与库里一致）
      expect(snapshot.shopping.lossRate).toBeCloseTo(1.07, 4);
    });

    it('★ 没传做几天时按 7 天算（与小程序 DIY 的默认值一致）', async () => {
      const { service, txProxy } = createService({});

      await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      const snapshot = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0].data.contentSnapshot;
      expect(snapshot.feeding.cycleDays).toBe(7);
    });

    it('补充剂被单独识别出来（不与食材混）', async () => {
      const { service, txProxy } = createService({});

      await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      const snapshot = (txProxy.customRecipeDelivery.create as jest.Mock).mock
        .calls[0][0].data.contentSnapshot;
      expect(snapshot.supplements).toHaveLength(1);
      expect(snapshot.supplements[0].name).toBe('鱼油');
      expect(snapshot.supplements[0].timing).toBe('出锅前拌入');
    });
  });

  describe('★ 隐私边界（2026-09-28 专门修过，不能再犯）', () => {
    it('别人家狗的食谱不能交付', async () => {
      const { service } = createService({
        recipe: buildRecipe({ customerDogId: 'dog-别的' }),
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/不属于该订单的顾客/);
    });

    it('别人家顾客的食谱不能交付', async () => {
      const { service } = createService({
        recipe: buildRecipe({ customerOwnerId: 'customer-别的' }),
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('公开食谱不能挂到定制单上', async () => {
      const { service } = createService({
        recipe: buildRecipe({ isCustomRecipe: false }),
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('★ 一道食谱只能对应一张定制单', () => {
    it('已被别的单占用时拒绝，并说明去哪张单处理', async () => {
      const { service } = createService({
        occupied: { orderId: 'CR202610010009' },
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/已经交付给另一张定制单（CR202610010009）/);
    });
  });

  describe('状态校验（走状态机，不是自己写 if）', () => {
    it('待付款不能交付，并说明原因', async () => {
      const { service } = createService({
        order: buildOrder({ status: CustomRecipeStatus.PENDING_PAYMENT }),
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/还没确认收款/);
    });

    it('已取消不能交付', async () => {
      const { service } = createService({
        order: buildOrder({ status: CustomRecipeStatus.CANCELLED }),
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toThrow(/已取消/);
    });

    it('订单不存在时报"不存在"，不是 500', async () => {
      const { service, orderFindFirst } = createService({});
      orderFindFirst.mockReset();
      orderFindFirst.mockResolvedValue(null);

      await expect(
        service.deliver({
          orderIdOrId: 'CR-不存在',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('重新交付 = 新版本 + 旧版本标记被替换', () => {
    it('已交付的单再交一次，版本号为 2 且旧版本被标记', async () => {
      const { service, txProxy } = createService({
        order: buildOrder({ status: CustomRecipeStatus.DELIVERED }),
        existingDeliveryCount: 1,
      });

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      expect(result.version).toBe(2);
      expect(result.redelivered).toBe(true);

      // 旧版本被标记"已被替换"，但**没有删** —— 客服要能翻回上一版
      const updateManyArg = (txProxy.customRecipeDelivery.updateMany as jest.Mock)
        .mock.calls[0][0];
      expect(updateManyArg.where.version).toEqual({ lt: 2 });
      expect(updateManyArg.data.replacedByDeliveryId).toBe('delivery-1');
    });

    it('已完成（售后改稿后）也能重新交付', async () => {
      const { service } = createService({
        order: buildOrder({ status: CustomRecipeStatus.COMPLETED }),
        existingDeliveryCount: 1,
      });

      await expect(
        service.deliver({
          orderIdOrId: 'CR202610160001',
          recipeIdOrBizId: 'CR1759000000000',
          deliveredBy: 'admin-1',
        }),
      ).resolves.toMatchObject({ version: 2 });
    });
  });

  describe('确认收到', () => {
    function createForConfirm(options: {
      order?: unknown;
      delivery?: unknown;
    }) {
      const txProxy = {
        customRecipeDelivery: { update: jest.fn().mockResolvedValue({}) },
        customRecipeOrder: { update: jest.fn().mockResolvedValue({}) },
      };
      const prisma = {
        customRecipeOrder: {
          findFirst: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
        },
        customRecipeDelivery: {
          findFirst: jest.fn().mockResolvedValue(options.delivery ?? null),
        },
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: any) => fn(txProxy)),
      };
      const service = new CustomRecipeDeliveryService(
        prisma as unknown as PrismaService,
        { getConfig: jest.fn() } as unknown as CustomRecipeConfigService,
      );
      return { service, txProxy, prisma };
    }

    it('已交付的单可以确认收到 → 转已完成并清掉闹钟', async () => {
      const now = new Date('2026-10-18T09:00:00+08:00');
      const { service, txProxy } = createForConfirm({
        order: buildOrder({ status: CustomRecipeStatus.DELIVERED }),
        delivery: { id: 'delivery-1', version: 1, confirmedAt: null },
      });

      const result = await service.confirmReceipt({
        orderIdOrId: 'CR202610160001',
        now,
      });

      expect(result).toEqual({ confirmed: true, alreadyConfirmed: false });
      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.status).toBe(CustomRecipeStatus.COMPLETED);
      expect(orderUpdate.data.completedAt).toEqual(now);
      // 完成后清掉自动完成闹钟，免得定时任务一直扫到这张单
      expect(orderUpdate.data.autoCompleteAt).toBeNull();
    });

    it('★ 幂等：重复确认不报错，也**不刷新**确认时间', async () => {
      const { service, txProxy } = createForConfirm({
        order: buildOrder({ status: CustomRecipeStatus.COMPLETED }),
        delivery: {
          id: 'delivery-1',
          version: 1,
          confirmedAt: new Date('2026-10-17T09:00:00+08:00'),
        },
      });

      const result = await service.confirmReceipt({
        orderIdOrId: 'CR202610160001',
        now: new Date('2026-10-20T09:00:00+08:00'),
      });

      expect(result).toEqual({ confirmed: true, alreadyConfirmed: true });
      // 一次写库都没有 —— "什么时候确认的"是售后窗口的起算依据，不能被刷新
      expect(txProxy.customRecipeDelivery.update).not.toHaveBeenCalled();
      expect(txProxy.customRecipeOrder.update).not.toHaveBeenCalled();
    });

    it('没有交付记录时给一句人话', async () => {
      const { service } = createForConfirm({
        order: buildOrder({ status: CustomRecipeStatus.PAID }),
        delivery: null,
      });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610160001' }),
      ).rejects.toThrow(/还没有交付记录/);
    });

    it('已取消的单不能确认收到', async () => {
      const { service } = createForConfirm({
        order: buildOrder({ status: CustomRecipeStatus.CANCELLED }),
        delivery: { id: 'delivery-1', version: 1, confirmedAt: null },
      });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610160001' }),
      ).rejects.toThrow(/已取消/);
    });

    it('还没交付的单不能确认收到（状态机拦住）', async () => {
      const { service } = createForConfirm({
        order: buildOrder({ status: CustomRecipeStatus.PENDING_PAYMENT }),
        delivery: { id: 'delivery-1', version: 1, confirmedAt: null },
      });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610160001' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('交付物清单', () => {
    it('配置里开了、内容也有 → 都出现（采购清单从批次 2.2 起有内容了）', async () => {
      const { service } = createService({
        config: { deliveryItemCodes: ['RECIPE', 'SHOPPING_SOP'] },
      });

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
      });

      // 有了喂食量就能算出采购量 → 采购与制作单这一项有内容了
      expect(result.itemCodes).toEqual(['RECIPE', 'SHOPPING_SOP']);
    });

    it('★ 算不出采购量时这一项不出现（点开是空白比不显示更糟）', async () => {
      // 取不到狗狗档案 → 没有喂食量 → 采购清单为空
      const { service } = createService({ dog: null });

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
        items: ['RECIPE', 'SHOPPING_SOP'],
      });

      expect(result.itemCodes).toEqual(['RECIPE']);
    });

    it('显式传入清单时以传入的为准（校验仍会过滤没内容的）', async () => {
      const { service } = createService({});

      const result = await service.deliver({
        orderIdOrId: 'CR202610160001',
        recipeIdOrBizId: 'CR1759000000000',
        deliveredBy: 'admin-1',
        items: ['RECIPE', 'NUTRITION_REPORT'],
      });

      expect(result.itemCodes).toEqual(['RECIPE', 'NUTRITION_REPORT']);
    });
  });
});
