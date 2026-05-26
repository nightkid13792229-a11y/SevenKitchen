import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { AgentSecretService } from './agent-secret.service';
import {
  SupplementImportAgentConfigView,
  UpdateSupplementImportAgentConfigInput,
} from './agent-config.types';

const AGENT_TYPE = 'SUPPLEMENT_IMPORT';
const DEFAULT_PROVIDER = 'OPENAI_COMPATIBLE';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_PROMPT_VERSION = 'supplement-import-v1';
const DEFAULT_SCHEMA_VERSION = 'supplement-import-schema-v1';

type AgentConfigRecord = {
  id: string;
  agentType?: string;
  enabled: boolean;
  provider: 'OPENAI_COMPATIBLE';
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
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
  createdAt: Date;
  updatedAt: Date;
};

type UsableSupplementImportConfig = {
  baseUrl: string;
  apiKey: string;
  visionModel: string;
  textModel: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  promptVersion: string;
  schemaVersion: string;
  snapshot: Record<string, unknown>;
};

@Injectable()
export class AgentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretService: AgentSecretService,
  ) {}

  async getSupplementImportConfig(): Promise<SupplementImportAgentConfigView> {
    const record = await this.findSupplementImportConfig();
    return this.toView(record);
  }

  async updateSupplementImportConfig(
    input: UpdateSupplementImportAgentConfigInput,
    userId: string,
  ): Promise<SupplementImportAgentConfigView> {
    this.validateInput(input);

    const existing = await this.findSupplementImportConfig();
    const apiKeyEncrypted = this.resolveApiKey(
      input,
      existing?.apiKeyEncrypted ?? null,
    );
    const baseData = {
      enabled: input.enabled ?? existing?.enabled ?? false,
      provider: input.provider ?? existing?.provider ?? DEFAULT_PROVIDER,
      baseUrl:
        input.baseUrl !== undefined
          ? input.baseUrl
          : (existing?.baseUrl ?? null),
      apiKeyEncrypted,
      visionModel:
        input.visionModel !== undefined
          ? input.visionModel
          : (existing?.visionModel ?? DEFAULT_MODEL),
      textModel:
        input.textModel !== undefined
          ? input.textModel
          : (existing?.textModel ?? DEFAULT_MODEL),
      temperature:
        input.temperature ?? existing?.temperature ?? DEFAULT_TEMPERATURE,
      timeoutMs: input.timeoutMs ?? existing?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries:
        input.maxRetries ?? existing?.maxRetries ?? DEFAULT_MAX_RETRIES,
      promptVersion:
        input.promptVersion ??
        existing?.promptVersion ??
        DEFAULT_PROMPT_VERSION,
      schemaVersion:
        input.schemaVersion ??
        existing?.schemaVersion ??
        DEFAULT_SCHEMA_VERSION,
      updatedBy: userId,
    };

    const saved = await this.prisma.agentConfig.upsert({
      where: { agentType: AGENT_TYPE },
      create: {
        agentType: AGENT_TYPE,
        ...baseData,
      },
      update: baseData,
    });

    return this.toView(saved as AgentConfigRecord);
  }

  async getEnabledSupplementImportConfigForUse(): Promise<UsableSupplementImportConfig> {
    const record = await this.findSupplementImportConfig();

    if (!record?.enabled) {
      throw new ServiceUnavailableException(
        'Supplement import agent is disabled',
      );
    }

    const missing: string[] = [];
    if (!record.baseUrl) missing.push('baseUrl');
    if (!record.apiKeyEncrypted) missing.push('apiKey');
    if (!record.visionModel) missing.push('visionModel');
    if (!record.textModel) missing.push('textModel');

    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Supplement import agent config is missing: ${missing.join(', ')}`,
      );
    }

    const baseUrl = record.baseUrl;
    const apiKeyEncrypted = record.apiKeyEncrypted;
    const visionModel = record.visionModel;
    const textModel = record.textModel;

    if (!baseUrl || !apiKeyEncrypted || !visionModel || !textModel) {
      throw new ServiceUnavailableException(
        'Supplement import agent config is incomplete',
      );
    }

    const apiKey = this.secretService.decrypt(apiKeyEncrypted);
    const snapshot = this.toView(record) as unknown as Record<string, unknown>;

    return {
      baseUrl,
      apiKey,
      visionModel,
      textModel,
      temperature: record.temperature,
      timeoutMs: record.timeoutMs,
      maxRetries: record.maxRetries,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      snapshot,
    };
  }

  async testSupplementImportConfig(
    userId: string,
  ): Promise<{ ok: boolean; message: string }> {
    try {
      const config = await this.getEnabledSupplementImportConfigForUse();
      const response = await this.fetchModels(config);

      if (!response.ok) {
        const message = `Model endpoint returned ${response.status}`;
        await this.recordTestResult('failed', message, userId);
        return { ok: false, message };
      }

      await this.recordTestResult(
        'success',
        'Model endpoint is reachable',
        userId,
      );
      return { ok: true, message: 'Model endpoint is reachable' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Agent config test failed';
      await this.recordTestResult('failed', message, userId);
      return { ok: false, message };
    }
  }

  private async findSupplementImportConfig(): Promise<AgentConfigRecord | null> {
    const record = await this.prisma.agentConfig.findUnique({
      where: { agentType: AGENT_TYPE },
    });
    return record as AgentConfigRecord | null;
  }

  private toView(
    record: AgentConfigRecord | null,
  ): SupplementImportAgentConfigView {
    const now = new Date().toISOString();

    if (!record) {
      return {
        id: '',
        enabled: false,
        provider: DEFAULT_PROVIDER,
        baseUrl: null,
        apiKeyConfigured: false,
        visionModel: DEFAULT_MODEL,
        textModel: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        promptVersion: DEFAULT_PROMPT_VERSION,
        schemaVersion: DEFAULT_SCHEMA_VERSION,
        lastTestStatus: null,
        lastTestMessage: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      id: record.id,
      enabled: record.enabled,
      provider: record.provider,
      baseUrl: record.baseUrl,
      apiKeyConfigured: Boolean(record.apiKeyEncrypted),
      visionModel: record.visionModel,
      textModel: record.textModel,
      temperature: record.temperature,
      timeoutMs: record.timeoutMs,
      maxRetries: record.maxRetries,
      promptVersion: record.promptVersion,
      schemaVersion: record.schemaVersion,
      lastTestStatus: record.lastTestStatus,
      lastTestMessage: record.lastTestMessage,
      updatedBy: record.updatedBy,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private resolveApiKey(
    input: UpdateSupplementImportAgentConfigInput,
    existingEncrypted: string | null,
  ): string | null {
    if (input.apiKey === undefined) {
      return existingEncrypted;
    }

    if (input.apiKey === null || input.apiKey.trim() === '') {
      return null;
    }

    return this.secretService.encrypt(input.apiKey);
  }

  private validateInput(input: UpdateSupplementImportAgentConfigInput): void {
    if (input.provider && input.provider !== DEFAULT_PROVIDER) {
      throw new BadRequestException('Unsupported agent provider');
    }
    if (
      input.temperature !== undefined &&
      (input.temperature < 0 || input.temperature > 2)
    ) {
      throw new BadRequestException('temperature must be between 0 and 2');
    }
    if (input.timeoutMs !== undefined && input.timeoutMs < 1000) {
      throw new BadRequestException('timeoutMs must be at least 1000');
    }
    if (input.maxRetries !== undefined && input.maxRetries < 0) {
      throw new BadRequestException('maxRetries must be at least 0');
    }
  }

  private async fetchModels(
    config: UsableSupplementImportConfig,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(config.timeoutMs, 10000),
    );

    try {
      const url = new URL('models', this.ensureTrailingSlash(config.baseUrl));
      return await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith('/') ? value : `${value}/`;
  }

  private async recordTestResult(
    status: 'success' | 'failed',
    message: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.agentConfig.upsert({
      where: { agentType: AGENT_TYPE },
      create: {
        agentType: AGENT_TYPE,
        enabled: false,
        provider: DEFAULT_PROVIDER,
        baseUrl: null,
        apiKeyEncrypted: null,
        visionModel: DEFAULT_MODEL,
        textModel: DEFAULT_MODEL,
        temperature: DEFAULT_TEMPERATURE,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxRetries: DEFAULT_MAX_RETRIES,
        promptVersion: DEFAULT_PROMPT_VERSION,
        schemaVersion: DEFAULT_SCHEMA_VERSION,
        lastTestStatus: status,
        lastTestMessage: message,
        updatedBy: userId,
      },
      update: {
        lastTestStatus: status,
        lastTestMessage: message,
        updatedBy: userId,
      },
    });
  }
}
