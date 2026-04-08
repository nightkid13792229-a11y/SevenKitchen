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

  function createOrder(targetProductionDate: Date): Order {
    return new Order(
      'order-1',
      'customer-1',
      OrderStatus.PAID,
      OrderType.FRESH_FOOD,
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

  it('stores and clears admin remark for production notes', () => {
    const order = createOrder(new Date('2026-04-02T00:00:00.000Z'));

    order.updateAdminRemark('  请优先上午制作并单独打包  ');
    expect(order.adminRemark).toBe('请优先上午制作并单独打包');

    order.updateAdminRemark('   ');
    expect(order.adminRemark).toBeNull();
  });
});
