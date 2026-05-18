import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';

export const NUTRITION_AGENT_PURPOSE = 'NUTRITION_CANDIDATE_REVIEW';
export const DEEPSEEK_PROVIDER = 'DEEPSEEK';

const DEFAULT_DEEPSEEK_SETTINGS = {
  purpose: NUTRITION_AGENT_PURPOSE,
  provider: DEEPSEEK_PROVIDER,
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  reviewModel: 'deepseek-v4-pro',
  maxConcurrency: 1,
  requestTimeoutMs: 90000,
  retryCount: 2,
} as const;

export interface AgentProviderSettingsView {
  provider: typeof DEEPSEEK_PROVIDER;
  enabled: boolean;
  baseUrl: string;
  model: string;
  reviewModel: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  maxConcurrency: number;
  requestTimeoutMs: number;
  retryCount: number;
}

export interface UpdateAgentProviderSettingsInput {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  reviewModel?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  maxConcurrency?: number;
  requestTimeoutMs?: number;
  retryCount?: number;
}

export interface DeepSeekRuntimeConfig {
  provider: 'deepseek';
  baseUrl: string;
  model: string;
  reviewModel: string;
  apiKey: string;
  maxConcurrency: number;
  requestTimeoutMs: number;
  retryCount: number;
}

@Injectable()
export class AgentProviderConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AgentProviderSettingsView> {
    const config = await this.findDeepSeekConfig();
    return this.toSettingsView(config);
  }

  async updateSettings(
    input: UpdateAgentProviderSettingsInput,
    userId?: string,
  ): Promise<AgentProviderSettingsView> {
    const current = await this.findDeepSeekConfig();
    const baseUrl = normalizeBaseUrl(
      input.baseUrl ?? current?.baseUrl ?? DEFAULT_DEEPSEEK_SETTINGS.baseUrl,
    );
    const model = normalizeRequiredText(
      input.model ?? current?.model ?? DEFAULT_DEEPSEEK_SETTINGS.model,
      '模型不能为空',
    );
    const reviewModel = normalizeRequiredText(
      input.reviewModel ??
        current?.reviewModel ??
        DEFAULT_DEEPSEEK_SETTINGS.reviewModel,
      '复核模型不能为空',
    );
    const enabled =
      input.enabled ?? current?.enabled ?? DEFAULT_DEEPSEEK_SETTINGS.enabled;
    const maxConcurrency = clampInteger(
      input.maxConcurrency ?? current?.maxConcurrency ?? 1,
      1,
      5,
    );
    const requestTimeoutMs = clampInteger(
      input.requestTimeoutMs ?? current?.requestTimeoutMs ?? 90000,
      5000,
      300000,
    );
    const retryCount = clampInteger(
      input.retryCount ?? current?.retryCount ?? 2,
      0,
      5,
    );

    validateBaseUrl(baseUrl);

    const keyUpdate = this.resolveApiKeyUpdate(input, current);
    const hasConfiguredKey = Boolean(
      keyUpdate.apiKeyEncrypted ?? current?.apiKeyEncrypted,
    );

    if (enabled && !hasConfiguredKey) {
      throw new BadRequestException('启用 DeepSeek 前请先配置 API Key');
    }

    const updateData: Record<string, unknown> = {
      enabled,
      baseUrl,
      model,
      reviewModel,
      maxConcurrency,
      requestTimeoutMs,
      retryCount,
      updatedBy: userId ?? null,
      ...keyUpdate,
    };

    const saved = await this.prisma.agentProviderConfig.upsert({
      where: {
        purpose_provider: {
          purpose: NUTRITION_AGENT_PURPOSE,
          provider: DEEPSEEK_PROVIDER,
        },
      },
      create: {
        ...DEFAULT_DEEPSEEK_SETTINGS,
        enabled,
        baseUrl,
        model,
        reviewModel,
        maxConcurrency,
        requestTimeoutMs,
        retryCount,
        updatedBy: userId ?? null,
        apiKeyEncrypted: keyUpdate.apiKeyEncrypted ?? null,
        apiKeyLast4: keyUpdate.apiKeyLast4 ?? null,
      },
      update: updateData,
    });

    return this.toSettingsView(saved);
  }

  async getEnabledDeepSeekRuntimeConfig(input: {
    purpose?: 'DEFAULT' | 'REVIEW';
  } = {}): Promise<DeepSeekRuntimeConfig> {
    const config = await this.findDeepSeekConfig();

    if (!config?.enabled) {
      throw new BadRequestException('DeepSeek Agent 设置未启用');
    }

    if (!config.apiKeyEncrypted) {
      throw new BadRequestException('DeepSeek API Key 未配置');
    }

    return {
      provider: 'deepseek',
      baseUrl: config.baseUrl,
      model:
        input.purpose === 'REVIEW'
          ? config.reviewModel || config.model
          : config.model,
      reviewModel: config.reviewModel || config.model,
      apiKey: this.decryptApiKey(config.apiKeyEncrypted),
      maxConcurrency: config.maxConcurrency,
      requestTimeoutMs: config.requestTimeoutMs,
      retryCount: config.retryCount,
    };
  }

  async assertCanRun(): Promise<void> {
    await this.getEnabledDeepSeekRuntimeConfig();
  }

  private async findDeepSeekConfig() {
    return this.prisma.agentProviderConfig.findUnique({
      where: {
        purpose_provider: {
          purpose: NUTRITION_AGENT_PURPOSE,
          provider: DEEPSEEK_PROVIDER,
        },
      },
    });
  }

  private toSettingsView(config: any | null): AgentProviderSettingsView {
    return {
      provider: DEEPSEEK_PROVIDER,
      enabled: config?.enabled ?? DEFAULT_DEEPSEEK_SETTINGS.enabled,
      baseUrl: config?.baseUrl ?? DEFAULT_DEEPSEEK_SETTINGS.baseUrl,
      model: config?.model ?? DEFAULT_DEEPSEEK_SETTINGS.model,
      reviewModel:
        config?.reviewModel ??
        config?.model ??
        DEFAULT_DEEPSEEK_SETTINGS.reviewModel,
      apiKeyConfigured: Boolean(config?.apiKeyEncrypted),
      apiKeyLast4: config?.apiKeyLast4 ?? null,
      maxConcurrency:
        config?.maxConcurrency ?? DEFAULT_DEEPSEEK_SETTINGS.maxConcurrency,
      requestTimeoutMs:
        config?.requestTimeoutMs ??
        DEFAULT_DEEPSEEK_SETTINGS.requestTimeoutMs,
      retryCount: config?.retryCount ?? DEFAULT_DEEPSEEK_SETTINGS.retryCount,
    };
  }

  private resolveApiKeyUpdate(
    input: UpdateAgentProviderSettingsInput,
    current: any | null,
  ) {
    if (input.clearApiKey) {
      return { apiKeyEncrypted: null, apiKeyLast4: null };
    }

    const apiKey = input.apiKey?.trim();
    if (!apiKey) {
      return {};
    }

    return {
      apiKeyEncrypted: this.encryptApiKey(apiKey),
      apiKeyLast4: apiKey.slice(-4),
    };
  }

  private encryptApiKey(apiKey: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(apiKey, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private decryptApiKey(value: string): string {
    const [version, ivText, tagText, encryptedText] = value.split(':');
    if (version !== 'v1' || !ivText || !tagText || !encryptedText) {
      throw new BadRequestException('DeepSeek API Key 加密格式无效');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = normalizeRequiredText(value, 'DeepSeek Base URL 不能为空');
  return trimmed.replace(/\/+$/, '');
}

function normalizeRequiredText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(message);
  }
  return trimmed;
}

function validateBaseUrl(baseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new BadRequestException('DeepSeek Base URL 格式无效');
  }

  const isLocal =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new BadRequestException('生产环境 DeepSeek Base URL 必须使用 HTTPS');
  }

  if (!isLocal && !['https:', 'http:'].includes(parsed.protocol)) {
    throw new BadRequestException('DeepSeek Base URL 协议无效');
  }
}

function clampInteger(value: number, min: number, max: number): number {
  const integer = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, integer));
}

function getEncryptionKey(): Buffer {
  const configured = process.env.AGENT_CONFIG_ENCRYPTION_KEY?.trim();

  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new BadRequestException('生产环境必须配置 AGENT_CONFIG_ENCRYPTION_KEY');
  }

  const material =
    configured || process.env.JWT_SECRET || 'sevenkitchen-dev-agent-config-key';
  return createHash('sha256').update(material).digest();
}
