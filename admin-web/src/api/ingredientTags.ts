/**
 * 原料标签管理 API
 */
import api from './index'

export interface IngredientTag {
  id: string
  name: string
  description: string | null
  parentId: string | null
  sort: number
  color: string | null
}

export interface CreateTagDto {
  name: string
  description?: string | null
  parentId?: string | null
  sort?: number
  color?: string | null
}

export interface UpdateTagDto {
  name?: string
  description?: string | null
  parentId?: string | null
  sort?: number
  color?: string | null
}

export const ingredientTagApi = {
  /**
   * 获取所有标签（扁平列表）
   */
  list: (): Promise<IngredientTag[]> =>
    api.get('/admin/ingredient-tags'),

  /**
   * 获取标签层级结构
   */
  getHierarchy: (): Promise<IngredientTag[]> =>
    api.get('/admin/ingredient-tags/hierarchy'),

  /**
   * 获取根标签
   */
  getRootTags: (): Promise<IngredientTag[]> =>
    api.get('/admin/ingredient-tags/root'),

  /**
   * 获取单个标签详情
   */
  getDetail: (id: string): Promise<IngredientTag> =>
    api.get(`/admin/ingredient-tags/${id}`),

  /**
   * 获取标签的子标签
   */
  getChildren: (id: string): Promise<IngredientTag[]> =>
    api.get(`/admin/ingredient-tags/${id}/children`),

  /**
   * 创建标签
   */
  create: (data: CreateTagDto): Promise<IngredientTag> =>
    api.post('/admin/ingredient-tags', data),

  /**
   * 更新标签
   */
  update: (id: string, data: UpdateTagDto): Promise<IngredientTag> =>
    api.put(`/admin/ingredient-tags/${id}`, data),

  /**
   * 删除标签
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/ingredient-tags/${id}`),

  /**
   * 获取原料的标签
   */
  getIngredientTags: (ingredientId: string): Promise<IngredientTag[]> =>
    api.get(`/admin/ingredients/${ingredientId}/tags`)
}
