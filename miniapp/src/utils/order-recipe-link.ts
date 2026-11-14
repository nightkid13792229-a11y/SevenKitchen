/**
 * 订单详情「最新版食谱」入口的 id 解析（2026-11-15）。
 *
 * 普通鲜食 / 定制食谱的 `recipeSnapshot.id` 是**食谱业务编号**，
 * 可以直接交给 `/recipes/:id` 打开这道食谱的最新版。
 *
 * 试吃装不行：试吃装快照复用 `recipeSnapshot` 这个字段，但 `id` 存的是
 * **商品 ID**（`tasting-pack-snapshot.ts`），`kind = 'TASTING_PACK'`；
 * 点进食谱详情必然 404。而且试吃装是「一套包含哪几道菜」，
 * 本来就没有「这一道食谱」可指 —— 所以这里直接返回空串，
 * 调用方据此不显示入口。以后若要按菜给入口，应该读 `dishes[].recipeId`。
 */
export type RecipeSnapshotLike = {
  id?: string | null
  kind?: string | null
}

export function resolveLatestRecipeId(
  snapshot: RecipeSnapshotLike | null | undefined,
  options: { tastingPackOrder?: boolean } = {},
): string {
  if (options.tastingPackOrder) return ''
  if (snapshot?.kind === 'TASTING_PACK') return ''
  return String(snapshot?.id ?? '').trim()
}
