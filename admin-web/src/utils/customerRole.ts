/**
 * 顾客角色口径（2026-10-21）
 *
 * 后台能看到三种账号：真实顾客（CUSTOMER）、员工（STAFF）、管理员（ADMIN）。
 * 后两者是内部账号，代客下单时如果选到它们，本质上是在造测试单 ——
 * 页面必须**明确标出来**，不能在订单中心里和真实业绩混在一起。
 *
 * 统一放在这里，代客下单页、订单中心、订单详情共用同一套判断，
 * 不各自写一遍 `role !== 'CUSTOMER'`。
 */

/** 内部账号在订单列表/详情上的标记 */
export const INTERNAL_CUSTOMER_BADGE = '内部测试'

/** 内部账号在代客下单搜索结果/已选身份上的标记 */
export const INTERNAL_CUSTOMER_ACCOUNT_BADGE = '内部账号'

/** 角色归一化：空值按真实顾客处理（老接口可能没返回 role） */
export function normalizeCustomerRole(role: unknown): string {
  const value = String(role ?? '')
    .trim()
    .toUpperCase()
  return value || 'CUSTOMER'
}

/**
 * 是否内部账号。
 *
 * 空角色返回 false —— 宁可把未知当成普通顾客也不要在页面上乱标，
 * 真正的内部账号后端一定会带 role。
 */
export function isInternalCustomerRole(role: unknown): boolean {
  const value = String(role ?? '').trim()
  if (!value) return false
  return normalizeCustomerRole(value) !== 'CUSTOMER'
}
