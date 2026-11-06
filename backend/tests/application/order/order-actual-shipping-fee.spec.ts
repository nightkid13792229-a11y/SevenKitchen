import { BadRequestException } from '@nestjs/common';
import { OrderService } from 'src/order.service';
import { Order, OrderStatus, OrderType } from 'src/domain';

/**
 * 改实际运费（2026-11-07）。
 *
 * 背景：实际运费只在「发货」那一下能填，发出去就再也改不了。
 * 老板 2026-11-07 发现一单把 18.50 记成了 180.50，系统里没有任何入口能救。
 */
describe('OrderService · 改实际运费', () => {
  let service: OrderService;
  let orderRepository: { findById: jest.Mock; save: jest.Mock };
  let statusHistoryRepository: { append: jest.Mock; findByOrderId: jest.Mock };
  let shippingNotificationService: { sendForOrder: jest.Mock };
  let prisma: {
    preparationMethod: { findMany: jest.Mock };
    order: { update: jest.Mock };
  };

  function createOrder(status: OrderStatus): Order {
    const order = Order.fromPrismaData({
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

    if (status !== OrderStatus.FREEZING) {
      order.markAsShipped('SF0206400913347', 'SF');
    }

    return order;
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
      sendForOrder: jest.fn(),
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
      prisma as any,
      undefined,
      shippingNotificationService as any,
    );
  });

  it('★ 已发货的订单：按两位小数落库，不动状态、不发通知', async () => {
    orderRepository.findById.mockResolvedValue(createOrder(OrderStatus.SHIPPED));

    const result = await service.updateActualShippingFee('order-1', 18.5);

    expect(result).toEqual({ orderId: 'order-1', actualShippingFee: 18.5 });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { actualShippingFee: '18.50' },
    });
    // 改的只是成本记账，别把状态和时间轴搅进来
    expect(orderRepository.save).not.toHaveBeenCalled();
    expect(statusHistoryRepository.append).not.toHaveBeenCalled();
    expect(shippingNotificationService.sendForOrder).not.toHaveBeenCalled();
  });

  it('★ 没发货的单不给改（这一列还没意义）', async () => {
    orderRepository.findById.mockResolvedValue(createOrder(OrderStatus.FREEZING));

    await expect(
      service.updateActualShippingFee('order-1', 18.5),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('★ 三位小数、负数、NaN 一律拒绝，别把脏数字写进库', async () => {
    orderRepository.findById.mockResolvedValue(createOrder(OrderStatus.SHIPPED));

    await expect(
      service.updateActualShippingFee('order-1', 18.555),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateActualShippingFee('order-1', -1),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateActualShippingFee('order-1', Number.NaN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('★ 改到 0 是合法的（这单其实没花钱）', async () => {
    orderRepository.findById.mockResolvedValue(createOrder(OrderStatus.SHIPPED));

    const result = await service.updateActualShippingFee('order-1', 0);

    expect(result.actualShippingFee).toBe(0);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { actualShippingFee: '0.00' },
    });
  });
});
