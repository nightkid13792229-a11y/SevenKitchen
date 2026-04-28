jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';
import { Address } from '../../../src/domain/address/address.entity';

describe('AdminController order customer addresses', () => {
  const address = new Address(
    'address-1',
    'customer-1',
    '张三',
    '13800138000',
    {
      province: '广东省',
      city: '深圳市',
      district: '南山区',
    },
    '科技园南区123号',
    false,
  );

  function createController(orderService: Record<string, any>) {
    return new AdminController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      orderService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('lists addresses for the order customer', async () => {
    const orderService = {
      listOrderCustomerAddresses: jest.fn().mockResolvedValue([address]),
    };
    const controller = createController(orderService);

    const result = await (controller as any).listOrderCustomerAddresses(
      'order-1',
    );

    expect(orderService.listOrderCustomerAddresses).toHaveBeenCalledWith(
      'order-1',
    );
    expect(result.code).toBe(0);
    expect(result.data[0]).toMatchObject({
      id: 'address-1',
      recipientName: '张三',
      phone: '13800138000',
    });
  });

  it('creates and binds an address for the order customer', async () => {
    const orderService = {
      createOrderCustomerAddress: jest.fn().mockResolvedValue({
        address,
        order: { id: 'order-1' },
      }),
    };
    const controller = createController(orderService);
    const body = {
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
      isDefault: true,
    };

    const result = await (controller as any).createOrderCustomerAddress(
      'order-1',
      body,
    );

    expect(orderService.createOrderCustomerAddress).toHaveBeenCalledWith(
      'order-1',
      body,
    );
    expect(result.code).toBe(0);
    expect(result.data.address.id).toBe('address-1');
  });

  it('binds an existing customer address to the order', async () => {
    const orderService = {
      bindOrderCustomerAddress: jest.fn().mockResolvedValue({ id: 'order-1' }),
    };
    const controller = createController(orderService);

    const result = await (controller as any).bindOrderCustomerAddress(
      'order-1',
      { addressId: 'address-1' },
    );

    expect(orderService.bindOrderCustomerAddress).toHaveBeenCalledWith(
      'order-1',
      'address-1',
    );
    expect(result.code).toBe(0);
  });

  it('updates a customer address and refreshes the current order binding', async () => {
    const orderService = {
      updateOrderCustomerAddress: jest.fn().mockResolvedValue({
        address,
        order: { id: 'order-1' },
      }),
    };
    const controller = createController(orderService);
    const body = {
      recipientName: '张三',
      phone: '13800138000',
      region: {
        province: '广东省',
        city: '深圳市',
        district: '南山区',
      },
      detail: '科技园南区123号',
      isDefault: false,
    };

    const result = await (controller as any).updateOrderCustomerAddress(
      'order-1',
      'address-1',
      body,
    );

    expect(orderService.updateOrderCustomerAddress).toHaveBeenCalledWith(
      'order-1',
      'address-1',
      body,
    );
    expect(result.code).toBe(0);
    expect(result.data.address.id).toBe('address-1');
  });

  it('uses the order address snapshot before the mutable address book entry', async () => {
    const controller = createController({});

    const result = await (controller as any).mapOrderToAdminDto({
      id: 'order-1',
      customerId: 'customer-1',
      dogId: null,
      addressId: 'address-1',
      address: {
        id: 'address-1',
        recipientName: '地址簿新名字',
        phone: '13900139000',
        region: {
          province: '广东省',
          city: '广州市',
          district: '天河区',
        },
        detail: '地址簿新地址',
      },
      shippingAddressSnapshot: {
        id: 'address-1',
        recipientName: '历史订单名字',
        phone: '13800138000',
        region: {
          province: '广东省',
          city: '深圳市',
          district: '南山区',
        },
        detail: '历史订单地址',
      },
      status: 'PAID',
      type: 'FRESH_FOOD',
      targetProductionDate: null,
      totalAmount: 110,
      amountProduct: 100,
      amountShipping: 10,
      amountTotal: 110,
      items: [],
      pricingBreakdownSnapshot: null,
      trackingNumber: null,
      carrierCode: null,
      shippedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      adminRemark: null,
    });

    expect(result.address).toMatchObject({
      id: 'address-1',
      recipientName: '历史订单名字',
      phone: '13800138000',
      detailAddress: '历史订单地址',
      regionText: '广东省 深圳市 南山区',
    });
  });
});
