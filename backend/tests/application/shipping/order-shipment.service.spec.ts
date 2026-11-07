import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderShipmentService } from 'src/application/shipping/order-shipment.service';
import { Order, OrderStatus, OrderType } from 'src/domain';

/**
 * 一票发货（2026-11-07）：合并 / 拆包。
 *
 * 这里只测「提交前能不能拦住」和「分摊写回订单对不对」——
 * 分摊算法本身在 shipping-fee-allocation.spec.ts 里单独测。
 */
describe('OrderShipmentService', () => {
  const buildOrder = (
    id: string,
    overrides: {
      customerId?: string;
      addressId?: string | null;
      status?: OrderStatus;
    } = {},
  ) =>
    Order.fromPrismaData({
      id,
      customerId: overrides.customerId ?? 'customer-1',
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
      addressId: overrides.addressId ?? 'address-1',
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

  let service: OrderShipmentService;
  let orderRepository: { findById: jest.Mock };
  let tx: any;
  let prisma: any;

  beforeEach(() => {
    orderRepository = { findById: jest.fn() };

    tx = {
      orderShipment: { create: jest.fn().mockResolvedValue({}) },
      orderShipmentOrder: { createMany: jest.fn().mockResolvedValue({}) },
      orderShipmentPackage: { create: jest.fn().mockResolvedValue({}) },
      orderShipmentPackageItem: { createMany: jest.fn().mockResolvedValue({}) },
      order: { update: jest.fn().mockResolvedValue({}) },
      orderStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };

    prisma = {
      orderShipmentOrder: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      orderItem: { findMany: jest.fn() },
      orderShipment: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };

    service = new OrderShipmentService(prisma, orderRepository as any, undefined);
  });

  const pkg = (overrides: any = {}) => ({
    carrierCode: 'SF',
    trackingNumber: 'SF0206400913347',
    actualShippingFee: 20,
    items: [{ orderId: 'order-1', specG: 110, bags: 14 }],
    ...overrides,
  });

  it('★ 包裹超过 6 个直接拦', async () => {
    await expect(
      service.createShipment({
        packages: Array.from({ length: 7 }, (_, index) =>
          pkg({ trackingNumber: `SF${index}000000000` }),
        ),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('★ 一票里两个包裹填同一个单号，拦住', async () => {
    await expect(
      service.createShipment({
        packages: [pkg(), pkg()],
      }),
    ).rejects.toThrow('同一个运单号');
  });

  it('★ 不同顾客的订单不能合并', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(buildOrder('order-1'))
      .mockResolvedValueOnce(buildOrder('order-2', { customerId: 'customer-2' }));

    prisma.orderItem.findMany.mockResolvedValue([
      {
        orderId: 'order-1',
        packagePlan: null,
        packageSpecG: 110,
        packageCount: 14,
      },
      {
        orderId: 'order-2',
        packagePlan: null,
        packageSpecG: 110,
        packageCount: 8,
      },
    ]);

    const two = pkg({
      items: [
        { orderId: 'order-1', specG: 110, bags: 14 },
        { orderId: 'order-2', specG: 110, bags: 8 },
      ],
    });

    await expect(service.createShipment({ packages: [two] })).rejects.toThrow(
      '不同顾客',
    );
  });

  it('★ 收货地址不同不能合并', async () => {
    orderRepository.findById
      .mockResolvedValueOnce(buildOrder('order-1'))
      .mockResolvedValueOnce(buildOrder('order-2', { addressId: 'address-2' }));

    prisma.orderItem.findMany.mockResolvedValue([
      { orderId: 'order-1', packagePlan: null, packageSpecG: 110, packageCount: 14 },
      { orderId: 'order-2', packagePlan: null, packageSpecG: 110, packageCount: 8 },
    ]);

    const two = pkg({
      items: [
        { orderId: 'order-1', specG: 110, bags: 14 },
        { orderId: 'order-2', specG: 110, bags: 8 },
      ],
    });

    await expect(service.createShipment({ packages: [two] })).rejects.toThrow(
      '收货地址',
    );
  });

  it('★ 袋数没分配完要报出来（不能悄悄少装）', async () => {
    orderRepository.findById.mockResolvedValue(buildOrder('order-1'));
    prisma.orderItem.findMany.mockResolvedValue([
      { orderId: 'order-1', packagePlan: null, packageSpecG: 110, packageCount: 14 },
    ]);

    await expect(
      service.createShipment({
        packages: [pkg({ items: [{ orderId: 'order-1', specG: 110, bags: 7 }] })],
      }),
    ).rejects.toThrow('应装 14 袋');
  });

  it('★ 已经在别的票里了，给一句人话', async () => {
    orderRepository.findById.mockResolvedValue(buildOrder('order-1'));
    prisma.orderShipmentOrder.findMany.mockResolvedValue([
      { orderId: 'order-1', shipmentId: 'shipment-x' },
    ]);

    await expect(service.createShipment({ packages: [pkg()] })).rejects.toThrow(
      '已经在另一票',
    );
  });

  it('★ 正常一单两包：订单运费 = 两包之和，状态变已发货', async () => {
    orderRepository.findById.mockResolvedValue(buildOrder('order-1'));
    prisma.orderItem.findMany.mockResolvedValue([
      { orderId: 'order-1', packagePlan: null, packageSpecG: 770, packageCount: 2 },
    ]);
    prisma.orderShipment.findUnique.mockResolvedValue({
      id: 'shipment-1',
      shippedAt: new Date('2026-11-07T00:00:00.000Z'),
      note: null,
      cancelledAt: null,
      packages: [],
      orders: [],
    });

    await service.createShipment({
      packages: [
        {
          carrierCode: 'SF',
          trackingNumber: 'SF0206400913347',
          actualShippingFee: 20,
          items: [{ orderId: 'order-1', specG: 770, bags: 1 }],
        },
        {
          carrierCode: 'SF',
          trackingNumber: 'SF0206400913355',
          actualShippingFee: 12,
          items: [{ orderId: 'order-1', specG: 770, bags: 1 }],
        },
      ],
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        status: OrderStatus.SHIPPED,
        trackingNumber: 'SF0206400913347',
        actualShippingFee: '32.00',
      }),
    });
  });

  it('订单不存在给 404，不是 500', async () => {
    orderRepository.findById.mockResolvedValue(null);
    prisma.orderItem.findMany.mockResolvedValue([]);

    await expect(service.createShipment({ packages: [pkg()] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
