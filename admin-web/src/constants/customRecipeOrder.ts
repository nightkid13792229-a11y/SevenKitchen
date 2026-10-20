/**
 * 定制订单的**判断规则与退款文案**。
 *
 * ⚠️ **状态文案不在这里了**（2026-10-16 批次 3.3 搬走）。
 *
 * 这里原先有一份 `CUSTOM_RECIPE_STATUS_META`（状态码 → 中文 + 标签色）。
 * 它当初解决了"列表页与详情页各写一份"的问题，但**没解决
 * "后端加枚举时前端要跟上"** —— 而这件事 2026-10-16 又发生了一次：
 * 后端加 `COMPLETED`（已完成）时这份表没跟上，
 * 顾客在小程序点「确认收到」之后，**后台显示的是英文 `COMPLETED`**。
 *
 * 与 2026-10-04 加「已取消」时漏了两处半是同一个毛病：
 * **只要中文还有第二份拷贝，就一定会再漏一次。**
 *
 * 现在状态中文只存在于后端的**选项字典**里，前端一律用
 * `composables/useOptionSet.ts` 来取。这个文件只剩
 * "跟文案无关的判断"（可交付吗、是不是重新交付）与退款文案。
 *
 * 为什么必须收成一份：详情页与列表页原来各写一份状态字典，
 * 详情页漏了「已取消」这一档 —— 同一张单在列表里显示"已取消"，
 * 点进详情却变成英文 CANCELLED。字典散在两处就是"改一处漏一处"。
 *
 * 这里只放纯映射与判断，不依赖 Vue / Element Plus，方便单测直接跑。
 */

/**
 * Element Plus 标签允许的 type 取值（空串 = 默认蓝色）。
 *
 * 与状态文案无关，纯粹是"这个组件库接受哪些颜色"——
 * 所以留在常量文件里，别的地方（如过敏可信度）也在用。
 */
export type CustomRecipeTagType =
  | ''
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'

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
  /**
   * ★ 2026-10-16 补：`COMPLETED`（已完成）。
   *
   * 漏了它的后果是**功能性的**，不只是文案：顾客点「确认收到」后订单变成
   * 已完成，这时他提售后说"想改一版"，**后台不会显示「重新交付」按钮**
   * —— 而这正是老板要的售后流程（调整食谱 → 重新交付）。
   *
   * 后端那边是允许的（动作解析器的 `DELIVERABLE` 里有 `COMPLETED`），
   * 于是形成"后端允许、界面不给入口"的口径不一致。
   */
  'COMPLETED',
] as const

export function canDeliverCustomRecipe(status?: string | null): boolean {
  return (CUSTOM_RECIPE_DELIVERABLE_STATUSES as readonly string[]).includes(
    String(status || '').toUpperCase(),
  )
}

/**
 * 已交付的单再交付 = 重新交付，文案与二次确认都要换。
 *
 * `COMPLETED` 也算 —— 售后改稿后顾客会重新回到"待确认"，
 * 那一次交付在界面上同样该叫「重新交付」。
 */
export function isCustomRecipeRedelivery(status?: string | null): boolean {
  const key = String(status || '').toUpperCase()
  return key === 'DELIVERED' || key === 'COMPLETED'
}

/**
 * 多份订单的应交付份数（2026-10-21 · 多份履约第二阶段）。
 *
 * 老订单没有这一列、脏数据也可能写成 0 / 负数 / 小数；这些情况一律按 1 份处理。
 * 判断放在这里而不是页面里，是为了让"到底算不算多份订单"只有一份口径。
 */
export function normalizeRecipeQuantity(value?: number | null): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
    ? value
    : 1
}

/** 是否多份订单（只有 N > 1 才走批量交付；1 份继续走原来的单份交付） */
export function isMultiRecipeOrderQuantity(value?: number | null): boolean {
  return normalizeRecipeQuantity(value) > 1
}

/**
 * 「共 N 份，已设计 X 份」。
 *
 * X 是候选食谱数量；设计多了也不影响本单，不能显示成「2 份订单已设计 5 份」——
 * 员工会误以为还要再交付 5 份，所以上限收敛到 N。
 */
export function buildMultiRecipeProgressText(
  recipeQuantity: number | null | undefined,
  designedCount: number,
): string {
  const total = normalizeRecipeQuantity(recipeQuantity)
  const rawDesigned = Number.isFinite(designedCount)
    ? Math.trunc(designedCount)
    : 0
  const designed = Math.min(Math.max(rawDesigned, 0), total)
  return `共 ${total} 份，已设计 ${designed} 份`
}

/**
 * 批量交付按钮能不能点：必须**恰好**勾满 N 份。
 *
 * 少一份不能交（后端也会拒绝）；多一份同样不行（后端上限就是订单份数）。
 * N = 1 不走批量入口，一律返回 false，避免把老订单误切到新接口。
 */
export function canSubmitBatchDelivery(
  selectedCount: number,
  recipeQuantity: number | null | undefined,
): boolean {
  const total = normalizeRecipeQuantity(recipeQuantity)
  return total > 1 && Number.isInteger(selectedCount) && selectedCount === total
}

/**
 * 候选食谱的复选框能不能继续勾。
 *
 * 已勾选的始终可点（要能取消）；没勾满 N 份时才能加新的。
 * 这样即便用户狂点，也不会出现勾了 N+1 份再提交的情况。
 */
export function isBatchRecipeSelectable(
  recipeId: string,
  selectedIds: readonly string[],
  recipeQuantity: number | null | undefined,
): boolean {
  const total = normalizeRecipeQuantity(recipeQuantity)
  const selected = Array.isArray(selectedIds) ? selectedIds : []
  return selected.includes(recipeId) || selected.length < total
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
