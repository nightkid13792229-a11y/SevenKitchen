import { ref } from 'vue'
import { api } from '@/api'

/**
 * 选项字典组合式函数（2026-10-16，批次 3.3）
 *
 * ## 它取代的是什么
 *
 * 后台原来有一份**本地状态文案表**（`constants/customRecipeOrder.ts` 的
 * `CUSTOM_RECIPE_STATUS_META`）。它的问题在 2026-10-16 又犯了一次：
 * 后端加了 `COMPLETED`（已完成）这一档，**三个端都没跟上** ——
 * 顾客在小程序点「确认收到」之后，**老板在后台看到的是英文 `COMPLETED`**。
 *
 * 这跟 2026-10-04 加「已取消」时漏了两处半是同一个毛病：
 * **只要中文还有第二份拷贝，就一定会再漏一次。**
 *
 * 现在中文只存在于后端的「选项字典」里，前端一律来取。
 *
 * ## 为什么用公开接口而不是管理员接口
 *
 * 后台页面客服也在用（`AdminGuard` 只挂敏感动作），
 * 而公开的 `/options` 不需要管理员权限 —— 谁都读得到。
 *
 * ## 缓存
 *
 * 按集缓存在**模块级**（不是组件级）：同一份字典在一整个会话里只请求一次。
 * 页面切来切去不会反复打接口。
 */

interface OptionItem {
  code: string
  label: string
  description?: string | null
  tone?: string | null
  icon?: string | null
  sortOrder?: number
  isDefault?: boolean
}

/** 模块级缓存：集码 → 条目（同一个会话只请求一次） */
const cache = new Map<string, OptionItem[]>()
/** 正在进行的请求（防止同一集并发打两次） */
const inflight = new Map<string, Promise<OptionItem[]>>()

async function loadSet(setCode: string): Promise<OptionItem[]> {
  if (cache.has(setCode)) return cache.get(setCode)!

  const pending = inflight.get(setCode)
  if (pending) return pending

  const request = (async () => {
    try {
      const res: any = await api.get('/options', { params: { sets: setCode } })
      const items = res?.sets?.[setCode]
      const normalized = Array.isArray(items) ? items : []
      cache.set(setCode, normalized)
      return normalized
    } catch (error) {
      /**
       * ⚠️ 取不到时**返回空表，不编一份兜底中文**。
       *
       * 编了就等于又回到"中文有两份拷贝"的老路 ——
       * 而且会比现在更糟：那份兜底会慢慢与后端分叉，却没人发现。
       * 调用方拿不到就显示原始码，至少是**如实**的。
       */
      console.warn(`[OptionSet] 读取选项集 ${setCode} 失败:`, error)
      return []
    } finally {
      inflight.delete(setCode)
    }
  })()

  inflight.set(setCode, request)
  return request
}

export function useOptionSet(setCode: string) {
  const items = ref<OptionItem[]>(cache.get(setCode) ?? [])
  const loading = ref(!cache.has(setCode))

  const ensure = async () => {
    if (cache.has(setCode)) {
      items.value = cache.get(setCode)!
      loading.value = false
      return
    }
    loading.value = true
    items.value = await loadSet(setCode)
    loading.value = false
  }

  /** 码 → 中文；取不到时**如实返回原始码**（不编） */
  const labelOf = (code?: string | null): string => {
    const key = String(code || '')
    if (!key) return ''
    return items.value.find((item) => item.code === key)?.label || key
  }

  /** 码 → 色调档位；取不到时给空串（Element Plus 的默认样式） */
  const toneOf = (code?: string | null): string => {
    const key = String(code || '')
    return items.value.find((item) => item.code === key)?.tone || ''
  }

  return { items, loading, ensure, labelOf, toneOf }
}

/** 定制订单状态（与后端枚举同名） */
export const CUSTOM_RECIPE_STATUS_SET = 'custom_recipe_status'

/**
 * 定制目标（减重 / 维持 / 增重 / 健康管理）。
 *
 * 后台此前有三份写死的中文 map（订单列表 / 订单详情 / 设计器侧栏），
 * 共 12 处 —— "三个地方保持一致"靠的是注释里的约定，而不是机制。
 * 后端加一个目标时，改一处漏两处是必然的。
 */
export const CUSTOM_RECIPE_GOAL_SET = 'custom_recipe_goal'

/** 只有一个用途：让测试能清掉缓存 */
export function __clearOptionSetCache() {
  cache.clear()
  inflight.clear()
}
