/**
 * 合并原料的 `properties`（2026-11-14）。
 *
 * 背景：原料更新接口收到 `properties` 是**整块替换**，不是深合并。
 * 第 4 步只改 `purchase_link` / `image_url`，如果直接把这两个键发上去，
 * 会把 `add_timing`、`production_loss_rate`、标签三项、`display_unit` 全清掉。
 *
 * 约定：
 *   · 传 `null`    → 删掉这个键（用户主动清空链接/图片）
 *   · 传 `undefined` → 不动（返回值里保留原值）
 *   · 其它值       → 覆盖
 */
export function mergeIngredientProperties(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing || {}) }

  for (const [key, value] of Object.entries(patch || {})) {
    if (value === null) {
      delete next[key]
      continue
    }
    if (value === undefined) {
      continue
    }
    next[key] = value
  }

  return next
}
