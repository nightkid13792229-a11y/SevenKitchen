import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomRecipeStatus } from '@prisma/client';
import { CustomRecipeDeliveryService } from '../../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 多份交付 · 顾客侧读取与确认（2026-10-21 · 第二阶段 Task 3）
 *
 * ## 这组测试守着什么
 *
 * 多份订单整批交付时**不写老的单份交付表**，如果顾客侧还只认老表，
 * 结果就是：买了 5 份、后台显示已交付、顾客那边一片空白。
 * 所以这里锁三件事：
 *
 *   ① 订单详情能取到「最新批次的 N 份摘要」，且**不背快照**（几十 KB）；
 *   ② 交付内容接口能返回 N 份各自的内容快照（每份不同）；
 *   ③ 确认收到对批次幂等 —— 重复点不报错、**不刷新**确认时间；
 *      老的单份交付路径一个字都不变。
 */

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-pk-1',
    orderId: 'CR202610210001',
    customerId: 'customer-1',
    dogId: 'dog-1',
    status: CustomRecipeStatus.DELIVERED,
    recipeId: 'recipe-pk-1',
    recipeQuantity: 2,
    ...overrides,
  };
}

function buildBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'batch-1',
    version: 1,
    deliveredAt: new Date('2026-10-21T02:00:00.000Z'),
    confirmedAt: null,
    items: [
      {
        id: 'item-1',
        items: ['RECIPE', 'SHOPPING_SOP'],
        contentSnapshot: {
          schemaVersion: 1,
          recipe: { name: '鸡肉南瓜' },
        },
        recipe: {
          recipeId: 'CR1759100000001',
          name: '鸡肉南瓜',
          coverImageUrl: 'https://cdn.example.com/1.jpg',
        },
      },
      {
        id: 'item-2',
        items: ['RECIPE'],
        contentSnapshot: {
          schemaVersion: 1,
          recipe: { name: '鸭肉西兰花' },
        },
        recipe: {
          recipeId: 'CR1759100000002',
          name: '鸭肉西兰花',
          coverImageUrl: null,
        },
      },
    ],
    ...overrides,
  };
}

function createService(
  options: {
    order?: unknown;
    batch?: unknown;
    legacyDelivery?: unknown;
  } = {},
) {
  const txProxy = {
    customRecipeDeliveryBatch: { update: jest.fn().mockResolvedValue({}) },
    customRecipeDelivery: { update: jest.fn().mockResolvedValue({}) },
    customRecipeOrder: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    customRecipeOrder: {
      findFirst: jest.fn().mockResolvedValue(options.order ?? buildOrder()),
    },
    customRecipeDelivery: {
      findFirst: jest.fn().mockResolvedValue(options.legacyDelivery ?? null),
    },
    customRecipeDeliveryBatch: {
      findFirst: jest.fn().mockResolvedValue(options.batch ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(txProxy)),
  };

  const service = new CustomRecipeDeliveryService(
    prisma as unknown as PrismaService,
    { getConfig: jest.fn() } as unknown as CustomRecipeConfigService,
  );

  return { service, prisma, txProxy };
}

describe('CustomRecipeDeliveryService · 顾客侧多份交付', () => {
  describe('订单详情摘要（不含快照）', () => {
    it('★ 查的是最新批次，带每份的食谱业务编号 / 名称 / 封面 / 交付物', async () => {
      const batch = buildBatch();
      const { service, prisma } = createService({ batch });

      const result = await service.findLatestBatchForOrder('order-pk-1');

      expect(result).toBe(batch);

      const args = prisma.customRecipeDeliveryBatch.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ orderId: 'order-pk-1' });
      expect(args.orderBy).toEqual({ version: 'desc' });
      expect(args.select.items.select).toMatchObject({
        id: true,
        items: true,
        recipe: {
          select: { recipeId: true, name: true, coverImageUrl: true },
        },
      });
      /**
       * ★ 订单详情**不能**背快照。
       * 一份快照几十 KB，5 份就上百 KB —— 每次打开订单页都要传一遍。
       * 要看内容走 `GET orders/:orderId/delivery`。
       */
      expect(args.select.items.select).not.toHaveProperty('contentSnapshot');
    });

    it('老订单没有批次 → 返回 null，调用方保持老字段不变', async () => {
      const { service } = createService({ batch: null });

      await expect(
        service.findLatestBatchForOrder('order-pk-1'),
      ).resolves.toBeNull();
    });
  });

  describe('交付内容（含每份快照）', () => {
    it('★ 不传版本时取最新一批，且每份都带自己的内容快照', async () => {
      const batch = buildBatch();
      const { service, prisma } = createService({ batch });

      const result = await service.findBatchForCustomer({
        orderId: 'order-pk-1',
      });

      expect(result).toBe(batch);
      const args = prisma.customRecipeDeliveryBatch.findFirst.mock.calls[0][0];
      expect(args.where).toEqual({ orderId: 'order-pk-1' });
      expect(args.orderBy).toEqual({ version: 'desc' });
      expect(args.select.items.select).toMatchObject({
        id: true,
        items: true,
        contentSnapshot: true,
        recipe: {
          select: { recipeId: true, name: true, coverImageUrl: true },
        },
      });
    });

    it('传版本号时按批次版本回看（与老接口的 ?version= 同义）', async () => {
      const { service, prisma } = createService({ batch: null });

      await service.findBatchForCustomer({ orderId: 'order-pk-1', version: 2 });

      expect(
        prisma.customRecipeDeliveryBatch.findFirst.mock.calls[0][0].where,
      ).toEqual({ orderId: 'order-pk-1', version: 2 });
    });

    it('老订单没有批次 → 返回 null，由调用方回落到老的单份交付', async () => {
      const { service } = createService({ batch: null });

      await expect(
        service.findBatchForCustomer({ orderId: 'order-pk-1' }),
      ).resolves.toBeNull();
    });
  });

  describe('★ 确认收到（批次）', () => {
    it('首次确认：写批次 confirmedAt / confirmChannel，订单转已完成并清掉闹钟', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, txProxy } = createService({
        batch: { id: 'batch-1', confirmedAt: null },
      });

      const result = await service.confirmReceipt({
        orderIdOrId: 'CR202610210001',
        channel: 'CUSTOMER',
        now,
      });

      expect(result).toEqual({ confirmed: true, alreadyConfirmed: false });

      const batchUpdate = (
        txProxy.customRecipeDeliveryBatch.update as jest.Mock
      ).mock.calls[0][0];
      expect(batchUpdate.where).toEqual({ id: 'batch-1' });
      expect(batchUpdate.data).toEqual({
        confirmedAt: now,
        confirmChannel: 'CUSTOMER',
      });

      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.where).toEqual({ id: 'order-pk-1' });
      expect(orderUpdate.data).toEqual({
        status: CustomRecipeStatus.COMPLETED,
        completedAt: now,
        autoCompleteAt: null,
      });

      // 批次路径不能顺手去写老的单份交付表
      expect(txProxy.customRecipeDelivery.update).not.toHaveBeenCalled();
    });

    it('★ 幂等：重复确认不报错、不刷新时间，也不写任何表', async () => {
      const { service, prisma, txProxy } = createService({
        batch: {
          id: 'batch-1',
          confirmedAt: new Date('2026-10-20T10:00:00+08:00'),
        },
      });

      const result = await service.confirmReceipt({
        orderIdOrId: 'CR202610210001',
        channel: 'CUSTOMER',
        now: new Date('2026-10-21T10:00:00+08:00'),
      });

      expect(result).toEqual({ confirmed: true, alreadyConfirmed: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(txProxy.customRecipeDeliveryBatch.update).not.toHaveBeenCalled();
      expect(txProxy.customRecipeOrder.update).not.toHaveBeenCalled();
    });

    it('自动完成任务确认批次时渠道记 AUTO（与顾客主动确认区分）', async () => {
      const { service, txProxy } = createService({
        batch: { id: 'batch-1', confirmedAt: null },
      });

      await service.confirmReceipt({
        orderIdOrId: 'CR202610210001',
        channel: 'AUTO',
      });

      expect(
        (txProxy.customRecipeDeliveryBatch.update as jest.Mock).mock.calls[0][0]
          .data.confirmChannel,
      ).toBe('AUTO');
    });

    it('已取消的单不能确认收到（批次也要过状态守卫）', async () => {
      const { service, prisma } = createService({
        order: buildOrder({ status: CustomRecipeStatus.CANCELLED }),
        batch: { id: 'batch-1', confirmedAt: null },
      });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610210001' }),
      ).rejects.toThrow(/已取消/);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('还没交付的单不能确认收到（状态机拦住，批次也不放行）', async () => {
      const { service } = createService({
        order: buildOrder({ status: CustomRecipeStatus.PAID }),
        batch: { id: 'batch-1', confirmedAt: null },
      });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610210001' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('老的单份交付（回归：形状与行为不变）', () => {
    it('没有批次时，仍然确认老交付记录并转已完成', async () => {
      const now = new Date('2026-10-21T10:00:00+08:00');
      const { service, prisma, txProxy } = createService({
        batch: null,
        legacyDelivery: { id: 'delivery-1', version: 1, confirmedAt: null },
      });

      const result = await service.confirmReceipt({
        orderIdOrId: 'CR202610210001',
        channel: 'CUSTOMER',
        now,
      });

      expect(result).toEqual({ confirmed: true, alreadyConfirmed: false });

      const deliveryUpdate = (txProxy.customRecipeDelivery.update as jest.Mock)
        .mock.calls[0][0];
      expect(deliveryUpdate.where).toEqual({ id: 'delivery-1' });
      expect(deliveryUpdate.data).toEqual({
        confirmedAt: now,
        confirmChannel: 'CUSTOMER',
      });

      const orderUpdate = (txProxy.customRecipeOrder.update as jest.Mock).mock
        .calls[0][0];
      expect(orderUpdate.data.status).toBe(CustomRecipeStatus.COMPLETED);
      expect(orderUpdate.data.autoCompleteAt).toBeNull();

      // 批次已经查过但没有 → 不能写批次表
      expect(txProxy.customRecipeDeliveryBatch.update).not.toHaveBeenCalled();
      expect(prisma.customRecipeDelivery.findFirst).toHaveBeenCalledWith({
        where: { orderId: 'order-pk-1' },
        orderBy: { version: 'desc' },
      });
    });

    it('既没有批次也没有老交付记录 → 仍是一句人话的 404', async () => {
      const { service } = createService({ batch: null, legacyDelivery: null });

      await expect(
        service.confirmReceipt({ orderIdOrId: 'CR202610210001' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
