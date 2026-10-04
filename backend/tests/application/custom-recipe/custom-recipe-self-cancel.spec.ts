import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { WechatService } from '../../../src/infrastructure/wechat/wechat.service';
import { CustomRecipeStatus } from '@prisma/client';

/**
 * 第 4 批（2026-09-28）：顾客自助取消 + 退款 + 付款通知
 *
 * 老板拍板的决策 12 + Q2：
 *   「只要还没开始制作，顾客可取消并**全额原路退回微信**，不需要客服先确认」。
 * 此前定制订单**完全没有退款通道**，顾客想取消只能找客服。
 */
describe('CustomRecipeService · 顾客自助取消', () => {
  let service: CustomRecipeService;

  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();
  const orderUpdate = jest.fn();
  const scheduleUpdateMany = jest.fn();
  const notification = jest.fn();

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: orderFindFirst,
      findUnique: orderFindUnique,
      update: orderUpdate,
      updateMany: jest.fn(),
    },
    customRecipeSchedule: { updateMany: scheduleUpdateMany },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        {
          provide: CustomRecipeConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              feeAmount: 300,
              creditAmount: 150,
              deliveryWorkDays: 3,
              dailyCapacity: 5,
              paymentTimeoutMinutes: 30,
            }),
          },
        },
        {
          provide: WechatService,
          useValue: {
            sendCustomRecipeOrderNotification: notification,
            sendSubscriptionMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CustomRecipeService);
    jest.clearAllMocks();

    mockPrismaService.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrismaService),
    );
    orderFindFirst.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
    });
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      customerId: 'user-1',
      status: CustomRecipeStatus.PAID,
      scheduledDate: new Date('2099-06-01'),
    });
    orderUpdate.mockResolvedValue({});
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
    /**
     * 2026-10-04：取消改成 CAS 认领（customRecipeOrder.updateMany），
     * 返回值必须是 { count: 1 } 才算"抢到了这次取消"。
     */
    mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
      count: 1,
    });
    notification.mockResolvedValue({ success: true });
  });

  const refundOk = jest.fn().mockResolvedValue({ status: 'SUCCESS' });

  it('待付款的单：直接取消，不调用退款', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      customerId: 'user-1',
      status: CustomRecipeStatus.PENDING_PAYMENT,
      scheduledDate: new Date('2099-06-01'),
    });

    const result = await service.cancelOrderByCustomer(
      'CR202609280001',
      'user-1',
      refundOk,
    );

    expect(refundOk).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(result.refundStatus).toBeNull();
  });

  it('已付款的单：先认领取消再退款，并把退款状态回给顾客', async () => {
    const result = await service.cancelOrderByCustomer(
      'CR202609280001',
      'user-1',
      refundOk,
    );

    expect(refundOk).toHaveBeenCalledWith(
      'CR202609280001',
      '顾客取消定制订单',
    );

    // 取消是通过 CAS 认领完成的：只有此刻仍是 PAID 才抢得到
    const claim = mockPrismaService.customRecipeOrder.updateMany.mock
      .calls[0][0];
    expect(claim.data.status).toBe(CustomRecipeStatus.CANCELLED);
    expect(claim.where.status).toBe(CustomRecipeStatus.PAID);
    expect(result.refundStatus).toBe('SUCCESS');
  });

  it('⭐ 退款失败时把取消**回滚**，避免"取消了钱没退"', async () => {
    const refundFail = jest
      .fn()
      .mockRejectedValue(new Error('线上退款未启用'));

    await expect(
      service.cancelOrderByCustomer(
        'CR202609280001',
        'user-1',
        refundFail,
      ),
    ).rejects.toThrow('线上退款未启用');

    /**
     * 2026-10-04 起：先认领再退款，所以退款失败时订单已经被改成 CANCELLED，
     * 必须在 catch 里回滚 —— 状态改回 PAID，并把刚释放的名额重新占上。
     */
    const rollback = mockPrismaService.customRecipeOrder.updateMany.mock.calls.find(
      (call: any[]) => call[0]?.data?.status === CustomRecipeStatus.PAID,
    );
    expect(rollback).toBeTruthy();

    const rebooked = scheduleUpdateMany.mock.calls.find(
      (call: any[]) => call[0]?.data?.bookedCount?.increment === 1,
    );
    expect(rebooked).toBeTruthy();
  });

  it('已开始制作的单不能自助取消（要联系客服）', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      customerId: 'user-1',
      status: CustomRecipeStatus.IN_PROGRESS,
      scheduledDate: new Date('2099-06-01'),
    });

    await expect(
      service.cancelOrderByCustomer('CR202609280001', 'user-1', refundOk),
    ).rejects.toThrow('已开始制作');
    expect(
      mockPrismaService.customRecipeOrder.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('不能取消别人的订单', async () => {
    await expect(
      service.cancelOrderByCustomer('CR202609280001', 'someone-else', refundOk),
    ).rejects.toThrow('无权操作此订单');
    expect(refundOk).not.toHaveBeenCalled();
    expect(
      mockPrismaService.customRecipeOrder.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('取消会释放当天名额（每天只有 5 个）', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      customerId: 'user-1',
      status: CustomRecipeStatus.PENDING_PAYMENT,
      scheduledDate: new Date('2099-06-01'),
    });

    await service.cancelOrderByCustomer(
      'CR202609280001',
      'user-1',
      refundOk,
    );

    const args = scheduleUpdateMany.mock.calls[0][0];
    expect(args.data.bookedCount).toEqual({ decrement: 1 });
    // 下限保护：不能让 booked_count 变成负数
    expect(args.where.bookedCount).toEqual({ gt: 0 });
  });

  it('顾客自己付款成功时也会发通知，且回调重试不会重复发', async () => {
    mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
      count: 1,
    });
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      status: CustomRecipeStatus.PAID,
      customer: { wechatOpenid: 'openid-1' },
    });

    await service.confirmPaymentFromWechat('CR202609280001', 'tx-1');

    expect(notification).toHaveBeenCalledWith(
      'openid-1',
      'CR202609280001',
      'PAID',
    );
  });

  it('已经付过款的重复回调不再发通知', async () => {
    // updateMany 命中 0 行 = 这次没有真的推进状态（幂等）
    mockPrismaService.customRecipeOrder.updateMany.mockResolvedValue({
      count: 0,
    });
    orderFindUnique.mockResolvedValue({
      id: 'cr-uuid-1',
      orderId: 'CR202609280001',
      status: CustomRecipeStatus.PAID,
      customer: { wechatOpenid: 'openid-1' },
    });

    await service.confirmPaymentFromWechat('CR202609280001', 'tx-1');

    expect(notification).not.toHaveBeenCalled();
  });
});
