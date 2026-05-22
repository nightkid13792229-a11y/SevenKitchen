import api from './index'
import type {
  SearchAliasGroup,
  SearchAliasGroupStatus,
  SearchAliasSuggestion,
  SearchAliasSuggestionStatus,
  SearchGovernanceDomain,
  SearchGovernanceOverview,
  SearchQueryInsight,
  UpsertSearchAliasGroupPayload
} from '@/types/searchGovernance'

export const searchGovernanceApi = {
  getOverview: (): Promise<SearchGovernanceOverview> =>
    api.get('/admin/search-governance/overview'),

  listAliasGroups: (params?: {
    domain?: SearchGovernanceDomain
    status?: SearchAliasGroupStatus | string
  }): Promise<SearchAliasGroup[]> =>
    api.get('/admin/search-governance/alias-groups', { params }),

  createAliasGroup: (data: UpsertSearchAliasGroupPayload): Promise<SearchAliasGroup> =>
    api.post('/admin/search-governance/alias-groups', data),

  updateAliasGroup: (id: string, data: UpsertSearchAliasGroupPayload): Promise<SearchAliasGroup> =>
    api.put(`/admin/search-governance/alias-groups/${id}`, data),

  disableAliasGroup: (id: string): Promise<SearchAliasGroup> =>
    api.post(`/admin/search-governance/alias-groups/${id}/disable`),

  getQueryInsights: (params?: { domain?: SearchGovernanceDomain; days?: number }): Promise<SearchQueryInsight[]> =>
    api.get('/admin/search-governance/query-insights', { params }),

  listSuggestions: (params?: {
    domain?: SearchGovernanceDomain
    status?: SearchAliasSuggestionStatus | string
  }): Promise<SearchAliasSuggestion[]> =>
    api.get('/admin/search-governance/suggestions', { params }),

  generateSuggestions: (data: { domain?: SearchGovernanceDomain; days?: number }): Promise<SearchAliasSuggestion[]> =>
    api.post('/admin/search-governance/suggestions/generate', data, { timeout: 180000 }),

  approveSuggestion: (id: string): Promise<SearchAliasSuggestion> =>
    api.post(`/admin/search-governance/suggestions/${id}/approve`),

  rejectSuggestion: (id: string): Promise<SearchAliasSuggestion> =>
    api.post(`/admin/search-governance/suggestions/${id}/reject`)
}

export default searchGovernanceApi
