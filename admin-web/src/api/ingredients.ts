/**
 * 原料管理 API
 */
import api from './index'
import type {
  Ingredient,
  IngredientForm,
  ProcurementSku,
  ProcurementSkuForm,
  ProcurementSkuPriceHistory,
  RecommendedProduct,
  RecommendedProductForm
} from '@/types/ingredient'

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

  /**
   * 上传补剂 DIY 推荐图片到腾讯 COS
   */
  uploadIngredientDiyImage: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post<{
      url: string
      key: string
    }>('/admin/ingredients/upload-diy-image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
  },

  /**
   * 删除补剂 DIY 推荐图片
   */
  deleteIngredientDiyImage: async (key: string) =>
    api.post('/admin/ingredients/delete-diy-image', { key }),

  // ==================== 家庭 DIY 推荐商品 ====================

  /**
   * 获取原料的家庭 DIY 推荐商品列表
   */
  listRecommendedProducts: (ingredientId: string): Promise<RecommendedProduct[]> =>
    api.get(`/admin/ingredients/${ingredientId}/recommended-products`),

  /**
   * 新增家庭 DIY 推荐商品
   */
  createRecommendedProduct: (ingredientId: string, data: RecommendedProductForm): Promise<RecommendedProduct> =>
    api.post(`/admin/ingredients/${ingredientId}/recommended-products`, data),

  /**
   * 更新家庭 DIY 推荐商品
   */
  updateRecommendedProduct: (ingredientId: string, id: string, data: Partial<RecommendedProductForm>): Promise<RecommendedProduct> =>
    api.put(`/admin/ingredients/${ingredientId}/recommended-products/${id}`, data),

  /**
   * 删除家庭 DIY 推荐商品
   */
  deleteRecommendedProduct: (ingredientId: string, id: string): Promise<void> =>
    api.delete(`/admin/ingredients/${ingredientId}/recommended-products/${id}`),

  /**
   * 获取全局历史品牌候选
   */
  listBrandSuggestions: (): Promise<string[]> =>
    api.get('/admin/ingredient-suggestions/brands'),

  /**
   * 获取全局历史采购渠道候选
   */
  listPurchaseChannelSuggestions: (): Promise<string[]> =>
    api.get('/admin/ingredient-suggestions/purchase-channels'),

  // ==================== 生产采购 SKU ====================

  /**
   * 获取原料的生产采购 SKU 列表
   */
  listProcurementSkus: (ingredientId: string): Promise<ProcurementSku[]> =>
    api.get(`/admin/ingredients/${ingredientId}/procurement-skus`),

  /**
   * 新增生产采购 SKU
   */
  createProcurementSku: (ingredientId: string, data: ProcurementSkuForm): Promise<ProcurementSku> =>
    api.post(`/admin/ingredients/${ingredientId}/procurement-skus`, data),

  /**
   * 更新生产采购 SKU
   */
  updateProcurementSku: (ingredientId: string, id: string, data: Partial<ProcurementSkuForm>): Promise<ProcurementSku> =>
    api.put(`/admin/ingredients/${ingredientId}/procurement-skus/${id}`, data),

  /**
   * 获取生产采购 SKU 生效采购价历史
   */
  listProcurementSkuPriceHistory: (ingredientId: string, id: string): Promise<ProcurementSkuPriceHistory[]> =>
    api.get(`/admin/ingredients/${ingredientId}/procurement-skus/${id}/price-history`),

  /**
   * 回退生产采购 SKU 当前采购价到某条历史价格
   */
  rollbackProcurementSkuPrice: (ingredientId: string, id: string, historyId: string): Promise<ProcurementSku> =>
    api.post(`/admin/ingredients/${ingredientId}/procurement-skus/${id}/price-history/${historyId}/rollback`),

  /**
   * 删除生产采购 SKU
   */
  deleteProcurementSku: (ingredientId: string, id: string): Promise<void> =>
    api.delete(`/admin/ingredients/${ingredientId}/procurement-skus/${id}`)
}
