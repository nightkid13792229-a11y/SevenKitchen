import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';
import { WechatService } from '../../../src/infrastructure/wechat/wechat.service';
import { CustomRecipeStatus } from '@prisma/client';

/**
 * 线下收款订单的退款分流（2026-10-21 · 代客定制食谱订单 Task 5）。
 *
 * ## 必须防住的 bug
 *
 * 代客单是**线下收款**：钱没进微信支付，订单却记成 `PAID`。
 * 如果取消时按原逻辑调用 `createCustomRecipeRefund`：
 *   · 微信侧根本没有这笔交易，退款会直接失败 → 顾客被卡住；
 *   · 或者更糟 —— 如果商户侧恰好有同单号交易，会退错钱。
 *
 * 所以：
 *   · `paymentChannel` = OFFLINE_WECHAT / OFFLINE_ALIPAY / OTHER，
 *     或 `orderSource=ASSISTED` 且 `paymentConfirmedAt` 有值 ⇒ 永不调微信退款；
 *   · 顾客自助取消这类单要**明确拒绝**并让他找客服，不能"取消了但不退钱"；
 *   · 管理员只能通过「线下退款登记」把谁/何时/退多少/怎么退/备注留痕。
 */
describe('CustomRecipeService · 线下收款订单退款分流', () => {
  let service: CustomRecipeService;

  const orderFindFirst = jest.fn();
  const orderFindUnique = jest.fn();
  const orderUpdate = jest.fn();
  const orderUpdateMany = jest.fn();
  const scheduleUpdateMany = jest.fn();

  const mockPrismaService = {
    customRecipeOrder: {
      findFirst: orderFindFirst,
      findUnique: orderFindUnique,
      update: orderUpdate,
      updateMany: orderUpdateMany,
    },
    customRecipeSchedule: { updateMany: scheduleUpdateMany },
    $transaction: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomRecipeService,
        CustomRecipePricingService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TencentCosService, useValue: {} },
        {
          provide: CustomRecipeConfigService,
          useValue: {
            getConfig: jest.fn().mockResolvedValue({
              feeAmount: 300,
              deliveryWorkDays: 3,
              dailyCapacity: 5,
              paymentTimeoutMinutes: 30,
            }),
          },
        },
        {
          provide: WechatService,
          useValue: {
            sendCustomRecipeOrderNotification: jest.fn(),
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
      orderId: 'CR202610210001',
    });
    orderUpdate.mockResolvedValue({});
    orderUpdateMany.mockResolvedValue({ count: 1 });
    scheduleUpdateMany.mockResolvedValue({ count: 1 });
  });

  /** 线下已收款的代客单：后台代客下单的真实落库形态 */
  const offlinePaidOrder = (overrides: Record<string, unknown> = {}) => ({
    id: 'cr-uuid-1',
    orderId: 'CR202610210001',
    customerId: 'user-1',
    status: CustomRecipeStatus.PAID,
    scheduledDate: new Date('2099-06-01'),
    recipeQuantity: 2,
    amount: 300,
    actualPaidAmount: 280,
    paymentConfirmedAt: new Date('2026-10-21T02:00:00.000Z'),
    paymentChannel: 'OFFLINE_WECHAT',
    orderSource: 'ASSISTED',
    offlineRefundedAt: null,
    offlineRefundAmount: null,
    offlineRefundMethod: null,
    offlineRefundNote: null,
    offlineRefundByStaffId: null,
    cancelledAt: null,
    ...overrides,
  });

  // ---------------------------------------------------------------
  // 顾客自助取消：线下单必须拒绝，不能"取消了但不退钱"
  // ---------------------------------------------------------------

  it('★ 顾客取消线下已收款单：明确拒绝，且不调用微信退款、不改状态', async () => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());
    const refund = jest.fn();

    await expect(
      service.cancelOrderByCustomer('CR202610210001', 'user-1', refund),
    ).rejects.toThrow('线下收款订单请联系客服处理退款');

    expect(refund).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(scheduleUpdateMany).not.toHaveBeenCalled();
  });

  it.each(['OFFLINE_WECHAT', 'OFFLINE_ALIPAY', 'OTHER'])(
    '★ 线下渠道 %s 的顾客取消一律拒绝',
    async (channel) => {
      orderFindUnique.mockResolvedValue(offlinePaidOrder({ paymentChannel: channel }));

      await expect(
        service.cancelOrderByCustomer('CR202610210001', 'user-1', jest.fn()),
      ).rejects.toThrow('线下收款订单请联系客服处理退款');
    },
  );

  it('★ 即使 paymentChannel 缺失，代客单只要已确认收款也不能被顾客自助取消', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({ paymentChannel: null, orderSource: 'ASSISTED' }),
    );

    await expect(
      service.cancelOrderByCustomer('CR202610210001', 'user-1', jest.fn()),
    ).rejects.toThrow('线下收款订单请联系客服处理退款');
  });

  it('线上自助单（WECHAT_ONLINE）行为不变：仍走原路退款', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({
        orderSource: 'SELF',
        paymentChannel: 'WECHAT_ONLINE',
      }),
    );
    const refund = jest.fn().mockResolvedValue({ status: 'SUCCESS' });

    const result = await service.cancelOrderByCustomer(
      'CR202610210001',
      'user-1',
      refund,
    );

    expect(refund).toHaveBeenCalledWith(
      'CR202610210001',
      '顾客取消定制订单',
    );
    expect(result.cancelled).toBe(true);
    expect(result.refundStatus).toBe('SUCCESS');
  });

  it('未付款的线下单（还没收钱）可以正常取消，不退款', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({
        status: CustomRecipeStatus.PENDING_PAYMENT,
        paymentConfirmedAt: null,
        paymentChannel: null,
        actualPaidAmount: null,
      }),
    );
    const refund = jest.fn();

    const result = await service.cancelOrderByCustomer(
      'CR202610210001',
      'user-1',
      refund,
    );

    expect(refund).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
  });

  // ---------------------------------------------------------------
  // 线下退款登记：写字段 + 取消 + 释放名额，一个事务里完成
  // ---------------------------------------------------------------

  it('★ 登记线下退款：记录金额/方式/操作人/时间，取消订单并释放名额', async () => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());

    const result = await service.registerOfflineRefund(
      'CR202610210001',
      { amount: 280, method: 'OFFLINE_WECHAT', note: '微信转账退回' },
      'admin-1',
    );

    expect(result).toMatchObject({
      orderId: 'CR202610210001',
      status: 'CANCELLED',
      refundChannel: 'OFFLINE',
      amount: 280,
      method: 'OFFLINE_WECHAT',
      note: '微信转账退回',
      releasedCapacity: 2,
      operatorId: 'admin-1',
    });

    expect(orderUpdateMany).toHaveBeenCalledTimes(1);
    const update = orderUpdateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: 'cr-uuid-1',
      offlineRefundedAt: null,
      cancelledAt: null,
    });
    expect(update.where.status).toEqual({
      in: [
        CustomRecipeStatus.PENDING_PAYMENT,
        CustomRecipeStatus.PAID,
        CustomRecipeStatus.IN_PROGRESS,
      ],
    });
    expect(update.data).toMatchObject({
      status: CustomRecipeStatus.CANCELLED,
      refundChannel: 'OFFLINE',
      offlineRefundAmount: 280,
      offlineRefundMethod: 'OFFLINE_WECHAT',
      offlineRefundNote: '微信转账退回',
      offlineRefundByStaffId: 'admin-1',
    });
    expect(update.data.offlineRefundedAt).toBeInstanceOf(Date);
    expect(update.data.cancelledAt).toBeInstanceOf(Date);
    expect(String(update.data.cancellationReason)).toContain('线下退款');

    // 名额按订单份数（2 份）释放，不能让那天的接单能力白少两个
    const release = scheduleUpdateMany.mock.calls[0][0];
    expect(release.data.bookedCount).toEqual({ decrement: 2 });
    expect(release.where.bookedCount).toEqual({ gte: 2 });
  });

  it('退款金额默认口径：actualPaidAmount 为空时以订单金额为上限', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({ actualPaidAmount: null, amount: 300 }),
    );

    const result = await service.registerOfflineRefund(
      'CR202610210001',
      { amount: 300, method: 'OTHER' },
      'admin-1',
    );

    expect(result.amount).toBe(300);
  });

  it('★ 退款金额不能超过实收金额', async () => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 300, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('退款金额不能超过实收金额');

    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(scheduleUpdateMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN])('★ 退款金额必须大于 0（%s）', async (amount) => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('退款金额必须大于 0');

    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('★ 没确认收款的单不能登记退款', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({
        status: CustomRecipeStatus.PENDING_PAYMENT,
        paymentConfirmedAt: null,
      }),
    );

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('尚未确认收款');
  });

  it('★ 线上订单不能登记线下退款（否则会绕过微信原路退款）', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({
        orderSource: 'SELF',
        paymentChannel: 'WECHAT_ONLINE',
        actualPaidAmount: null,
        amount: 300,
      }),
    );

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('不是线下收款订单');
  });

  it('★ 幂等：已取消/已登记线下退款的单不能重复登记，也不会重复释放名额', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({ status: CustomRecipeStatus.CANCELLED }),
    );

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('不能重复登记');

    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(scheduleUpdateMany).not.toHaveBeenCalled();

    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({
        offlineRefundedAt: new Date('2026-10-21T03:00:00.000Z'),
      }),
    );

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('不能重复登记');
  });

  it('★ 并发/重复提交：CAS 抢不到（count=0）时同样拒绝且不释放名额', async () => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());
    orderUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('不能重复登记');

    expect(scheduleUpdateMany).not.toHaveBeenCalled();
  });

  it('★ 已交付/已完成的单不能靠线下退款撤销（要走售后）', async () => {
    orderFindUnique.mockResolvedValue(
      offlinePaidOrder({ status: CustomRecipeStatus.DELIVERED }),
    );

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'OFFLINE_WECHAT' },
        'admin-1',
      ),
    ).rejects.toThrow('不能取消');

    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('退款方式必须是合法枚举', async () => {
    orderFindUnique.mockResolvedValue(offlinePaidOrder());

    await expect(
      service.registerOfflineRefund(
        'CR202610210001',
        { amount: 100, method: 'WECHAT_ONLINE' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
