import api from './index'
import type {
  AgentProviderSettings,
  AgentSettingsTestResult,
  ApplyIngredientCandidateConfigurationPayload,
  BatchAgentReviewPayload,
  CandidateNutritionValidationWithAgentResult,
  CfctLocalStructuredLibrary,
  CfctLocalStructuredLibraryQueue,
  ConfirmNutritionCandidatePayload,
  ImportCfctReviewedSourceRowsPayload,
  ImportCfctReviewedSourceRowsResult,
  IngredientNutritionCandidate,
  IngredientNutritionCandidateListItem,
  ListNutritionCandidatesParams,
  ListSupplementDraftsParams,
  NutritionAgentReviewJob,
  NutritionGovernanceOverview,
  NutritionSourceRecord,
  RankFoodCandidatesWithAgentPayload,
  SupplementNutritionDraft,
  UpdateAgentProviderSettingsPayload
} from '@/types/nutritionGovernance'

export const nutritionGovernanceApi = {
  getOverview: (): Promise<NutritionGovernanceOverview> =>
    api.get('/admin/nutrition-governance/overview'),

  listCandidates: (
    params?: ListNutritionCandidatesParams
  ): Promise<IngredientNutritionCandidateListItem[]> =>
    api.get('/admin/nutrition-governance/candidates', { params }),

  generateFoodCandidates: (
    ingredientId: string
  ): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/generate-food', {
      ingredientId
    }),

  importUsdaSource: (
    fdcId: string,
    ingredientId?: string
  ): Promise<NutritionSourceRecord> =>
    api.post('/admin/nutrition-governance/sources/usda/import', {
      fdcId,
      ingredientId
    }),

  importReviewedCfctRows: (
    data: ImportCfctReviewedSourceRowsPayload
  ): Promise<ImportCfctReviewedSourceRowsResult> =>
    api.post('/admin/nutrition-governance/sources/cfct/import-reviewed', data),

  getLocalCfctStructuredLibrary: (
    queue: CfctLocalStructuredLibraryQueue = 'auto-ready'
  ): Promise<CfctLocalStructuredLibrary> =>
    api.get('/admin/nutrition-governance/sources/cfct/local-library', {
      params: { queue }
    }),

  getAgentSettings: (purpose?: string): Promise<AgentProviderSettings> =>
    api.get('/admin/nutrition-governance/agent-settings', {
      params: purpose ? { purpose } : {}
    }),

  updateAgentSettings: (
    data: UpdateAgentProviderSettingsPayload,
    purpose?: string
  ): Promise<AgentProviderSettings> =>
    api.put('/admin/nutrition-governance/agent-settings', data, {
      params: purpose ? { purpose } : {}
    }),

  /**
   * 测试连接（会用配置里的模型真跑一次调用）。
   *
   * ⚠️ 请求体必须是 `{}` 而不是 `null`（2026-10-01 修）：axios 会把 `null` 序列化成
   * 字面量字符串 "null"，而后端的 JSON 解析器在 strict 模式下会直接抛
   * `Unexpected token 'n', "null" is not valid JSON` —— 那个 400 还没带跨域头，
   * 浏览器于是报成 "Network Error"，界面上看着像"网络不通"，其实是这个。
   *
   * 另外：这一步是**真实模型调用**，可能比普通接口慢得多（配置里超时上限 90s），
   * 所以单独给它放宽到 120s，避免前端 30s 先超时、误判成"连接失败"。
   */
  testAgentSettings: (purpose?: string): Promise<AgentSettingsTestResult> =>
    api.post(
      '/admin/nutrition-governance/agent-settings/test',
      {},
      {
        params: purpose ? { purpose } : {},
        timeout: 120000,
      }
    ),

  startBatchAgentReview: (
    data: BatchAgentReviewPayload
  ): Promise<NutritionAgentReviewJob> =>
    api.post('/admin/nutrition-governance/candidates/batch-agent-review', data),

  getLatestAgentReviewJob: (): Promise<NutritionAgentReviewJob | null> =>
    api.get('/admin/nutrition-governance/candidates/agent-review-jobs/latest'),

  getAgentReviewJob: (id: string): Promise<NutritionAgentReviewJob> =>
    api.get(`/admin/nutrition-governance/candidates/agent-review-jobs/${id}`),

  reviewCandidateWithAgent: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/agent-review`),

  rankFoodCandidatesWithAgent: (
    data: RankFoodCandidatesWithAgentPayload
  ): Promise<IngredientNutritionCandidateListItem[]> =>
    api.post('/admin/nutrition-governance/candidates/rank-with-agent', data, {
      timeout: 180000
    }),

  validateCandidateNutritionWithAgent: (
    id: string
  ): Promise<CandidateNutritionValidationWithAgentResult> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/nutrition-validation`, undefined, {
      timeout: 180000
    }),

  confirmCandidate: (
    id: string,
    data?: ConfirmNutritionCandidatePayload
  ): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/confirm`, data),

  batchConfirmCandidates: (
    candidateIds: string[]
  ): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/batch-confirm', { candidateIds }),

  applyIngredientCandidateConfiguration: (
    data: ApplyIngredientCandidateConfigurationPayload
  ): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/apply-ingredient-config', data),

  rejectCandidate: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/reject`),

  listSupplementDrafts: (
    params?: ListSupplementDraftsParams
  ): Promise<SupplementNutritionDraft[]> =>
    api.get('/admin/nutrition-governance/supplement-drafts', { params }),

  confirmSupplementDraft: (id: string): Promise<SupplementNutritionDraft> =>
    api.post(`/admin/nutrition-governance/supplement-drafts/${id}/confirm`),

  rejectSupplementDraft: (id: string): Promise<SupplementNutritionDraft> =>
    api.post(`/admin/nutrition-governance/supplement-drafts/${id}/reject`),

  uploadSupplementLabel: (
    ingredientId: string,
    file: File
  ): Promise<SupplementNutritionDraft> => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post(
      `/admin/nutrition-governance/supplement-drafts/${ingredientId}/upload-label`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
  }
}

export default nutritionGovernanceApi
