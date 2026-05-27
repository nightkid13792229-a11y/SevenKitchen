import api from './index'

export type KnowledgeSourceListItem = {
  id: string
  code: string
  name: string
  versionLabel: string
  status: string
  authorityLevel: string
}

export const aiRecipeApi = {
  listKnowledgeSources: (): Promise<KnowledgeSourceListItem[]> =>
    api.get('/ai-recipe/knowledge-sources'),
  listRulePackages: (): Promise<any[]> =>
    api.get('/ai-recipe/rule-packages'),
  getAssessment: (id: string): Promise<any> =>
    api.get(`/ai-recipe/assessments/${id}`),
}
