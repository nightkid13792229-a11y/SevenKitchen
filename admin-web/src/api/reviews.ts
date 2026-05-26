import api from './index'

export interface AdminReview {
  id: string
  recipeId: string
  userId: string
  ratingEase: number
  ratingValue: number
  ratingTaste: number
  content: string
  photos?: string[]
  source?: string
  createdAt: string
  recipe?: {
    id: string
    name: string
    recipeId: string
  }
  user?: {
    id: string
    nickname?: string | null
    phone?: string | null
    avatarUrl?: string | null
  }
}

export const reviewApi = {
  listAdmin: (params: { page?: number; pageSize?: number; keyword?: string }) =>
    api.get<{
      list: AdminReview[]
      total: number
      page: number
      pageSize: number
    }>('/admin/reviews', { params }),

  createAdmin: (data: {
    recipeId: string
    userId?: string
    ratingEase: number
    ratingValue: number
    ratingTaste: number
    content: string
    photos?: string[]
  }) => api.post<AdminReview>('/admin/reviews', data),

  deleteAdmin: (id: string) => api.delete(`/admin/reviews/${id}`),
}
