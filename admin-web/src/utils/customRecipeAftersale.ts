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
    }
  })
}
