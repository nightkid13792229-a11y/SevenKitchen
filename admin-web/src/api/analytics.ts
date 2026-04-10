import api from './index'
import type { DogProfileAnalyticsSummary } from '@/types/analytics'

export const analyticsApi = {
  getDogProfileSummary: async (params: { from: string; to: string }): Promise<DogProfileAnalyticsSummary> => {
    const response = await api.get('/admin/analytics/dog-profile', { params })
    return response as unknown as DogProfileAnalyticsSummary
  },
}
