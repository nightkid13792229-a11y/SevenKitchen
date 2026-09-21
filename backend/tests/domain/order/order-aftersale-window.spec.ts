import { Order } from '../../../src/domain/order/order.entity';
import { OrderStatus, OrderType, AftersaleType } from '../../../src/domain/order/enums';

/**
 * 售后窗口矩阵（2026-09-19 重新划分）
 *
 *   ① 取消窗口：已付款（尚未生成采购清单）—— 我们还没为这一单花钱，可整单取消
 *   ② 锁定期  ：采购中 / 生产中 / 急冻中 —— 已开始投入，不支持退款或重做
 *   ③ 售后窗口：已发货 / 已完成 —— 真正的售后服务（质量问题退款/重做）
 *
 * 投诉建议全程保留：与订单进度无关，关闭该渠道会把顾客推向平台投诉。
 *
 * ⚠️ 这份矩阵必须与小程序端 `miniapp/src/utils/order-aftersale.ts` 保持一致。
 */
function buildOrder(status: OrderStatus): Order {
  const u = undefined;
  return new Order(
    'order-1',
    'customer-1',
    status,
    OrderType.FRESH_FOOD,
    new Date(),
    null,
    null,
    0,
    0,
    0,
    [{}] as any,
    u, u, u, u, u, u,
    u, u, u,
    u, u, u, u, u,
    u, u, u, u,
    u, u, u,
  );
}

function canApply(status: OrderStatus, type: AftersaleType): boolean {
  try {
    buildOrder(status).applyForAftersale(type, '测试原因');
    return true;
  } catch {
    return false;
  }
}

describe('Order aftersale window matrix', () => {
  describe('① 取消窗口：仅「已付款」可申请退款（顾客侧呈现为"取消订单"）', () => {
    it('allows PAID — the cancel flow depends on the REFUND type', () => {
      expect(canApply(OrderStatus.PAID, AftersaleType.REFUND)).toBe(true);
    });

    it('allows no op — PAID 不允许重做（东西还没做出来）', () => {
      expect(canApply(OrderStatus.PAID, AftersaleType.REMAKE)).toBe(false);
    });
  });

  describe('② 锁定期：采购中 / 生产中 / 急冻中 不支持退款与重做', () => {
    const locked = [
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.FREEZING,
    ];

    it.each(locked)('%s 不允许退款', (status) => {
      expect(canApply(status, AftersaleType.REFUND)).toBe(false);
    });

    it.each(locked)('%s 不允许重做', (status) => {
      expect(canApply(status, AftersaleType.REMAKE)).toBe(false);
    });
  });

  describe('③ 售后窗口：已发货 / 已完成 支持退款与重做', () => {
    const shipped = [OrderStatus.SHIPPED, OrderStatus.COMPLETED];

    it.each(shipped)('%s 允许退款', (status) => {
      expect(canApply(status, AftersaleType.REFUND)).toBe(true);
    });

    it.each(shipped)('%s 允许重做', (status) => {
      expect(canApply(status, AftersaleType.REMAKE)).toBe(true);
    });
  });

  describe('投诉建议：全程保留', () => {
    const holdable = [
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      OrderStatus.COMPLETED,
    ];

    it.each(holdable)('%s 允许投诉建议', (status) => {
      expect(canApply(status, AftersaleType.COMPLAINT)).toBe(true);
    });
  });

  describe('边界', () => {
    it('未付款与已取消的订单不能申请任何售后', () => {
      for (const status of [
        OrderStatus.INIT,
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.CANCELLED,
        OrderStatus.AFTERSALE,
      ]) {
        expect(canApply(status, AftersaleType.REFUND)).toBe(false);
        expect(canApply(status, AftersaleType.REMAKE)).toBe(false);
        expect(canApply(status, AftersaleType.COMPLAINT)).toBe(false);
      }
    });

    it('售后原因必填', () => {
      expect(() =>
        buildOrder(OrderStatus.SHIPPED).applyForAftersale(
          AftersaleType.REFUND,
          '   ',
        ),
      ).toThrow();
    });

    it('已完成订单超过 7 天不能再申请退款或重做，但仍可投诉', () => {
      const stale = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const u = undefined;
      const makeStale = () =>
        new Order(
          'order-1', 'customer-1', OrderStatus.COMPLETED, OrderType.FRESH_FOOD,
          new Date(), null, null, 0, 0, 0, [{}] as any,
          u, u, u, u, u, u,
          u, u, u,
          stale, u, u, u, u,
          u, u, u, u,
          u, u, u,
        );

      expect(() => makeStale().applyForAftersale(AftersaleType.REFUND, '测试')).toThrow();
      expect(() => makeStale().applyForAftersale(AftersaleType.REMAKE, '测试')).toThrow();
      // 投诉不受 7 天限制
      expect(() =>
        makeStale().applyForAftersale(AftersaleType.COMPLAINT, '测试'),
      ).not.toThrow();
    });
  });
});
