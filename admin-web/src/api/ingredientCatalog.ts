/**
 * 《饲料添加剂品种目录》查询。
 *
 * 只用于「标签名称」这一格：查规范写法、看适用范围含不含犬。
 * 不做选品排序——选品看形态/人用/性价比，目录不参与。
 */
import api from './index'

const BASE = '/admin/ingredient-catalog'

export interface FeedAdditiveMatch {
  name: string
  category: string
  scope: string
  dogAllowed: boolean
  exact: boolean
}

export interface FeedAdditiveCatalogResponse {
  summary: {
    total: number
    dogAllowed: number
    generatedAt: string
    source: string
    sourceUrl: string
  }
  matches: FeedAdditiveMatch[]
}

export const ingredientCatalogApi = {
  lookupFeedAdditives: (q: string): Promise<FeedAdditiveCatalogResponse> =>
    api.get(`${BASE}/feed-additives`, { params: { q } })
}
