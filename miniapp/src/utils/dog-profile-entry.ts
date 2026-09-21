/**
 * 狗狗档案「建档入口」统一约定
 *
 * 背景（2026-09-21 复盘）：全站曾有 12 处引导/拦截点各自拼跳转 URL、各写一套文案，
 * 结果是 ——
 *   1. 只有成品订购页带了「回来要继续做什么」，其余入口建档完成后一律被丢到爱犬列表页，
 *      用户的购买意图丢失；
 *   2. 建档埋点的 entrySource 被硬编码成 'dog_list'，无法分辨用户是从哪来的；
 *   3. 拦截点本身没有任何埋点，看不到哪个入口转化最好。
 *
 * 本模块把这三件事收敛成一个入口：
 *   · buildDogCreateRoute —— 统一拼 URL，永远带上 source（可选带 recipeId / redirect=order）；
 *   · trackDogCreateEntry —— 每个引导点上报同一条漏斗事件，entrySource 区分来源；
 *   · navigateToDogCreate —— 上面两件事的组合，页面里只调这一个函数。
 *
 * dog-create 读取 source 后会：
 *   · 把它作为 dog_profile_create_started 的 entrySource（修正原先的硬编码）；
 *   · 建档成功后优先 navigateBack 回到来源页（来源页自己负责 onShow 刷新），
 *     只有页面栈里没有上一页时才回落到爱犬列表页。
 */

import { trackFunnelEvent } from './funnel'

/** 建档页路由（不带参数） */
export const DOG_CREATE_ROUTE = '/pages/dog-create/index'

/**
 * 建档入口来源标识。
 *
 * 新增入口时必须在这里登记，避免又出现 'dog_list' 式的硬编码。
 */
export const DOG_CREATE_SOURCES = [
  'home',
  'my_page',
  'dog_list',
  'health',
  'recipe_detail',
  'recipe_order',
  'recipe_diy',
  'calculator',
  'custom_recipe',
  'unknown',
] as const

export type DogCreateSource = (typeof DOG_CREATE_SOURCES)[number]

export interface DogCreateEntryOptions {
  /** 入口来源，用于埋点归因与排查 */
  source: DogCreateSource
  /** 从食谱相关页面进入时带上食谱 ID，方便回来后恢复现场 */
  recipeId?: string | null
  /** 当前选中的狗狗 ID（用于观察用户在建档前的选择状态） */
  dogId?: string | null
  /** 来自订购流程时置 true：建档成功后回到订购页继续下单，而不是单纯返回 */
  redirectToOrder?: boolean
}

function normalizeSource(source: DogCreateSource | string | null | undefined): DogCreateSource {
  const value = String(source || '') as DogCreateSource
  return (DOG_CREATE_SOURCES as readonly string[]).includes(value) ? value : 'unknown'
}

/** 拼建档页 URL；永远带 source，可选带 recipeId 与 redirect=order */
export function buildDogCreateRoute(options: DogCreateEntryOptions): string {
  const params = [`source=${encodeURIComponent(normalizeSource(options.source))}`]

  if (options.recipeId) {
    params.push(`recipeId=${encodeURIComponent(options.recipeId)}`)
  }

  if (options.redirectToOrder) {
    params.push('redirect=order')
  }

  return `${DOG_CREATE_ROUTE}?${params.join('&')}`
}

/**
 * 上报一次「从某处点去建档」。
 *
 * 失败不影响跳转（trackFunnelEvent 本身是 fire-and-forget）。
 */
export function trackDogCreateEntry(options: DogCreateEntryOptions): void {
  trackFunnelEvent({
    eventName: 'tap_create_dog',
    step: 'tap_create_dog',
    recipeId: options.recipeId || undefined,
    dogId: options.dogId || undefined,
    entrySource: normalizeSource(options.source),
  })
}

/** 上报来源并跳到建档页 —— 页面里应该只调这一个函数 */
export function navigateToDogCreate(options: DogCreateEntryOptions): void {
  trackDogCreateEntry(options)
  uni.navigateTo({ url: buildDogCreateRoute(options) })
}
