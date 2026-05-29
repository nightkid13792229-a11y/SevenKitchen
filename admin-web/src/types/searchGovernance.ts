export type SearchGovernanceDomain = 'INGREDIENT' | 'NUTRITION_FOOD' | 'BREED' | 'ORDER'
export type SearchAliasGroupStatus = 'ACTIVE' | 'DISABLED'
export type SearchAliasRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type SearchAliasSuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED'

export interface SearchAliasGroup {
  id: string
  domain: SearchGovernanceDomain
  canonicalTerm: string
  aliases: string[]
  status: SearchAliasGroupStatus
  riskLevel: SearchAliasRiskLevel
  notes?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  createdAt: string
  updatedAt: string
}

export interface SearchQueryInsight {
  id: string
  domain: SearchGovernanceDomain
  source: string
  rawQuery: string
  normalizedQuery: string
  resultCount: number
  selectedEntityType?: string | null
  selectedEntityId?: string | null
  selectedEntityName?: string | null
  userId?: string | null
  createdAt: string
}

export interface SearchGovernanceOverview {
  activeAliasGroupCount: number
  pendingSuggestionCount: number
  recentNoResultQueries: SearchQueryInsight[]
}

export interface SearchAliasSuggestion {
  id: string
  domain: SearchGovernanceDomain
  action: string
  status: SearchAliasSuggestionStatus
  payload: Record<string, unknown>
  evidence: Record<string, unknown>
  riskLevel: SearchAliasRiskLevel
  agentRationale?: string | null
  errorMessage?: string | null
  createdAt: string
}

export interface UpsertSearchAliasGroupPayload {
  domain: SearchGovernanceDomain
  canonicalTerm: string
  aliases: string[]
  riskLevel?: SearchAliasRiskLevel
  notes?: string | null
}
