import { OrderService } from 'src/order.service';
import { Order, OrderStatus, OrderType } from 'src/domain';
import { ShippingNotificationService } from 'src/application/shipping/shipping-notification.service';

describe('OrderService shipping notifications', () => {
  let service: OrderService;
  let orderRepository: {
    findById: jest.Mock;
    save: jest.Mock;
  };
  let statusHistoryRepository: {
    append: jest.Mock;
    findByOrderId: jest.Mock;
  };
  let shippingNotificationService: {
    sendForOrder: jest.Mock;
  };
  let prisma: { preparationMethod: { findMany: jest.Mock }; order: { update: jest.Mock } };

  function createFreezingOrder(): Order {
    return Order.fromPrismaData({
      id: 'order-1',
      customerId: 'customer-1',
      status: OrderStatus.FREEZING,
      type: OrderType.FRESH_FOOD,
      createdAt: new Date('2026-06-11T00:00:00.000Z'),
      targetProductionDate: null,
      originalTargetProductionDate: null,
      amountProduct: 100,
      amountShipping: 10,
      amountTotal: 110,
      totalAmount: 110,
      pricingBreakdownSnapshot: null,
      dogId: null,
      addressId: null,
      shippingAddressSnapshot: null,
      trackingNumber: null,
      carrierCode: null,
      shippedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
      paymentMethod: null,
      transactionId: null,
      paidAt: null,
      paymentStatus: null,
      aftersaleType: null,
      freezingSince: null,
      aftersaleSince: null,
      aftersaleReason: null,
      aftersalePhotos: [],
      adminRemark: null,
    });
  }

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      save: jest.fn((order: Order) => Promise.resolve(order)),
    };
    statusHistoryRepository = {
      append: jest.fn(),
      findByOrderId: jest.fn(),
    };
    shippingNotificationService = {
      sendForOrder: jest.fn().mockResolvedValue({
        success: true,
        skipped: false,
        message: '发货订阅通知已发送',
      }),
    };

    prisma = {
      preparationMethod: { findMany: jest.fn() },
      order: { update: jest.fn().mockResolvedValue({}) },
    };

    service = new OrderService(
      orderRepository as any,
      statusHistoryRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      prisma as any,
      undefined,
      shippingNotificationService as unknown as ShippingNotificationService,
    );
  });

  it('sends the customer shipping notification after admin shipment', async () => {
    const order = createFreezingOrder();
    orderRepository.findById.mockResolvedValue(order);

    await service.shipOrder(
      'order-1',
      { trackingNumber: 'SF1234567890', carrierCode: 'SF' },
      'admin-1',
    );

    expect(orderRepository.save).toHaveBeenCalledWith(order);
    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      'admin',
      'admin-1',
      {
        trackingNumber: 'SF1234567890',
        carrierCode: 'SF',
      },
    );
    expect(shippingNotificationService.sendForOrder).toHaveBeenCalledWith(
      'order-1',
    );
  });

  it('★ 录了实际运费就按两位小数落库（2026-10-31）', async () => {
    const order = createFreezingOrder();
    orderRepository.findById.mockResolvedValue(order);

    await service.shipOrder(
      'order-1',
      { trackingNumber: 'SF1234567890', carrierCode: 'SF', actualShippingFee: 12.5 },
      'admin-1',
    );

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { actualShippingFee: '12.50' },
    });
  });

  it('★ 选「无需发货」：直接结案，不发通知、不写运费', async () => {
    const order = createFreezingOrder();
    orderRepository.findById.mockResolvedValue(order);

    const saved = await service.shipOrder(
      'order-1',
      { shippingType: 'NOT_REQUIRED' },
      'admin-1',
    );

    expect(saved.status).toBe(OrderStatus.COMPLETED);
    expect(saved.noShippingRequired).toBe(true);
    expect(saved.trackingNumber ?? null).toBeNull();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(shippingNotificationService.sendForOrder).not.toHaveBeenCalled();
  });

  it('★ 没填运费就不写这一列，别把老单改成 0', async () => {
    const order = createFreezingOrder();
    orderRepository.findById.mockResolvedValue(order);

    await service.shipOrder(
      'order-1',
      { trackingNumber: 'SF1234567890', carrierCode: 'SF' },
      'admin-1',
    );

    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
