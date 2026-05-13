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

  it('clears an API key when clearApiKey is true', async () => {
    mockPrisma.agentProviderConfig.findUnique.mockResolvedValue({
      id: 'config-1',
      purpose: 'NUTRITION_CANDIDATE_REVIEW',
      provider: 'DEEPSEEK',
      enabled: false,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
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
