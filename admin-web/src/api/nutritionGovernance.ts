import api from './index'
import type {
  IngredientNutritionCandidate,
  IngredientNutritionCandidateListItem,
  ListNutritionCandidatesParams,
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

  importUsdaSource: (fdcId: string): Promise<NutritionSourceRecord> =>
    api.post('/admin/nutrition-governance/sources/usda/import', { fdcId }),

  confirmCandidate: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/confirm`),

  rejectCandidate: (id: string): Promise<IngredientNutritionCandidate> =>
    api.post(`/admin/nutrition-governance/candidates/${id}/reject`),

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
