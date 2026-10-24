import type { AdminAftersaleItem } from '@/api/customRecipe'

/**
 * 后台售后待办 · 多份售后的展示数据（2026-10-21）
 *
 * 后端把 `deliveryItemIds` 翻成了 `items`（id → 食谱名），
 * 逐份说明在 `recipeRequests` 里。页面要的是**每一份一行**：
 * 食谱名 + 这一份自己的诉求。
 *
 * 以 `deliveryItemIds` 为准、不直接遍历 `items`：
 * 交付明细被删时 `items` 会缺项，但这次售后确实涉及那么多份，
 * 少显示一行会让客服以为选少了。缺名字时给「未命名食谱」兜底。
 */
export type AftersaleRecipeSelection = Partial<
  Pick<AdminAftersaleItem, 'deliveryItemIds' | 'items' | 'recipeRequests'>
>

export interface AftersaleRecipeDetail {
  deliveryItemId: string
  recipeName: string
  /** 这一份自己的诉求；没写逐份说明时为空字符串（页面不渲染空行） */
  requestDescription: string
  /** 这一份自己的附件；旧记录为空数组 */
  requestPhotos: string[]
}

export function buildAftersaleRecipeDetails(
  selection: AftersaleRecipeSelection,
): AftersaleRecipeDetail[] {
  const deliveryItemIds = Array.isArray(selection.deliveryItemIds)
    ? selection.deliveryItemIds
    : []
  if (deliveryItemIds.length === 0) return []

  const items = Array.isArray(selection.items) ? selection.items : []
  const recipeRequests = Array.isArray(selection.recipeRequests)
    ? selection.recipeRequests
    : []

  const recipeById = new Map(
    items.map((item) => [item.deliveryItemId, item] as const),
  )
  const requestById = new Map(
    recipeRequests.map((request) => [request.deliveryItemId, request] as const),
  )

  return deliveryItemIds.map((deliveryItemId) => {
    const recipe = recipeById.get(deliveryItemId)
    const request = requestById.get(deliveryItemId)
    const recipeName = String(recipe?.recipeName ?? '').trim() || '未命名食谱'
    return {
      deliveryItemId,
      recipeName,
      requestDescription: String(request?.description ?? '').trim(),
      requestPhotos: Array.isArray(request?.photos)
        ? request.photos.filter(Boolean)
        : [],
    }
  })
}

/**
 * 按选中份重新交付（2026-10-21 · 多份售后改稿）
 *
 * 售后卡上那个按钮要不要显示、点下去发什么，只有这一处口径：
 *   · **老的单份售后**没有 `deliveryItemIds`，不能按份重交；
 *   · 没有 `orderId` 时连往哪张单重交都不知道；
 *   · 空白 id / 重复 id 不能原样发给后端，否则会被 400 挡回来。
 */
export type AftersaleRedeliverSelection = AftersaleRecipeSelection & {
  orderId?: string | null
}

/**
 * 这次售后选中的交付明细 id。
 *
 * 保持后端给的顺序（也是顾客勾选的顺序），去掉空白与重复项 ——
 * 后端只接受非空字符串数组，脏 id 发出去只会得到一句 400。
 */
export function resolveAftersaleRedeliverItemIds(
  selection: AftersaleRecipeSelection,
): string[] {
  const rawIds = Array.isArray(selection.deliveryItemIds)
    ? selection.deliveryItemIds
    : []

  const seen = new Set<string>()
  const deliveryItemIds: string[] = []

  for (const rawId of rawIds) {
    // 后端正常不会给非字符串；这里防的是历史脏数据与接口形状变化
    if (typeof rawId !== 'string') continue
    const deliveryItemId = rawId.trim()
    if (!deliveryItemId || seen.has(deliveryItemId)) continue
    seen.add(deliveryItemId)
    deliveryItemIds.push(deliveryItemId)
  }

  return deliveryItemIds
}

/**
 * 售后卡上是否显示「按选中份重新交付」。
 *
 * 必须同时满足：挂在具体订单上 + 至少选中了一份交付明细。
 * 老的单份售后没有按份选择，按钮不显示，保持原来的处理动线。
 */
export function canRedeliverAftersaleBatch(
  selection: AftersaleRedeliverSelection,
): boolean {
  const orderId = String(selection.orderId ?? '').trim()
  if (!orderId) return false
  return resolveAftersaleRedeliverItemIds(selection).length > 0
}
