import { OrderService } from 'src/order.service';
import { Order, OrderStatus, OrderType } from 'src/domain';

describe('OrderService staff order package corrections', () => {
  let service: OrderService;
  let orderRepository: { findById: jest.Mock; save: jest.Mock };
  let prisma: {
    orderItem: { findUnique: jest.Mock; update: jest.Mock };
    order: { update: jest.Mock };
  };

  function createOrder(overrides: Partial<any> = {}): Order {
    return Order.fromPrismaData({
      id: 'order-1',
      customerId: 'customer-1',
      status: OrderStatus.PENDING_PAYMENT,
      type: OrderType.FRESH_FOOD,
      createdAt: new Date('2026-06-08T00:00:00.000Z'),
      targetProductionDate: null,
      originalTargetProductionDate: null,
      amountProduct: 100,
      amountShipping: 10,
      amountTotal: 110,
      totalAmount: 110,
      pricingBreakdownSnapshot: null,
      dogId: 'dog-1',
      addressId: 'address-1',
      shippingAddressSnapshot: null,
      trackingNumber: null,
      carrierCode: null,
      shippedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
      paymentMethod: 'WECHAT_PAY',
      transactionId: null,
      paidAt: null,
      paymentStatus: null,
      aftersaleType: null,
      freezingSince: null,
      aftersaleSince: null,
      aftersaleReason: null,
      aftersalePhotos: [],
      adminRemark: null,
      ...overrides,
    });
  }

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      save: jest.fn((order: Order) => Promise.resolve(order)),
    };
    prisma = {
      orderItem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'item-1',
          orderId: 'order-1',
          dogId: 'dog-1',
          recipeSnapshot: { id: 'recipe-1', name: '牛肉餐' },
          quantityG: 1000,
          dailyIntakeG: 200,
          ingredientSourcePlan: 'MARKET_PREMIUM',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'item-1',
          orderId: 'order-1',
          quantityG: 1200,
          packageCount: 6,
          packageSpecG: 200,
        }),
      },
      order: {
        update: jest.fn().mockResolvedValue({ id: 'order-1' }),
      },
    };

    service = new OrderService(
      orderRepository as any,
      { append: jest.fn(), findByOrderId: jest.fn() } as any,
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
    );
    jest.spyOn(service, 'previewPricing').mockResolvedValue({
      amountProduct: 130,
      amountShipping: 12,
      amountTotal: 142,
      pricingBreakdown: {
        costIngredients: 70,
        costPackaging: 8,
        costLabor: 10,
        costOverhead: 4,
        totalProductCost: 92,
        productPrice: 130,
      },
    } as any);
  });

  it('updates package quantity and order price when the order is unpaid', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());

    const result = await service.updateOrderItemPackagePlan('order-1', 'item-1', [
      { packageSpecG: 200, packageCount: 6 },
    ]);

    expect(service.previewPricing).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        dogId: 'dog-1',
        addressId: 'address-1',
        ingredientSourcePlan: 'MARKET_PREMIUM',
        items: [
          expect.objectContaining({
            recipeId: 'recipe-1',
            quantityG: 1200,
            packageCount: 6,
            packageSpecG: 200,
          }),
        ],
      }),
    );
    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantityG: 1200,
          packageCount: 6,
          packageSpecG: 200,
        }),
      }),
    );
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.objectContaining({
          amountProduct: 130,
          amountShipping: 12,
          amountTotal: 142,
          totalAmount: 142,
        }),
      }),
    );
    expect(result.pricingEffect).toMatchObject({
      amountUpdated: true,
      previousAmountTotal: 110,
      recalculatedAmountTotal: 142,
      chargedAmountTotal: 142,
      suggestedRefundAmount: 0,
      absorbedIncreaseAmount: 0,
    });
  });

  it('does not increase a paid order amount and returns absorbed merchant cost', async () => {
    orderRepository.findById.mockResolvedValue(
      createOrder({
        status: OrderStatus.PAID,
        paymentStatus: 'SUCCESS',
        paidAt: new Date('2026-06-08T01:00:00.000Z'),
      }),
    );

    const result = await service.updateOrderItemPackagePlan('order-1', 'item-1', [
      { packageSpecG: 200, packageCount: 6 },
    ]);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-1' },
        data: expect.not.objectContaining({
          amountTotal: expect.anything(),
        }),
      }),
    );
    expect(result.pricingEffect).toMatchObject({
      amountUpdated: false,
      previousAmountTotal: 110,
      recalculatedAmountTotal: 142,
      chargedAmountTotal: 110,
      suggestedRefundAmount: 0,
      absorbedIncreaseAmount: 32,
    });
  });

  it('returns a refund suggestion when a paid correction lowers the price', async () => {
    (service.previewPricing as jest.Mock).mockResolvedValueOnce({
      amountProduct: 80,
      amountShipping: 10,
      amountTotal: 90,
      pricingBreakdown: null,
    });
    orderRepository.findById.mockResolvedValue(
      createOrder({
        status: OrderStatus.PAID,
        paymentStatus: 'SUCCESS',
        paidAt: new Date('2026-06-08T01:00:00.000Z'),
      }),
    );

    const result = await service.updateOrderItemPackagePlan('order-1', 'item-1', [
      { packageSpecG: 200, packageCount: 6 },
    ]);

    expect(result.pricingEffect).toMatchObject({
      amountUpdated: false,
      previousAmountTotal: 110,
      recalculatedAmountTotal: 90,
      chargedAmountTotal: 110,
      suggestedRefundAmount: 20,
      absorbedIncreaseAmount: 0,
    });
  });

  it('rejects package corrections after purchasing has started', async () => {
    orderRepository.findById.mockResolvedValue(
      createOrder({
        status: OrderStatus.PURCHASING,
        paymentStatus: 'SUCCESS',
        paidAt: new Date('2026-06-08T01:00:00.000Z'),
      }),
    );

    await expect(
      service.updateOrderItemPackagePlan('order-1', 'item-1', [
        { packageSpecG: 200, packageCount: 6 },
      ]),
    ).rejects.toThrow('Cannot update package plan for order in status: PURCHASING');
    expect(service.previewPricing).not.toHaveBeenCalled();
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });
});
