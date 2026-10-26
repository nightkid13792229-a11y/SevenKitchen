/**
 * 食谱需求分类 API（2026-10-26 第一阶段）
 *
 * 路径与后端 `admin-recipe-taxonomy.controller.ts` 一一对应，
 * 改动这里必须同步改后端路由契约测试。
 */
import api from './index'
import type {
  TaxonomyKindView,
  TaxonomySeriesItem
} from '@/types/recipeDesigner'

export interface TaxonomyScopeParams {
  designMode?: 'CATALOG' | 'ORDER'
  businessStatus?: string
}

export interface ListTaxonomySeriesParams extends TaxonomyScopeParams {
  nodeId?: string
  unclassified?: boolean
  keyword?: string
  page?: number
  pageSize?: number
}

export interface TaxonomyTreeResult {
  kinds: TaxonomyKindView[]
}

export interface TaxonomySeriesResult {
  items: TaxonomySeriesItem[]
  total: number
}

export interface CreateTaxonomyNodePayload {
  kindId: string
  parentId?: string | null
  name: string
  definition: string
  sort?: number
}

export interface UpdateTaxonomyNodePayload {
  name?: string
  definition?: string
  sort?: number
  status?: 'ACTIVE' | 'DISABLED'
}

export const recipeTaxonomyApi = {
  getTree: (scope: TaxonomyScopeParams = {}): Promise<TaxonomyTreeResult> =>
    api.get('/admin/recipe-taxonomy/tree', { params: scope }),

  listSeries: (params: ListTaxonomySeriesParams = {}): Promise<TaxonomySeriesResult> =>
    api.get('/admin/recipe-taxonomy/series', {
      params: {
        ...params,
        unclassified: params.unclassified ? 'true' : undefined
      }
    }),

  replaceLinks: (seriesId: string, nodeIds: string[]): Promise<{ ok: boolean }> =>
    api.put(`/admin/recipe-taxonomy/series/${seriesId}/links`, { nodeIds }),

  batchLinks: (seriesIds: string[], nodeIds: string[]): Promise<{ updated: number }> =>
    api.post('/admin/recipe-taxonomy/series/batch-links', { seriesIds, nodeIds }),

  createNode: (payload: CreateTaxonomyNodePayload): Promise<TaxonomyKindView> =>
    api.post('/admin/recipe-taxonomy/nodes', payload),

  updateNode: (nodeId: string, payload: UpdateTaxonomyNodePayload): Promise<unknown> =>
    api.patch(`/admin/recipe-taxonomy/nodes/${nodeId}`, payload),

  deleteNode: (nodeId: string): Promise<{ ok: boolean }> =>
    api.delete(`/admin/recipe-taxonomy/nodes/${nodeId}`)
}
