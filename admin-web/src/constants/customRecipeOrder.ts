/**
 * 定制订单状态与退款状态的**唯一文案口径**。
 *
 * 为什么必须收成一份：详情页与列表页原来各写一份状态字典，
 * 详情页漏了「已取消」这一档 —— 同一张单在列表里显示"已取消"，
 * 点进详情却变成英文 CANCELLED。字典散在两处就是"改一处漏一处"。
 *
 * 这里只放纯映射与判断，不依赖 Vue / Element Plus，方便单测直接跑。
 */

/** Element Plus 标签允许的 type 取值（空串 = 默认蓝色） */
export type CustomRecipeTagType =
  | ''
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'

export interface CustomRecipeStatusMeta {
  text: string
  tagType: CustomRecipeTagType
}

/** 与后端 CustomRecipeStatus 枚举一一对应，五档齐全 */
export const CUSTOM_RECIPE_STATUS_META: Record<string, CustomRecipeStatusMeta> = {
  PENDING_PAYMENT: { text: '待付款', tagType: 'warning' },
  PAID: { text: '已付款', tagType: 'primary' },
  IN_PROGRESS: { text: '制作中', tagType: 'primary' },
  DELIVERED: { text: '已交付', tagType: 'success' },
  // 超时自动关单与客服取消都是这一档，此前详情页没有文案
  CANCELLED: { text: '已取消', tagType: 'info' },
}

/** 状态文案；遇到未知枚举时原样返回，至少不会是空白 */
export function getCustomRecipeStatusText(status?: string | null): string {
  const key = String(status || '').toUpperCase()
  return CUSTOM_RECIPE_STATUS_META[key]?.text || key || '-'
}

export function getCustomRecipeStatusTagType(
  status?: string | null,
): CustomRecipeTagType {
  const key = String(status || '').toUpperCase()
  return CUSTOM_RECIPE_STATUS_META[key]?.tagType || 'info'
}

/**
 * 订单是否"还在进行中"。
 *
 * 只有进行中的单才会因为超过预计交付日而算超期：
 * 已交付、已取消的单再去标红没有意义，只会淹没真正要催的单。
 */
export function isCustomRecipeOrderOpen(status?: string | null): boolean {
  const key = String(status || '').toUpperCase()
  return key !== 'DELIVERED' && key !== 'CANCELLED'
}

/**
 * 可交付的状态 —— 与后端 deliverExistingRecipe 的白名单保持一致。
 * 已交付的单也在内：口径 4 允许「重新交付」（覆盖并再次通知顾客）。
 */
export const CUSTOM_RECIPE_DELIVERABLE_STATUSES = [
  'PAID',
  'IN_PROGRESS',
  'DELIVERED',
] as const

export function canDeliverCustomRecipe(status?: string | null): boolean {
  return (CUSTOM_RECIPE_DELIVERABLE_STATUSES as readonly string[]).includes(
    String(status || '').toUpperCase(),
  )
}

/** 已交付的单再交付 = 重新交付，文案与二次确认都要换 */
export function isCustomRecipeRedelivery(status?: string | null): boolean {
  return String(status || '').toUpperCase() === 'DELIVERED'
}

/**
 * 退款状态文案（与后端 wechat-payment.service 的 getRefundStatusText 同口径）。
 * 退款是钱的事，不能让客服只看到一个英文枚举。
 */
export const CUSTOM_RECIPE_REFUND_STATUS_TEXT: Record<string, string> = {
  PENDING: '退款处理中，等待微信确认',
  PROCESSING: '退款处理中，等待微信确认',
  SUCCESS: '退款成功，钱款已原路退回',
  ABNORMAL: '退款异常，请到微信商户平台核查',
  CLOSED: '退款已关闭，请核查',
  FAILED: '退款发起失败，钱款未退回',
}

export function getCustomRecipeRefundStatusText(
  status?: string | null,
): string {
  const key = String(status || '').toUpperCase()
  if (!key) return ''
  return CUSTOM_RECIPE_REFUND_STATUS_TEXT[key] || `退款状态：${key}`
}

/** 退款是否已成功（决定详情页用绿还是用红提示） */
export function isCustomRecipeRefundSucceeded(
  status?: string | null,
): boolean {
  return String(status || '').toUpperCase() === 'SUCCESS'
}
