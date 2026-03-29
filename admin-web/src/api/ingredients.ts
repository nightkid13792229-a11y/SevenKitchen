/**
 * 原料管理 API
 */
import api from './index'
import type { Ingredient, IngredientForm, RecommendedProduct, RecommendedProductForm } from '@/types/ingredient'

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
    api.get(`/admin/ingredients/${id}/usage`),

  // ==================== 推荐产品 ====================

  /**
   * 获取原料的推荐产品列表
   */
  listRecommendedProducts: (ingredientId: string): Promise<RecommendedProduct[]> =>
    api.get(`/admin/ingredients/${ingredientId}/recommended-products`),

  /**
   * 新增推荐产品
   */
  createRecommendedProduct: (ingredientId: string, data: RecommendedProductForm): Promise<RecommendedProduct> =>
    api.post(`/admin/ingredients/${ingredientId}/recommended-products`, data),

  /**
   * 更新推荐产品
   */
  updateRecommendedProduct: (ingredientId: string, id: string, data: Partial<RecommendedProductForm>): Promise<RecommendedProduct> =>
    api.put(`/admin/ingredients/${ingredientId}/recommended-products/${id}`, data),

  /**
   * 删除推荐产品
   */
  deleteRecommendedProduct: (ingredientId: string, id: string): Promise<void> =>
    api.delete(`/admin/ingredients/${ingredientId}/recommended-products/${id}`)
}
