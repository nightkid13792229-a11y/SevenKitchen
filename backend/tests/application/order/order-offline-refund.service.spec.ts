import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderOfflineRefundService } from 'src/application/order/order-offline-refund.service';
import { TimezoneUtil } from 'src/utils/timezone.util';

const makePrisma = (order: any, refunded: any = 0) => ({
  order: { findUnique: jest.fn().mockResolvedValue(order) },
  orderOfflineRefund: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { amount: refunded } }),
    create: jest.fn().mockResolvedValue({ id: 'r1' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const offlineOrder = {
  id: 'o1',
  amountTotal: 699,
  paidAt: new Date('2026-10-20T02:00:00.000Z'),
  paymentMethod: 'OFFLINE_WECHAT',
};

const input = (overrides: Record<string, unknown> = {}) => ({
  amount: 100,
  refundedAt: '2026-11-05',
  method: 'WECHAT',
  ...overrides,
});

describe('OrderOfflineRefundService', () => {
  it('线上支付的订单不允许登记线下退款', async () => {
    const prisma: any = makePrisma({
      ...offlineOrder,
      paymentMethod: 'WECHAT_PAY',
    });
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input() as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderOfflineRefund.create).not.toHaveBeenCalled();
  });

  it('未付款订单不允许登记', async () => {
    const prisma: any = makePrisma({ ...offlineOrder, paidAt: null });
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input() as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderOfflineRefund.create).not.toHaveBeenCalled();
  });

  it('累计退款不得超过实收', async () => {
    const prisma: any = makePrisma(offlineOrder, 650);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input() as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderOfflineRefund.create).not.toHaveBeenCalled();
  });

  it('合法登记返回累计与剩余，并按 UTC 零点落库', async () => {
    const prisma: any = makePrisma(offlineOrder, 599);
    const service = new OrderOfflineRefundService(prisma);

    const result = await service.register('u1', 'o1', input() as any);

    expect(result).toEqual({ id: 'r1', totalRefunded: 699, remaining: 0 });
    expect(prisma.orderOfflineRefund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'o1',
        amount: 100,
        refundedAt: new Date('2026-11-05T00:00:00.000Z'),
        method: 'WECHAT',
        createdById: 'u1',
      }),
    });
  });

  it('小数金额按整数分比较：累计到实收 876.54 允许，多 1 分拒绝', async () => {
    // 876.46 + 0.08 在浮点里是 876.5400000000001，按元比较会把刚好退满误判成超额。
    // `_sum.amount` 是 Prisma Decimal，mock 成字符串更接近真实返回。
    const prisma: any = makePrisma(
      { ...offlineOrder, amountTotal: 876.54 },
      '876.46',
    );
    const service = new OrderOfflineRefundService(prisma);

    const result = await service.register(
      'u1',
      'o1',
      input({ amount: 0.08 }) as any,
    );
    expect(result).toEqual({
      id: 'r1',
      totalRefunded: 876.54,
      remaining: 0,
    });

    await expect(
      service.register('u1', 'o1', input({ amount: 0.09 }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('已作废的登记不计入累计', async () => {
    const prisma: any = makePrisma(offlineOrder, 299);
    const service = new OrderOfflineRefundService(prisma);

    const result = await service.register(
      'u1',
      'o1',
      input({ amount: 400 }) as any,
    );

    expect(prisma.orderOfflineRefund.aggregate).toHaveBeenCalledWith({
      where: { orderId: 'o1', voidedAt: null },
      _sum: { amount: true },
    });
    expect(result.totalRefunded).toBe(699);
  });

  it('订单不存在返回 404', async () => {
    const prisma: any = makePrisma(null);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'missing', input() as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('退款金额必须大于 0', async () => {
    const prisma: any = makePrisma(offlineOrder);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input({ amount: 0 }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('退款金额最多两位小数', async () => {
    const prisma: any = makePrisma(offlineOrder);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input({ amount: 100.001 }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('退款日早于起账日（2026-11-01）时拒绝，不写库', async () => {
    const prisma: any = makePrisma(offlineOrder);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register('u1', 'o1', input({ refundedAt: '2026-10-31' }) as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderOfflineRefund.create).not.toHaveBeenCalled();
  });

  it('退款日晚于今天时拒绝，不写库', async () => {
    const todayKey = TimezoneUtil.shanghaiDateKey(new Date());
    const [year, month, day] = todayKey.split('-').map(Number);
    const tomorrowKey = new Date(Date.UTC(year, month - 1, day + 1))
      .toISOString()
      .slice(0, 10);
    const prisma: any = makePrisma(offlineOrder);
    const service = new OrderOfflineRefundService(prisma);

    await expect(
      service.register(
        'u1',
        'o1',
        input({ refundedAt: tomorrowKey }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderOfflineRefund.create).not.toHaveBeenCalled();
  });

  it('列出未作废的登记，按退款日倒序', async () => {
    const prisma: any = makePrisma(offlineOrder);
    prisma.orderOfflineRefund.findMany.mockResolvedValue([
      {
        id: 'r2',
        amount: '200.00',
        refundedAt: new Date('2026-11-08T00:00:00.000Z'),
        method: 'ALIPAY',
        note: null,
        proofKeys: [],
        createdById: 'u1',
        createdAt: new Date('2026-11-09T02:00:00.000Z'),
      },
    ]);
    const service = new OrderOfflineRefundService(prisma);

    const rows = await service.list('o1');

    expect(prisma.orderOfflineRefund.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'o1', voidedAt: null },
        orderBy: [{ refundedAt: 'desc' }, { createdAt: 'desc' }],
      }),
    );
    expect(rows).toEqual([
      {
        id: 'r2',
        amount: 200,
        refundedAt: '2026-11-08',
        method: 'ALIPAY',
        note: null,
        proofKeys: [],
        createdById: 'u1',
        createdAt: new Date('2026-11-09T02:00:00.000Z'),
      },
    ]);
  });
});
