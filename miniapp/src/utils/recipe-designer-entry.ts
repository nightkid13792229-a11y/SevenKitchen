/**
 * 食谱设计器入口的可见性（W2）
 *
 * 业务口径（docs/plans/2026-09-30-recipe-domain-business-definition.md §5.1）：
 *   · 首页**不展示**食谱设计器入口
 *   · 「我的」页面展示入口，但**只给已经用食谱设计器设计过食谱的用户**
 *   · 没用过的用户（含所有新客户）在任何地方都看不到
 *
 * "用过"的判定由后端 `/recipe-designer/customer-access` 给出：
 *   该客户名下还有没有活跃的食谱系列。前端与后端共用同一口径，
 *   避免出现"看得到入口却建不了"或"看不到入口却能建"。
 *
 * 用法：
 *   const { shouldShowRecipeDesignerEntry, loadRecipeDesignerEntry } = useRecipeDesignerEntry()
 *   onShow(() => { void loadRecipeDesignerEntry() })
 */
import { ref } from 'vue'
import { recipeDesignerApi } from '../api/recipe-designer'

/** 同一次会话内只问一次后端，避免每次进页面都打接口 */
const entryVisible = ref(false)
const resolved = ref(false)

const readHasDesignHistory = (res: any): boolean =>
  Boolean(res?.data?.hasDesignHistory ?? res?.hasDesignHistory)

export function useRecipeDesignerEntry() {
  const loadRecipeDesignerEntry = async (force = false) => {
    if (resolved.value && !force) return

    try {
      const res: any = await recipeDesignerApi.getCustomerDesignerAccess()
      entryVisible.value = readHasDesignHistory(res)
    } catch (error) {
      // 取不到就按"不显示"处理：设计器已不再对所有用户开放，
      // 宁可少显示一个入口，也不要让不该看到的人看到。
      console.warn('[RecipeDesignerEntry] Failed to load access:', error)
      entryVisible.value = false
    } finally {
      resolved.value = true
    }
  }

  /** 退出登录等场景需要重置缓存 */
  const resetRecipeDesignerEntry = () => {
    entryVisible.value = false
    resolved.value = false
  }

  return {
    shouldShowRecipeDesignerEntry: entryVisible,
    loadRecipeDesignerEntry,
    resetRecipeDesignerEntry,
  }
}
