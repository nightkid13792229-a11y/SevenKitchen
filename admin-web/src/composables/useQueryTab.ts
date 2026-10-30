import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

/**
 * 把"当前 tab"同步到地址栏的 ?tab=。
 *
 * 为什么不用组件内部状态：合并后的入口要能被分享、能被旧地址 redirect 指过来
 * （例如 /refunds → /aftersale-center?tab=refunds），刷新后也要停在同一个 tab。
 */
export function useQueryTab<T extends string>(
  key: string,
  tabs: readonly T[],
  fallback: T,
) {
  const route = useRoute()
  const router = useRouter()

  const normalize = (value: unknown): T => {
    const raw = Array.isArray(value) ? value[0] : value
    return tabs.includes(raw as T) ? (raw as T) : fallback
  }

  const tab = ref<T>(normalize(route.query[key]))

  watch(
    () => route.query[key],
    (value) => {
      const next = normalize(value)
      if (next !== tab.value) tab.value = next
    },
  )

  watch(tab, (value) => {
    if (route.query[key] === value) return
    router.replace({
      path: route.path,
      query: { ...route.query, [key]: value },
    })
  })

  return tab
}
