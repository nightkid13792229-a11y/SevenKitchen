export type SupplementImportAgentProvider = 'OPENAI_COMPATIBLE';

export interface SupplementImportAgentConfigView {
  id: string;
  enabled: boolean;
  provider: SupplementImportAgentProvider;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  visionModel: string | null;
  textModel: string | null;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  promptVersion: string;
  schemaVersion: string;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSupplementImportAgentConfigInput {
  enabled?: boolean;
  provider?: SupplementImportAgentProvider;
  baseUrl?: string | null;
  apiKey?: string | null;
  visionModel?: string | null;
  textModel?: string | null;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  promptVersion?: string;
  schemaVersion?: string;
}
