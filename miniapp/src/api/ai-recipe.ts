import { request } from '../utils/api'

export type CreateAssessmentPayload = {
  dogId: string
  prompt?: string
  confirmedInputs?: Record<string, unknown>
}

export type CreateAssessmentResult = {
  dogId: string
  createdBy: string
  status: string
}

export type AiRecipeKnowledgeSource = {
  id: string
  code: string
  name: string
  versionLabel: string
  status: string
  authorityLevel: string
}

export type AiRecipeRulePackage = {
  id: string
  code: string
  name: string
  status: string
  currentVersion?: number | null
  versions?: Array<{
    id: string
    version: number
    isActive: boolean
  }>
}

export const aiRecipeApi = {
  createAssessment: (data: CreateAssessmentPayload) =>
    request<CreateAssessmentResult>({ url: '/ai-recipe/assessments', method: 'POST', data }),
  listKnowledgeSources: () =>
    request<AiRecipeKnowledgeSource[]>({ url: '/ai-recipe/knowledge-sources', method: 'GET' }),
  listRulePackages: () =>
    request<AiRecipeRulePackage[]>({ url: '/ai-recipe/rule-packages', method: 'GET' }),
}
