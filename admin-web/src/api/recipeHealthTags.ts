/**
 * 食谱健康标签管理 API
 */
import api from './index'

export interface RecipeHealthTag {
  id: string
  name: string
  description: string | null
  parentId: string | null
  sort: number
  color: string | null
  children?: RecipeHealthTag[]
}

export interface CreateHealthTagDto {
  name: string
  description?: string | null
  parentId?: string | null
  sort?: number
  color?: string | null
}

export interface UpdateHealthTagDto {
  name?: string
  description?: string | null
  parentId?: string | null
  sort?: number
  color?: string | null
}

export const recipeHealthTagApi = {
  /**
   * 获取所有标签（扁平列表）
   */
  list: (): Promise<RecipeHealthTag[]> =>
    api.get('/admin/health-tags'),

  /**
   * 获取标签层级结构
   */
  getHierarchy: (): Promise<RecipeHealthTag[]> =>
    api.get('/admin/health-tags/hierarchy'),

  /**
   * 获取根标签
   */
  getRootTags: (): Promise<RecipeHealthTag[]> =>
    api.get('/admin/health-tags/root'),

  /**
   * 获取单个标签详情
   */
  getDetail: (id: string): Promise<RecipeHealthTag> =>
    api.get(`/admin/health-tags/${id}`),

  /**
   * 获取标签的子标签
   */
  getChildren: (id: string): Promise<RecipeHealthTag[]> =>
    api.get(`/admin/health-tags/${id}/children`),

  /**
   * 创建标签
   */
  create: (data: CreateHealthTagDto): Promise<RecipeHealthTag> =>
    api.post('/admin/health-tags', data),

  /**
   * 更新标签
   */
  update: (id: string, data: UpdateHealthTagDto): Promise<RecipeHealthTag> =>
    api.put(`/admin/health-tags/${id}`, data),

  /**
   * 删除标签
   */
  delete: (id: string): Promise<void> =>
    api.delete(`/admin/health-tags/${id}`),
}
