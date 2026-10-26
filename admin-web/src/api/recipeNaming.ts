/**
 * 食谱命名 API（2026-10-27）
 *
 * 路径与后端 `admin.controller.ts` 的 AI 命名两条路由一一对应。
 * 注意：只**生成**候选，不落库——改名字仍然走原来的系列改名接口。
 */
import api from './index'

/** 与后端 `RECIPE_NAME_MAX_LENGTH` 保持同一个数：标签一行只放得下 12 个字 */
export const RECIPE_NAME_MAX_LENGTH = 12

export interface RecipeNameCandidate {
  name: string
  valuePoint: string
  ingredients: string
  /** 已不再要求模型输出 */
  reason?: string
  /** 命中现有禁用词表：只是提醒，不拒绝（词表尚未完善） */
  complianceWarning: boolean
}

export interface RecipeNameCandidatesResult {
  candidates: RecipeNameCandidate[]
  provider: string
}

export const recipeNamingApi = {
  availability: (): Promise<{ available: boolean }> =>
    api.get('/admin/recipe-designer/naming/availability'),

  candidates: (seriesId: string): Promise<RecipeNameCandidatesResult> =>
    api.post(`/admin/recipe-designer/series/${seriesId}/name-candidates`)
}
