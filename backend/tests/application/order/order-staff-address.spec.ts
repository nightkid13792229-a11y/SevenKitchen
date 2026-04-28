import { BadRequestException } from '@nestjs/common';
import { OrderService, ORDER_REPOSITORY } from 'src/order.service';
import { Order, OrderStatus, OrderType } from 'src/domain';
import { Address } from 'src/domain/address/address.entity';

describe('OrderService staff order addresses', () => {
  let service: OrderService;
  let orderRepository: {
    findById: jest.Mock;
    save: jest.Mock;
  };
  let addressRepository: {
    findById: jest.Mock;
    findByUserId: jest.Mock;
    save: jest.Mock;
  };

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

  function createAddress(
    id: string,
    userId = 'customer-1',
    isDefault = false,
  ): Address {
    return new Address(
      id,
      userId,
      id === 'address-2' ? '李四' : '张三',
      id === 'address-2' ? '13900139000' : '13800138000',
      {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      id === 'address-2' ? '海岸城2号' : '科技园南区123号',
      isDefault,
    );
  }

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      save: jest.fn((order: Order) => Promise.resolve(order)),
    };
    addressRepository = {
      findById: jest.fn(),
      findByUserId: jest.fn(),
      save: jest.fn((address: Address) => Promise.resolve(address)),
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
      addressRepository as any,
      {} as any,
      { preparationMethod: { findMany: jest.fn() } } as any,
    );
  });

  it('creates an address for the order customer and binds it to the order', async () => {
    const order = createOrder();
    orderRepository.findById.mockResolvedValue(order);
    addressRepository.findByUserId.mockResolvedValue([]);

    const result = await service.createOrderCustomerAddress('order-1', {
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
      isDefault: false,
    });

    const savedAddress = addressRepository.save.mock.calls[0][0] as Address;
    expect(savedAddress.userId).toBe('customer-1');
    expect(savedAddress.isDefault).toBe(false);
    expect(result.address).toBe(savedAddress);
    expect(result.order.addressId).toBe(savedAddress.id);
    expect(result.order.shippingAddressSnapshot).toMatchObject({
      id: savedAddress.id,
      recipientName: '张三',
      phone: '13800138000',
      detail: '科技园南区123号',
    });
    expect(orderRepository.save).toHaveBeenCalledWith(order);
  });

  it('binds an existing address owned by the order customer', async () => {
    const order = createOrder();
    const address = createAddress('address-1');
    orderRepository.findById.mockResolvedValue(order);
    addressRepository.findById.mockResolvedValue(address);

    const result = await service.bindOrderCustomerAddress(
      'order-1',
      'address-1',
    );

    expect(result.addressId).toBe('address-1');
    expect(result.shippingAddressSnapshot).toMatchObject({
      id: 'address-1',
      recipientName: '张三',
    });
    expect(orderRepository.save).toHaveBeenCalledWith(order);
  });

  it('rejects binding an address owned by another customer', async () => {
    orderRepository.findById.mockResolvedValue(createOrder());
    addressRepository.findById.mockResolvedValue(
      createAddress('address-2', 'customer-2'),
    );

    await expect(
      service.bindOrderCustomerAddress('order-1', 'address-2'),
    ).rejects.toThrow('Address does not belong to the order customer');
  });

  it('rejects address changes after the order is shipped', async () => {
    orderRepository.findById.mockResolvedValue(createOrder(OrderStatus.SHIPPED));
    addressRepository.findById.mockResolvedValue(createAddress('address-1'));

    await expect(
      service.bindOrderCustomerAddress('order-1', 'address-1'),
    ).rejects.toThrow('Cannot update address for order in status: SHIPPED');
  });

  it('clears the previous default address when staff saves a new default', async () => {
    const previousDefault = createAddress('address-1', 'customer-1', true);
    orderRepository.findById.mockResolvedValue(createOrder());
    addressRepository.findByUserId.mockResolvedValue([previousDefault]);

    await service.createOrderCustomerAddress('order-1', {
      recipientName: '李四',
      phone: '13900139000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '海岸城2号',
      isDefault: true,
    });

    const savedAddresses = addressRepository.save.mock.calls.map(
      ([address]) => address as Address,
    );
    expect(previousDefault.isDefault).toBe(false);
    expect(savedAddresses).toContain(previousDefault);
    expect(savedAddresses.some((address) => address.isDefault)).toBe(true);
  });

  it('updates the customer address book entry and current order snapshot together', async () => {
    const order = createOrder();
    const address = createAddress('address-1');
    orderRepository.findById.mockResolvedValue(order);
    addressRepository.findById.mockResolvedValue(address);
    addressRepository.findByUserId.mockResolvedValue([address]);

    const result = await service.updateOrderCustomerAddress(
      'order-1',
      'address-1',
      {
        recipientName: '王五',
        phone: '13700137000',
        region: {
          province: '广东省',
          city: '广州市',
          district: '天河区',
        },
        detail: '体育西路1号',
        isDefault: false,
      },
    );

    expect(result.address.recipientName).toBe('王五');
    expect(result.order.shippingAddressSnapshot).toMatchObject({
      id: 'address-1',
      recipientName: '王五',
      phone: '13700137000',
      detail: '体育西路1号',
    });
  });
});
