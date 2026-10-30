/**
 * 列表筛选 ↔ 地址栏同步（2026-10-30）。
 *
 * 之前「产品线 / 订单定制」只存在组件内存里，刷新就回到默认；后来给 mode
 * 单独写了 URL 读写。现在把这类筛选统一收在这里：
 *
 * 新增一个筛选（比如再增加一种状态）只需在调用处 `refs` 和 `defaults` 里
 * 登记一项，刷新、分享、从订单带入都会自动带上，不用再写一遍持久化逻辑。
 */
import { onBeforeUnmount, watch, type Ref } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'

export interface QueryFilterSyncOptions {
  /** 每个筛选的默认值；等于默认值时不写进地址栏，保持地址干净 */
  defaults: Record<string, string | number | boolean | undefined>
  /** 地址栏里的非法值（比如已删除的旧状态）直接忽略 */
  validators?: Record<string, (value: string) => boolean>
  /** 输入类筛选的写地址节流，默认 200ms */
  debounceMs?: number
}

/**
 * 纯函数：把筛选值合并进 query。
 * - 空值 / 默认值从 query 里删掉；
 * - 其它参数（orderId、dogId 等）原样保留。
 */
export function buildFilterQuery(
  base: LocationQuery,
  values: Record<string, unknown>,
  defaults: Record<string, string | number | boolean | undefined>
): LocationQuery {
  const query: LocationQuery = { ...base }
  for (const [key, raw] of Object.entries(values)) {
    const value = String(raw ?? '').trim()
    // 默认值可能是数字/布尔（比如页码），统一按字符串比较
    const defaultValue = String(defaults[key] ?? '')
    if (!value || value === defaultValue) {
      delete query[key]
    } else {
      query[key] = value
    }
  }
  return query
}

/** 两个 query 是否等价（顺序无关，数组按拼接比较） */
export function isSameQuery(a: LocationQuery, b: LocationQuery): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const normalize = (value: LocationQuery[string] | undefined) =>
    Array.isArray(value) ? value.join('|') : String(value ?? '')
  for (const key of keys) {
    if (normalize(a[key]) !== normalize(b[key])) return false
  }
  return true
}

/**
 * 把「一整份筛选状态对象」自动同步到地址栏。
 *
 * 这是比逐个登记更省事的方式：新增一类筛选时，只要在 state 里加一个字段，
 * 这里会自动遍历它 —— 不需要再登记 ref、默认值或读写逻辑。
 * `state` 的初始值会作为默认值：等于默认值时不写进地址栏。
 */
export function useFilterQueryState<T extends Record<string, unknown>>(
  state: T
): void {
  const route = useRoute()
  const router = useRouter()
  const defaults: Record<string, unknown> = { ...state }

  // 地址栏优先：刷新、分享链接、从订单带入时按 URL 恢复。
  // 按默认值的类型还原：数字（页码）转 Number，布尔转 Boolean，其余按字符串。
  for (const key of Object.keys(state)) {
    const raw = route.query[key]
    if (typeof raw !== 'string' || !raw) continue
    const defaultValue = defaults[key]
    if (typeof defaultValue === 'number') {
      const numeric = Number(raw)
      if (Number.isFinite(numeric)) {
        ;(state as Record<string, unknown>)[key] = numeric
      }
      continue
    }
    if (typeof defaultValue === 'boolean') {
      ;(state as Record<string, unknown>)[key] = raw === 'true' || raw === '1'
      continue
    }
    ;(state as Record<string, unknown>)[key] = raw
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  watch(
    () => state,
    () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const values = Object.fromEntries(
          Object.keys(state).map((key) => [key, state[key]])
        )
        const nextQuery = buildFilterQuery(
          route.query,
          values,
          defaults as Record<string, string | number | boolean | undefined>
        )
        if (isSameQuery(nextQuery, route.query)) return
        void router.replace({ query: nextQuery })
      }, 200)
    },
    { deep: true }
  )

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })
}
