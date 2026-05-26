import api from './index'

export type AgentProvider = 'OPENAI_COMPATIBLE'

export interface SupplementImportAgentConfig {
  id: string
  enabled: boolean
  provider: AgentProvider
  baseUrl: string | null
  apiKeyConfigured: boolean
  visionModel: string | null
  textModel: string | null
  temperature: number
  timeoutMs: number
  maxRetries: number
  promptVersion: string
  schemaVersion: string
  lastTestStatus: string | null
  lastTestMessage: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface UpdateSupplementImportAgentConfig {
  enabled?: boolean
  provider?: AgentProvider
  baseUrl?: string
  apiKey?: string | null
  visionModel?: string
  textModel?: string
  temperature?: number
  timeoutMs?: number
  maxRetries?: number
  promptVersion?: string
  schemaVersion?: string
}

export interface SupplementImportAgentConfigTestResult {
  ok: boolean
  message: string
}

const supplementImportPath = '/admin/agent-configs/supplement-import'

export const agentConfigApi = {
  getSupplementImport: (): Promise<SupplementImportAgentConfig> =>
    api.get(supplementImportPath),

  updateSupplementImport: (
    data: UpdateSupplementImportAgentConfig
  ): Promise<SupplementImportAgentConfig> =>
    api.put(supplementImportPath, data),

  testSupplementImport: (): Promise<SupplementImportAgentConfigTestResult> =>
    api.post(`${supplementImportPath}/test`)
}
