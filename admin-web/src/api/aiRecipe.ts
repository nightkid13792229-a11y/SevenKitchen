import api from './index'

export type KnowledgeSourceListItem = {
  id: string
  code: string
  name: string
  versionLabel: string
  status: string
  authorityLevel: string
}

export type RulePackageVersionItem = {
  id: string
  version: number
  isActive: boolean
}

export type RulePackageListItem = {
  id: string
  code: string
  name: string
  status: string
  currentVersion?: number | null
  versions?: RulePackageVersionItem[]
}

export type AssessmentDetail = {
  id: string
  status?: string
}

export const aiRecipeApi = {
  listKnowledgeSources: (): Promise<KnowledgeSourceListItem[]> =>
    api.get('/ai-recipe/knowledge-sources'),
  listRulePackages: async (): Promise<RulePackageListItem[]> => {
    const packages = await api.get<RulePackageListItem[]>('/ai-recipe/rule-packages')
    return packages.map(item => ({
      ...item,
      currentVersion: item.currentVersion ?? item.versions?.[0]?.version ?? null
    }))
  },
  getAssessment: (id: string): Promise<AssessmentDetail> =>
    api.get(`/ai-recipe/assessments/${id}`),
}
