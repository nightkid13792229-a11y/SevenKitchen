import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

/**
 * 定制订单支付闭环（2026-09-25）：
 *   - 微信回调/主动查单确认收款必须**幂等**（回调会重试，查单可能并发）
 *   - 关单必须**释放排期名额**，否则僵尸单会永久吃掉当天的接单能力
 *   - 已付款/已交付的单不能被超时任务悄悄改掉
 */
describe('CustomRecipeService · 支付与关单', () => {
  let service: CustomRecipeService;

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    customRecipeSchedule: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  } as any;

  const mockConfigService = {
    getConfig: jest.fn().mockResolvedValue({
      feeAmount: 300,
      creditAmount: 300,
      deliveryWorkDays: 3,
      dailyCapacity: 4,
      paymentTimeoutMinutes: 30,
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        { provide: CustomRecipeConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();

    // 事务默认直接执行回调，并把 tx 指向同一个 mock
    mockPrismaService.$transaction.mockImplementation(async (callback: any) =>
      callback(mockPrismaService),
    );
  });

  describe('confirmPaymentFromWechat', () => {
    it('把待付款订单置为已付款并记录微信交易号', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
      });
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
        status: 'PAID',
      });

      const result = await service.confirmPaymentFromWechat('CR1', 'wx-tx-1');

      expect(mockPrismaService.customRecipeOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'uuid-1', status: 'PENDING_PAYMENT' },
          data: expect.objectContaining({
            status: 'PAID',
            paymentTransactionId: 'wx-tx-1',
          }),
        }),
      );
      expect(result.alreadyPaid).toBe(false);
    });

    it('回调重试时不覆盖已推进的状态（幂等）', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
      });
      // 条件更新命中 0 行：说明订单已不在 PENDING_PAYMENT
      mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
        status: 'IN_PROGRESS',
      });

      const result = await service.confirmPaymentFromWechat('CR1', 'wx-tx-1');

      expect(result.alreadyPaid).toBe(true);
    });
  });

  describe('cancelOrder', () => {
    it('关单时同时释放当天的排期名额', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
      });
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'uuid-1',
        status: 'PENDING_PAYMENT',
        scheduledDate: new Date('2026-10-12'),
      });
      mockPrismaService.customRecipeOrder.update.mockResolvedValue({});
      mockPrismaService.customRecipeSchedule.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.cancelOrder('CR1', {
        reason: '支付超时自动取消',
      });

      expect(result.cancelled).toBe(true);
      expect(mockPrismaService.customRecipeSchedule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: new Date('2026-10-12'),
            // 下限保护：并发/重复关单不能让 booked_count 变负数
            bookedCount: { gt: 0 },
          }),
          data: { bookedCount: { decrement: 1 } },
        }),
      );
    });

    it('已付款的订单不允许被自动关单改掉', async () => {
      mockPrismaService.customRecipeOrder.findFirst.mockResolvedValue({
        id: 'uuid-1',
        orderId: 'CR1',
      });
      mockPrismaService.customRecipeOrder.findUnique.mockResolvedValue({
        id: 'uuid-1',
        status: 'PAID',
        scheduledDate: new Date('2026-10-12'),
      });

      const result = await service.cancelOrder('CR1', { reason: '超时' });

      expect(result.cancelled).toBe(false);
      expect(mockPrismaService.customRecipeOrder.update).not.toHaveBeenCalled();
      expect(
        mockPrismaService.customRecipeSchedule.updateMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('findExpiredUnpaidOrders', () => {
    it('支付超时配成 0 时不关任何单', async () => {
      const result = await service.findExpiredUnpaidOrders(0);

      expect(result).toEqual([]);
      expect(mockPrismaService.customRecipeOrder.findMany).not.toHaveBeenCalled();
    });

    it('只查超过时限且仍未付款的订单', async () => {
      mockPrismaService.customRecipeOrder.findMany.mockResolvedValue([
        { id: 'uuid-1', orderId: 'CR1', createdAt: new Date() },
      ]);

      const result = await service.findExpiredUnpaidOrders(30);

      expect(result).toHaveLength(1);
      expect(mockPrismaService.customRecipeOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING_PAYMENT',
            createdAt: { lt: expect.any(Date) },
          }),
        }),
      );
    });
  });
});
