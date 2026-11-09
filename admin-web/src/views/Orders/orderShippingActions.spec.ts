import { describe, expect, it } from 'vitest'
import { OrderStatus, OrderType } from '@/types/order'
import {
  canShipFromAdmin,
  paidOrderHint,
} from './orderShippingActions'

/**
 * 试吃装是现货：付款（PAID）就能发，不用等急冻。
 *
 * 2026-11-10 独立复核发现：订单中心已把试吃装 PAID 标成「待发货」，
 * 但 admin-web 订单详情只给 FREEZING 发货按钮，还提示「生产批次系统会自动处理」。
 * 运营点进去发不了货，这条锁住口径。
 */
describe('admin 订单详情 · 发货口径', () => {
  const order = (type: OrderType, status: OrderStatus) => ({ type, status })

  it('试吃装：PAID / FREEZING 都能发货', () => {
    expect(canShipFromAdmin(order(OrderType.TASTING_PACK, OrderStatus.PAID))).toBe(true)
    expect(canShipFromAdmin(order(OrderType.TASTING_PACK, OrderStatus.FREEZING))).toBe(true)
  })

  it('普通鲜食：仍然只有急冻完成才能发', () => {
    expect(canShipFromAdmin(order(OrderType.FRESH_FOOD, OrderStatus.PAID))).toBe(false)
    expect(canShipFromAdmin(order(OrderType.FRESH_FOOD, OrderStatus.FREEZING))).toBe(true)
  })

  it('其它状态 / 空订单不发', () => {
    expect(canShipFromAdmin(order(OrderType.TASTING_PACK, OrderStatus.PURCHASING))).toBe(false)
    expect(canShipFromAdmin(null)).toBe(false)
  })

  it('付款后的提示：试吃装说现货可发，鲜食仍说等生产批次', () => {
    expect(paidOrderHint(order(OrderType.TASTING_PACK, OrderStatus.PAID))).toContain('现货')
    expect(paidOrderHint(order(OrderType.FRESH_FOOD, OrderStatus.PAID))).toContain('生产批次')
  })
})
