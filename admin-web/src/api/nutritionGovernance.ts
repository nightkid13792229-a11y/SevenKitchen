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

  testAgentSettings: (purpose?: string): Promise<AgentSettingsTestResult> =>
    api.post('/admin/nutrition-governance/agent-settings/test', null, {
      params: purpose ? { purpose } : {}
    }),

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
