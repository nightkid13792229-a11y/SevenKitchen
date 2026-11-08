/**
 * 鲜食订单「预约制作日期」的管理员改期准入（2026-11-08）。
 *
 * 老板定：员工端/管理员端的鲜食订单详情里，给**管理员**一个改期入口，
 * 但只在**还没开始采购**之前 —— 采购一开始，制作日期就锁死。
 *
 * 这里的判断必须和后端 `order.assertTargetDateEditable()` 对得上：
 *   采购中 / 生产中 / 急冻中 / 已发货 / 已完成 / 已取消 / 售后中 都不能改；
 *   试吃装是现货，本来就没有制作日期。
 *
 * 放在纯函数里单独测，避免页面上一堆 if 拼错状态、员工点了才报错。
 */

export interface ProductionDateEditOrder {
  status?: string | null;
  type?: string | null;
}

/** 采购开始前的三种状态：初始 / 待支付 / 已付款 */
const PRODUCTION_DATE_EDITABLE_STATUSES = ['INIT', 'PENDING_PAYMENT', 'PAID'];

/**
 * 订单当前是否允许改预约制作日。
 * 注意：调用方还要自己判断「当前登录人是不是管理员」——员工端不放开。
 */
export function canAdminEditOrderProductionDate(
  order: ProductionDateEditOrder | null | undefined,
): boolean {
  if (!order) return false;

  // 试吃装是现货，没有制作日期可改
  if (order.type === 'TASTING_PACK') return false;

  return PRODUCTION_DATE_EDITABLE_STATUSES.includes(String(order.status || ''));
}
