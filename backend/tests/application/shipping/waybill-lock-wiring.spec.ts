import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { enforceWaybillLock } from 'src/application/shipping/waybill-lock';
import { OrderService } from 'src/application/order/order.service';
import { OrderShipmentService } from 'src/application/shipping/order-shipment.service';
import { SupplementOrderService } from 'src/application/supplement-shop/supplement-order.service';

/**
 * 发货硬锁的接线（2026-11-10）。
 *
 * 老板选的是「没验过存根就不许发货」。锁本身（WaybillReceiptGuardService）
 * 另有用例；这里管的是**三个发货入口有没有真的调它**——
 * 少接一个口，那条路上就完全不设防，而且没人会发现问题。
 */
describe('enforceWaybillLock 开关', () => {
  const guard = { assertVerified: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    guard.assertVerified.mockResolvedValue(undefined);
  });

  it('不要求锁时，一次都不调', async () => {
    await enforceWaybillLock(guard as any, {
      enabled: false,
      orderIds: ['o1'],
      trackingNumber: 'SF1',
    });

    expect(guard.assertVerified).not.toHaveBeenCalled();
  });

  it('要求锁时，把单号原样交给校验', async () => {
    await enforceWaybillLock(guard as any, {
      enabled: true,
      orderIds: ['o1'],
      trackingNumber: 'SF0204691009893',
    });

    expect(guard.assertVerified).toHaveBeenCalledWith({
      orderIds: ['o1'],
      trackingNumber: 'SF0204691009893',
    });
  });

  it('★ 要求锁但校验服务没注入 → 报错，绝不静默放行', async () => {
    await expect(
      enforceWaybillLock(undefined, {
        enabled: true,
        orderIds: ['o1'],
        trackingNumber: 'SF1',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('不要求锁 + 校验服务没注入 → 正常通过（后台网页那条路）', async () => {
    await expect(
      enforceWaybillLock(undefined, {
        enabled: false,
        orderIds: ['o1'],
        trackingNumber: 'SF1',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('鲜食单笔发货接入了硬锁', () => {
  const makeOrder = () => ({
    id: 'o1',
    status: 'FREEZING',
    markAsShipped: jest.fn(),
    markAsNoShippingRequired: jest.fn(),
  });

  const build = (order: any, guard: any) => {
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn().mockResolvedValue(order),
    };
    const service: any = new (OrderService as any)(orderRepository);
    service.waybillReceiptGuard = guard;
    return service;
  };

  it('★ 核对不过 → 拦住，订单不会被标记发货', async () => {
    const order = makeOrder();
    const guard = {
      assertVerified: jest
        .fn()
        .mockRejectedValue(new BadRequestException('还没核对过')),
    };
    const service = build(order, guard);

    await expect(
      service.shipOrder(
        'o1',
        {
          shippingType: 'NORMAL',
          trackingNumber: 'SF0204691009893',
          carrierCode: 'SF',
          enforceWaybillCheck: true,
        },
        null,
      ),
    ).rejects.toThrow(/还没核对过/);

    expect(order.markAsShipped).not.toHaveBeenCalled();
    expect(guard.assertVerified).toHaveBeenCalledWith({
      orderIds: ['o1'],
      trackingNumber: 'SF0204691009893',
    });
  });

  it('★ 不要求锁（后台网页来的）→ 不校验，照常往下走', async () => {
    const order = makeOrder();
    order.markAsShipped.mockImplementation(() => {
      throw new Error('SENTINEL-往下走了');
    });
    const guard = { assertVerified: jest.fn() };
    const service = build(order, guard);

    await expect(
      service.shipOrder(
        'o1',
        {
          shippingType: 'NORMAL',
          trackingNumber: 'SF0204691009893',
          carrierCode: 'SF',
        },
        null,
      ),
    ).rejects.toThrow('SENTINEL');

    expect(guard.assertVerified).not.toHaveBeenCalled();
  });

  it('无需发货（自用单）不校验', async () => {
    const order = makeOrder();
    order.markAsNoShippingRequired.mockImplementation(() => {
      throw new Error('SENTINEL-往下走了');
    });
    const guard = { assertVerified: jest.fn() };
    const service = build(order, guard);

    await expect(
      service.shipOrder('o1', { shippingType: 'NOT_REQUIRED', enforceWaybillCheck: true }, null),
    ).rejects.toThrow('SENTINEL');

    expect(guard.assertVerified).not.toHaveBeenCalled();
  });
});

describe('补剂单发货接入了硬锁', () => {
  const build = (guard: any) => {
    const prisma = {
      supplementOrder: {
        findUnique: jest.fn().mockResolvedValue({ id: 's1', status: 'PACKED' }),
      },
      $transaction: jest.fn(),
    };
    const service: any = new (SupplementOrderService as any)(prisma);
    service.waybillReceiptGuard = guard;
    return { service, prisma };
  };

  it('★ 核对不过 → 拦住，事务一次都没开', async () => {
    const guard = {
      assertVerified: jest
        .fn()
        .mockRejectedValue(new BadRequestException('还没核对过')),
    };
    const { service, prisma } = build(guard);

    await expect(
      service.shipOrder(
        's1',
        {
          shippingType: 'NORMAL',
          trackingNumber: 'SF0204691009893',
          carrierCode: 'SF',
          actualShippingFee: 12,
          enforceWaybillCheck: true,
        },
        { type: 'STAFF', id: 'staff-1' },
      ),
    ).rejects.toThrow(/还没核对过/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(guard.assertVerified).toHaveBeenCalledWith({
      orderIds: ['s1'],
      trackingNumber: 'SF0204691009893',
    });
  });

  it('不要求锁时不校验', async () => {
    const guard = { assertVerified: jest.fn() };
    const { service, prisma } = build(guard);

    await expect(
      service.shipOrder(
        's1',
        {
          shippingType: 'NORMAL',
          trackingNumber: 'SF0204691009893',
          carrierCode: 'SF',
          actualShippingFee: 12,
        },
        { type: 'STAFF', id: 'staff-1' },
      ),
    ).rejects.toBeTruthy();

    expect(guard.assertVerified).not.toHaveBeenCalled();
  });
});

describe('合并/拆包发货接入了硬锁', () => {
  const build = (guard: any) => {
    const order = {
      id: 'o1',
      customerId: 'c1',
      addressId: 'addr-1',
      status: 'FREEZING',
      markAsShipped: jest.fn(),
    };
    const prisma = {
      orderShipmentOrder: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            orderId: 'o1',
            packagePlan: null,
            packageSpecG: 110,
            packageCount: 7,
          },
        ]),
      },
      $transaction: jest.fn(),
      ingredient: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const orderRepository = {
      findById: jest.fn().mockResolvedValue(order),
    };
    const service: any = new (OrderShipmentService as any)(prisma, orderRepository);
    service.waybillReceiptGuard = guard;
    return { service, prisma, order };
  };

  const payload = {
    packages: [
      {
        carrierCode: 'SF',
        trackingNumber: 'SF0204691009893',
        actualShippingFee: 20,
        items: [{ orderId: 'o1', specG: 110, bags: 7 }],
      },
    ],
  };

  it('★ 核对不过 → 整票拒绝，事务一次都没开', async () => {
    const guard = {
      assertVerified: jest
        .fn()
        .mockRejectedValue(new BadRequestException('还没核对过')),
    };
    const { service, prisma, order } = build(guard);

    await expect(
      service.createShipment(
        { ...payload, enforceWaybillCheck: true },
        'staff-1',
      ),
    ).rejects.toThrow(/还没核对过/);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(order.markAsShipped).not.toHaveBeenCalled();
    expect(guard.assertVerified).toHaveBeenCalledWith({
      orderIds: ['o1'],
      trackingNumber: 'SF0204691009893',
    });
  });

  it('不要求锁时不校验', async () => {
    const guard = { assertVerified: jest.fn() };
    const { service } = build(guard);

    await expect(
      service.createShipment(payload, 'staff-1'),
    ).rejects.toBeTruthy();

    expect(guard.assertVerified).not.toHaveBeenCalled();
  });
});
