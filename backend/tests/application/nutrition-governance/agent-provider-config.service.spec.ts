import { BadRequestException } from '@nestjs/common';
import { AgentProviderConfigService } from 'src/application/nutrition-governance/agent-provider-config.service';

describe('AgentProviderConfigService', () => {
  const originalEnv = { ...process.env };
  const mockPrisma = {
    agentProviderConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;

  let service: AgentProviderConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      JWT_SECRET: 'test-jwt-secret',
      AGENT_CONFIG_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    service = new AgentProviderConfigService(mockPrisma);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('masks saved API keys and never returns the plaintext key', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(null);
    mockPrisma.agentProviderConfig.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: 'config-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const settings = await service.updateSettings(
      {
        enabled: true,
        apiKey: 'sk-deepseek-secret-1234',
      },
      'admin-1',
    );

    expect(settings).toEqual(
      expect.objectContaining({
        provider: 'DEEPSEEK',
        enabled: true,
        apiKeyConfigured: true,
        apiKeyLast4: '1234',
      }),
    );
    expect(JSON.stringify(settings)).not.toContain('sk-deepseek-secret-1234');
    expect(mockPrisma.agentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          apiKeyLast4: '1234',
          updatedBy: 'admin-1',
        }),
      }),
    );
    const saved = mockPrisma.agentProviderConfig.upsert.mock.calls[0][0].create;
    expect(saved.apiKeyEncrypted).toEqual(expect.any(String));
    expect(saved.apiKeyEncrypted).not.toContain('sk-deepseek-secret-1234');
  });

  it('preserves an existing encrypted API key when apiKey is omitted', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      purpose: 'NUTRITION_CANDIDATE_REVIEW',
      provider: 'DEEPSEEK',
      enabled: false,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      reviewModel: 'deepseek-v4-pro',
      apiKeyEncrypted: 'encrypted-existing',
      apiKeyLast4: '9999',
      maxConcurrency: 1,
      requestTimeoutMs: 90000,
      retryCount: 2,
    });
    mockPrisma.agentProviderConfig.upsert.mockImplementation(async ({ update }) => ({
      id: 'config-1',
      purpose: 'NUTRITION_CANDIDATE_REVIEW',
      provider: 'DEEPSEEK',
      enabled: update.enabled,
      baseUrl: update.baseUrl,
      model: update.model,
      reviewModel: update.reviewModel,
      apiKeyEncrypted: 'encrypted-existing',
      apiKeyLast4: '9999',
      maxConcurrency: update.maxConcurrency,
      requestTimeoutMs: update.requestTimeoutMs,
      retryCount: update.retryCount,
    }));

    await service.updateSettings({ enabled: true, model: 'deepseek-v4-pro' }, 'admin-1');

    const update = mockPrisma.agentProviderConfig.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('apiKeyEncrypted');
    expect(update).not.toHaveProperty('apiKeyLast4');
  });

  it('saves a separate review model for higher-risk Agent tasks', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(null);
    mockPrisma.agentProviderConfig.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: 'config-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const settings = await service.updateSettings(
      {
        enabled: true,
        apiKey: 'sk-deepseek-secret-1234',
        model: 'deepseek-v4-flash',
        reviewModel: 'deepseek-v4-pro',
      },
      'admin-1',
    );

    expect(settings.model).toBe('deepseek-v4-flash');
    expect(settings.reviewModel).toBe('deepseek-v4-pro');
    expect(mockPrisma.agentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          model: 'deepseek-v4-flash',
          reviewModel: 'deepseek-v4-pro',
        }),
      }),
    );
  });

  it('returns runtime config with the review model when requested', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(null);
    mockPrisma.agentProviderConfig.upsert.mockImplementation(async ({ create }) => ({
      ...create,
      id: 'config-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await service.updateSettings(
      {
        enabled: true,
        apiKey: 'sk-deepseek-secret-1234',
        model: 'deepseek-v4-flash',
        reviewModel: 'deepseek-v4-pro',
      },
      'admin-1',
    );
    const saved = mockPrisma.agentProviderConfig.upsert.mock.calls[0][0].create;
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(saved);

    const runtime = await service.getEnabledDeepSeekRuntimeConfig({
      purpose: 'REVIEW',
    });

    expect(runtime.model).toBe('deepseek-v4-pro');
  });

  it('clears an API key when clearApiKey is true', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      purpose: 'NUTRITION_CANDIDATE_REVIEW',
      provider: 'DEEPSEEK',
      enabled: false,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      reviewModel: 'deepseek-v4-pro',
      apiKeyEncrypted: 'encrypted-existing',
      apiKeyLast4: '9999',
      maxConcurrency: 1,
      requestTimeoutMs: 90000,
      retryCount: 2,
    });
    mockPrisma.agentProviderConfig.upsert.mockImplementation(async ({ update }) => ({
      id: 'config-1',
      purpose: 'NUTRITION_CANDIDATE_REVIEW',
      provider: 'DEEPSEEK',
      enabled: update.enabled,
      baseUrl: update.baseUrl,
      model: update.model,
      reviewModel: update.reviewModel,
      apiKeyEncrypted: update.apiKeyEncrypted,
      apiKeyLast4: update.apiKeyLast4,
      maxConcurrency: update.maxConcurrency,
      requestTimeoutMs: update.requestTimeoutMs,
      retryCount: update.retryCount,
    }));

    const settings = await service.updateSettings(
      { clearApiKey: true, enabled: false },
      'admin-1',
    );

    expect(settings.apiKeyConfigured).toBe(false);
    expect(mockPrisma.agentProviderConfig.upsert.mock.calls[0][0].update).toEqual(
      expect.objectContaining({
        apiKeyEncrypted: null,
        apiKeyLast4: null,
      }),
    );
  });

  it('rejects enabled settings without a configured API key', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(null);

    await expect(
      service.updateSettings({ enabled: true }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-HTTPS DeepSeek base URLs outside local development', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue(null);

    await expect(
      service.updateSettings(
        {
          enabled: false,
          baseUrl: 'http://api.deepseek.com',
          apiKey: 'sk-test-1234',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * 「只在该用途确实单独配过时才返回模型」（2026-10-01）。
 *
 * 为什么需要它：健康报告识别必须用**能读图**的模型，
 * 而 getEnabledDeepSeekRuntimeConfig 会回退到全局默认（纯文本模型）——
 * 一旦被顶掉，识别会直接失败。所以视觉模型只认"单独配过的那一行"。
 */
describe('AgentProviderConfigService · 单独配过的用途模型', () => {
  const makeService = (row: unknown) => {
    const prisma = {
      agentProviderConfig: { findUnique: jest.fn().mockResolvedValue(row) },
    };
    const service = new AgentProviderConfigService(prisma as any);
    return { service, prisma };
  };

  it('没单独配过 → 返回 null（由调用方用自己的默认）', async () => {
    const { service } = makeService(null);
    await expect(
      service.getConfiguredPurposeModel('HEALTH_REPORT_EXTRACTION'),
    ).resolves.toBeNull();
  });

  it('单独配过且启用 → 返回它填的模型', async () => {
    const { service } = makeService({
      purpose: 'HEALTH_REPORT_EXTRACTION',
      provider: 'DEEPSEEK',
      enabled: true,
      model: 'deepseek-v4-flash-vision-exp',
    });
    await expect(
      service.getConfiguredPurposeModel('HEALTH_REPORT_EXTRACTION'),
    ).resolves.toBe('deepseek-v4-flash-vision-exp');
  });

  it('配过但没启用 → 也算没配（不能让停用的配置生效）', async () => {
    const { service } = makeService({
      purpose: 'HEALTH_REPORT_EXTRACTION',
      provider: 'DEEPSEEK',
      enabled: false,
      model: 'deepseek-v4-flash-vision-exp',
    });
    await expect(
      service.getConfiguredPurposeModel('HEALTH_REPORT_EXTRACTION'),
    ).resolves.toBeNull();
  });

  it('全局默认这个用途不走这条路（它本来就是兜底）', async () => {
    const { service, prisma } = makeService({ enabled: true, model: 'x' });
    await expect(service.getConfiguredPurposeModel('DEFAULT')).resolves.toBeNull();
    expect(prisma.agentProviderConfig.findUnique).not.toHaveBeenCalled();
  });
});
