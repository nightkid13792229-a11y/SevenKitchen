import { BadRequestException } from '@nestjs/common';
import { SupplementAftersaleService } from '../../../src/application/supplement-shop/supplement-aftersale.service';

function caseRow(overrides: any = {}) {
  const now = new Date('2026-10-20T00:00:00Z');
  return {
    id: 'c1',
    caseNo: 'AS20261020ABCDEF',
    orderType: 'SUPPLEMENT',
    orderId: 'o1',
    orderNo: 'SP20261019-001',
    customerId: 'u1',
    status: 'PENDING',
    requestType: 'REFUND',
    requestedReason: '破损',
    requestedPhotos: [],
    source: 'CUSTOMER',
    handlerId: null,
    handlingNote: null,
    resolutionType: null,
    refundAmount: 30,
    refundStatus: null,
    refundOutNo: null,
    refundId: null,
    refundRequestedAt: null,
    refundedAt: null,
    reshipOrderId: null,
    reshipOrderNo: null,
    acceptedAt: null,
    resolvedAt: null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function orderRow(overrides: any = {}) {
  // 售后窗口按 packedAt / shippedAt 倒推天数，夹具不能用固定历史日期，
  // 否则测试会在窗口过期后自然变红（2026-10-31 本次修复）。
  const recent = new Date(Date.now() - 60 * 60 * 1000);
  return {
    id: 'o1',
    orderNo: 'SP20261019-001',
    userId: 'u1',
    status: 'SHIPPED',
    amountTotal: 100,
    shippedAt: recent,
    items: [{ packedAt: recent }],
    ...overrides,
  };
}

describe('SupplementAftersaleService', () => {
  const prisma: any = {
    aftersaleCase: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    supplementOrder: { findUnique: jest.fn(), update: jest.fn() },
    supplementShopConfig: { findUnique: jest.fn() },
    supplementOrderEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const orderService: any = { createReshipForCase: jest.fn() };
  const wechat: any = { createSupplementRefundForCase: jest.fn() };
  let service: SupplementAftersaleService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.supplementOrder.findUnique.mockResolvedValue(orderRow());
    prisma.supplementShopConfig.findUnique.mockResolvedValue({
      aftersaleWindowDays: 7,
    });
    prisma.aftersaleCase.count.mockResolvedValue(0);
    prisma.aftersaleCase.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        aftersaleCase: {
          create: prisma.aftersaleCase.create,
          update: prisma.aftersaleCase.update,
        },
        supplementOrder: {
          update: prisma.supplementOrder.update,
        },
        supplementOrderEvent: {
          create: prisma.supplementOrderEvent.create,
        },
      }),
    );
    service = new SupplementAftersaleService(prisma, orderService, wechat);
  });

  it('PACKED 只允许全额退款', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'PACKED', shippedAt: null }),
    );
    await expect(
      service.createForCustomer('u1', 'o1', {
        requestType: 'REFUND',
        reason: '不要了',
        amount: 50,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PACKED 不允许补发', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'PACKED', shippedAt: null }),
    );
    await expect(
      service.createForCustomer('u1', 'o1', {
        requestType: 'RESHIP',
        reason: '破损',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PACKED 全额退款：创建 case，refundAmount=实付', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'PACKED', shippedAt: null }),
    );
    prisma.aftersaleCase.create.mockResolvedValue(
      caseRow({ refundAmount: 100, status: 'PENDING' }),
    );
    prisma.supplementOrderEvent.create.mockResolvedValue({});

    const view = await service.createForCustomer('u1', 'o1', {
      requestType: 'REFUND',
      reason: '不要了',
    });

    expect(view.refundAmount).toBe(100);
    expect(prisma.aftersaleCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestType: 'REFUND',
          refundAmount: 100,
        }),
      }),
    );
  });

  it('PAID 未分装取消：建全额退款 case 并调退款', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'PAID', paymentMethod: 'WECHAT_PAY' }),
    );
    prisma.aftersaleCase.create.mockResolvedValue(
      caseRow({ refundAmount: 100, status: 'PENDING' }),
    );
    const processingRow = caseRow({ refundAmount: 100, status: 'PROCESSING' });
    prisma.aftersaleCase.findUnique.mockImplementation(
      async ({ where }: any) =>
        where.caseNo ? null : processingRow,
    );
    prisma.supplementOrderEvent.create.mockResolvedValue({});
    wechat.createSupplementRefundForCase.mockResolvedValue({});

    const view = await service.cancelPaidOrder('u1', 'o1', '不想要了');

    expect(view.refundAmount).toBe(100);
    expect(wechat.createSupplementRefundForCase).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, adminId: null }),
    );
  });

  it('同一订单已有未完结售后 → 拒绝', async () => {
    prisma.aftersaleCase.count.mockResolvedValue(1);
    await expect(
      service.createForCustomer('u1', 'o1', {
        requestType: 'REFUND',
        reason: '破损',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('管理员退款：调 case 退款服务', async () => {
    const row = caseRow({ status: 'PENDING', refundAmount: 30 });
    prisma.aftersaleCase.findUnique.mockResolvedValue(row);
    prisma.aftersaleCase.update.mockResolvedValue(row);
    wechat.createSupplementRefundForCase.mockResolvedValue({});

    await service.resolve('admin-1', 'c1', {
      resolutionType: 'REFUND',
      refundAmount: 30,
    });

    expect(wechat.createSupplementRefundForCase).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'c1', amount: 30 }),
    );
  });

  it('PACKED 退款成功：订单 CANCELLED', async () => {
    const row = caseRow({ orderId: 'o1' });
    prisma.aftersaleCase.findUnique.mockResolvedValue(row);
    prisma.supplementOrder.findUnique.mockResolvedValue(
      orderRow({ status: 'PACKED' }),
    );
    prisma.aftersaleCase.update.mockResolvedValue(row);
    prisma.supplementOrder.update.mockResolvedValue({});
    prisma.supplementOrderEvent.create.mockResolvedValue({});

    await service.markRefundSucceeded('c1', {
      refundId: 'wx-refund-1',
      successTime: new Date('2026-10-20T01:00:00Z'),
    });

    expect(prisma.supplementOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
  });

  it('发货前守卫：有未完结退款返回 true', async () => {
    prisma.aftersaleCase.count.mockResolvedValue(1);
    await expect(service.hasOpenRefund('o1')).resolves.toBe(true);
  });
});
