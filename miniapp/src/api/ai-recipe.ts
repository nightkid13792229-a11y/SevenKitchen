import { request } from '../utils/api'

export const aiRecipeApi = {
  createAssessment: (data: {
    dogId: string
    prompt?: string
    confirmedInputs?: Record<string, any>
  }) => request({ url: '/ai-recipe/assessments', method: 'POST', data }),
  listKnowledgeSources: () =>
    request({ url: '/ai-recipe/knowledge-sources', method: 'GET' }),
  listRulePackages: () =>
    request({ url: '/ai-recipe/rule-packages', method: 'GET' }),
}
