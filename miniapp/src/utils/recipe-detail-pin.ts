/**
 * 食谱详情页「锁版」模式（2026-11-15）。
 *
 * 员工从鲜食订单详情点「最新版 ›」时，要看的**就是这单这道食谱的最新版**。
 * 但食谱详情页原本会用 `storage.dogId` / `dogs[0]` 自动选狗，并把 dogId
 * 带给后端；后端在有 dogId 时会按狗狗生命阶段挑同系列的另一版 ——
 * 于是"最新版"可能变成同系列另一个阶段。
 *
 * 入口带上 `pinRecipe=1` 后：
 *   · 首屏不认 URL / 本地缓存的狗，按"无狗"取这道食谱本身；
 *   · 狗列表照常展示，员工想按某只狗看时手动点一下即可（点了才带 dogId）。
 *
 * 这两个纯函数把「首次用哪个 dogId」「请求带不带 dogId」从页面里拆出来，
 * 方便单测；页面只负责把 ref 的值传进来。
 */

export function resolveInitialDogId(options: {
  /** 入口是否要求锁定这道食谱 */
  pinRecipe: boolean
  /** URL 上显式带的 dogId */
  urlDogId?: string | null
  /** 本地缓存的 dogId（全站约定） */
  storedDogId?: string | null
}): string | null {
  if (options.pinRecipe) return null
  const dogId = String(options.urlDogId || options.storedDogId || '').trim()
  return dogId || null
}

export function resolveRecipeDetailDogId(options: {
  /** 入口是否要求锁定这道食谱 */
  pinRecipe: boolean
  /** 用户在当前页手动选中的狗；空 = 还没选 */
  selectedDogId?: string | null
  /** 页面请求用的 dogId（历史遗留的第二份记录） */
  dogId?: string | null
}): string {
  /**
   * 锁版模式下，只要用户还没手动选狗，就绝不带 dogId。
   * 用显式守卫而不是"靠 dogId 恰好为空"：万一别处又把 dogId 写回来，
   * 也不会悄悄把这道食谱换成同系列另一阶段。
   */
  if (options.pinRecipe && !options.selectedDogId) return ''
  return String(options.selectedDogId || options.dogId || '').trim()
}
