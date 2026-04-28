import { OrderStatus, OrderType } from '../../../src/domain';
import { Order } from '../../../src/domain/order/order.entity';

describe('Order address snapshot', () => {
  function createOrder(status = OrderStatus.PAID): Order {
    return Order.fromPrismaData({
      id: 'order-1',
      customerId: 'customer-1',
      status,
      type: OrderType.FRESH_FOOD,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
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

  it('stores a stable shipping address snapshot when address is updated', () => {
    const order = createOrder();

    order.updateAddress('address-1', {
      id: 'address-1',
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
    });

    expect(order.addressId).toBe('address-1');
    expect(order.address).toEqual({
      id: 'address-1',
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
    });
    expect(order.shippingAddressSnapshot).toEqual({
      id: 'address-1',
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
    });
  });

  it('rejects address snapshot updates after shipment has started', () => {
    const order = createOrder(OrderStatus.SHIPPED);

    expect(() =>
      order.updateAddress('address-1', {
        id: 'address-1',
        recipientName: '张三',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: '科技园南区123号',
      }),
    ).toThrow('Cannot update address for order in status: SHIPPED');
  });
});
