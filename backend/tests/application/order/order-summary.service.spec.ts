import { OrderSummaryService } from '../../../src/application/order/order-summary.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('OrderSummaryService · 三类订单统一计数', () => {
  function createService() {
    const prisma = {
      order: { groupBy: jest.fn() },
      supplementOrder: { groupBy: jest.fn() },
      customRecipeOrder: { groupBy: jest.fn() },
    };
    const service = new OrderSummaryService(
      prisma as unknown as PrismaService,
    );
    return { service, prisma };
  }

  it('★ 合计鲜食/补剂/定制，并按订单列表同一口径分五档', async () => {
    const { service, prisma } = createService();

    (prisma.order.groupBy as jest.Mock).mockResolvedValue([
      { status: 'PENDING_PAYMENT', _count: { _all: 1 } },
      { status: 'PAID', _count: { _all: 2 } },
      { status: 'SHIPPED', _count: { _all: 1 } },
      { status: 'COMPLETED', _count: { _all: 1 } },
      { status: 'AFTERSALE', _count: { _all: 1 } },
      { status: 'CANCELLED', _count: { _all: 1 } },
    ]);
    (prisma.supplementOrder.groupBy as jest.Mock).mockResolvedValue([
      { status: 'PENDING_PAYMENT', _count: { _all: 1 } },
      { status: 'PAID', _count: { _all: 1 } },
      { status: 'PACKING', _count: { _all: 1 } },
      { status: 'SHIPPED', _count: { _all: 1 } },
      { status: 'COMPLETED', _count: { _all: 1 } },
      { status: 'AFTERSALE', _count: { _all: 1 } },
      { status: 'CANCELLED', _count: { _all: 1 } },
    ]);
    (prisma.customRecipeOrder.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { status: 'PENDING_PAYMENT', _count: { _all: 1 } },
        { status: 'PAID', _count: { _all: 1 } },
        { status: 'IN_PROGRESS', _count: { _all: 1 } },
        { status: 'DELIVERED', _count: { _all: 1 } },
        { status: 'COMPLETED', _count: { _all: 1 } },
        { status: 'CANCELLED', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { status: 'DELIVERED', _count: { _all: 1 } },
        { status: 'COMPLETED', _count: { _all: 1 } },
      ]);

    const summary = await service.getCustomerSummary('customer-1');

    expect(summary).toEqual({
      total: 20,
      pendingPayment: 3,
      inProgress: 6,
      waitReceive: 2,
      completed: 2,
      aftersale: 4,
    });
    expect(prisma.order.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: 'customer-1' } }),
    );
    expect(prisma.supplementOrder.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'customer-1' } }),
    );
    expect(prisma.customRecipeOrder.groupBy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 'customer-1',
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('没有订单时返回全 0', async () => {
    const { service, prisma } = createService();
    (prisma.order.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.supplementOrder.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.customRecipeOrder.groupBy as jest.Mock).mockResolvedValue([]);

    await expect(service.getCustomerSummary('customer-1')).resolves.toEqual({
      total: 0,
      pendingPayment: 0,
      inProgress: 0,
      waitReceive: 0,
      completed: 0,
      aftersale: 0,
    });
  });
});
