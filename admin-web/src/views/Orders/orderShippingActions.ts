import { OrderStatus, OrderType } from '@/types/order'

/**
 * admin-web 订单详情的发货口径（2026-11-10）。
 *
 * 与后端 `markAsShipped` 保持一致：试吃装是现货，付款（PAID）即可发货；
 * 普通鲜食必须等急冻完成（FREEZING）。
 */
export interface ShipmentStatusLike {
  type: OrderType
  status: OrderStatus
}

export function canShipFromAdmin(
  order: ShipmentStatusLike | null | undefined
): boolean {
  if (!order) return false
  if (order.type === OrderType.TASTING_PACK) {
    return [OrderStatus.PAID, OrderStatus.FREEZING].includes(order.status)
  }
  return order.status === OrderStatus.FREEZING
}

/** PAID 状态下的说明文案：试吃装别再提示「生产批次会自动处理」 */
export function paidOrderHint(
  order: ShipmentStatusLike | null | undefined
): string {
  return order?.type === OrderType.TASTING_PACK
    ? '试吃装是现货，付款后可直接发货'
    : '生产批次系统将自动处理此订单'
}
