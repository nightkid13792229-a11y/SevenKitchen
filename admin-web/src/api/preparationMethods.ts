/**
 * 制备方法管理 API
 */
import api from './index'

export interface PreparationMethod {
  id: string
  name: string
  description: string | null
  sort: number
  createdAt: string
  updatedAt: string
}

export interface CreatePreparationMethodDto {
  name: string
  description?: string | null
  sort?: number
}

export interface UpdatePreparationMethodDto {
  name?: string
  description?: string | null
  sort?: number
}

export const preparationMethodApi = {
  /**
   * 获取所有制备方法
   */
  list: (): Promise<PreparationMethod[]> =>
    api.get('/admin/preparation-methods'),

  /**
   * 获取单个制备方法详情
   */
  getDetail: (id: string): Promise<PreparationMethod> =>
    api.get(`/admin/preparation-methods/${id}`),

  /**
   * 创建制备方法
   */
  create: (data: CreatePreparationMethodDto): Promise<PreparationMethod> =>
    api.post('/admin/preparation-methods', data),

  /**
   * 更新制备方法
   */
  update: (id: string, data: UpdatePreparationMethodDto): Promise<PreparationMethod> =>
    api.put(`/admin/preparation-methods/${id}`, data),

  /**
   * 删除制备方法
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/preparation-methods/${id}`),

  /**
   * 批量更新排序
   */
  updateSort: (items: { id: string; sort: number }[]): Promise<void> =>
    api.put('/admin/preparation-methods/sort', { items }),
}
