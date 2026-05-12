import api from './index'
import type {
  ConfirmNutritionCandidatePayload,
  IngredientNutritionCandidate,
  IngredientNutritionCandidateListItem,
  ListNutritionCandidatesParams,
  ListSupplementDraftsParams,
  NutritionGovernanceOverview,
  NutritionSourceRecord,
  SupplementNutritionDraft
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

  reviewCandidateWithAgent: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/agent-review`),

  confirmCandidate: (
    id: string,
    data?: ConfirmNutritionCandidatePayload
  ): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/confirm`, data),

  batchConfirmCandidates: (
    candidateIds: string[]
  ): Promise<IngredientNutritionCandidate[]> =>
    api.post('/admin/nutrition-governance/candidates/batch-confirm', { candidateIds }),

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
