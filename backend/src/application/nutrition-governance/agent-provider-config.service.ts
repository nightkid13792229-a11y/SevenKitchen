import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { PrismaService } from '../../infrastructure/prisma.service';

export const NUTRITION_AGENT_PURPOSE = 'NUTRITION_CANDIDATE_REVIEW';
/** 全局默认用途：所有未单独指定用途的 AI/Agent 都回退到这里 */
export const DEFAULT_AGENT_PURPOSE = 'DEFAULT';
export const DEEPSEEK_PROVIDER = 'DEEPSEEK';
/** 食谱封面图生成（智谱 glm-image）：独立于 DeepSeek 文本配置 */
export const RECIPE_COVER_IMAGE_PURPOSE = 'RECIPE_COVER_IMAGE';
export const ZHIPU_PROVIDER = 'ZHIPU';

/** 智谱封面图的默认值：只用于「还没配过」时的展示与创建 */
const DEFAULT_ZHIPU_IMAGE_SETTINGS = {
  enabled: false,
  baseUrl: 'https://open.bigmodel.cn',
  model: 'glm-image',
  requestTimeoutMs: 90000,
} as const;

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
  purpose: string;
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

/** 智谱封面图的配置视图：只回末四位，永不回明文 Key */
export interface ZhipuImageSettingsView {
  purpose: string;
  provider: typeof ZHIPU_PROVIDER;
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  requestTimeoutMs: number;
  updatedAt: string | null;
}

export interface UpdateZhipuImageSettingsInput {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  requestTimeoutMs?: number;
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

  /**
   * 智谱封面图配置（2026-10-27）。
   *
   * 为什么单独一组方法：现有 agent-settings 是 DeepSeek 文本模型的配置，
   * provider 写死 DEEPSEEK；生图用途必须读写 provider=ZHIPU 的**另一行**，
   * 两者不能混。Key 沿用同一套加密存储，只回末四位。
   */
  async getZhipuImageSettings(): Promise<ZhipuImageSettingsView> {
    const config = await this.findZhipuImageConfig();
    return this.toZhipuImageSettingsView(config);
  }

  async updateZhipuImageSettings(
    input: UpdateZhipuImageSettingsInput,
    userId?: string,
  ): Promise<ZhipuImageSettingsView> {
    const current = await this.findZhipuImageConfig();
    const baseUrl = this.normalizeZhipuBaseUrl(
      input.baseUrl ?? current?.baseUrl ?? DEFAULT_ZHIPU_IMAGE_SETTINGS.baseUrl,
    );
    const model = String(
      input.model ?? current?.model ?? DEFAULT_ZHIPU_IMAGE_SETTINGS.model,
    ).trim();
    if (!model) {
      throw new BadRequestException('智谱模型不能为空');
    }
    const enabled = input.enabled ?? current?.enabled ?? false;
    const requestTimeoutMs = clampInteger(
      input.requestTimeoutMs ??
        current?.requestTimeoutMs ??
        DEFAULT_ZHIPU_IMAGE_SETTINGS.requestTimeoutMs,
      5000,
      300000,
    );

    const keyUpdate = this.resolveApiKeyUpdate(input);
    const nextApiKey =
      keyUpdate.apiKeyEncrypted !== undefined
        ? keyUpdate.apiKeyEncrypted
        : current?.apiKeyEncrypted ?? null;
    if (enabled && !nextApiKey) {
      throw new BadRequestException('请先填写智谱 API Key 再启用');
    }

    const data = {
      enabled,
      baseUrl,
      model,
      requestTimeoutMs,
      updatedBy: userId ?? null,
    };
    const saved = await this.prisma.agentProviderConfig.upsert({
      where: {
        purpose_provider: {
          purpose: RECIPE_COVER_IMAGE_PURPOSE,
          provider: ZHIPU_PROVIDER,
        },
      },
      create: {
        purpose: RECIPE_COVER_IMAGE_PURPOSE,
        provider: ZHIPU_PROVIDER,
        ...data,
        ...keyUpdate,
      },
      update: { ...data, ...keyUpdate },
    });

    return this.toZhipuImageSettingsView(saved);
  }

  /**
   * 连接测试只 ping 一个便宜的文本模型：
   * 验证 Key / Base URL 通不通，**不生成图片、不花 0.1 元**。
   * 真正出图请到系列里点「AI 生成图片」。
   */
  async testZhipuImageSettings(): Promise<{
    ok: boolean;
    provider: typeof ZHIPU_PROVIDER;
    model: string;
    message: string;
  }> {
    const config = await this.findZhipuImageConfig();
    if (!config?.apiKeyEncrypted) {
      throw new BadRequestException('请先保存智谱 API Key 再测试');
    }

    const apiKey = this.decryptApiKey(config.apiKeyEncrypted);
    const baseUrl = this.normalizeZhipuBaseUrl(
      config.baseUrl || DEFAULT_ZHIPU_IMAGE_SETTINGS.baseUrl,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${baseUrl}/api/paas/v4/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-4-flash',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new BadRequestException(
          `智谱连接失败：${extractZhipuError(raw, response.status)}`,
        );
      }

      return {
        ok: true,
        provider: ZHIPU_PROVIDER,
        model: config.model,
        message: '智谱 Key 有效（连接测试不生成图片，不花钱）',
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      if (error?.name === 'AbortError') {
        throw new BadRequestException(
          '智谱连接超时（15 秒），请检查 Base URL 或网络',
        );
      }
      throw new BadRequestException(
        `智谱连接失败：${error?.message || '未知错误'}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private findZhipuImageConfig() {
    return this.prisma.agentProviderConfig.findUnique({
      where: {
        purpose_provider: {
          purpose: RECIPE_COVER_IMAGE_PURPOSE,
          provider: ZHIPU_PROVIDER,
        },
      },
    });
  }

  private toZhipuImageSettingsView(config: any | null): ZhipuImageSettingsView {
    return {
      purpose: RECIPE_COVER_IMAGE_PURPOSE,
      provider: ZHIPU_PROVIDER,
      enabled: config?.enabled ?? DEFAULT_ZHIPU_IMAGE_SETTINGS.enabled,
      baseUrl: config?.baseUrl ?? DEFAULT_ZHIPU_IMAGE_SETTINGS.baseUrl,
      model: config?.model ?? DEFAULT_ZHIPU_IMAGE_SETTINGS.model,
      apiKeyConfigured: Boolean(config?.apiKeyEncrypted),
      apiKeyLast4: config?.apiKeyLast4 ?? null,
      requestTimeoutMs:
        config?.requestTimeoutMs ??
        DEFAULT_ZHIPU_IMAGE_SETTINGS.requestTimeoutMs,
      updatedAt: config?.updatedAt
        ? new Date(config.updatedAt).toISOString()
        : null,
    };
  }

  private normalizeZhipuBaseUrl(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('智谱 Base URL 不能为空');
    }
    try {
      new URL(trimmed);
    } catch {
      throw new BadRequestException('智谱 Base URL 格式无效');
    }
    return trimmed.replace(/\/+$/, '');
  }

  async getSettings(purpose?: string): Promise<AgentProviderSettingsView> {
    const config = await this.findDeepSeekConfig(purpose);
    return this.toSettingsView(config);
  }

  async updateSettings(
    input: UpdateAgentProviderSettingsInput,
    userId?: string,
    purpose: string = DEFAULT_AGENT_PURPOSE,
  ): Promise<AgentProviderSettingsView> {
    const current = await this.findDeepSeekConfig(purpose);
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

    const keyUpdate = this.resolveApiKeyUpdate(input);
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
          purpose,
          provider: DEEPSEEK_PROVIDER,
        },
      },
      create: {
        purpose,
        provider: DEEPSEEK_PROVIDER,
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
    purpose?: string;
    /** 指定用途未配置时是否回退到全局默认（默认 true） */
    fallbackToDefault?: boolean;
  } = {}): Promise<DeepSeekRuntimeConfig> {
    const purpose = input.purpose || DEFAULT_AGENT_PURPOSE;
    const config = await this.findDeepSeekConfig(
      purpose,
      input.fallbackToDefault ?? true,
    );

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

  /**
   * 通用 provider 运行时配置（2026-10-18）。
   *
   * ## 为什么要有它
   *
   * 原有的 `getEnabledDeepSeekRuntimeConfig` **写死** `provider: 'DEEPSEEK'`，
   * 而且取不到时会**回退到全局默认**（一个纯文本模型）。
   * 生图用途（`RECIPE_COVER_IMAGE` / provider = ZHIPU）用不了它：
   * 回退到 DeepSeek 的文本模型，请求必然失败，而且报错信息会骗人。
   *
   * ## 与 DeepSeek 版的区别
   *
   * **不回退**。指定的 `purpose` 没配就是没配，直接报清楚 —— 
   * 让管理员去后台把它配上，而不是偷偷用一个不相干的模型顶上。
   */
  async getEnabledProviderRuntimeConfig(input: {
    purpose: string;
    provider: string;
  }): Promise<{
    provider: string;
    baseUrl: string;
    model: string;
    apiKey: string;
    maxConcurrency: number;
    requestTimeoutMs: number;
    retryCount: number;
  }> {
    const config = await this.prisma.agentProviderConfig.findUnique({
      where: {
        purpose_provider: {
          purpose: input.purpose,
          provider: input.provider,
        },
      },
    });

    if (!config) {
      throw new BadRequestException(
        `${input.provider} 的「${input.purpose}」用法还没配置，请到后台 AI 设置里添加`,
      );
    }
    if (!config.enabled) {
      throw new BadRequestException(
        `${input.provider} 的「${input.purpose}」用法未启用`,
      );
    }
    if (!config.apiKeyEncrypted) {
      throw new BadRequestException(
        `${input.provider} 的 API Key 未配置`,
      );
    }

    return {
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: this.decryptApiKey(config.apiKeyEncrypted),
      maxConcurrency: config.maxConcurrency,
      requestTimeoutMs: config.requestTimeoutMs,
      retryCount: config.retryCount,
    };
  }

  /**
   * 只在该用途**确实单独配过**（有自己的行、且已启用）时返回它的模型。
   *
   * 为什么不直接用 getEnabledDeepSeekRuntimeConfig：那个会回退到全局默认，
   * 而全局默认是**纯文本模型**。健康报告识别这一项必须是能读图的模型，
   * 一旦被全局默认顶掉，识别会直接失败。所以这里"没单独配 = 用代码里的默认"。
   */
  async getConfiguredPurposeModel(purpose: string): Promise<string | null> {
    if (!purpose || purpose === DEFAULT_AGENT_PURPOSE) {
      return null;
    }

    const row = await this.prisma.agentProviderConfig.findUnique({
      where: {
        purpose_provider: { purpose, provider: DEEPSEEK_PROVIDER },
      },
    });

    if (!row?.enabled) {
      return null;
    }

    return String(row.model || '').trim() || null;
  }

  async assertCanRun(): Promise<void> {
    await this.getEnabledDeepSeekRuntimeConfig();
  }

  /**
   * 查询某用途的 DeepSeek 配置；该用途未配置时回退到全局默认(DEFAULT)。
   * 传入用途时优先查该用途，无则回退 DEFAULT；都无则返回 null。
   */
  private async findDeepSeekConfig(
    purpose?: string,
    fallbackToDefault = true,
  ) {
    if (purpose && purpose !== DEFAULT_AGENT_PURPOSE) {
      const specific = await this.prisma.agentProviderConfig.findUnique({
        where: {
          purpose_provider: {
            purpose,
            provider: DEEPSEEK_PROVIDER,
          },
        },
      });
      if (specific) return specific;
      if (!fallbackToDefault) return null;
    }
    return this.prisma.agentProviderConfig.findUnique({
      where: {
        purpose_provider: {
          purpose: DEFAULT_AGENT_PURPOSE,
          provider: DEEPSEEK_PROVIDER,
        },
      },
    });
  }

  private toSettingsView(config: any | null): AgentProviderSettingsView {
    return {
      purpose: config?.purpose ?? DEFAULT_AGENT_PURPOSE,
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

  private resolveApiKeyUpdate(input: {
    apiKey?: string;
    clearApiKey?: boolean;
  }) {
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
      throw new BadRequestException('API Key 加密格式无效');
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

function extractZhipuError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  } catch {
    // 不是 JSON：退回原文片段
  }
  const text = String(raw ?? '').trim().slice(0, 200);
  return text || `HTTP ${status}`;
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
