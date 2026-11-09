import { OrderStatus, OrderType } from '../../../src/domain/order/enums';
import { Order } from '../../../src/domain/order/order.entity';
import { OrderItem } from '../../../src/domain/order/order-item.entity';

describe('Order domain behaviors', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createOrder(
    targetProductionDate: Date,
    options: { status?: OrderStatus; type?: OrderType } = {},
  ): Order {
    return new Order(
      'order-1',
      'customer-1',
      options.status ?? OrderStatus.PAID,
      options.type ?? OrderType.FRESH_FOOD,
      new Date('2026-03-30T00:00:00.000Z'),
      targetProductionDate,
      null,
      100,
      10,
      110,
      [
        new OrderItem(
          'item-1',
          'order-1',
          null,
          {} as any,
          1000,
          10,
          100,
          null,
          100,
        ),
      ],
    );
  }

  it('allows moving a future target production date back to today', () => {
    jest.setSystemTime(new Date('2026-03-31T17:00:00.000Z'));

    const originalDate = new Date('2026-04-02T00:00:00.000Z');
    const today = new Date('2026-04-01T00:00:00.000Z');
    const order = createOrder(originalDate);

    order.updateTargetProductionDate(today);

    expect(order.targetProductionDate).toBe(today);
    expect(order.originalTargetProductionDate?.toISOString()).toBe(
      originalDate.toISOString(),
    );
  });

  it('rejects moving the target production date into the past', () => {
    jest.setSystemTime(new Date('2026-03-31T17:00:00.000Z'));

    const order = createOrder(new Date('2026-04-02T00:00:00.000Z'));

    expect(() =>
      order.updateTargetProductionDate(new Date('2026-03-31T00:00:00.000Z')),
    ).toThrow('Target production date cannot be earlier than today');
  });

  it('rejects date changes after purchasing starts, including aftersale', () => {
    jest.setSystemTime(new Date('2026-03-31T17:00:00.000Z'));

    for (const status of [
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.AFTERSALE,
    ]) {
      const order = createOrder(new Date('2026-04-02T00:00:00.000Z'), {
        status,
      });

      expect(() =>
        order.updateTargetProductionDate(new Date('2026-04-01T00:00:00.000Z')),
      ).toThrow('Cannot update target production date');
    }
  });

  it('rejects date changes for tasting-pack orders', () => {
    jest.setSystemTime(new Date('2026-03-31T17:00:00.000Z'));

    const order = createOrder(new Date('2026-04-02T00:00:00.000Z'), {
      type: OrderType.TASTING_PACK,
    });

    expect(() =>
      order.updateTargetProductionDate(new Date('2026-04-01T00:00:00.000Z')),
    ).toThrow('试吃装是现货');
  });

  it('★ 试吃装是现货：付款（PAID）即可发货；普通鲜食仍要等急冻完成（2026-11-10）', () => {
    const tasting = createOrder(new Date('2026-04-02T00:00:00.000Z'), {
      type: OrderType.TASTING_PACK,
      status: OrderStatus.PAID,
    });
    expect(() => tasting.markAsShipped('SF123456', 'SF')).not.toThrow();

    const fresh = createOrder(new Date('2026-04-02T00:00:00.000Z'), {
      status: OrderStatus.PAID,
    });
    expect(() => fresh.markAsShipped('SF123456', 'SF')).toThrow(
      /Cannot mark order as shipped/,
    );
  });

  it('stores and clears admin remark for production notes', () => {
    const order = createOrder(new Date('2026-04-02T00:00:00.000Z'));

    order.updateAdminRemark('  请优先上午制作并单独打包  ');
    expect(order.adminRemark).toBe('请优先上午制作并单独打包');

    order.updateAdminRemark('   ');
    expect(order.adminRemark).toBeNull();
  });
});

describe('OrderItem packagePlan validation', () => {
  function createOrderItem(
    packagePlan: Array<{ packageSpecG: number; packageCount: number }> | null,
    overrides: Partial<{
      quantityG: number;
      packageCount: number;
      packageSpecG: number;
    }> = {},
  ): OrderItem {
    return new OrderItem(
      'item-1',
      'order-1',
      null,
      {} as any,
      overrides.quantityG ?? 800,
      overrides.packageCount ?? 5,
      overrides.packageSpecG ?? 200,
      null,
      100,
      null,
      null,
      null,
      packagePlan,
      null,
    );
  }

  it('accepts a packagePlan matching quantity and package count', () => {
    const item = createOrderItem([
      { packageSpecG: 100, packageCount: 2 },
      { packageSpecG: 200, packageCount: 3 },
    ]);

    expect(item.packagePlan).toEqual([
      { packageSpecG: 100, packageCount: 2 },
      { packageSpecG: 200, packageCount: 3 },
    ]);
  });

  it('rejects a packagePlan whose total quantity differs from quantityG', () => {
    expect(() =>
      createOrderItem([{ packageSpecG: 200, packageCount: 5 }], {
        quantityG: 900,
      }),
    ).toThrow('Package plan total (1000) must equal quantityG (900)');
  });

  it('rejects a packagePlan whose package count differs from packageCount', () => {
    expect(() =>
      createOrderItem([{ packageSpecG: 200, packageCount: 4 }], {
        quantityG: 800,
        packageCount: 5,
      }),
    ).toThrow('Package plan count (4) must equal packageCount (5)');
  });

  it('rejects an explicitly empty packagePlan', () => {
    expect(() => createOrderItem([])).toThrow(
      'Package plan must contain at least one row when provided',
    );
  });

  it('accepts a null packagePlan for legacy order items', () => {
    const item = createOrderItem(null, {
      quantityG: 1350,
      packageSpecG: 100,
      packageCount: 14,
    });

    expect(item.packagePlan).toBeNull();
  });
});
