/**
 * 原料管理 API
 */
import api from './index'
import type { Ingredient, IngredientForm } from '@/types/ingredient'

export const ingredientApi = {
  /**
   * 获取所有原料列表
   */
  list: (): Promise<Ingredient[]> =>
    api.get('/admin/ingredients'),

  /**
   * 获取单个原料详情
   */
  getDetail: (id: string): Promise<Ingredient> =>
    api.get(`/admin/ingredients/${id}`),

  /**
   * 创建新原料
   */
  create: (data: IngredientForm): Promise<Ingredient> =>
    api.post('/admin/ingredients', data),

  /**
   * 更新原料
   */
  update: (id: string, data: Partial<IngredientForm>): Promise<Ingredient> =>
    api.put(`/admin/ingredients/${id}`, data),

  /**
   * 更新原料价格
   */
  updatePrice: (id: string, price: number): Promise<Ingredient> =>
    api.put(`/admin/ingredients/${id}/price`, { currentPricePerPurchaseUnit: price }),

  /**
   * 删除原料
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/ingredients/${id}`),

  /**
   * 获取原料使用情况
   */
  getUsage: (id: string): Promise<any[]> =>
    api.get(`/admin/ingredients/${id}/usage`)
}
