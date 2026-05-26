import { AgentConfigService } from '../../../src/application/agent/agent-config.service';
import { AgentSecretService } from '../../../src/application/agent/agent-secret.service';

describe('AgentConfigService', () => {
  const prisma = {
    agentConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_CONFIG_ENCRYPTION_KEY = 'test-secret';
  });

  it('masks api key on read', async () => {
    const secret = new AgentSecretService();
    prisma.agentConfig.findUnique.mockResolvedValue({
      id: 'cfg-1',
      agentType: 'SUPPLEMENT_IMPORT',
      enabled: true,
      provider: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEncrypted: secret.encrypt('sk-live-value'),
      visionModel: 'gpt-4.1-mini',
      textModel: 'gpt-4.1-mini',
      temperature: 0.1,
      timeoutMs: 30000,
      maxRetries: 1,
      promptVersion: 'supplement-import-v1',
      schemaVersion: 'supplement-import-schema-v1',
      lastTestStatus: null,
      lastTestMessage: null,
      updatedBy: 'admin-1',
      createdAt: new Date('2026-05-27T00:00:00.000Z'),
      updatedAt: new Date('2026-05-27T00:00:00.000Z'),
    });

    const service = new AgentConfigService(prisma as any, secret);
    const result = await service.getSupplementImportConfig();

    expect(result.apiKeyConfigured).toBe(true);
    expect((result as any).apiKeyEncrypted).toBeUndefined();
    expect((result as any).apiKey).toBeUndefined();
  });

  it('keeps existing encrypted key when update omits apiKey', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue({
      id: 'cfg-1',
      apiKeyEncrypted: 'encrypted-existing',
    });
    prisma.agentConfig.upsert.mockResolvedValue({
      id: 'cfg-1',
      agentType: 'SUPPLEMENT_IMPORT',
      enabled: false,
      provider: 'OPENAI_COMPATIBLE',
      baseUrl: 'https://api.example.com/v1',
      apiKeyEncrypted: 'encrypted-existing',
      visionModel: 'vision-model',
      textModel: 'text-model',
      temperature: 0.1,
      timeoutMs: 30000,
      maxRetries: 1,
      promptVersion: 'supplement-import-v1',
      schemaVersion: 'supplement-import-schema-v1',
      lastTestStatus: null,
      lastTestMessage: null,
      updatedBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new AgentConfigService(
      prisma as any,
      new AgentSecretService(),
    );
    await service.updateSupplementImportConfig(
      { baseUrl: 'https://api.example.com/v1' },
      'admin-1',
    );

    expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          apiKeyEncrypted: 'encrypted-existing',
        }),
      }),
    );
  });
});
