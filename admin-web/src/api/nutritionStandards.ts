import api from './index'
import type {
  NutritionStandardEntry,
  NutritionStandardEntryDetail,
  NutritionStandardEntryQuery,
  NutritionStandardOverview,
  NutritionStandardReviewStatus
} from '@/types/nutritionStandard'

export const nutritionStandardApi = {
  getFediaf2025DogOverview: (): Promise<NutritionStandardOverview> =>
    api.get('/admin/nutrition-standards/fediaf-2025-dog/overview'),

  listFediaf2025DogEntries: (
    params?: NutritionStandardEntryQuery
  ): Promise<NutritionStandardEntry[]> =>
    api.get('/admin/nutrition-standards/fediaf-2025-dog/entries', { params }),

  getFediaf2025DogEntryDetail: (
    id: string
  ): Promise<NutritionStandardEntryDetail> =>
    api.get(`/admin/nutrition-standards/fediaf-2025-dog/entries/${id}`),

  updateFediaf2025DogEntryReview: (
    id: string,
    data: { status: NutritionStandardReviewStatus; note?: string }
  ): Promise<unknown> =>
    api.patch(
      `/admin/nutrition-standards/fediaf-2025-dog/entries/${id}/review`,
      data
    )
}
