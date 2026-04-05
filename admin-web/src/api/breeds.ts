/**
 * 品种管理 API
 * Breed Management API
 */
import api from './index'
import type { DogBreed, BreedForm, CustomBreedStats, BreedUsageCheck } from '@/types/breed'

export const breedApi = {
  /**
   * 获取所有系统预定义品种
   */
  list: (): Promise<DogBreed[]> =>
    api.get('/admin/breeds'),

  /**
   * 获取单个品种详情
   */
  getDetail: (id: string): Promise<DogBreed> =>
    api.get(`/admin/breeds/${id}`),

  /**
   * 创建新品种
   */
  create: (data: BreedForm): Promise<DogBreed> =>
    api.post('/admin/breeds', data),

  /**
   * 更新品种
   */
  update: (id: string, data: Partial<BreedForm>): Promise<DogBreed> =>
    api.put(`/admin/breeds/${id}`, data),

  /**
   * 删除品种
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/breeds/${id}`),

  /**
   * 检查品种使用情况
   */
  checkUsage: (id: string): Promise<BreedUsageCheck> =>
    api.get(`/admin/breeds/${id}/usage`),

  /**
   * 获取用户自定义品种统计
   */
  getCustomBreeds: (): Promise<CustomBreedStats[]> =>
    api.get('/admin/breeds/custom-stats')
}
