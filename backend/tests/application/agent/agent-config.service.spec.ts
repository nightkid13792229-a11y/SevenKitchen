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

  const configRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'cfg-1',
    agentType: 'SUPPLEMENT_IMPORT',
    enabled: true,
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: 'https://api.example.com/v1',
    apiKeyEncrypted: 'encrypted-existing',
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
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_CONFIG_ENCRYPTION_KEY = 'test-secret';
    process.env.JWT_SECRET = 'jwt-test-secret';
    process.env.NODE_ENV = 'test';
    prisma.agentConfig.findUnique.mockReset();
    prisma.agentConfig.upsert.mockReset();
    prisma.agentConfig.update.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fails encryption outside dev/test when no secret is configured', () => {
    delete process.env.AGENT_CONFIG_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'production';

    expect(() => new AgentSecretService().encrypt('sk-live-value')).toThrow(
      'AGENT_CONFIG_ENCRYPTION_KEY or JWT_SECRET is required to encrypt agent config secrets',
    );
  });

  it('allows deterministic fallback encryption in test', () => {
    delete process.env.AGENT_CONFIG_ENCRYPTION_KEY;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = 'test';

    const secret = new AgentSecretService();
    const encrypted = secret.encrypt('sk-test-value');

    expect(secret.decrypt(encrypted)).toBe('sk-test-value');
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

  it('clears existing encrypted key when update sets apiKey to null', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ apiKeyEncrypted: 'encrypted-existing' }),
    );
    prisma.agentConfig.upsert.mockResolvedValue(
      configRecord({ apiKeyEncrypted: null }),
    );

    const service = new AgentConfigService(
      prisma as any,
      new AgentSecretService(),
    );
    await service.updateSupplementImportConfig({ apiKey: null }, 'admin-1');

    expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ apiKeyEncrypted: null }),
      }),
    );
  });

  it('encrypts replacement api key on update', async () => {
    const secret = new AgentSecretService();
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ apiKeyEncrypted: secret.encrypt('sk-old-value') }),
    );
    prisma.agentConfig.upsert.mockImplementation(async (args) =>
      configRecord({ apiKeyEncrypted: args.update.apiKeyEncrypted }),
    );

    const service = new AgentConfigService(prisma as any, secret);
    await service.updateSupplementImportConfig(
      { apiKey: 'sk-new-value' },
      'admin-1',
    );

    const upsertArg = prisma.agentConfig.upsert.mock.calls[0][0];
    expect(upsertArg.update.apiKeyEncrypted).not.toBe('sk-old-value');
    expect(secret.decrypt(upsertArg.update.apiKeyEncrypted)).toBe(
      'sk-new-value',
    );
  });

  it('rejects usable config when disabled', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ enabled: false }),
    );

    const service = new AgentConfigService(
      prisma as any,
      new AgentSecretService(),
    );

    await expect(
      service.getEnabledSupplementImportConfigForUse(),
    ).rejects.toThrow('Supplement import agent is disabled');
  });

  it('rejects usable config when required fields are missing', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({
        baseUrl: null,
        apiKeyEncrypted: null,
        visionModel: null,
      }),
    );

    const service = new AgentConfigService(
      prisma as any,
      new AgentSecretService(),
    );

    await expect(
      service.getEnabledSupplementImportConfigForUse(),
    ).rejects.toThrow(
      'Supplement import agent config is missing: baseUrl, apiKey, visionModel',
    );
  });

  it('wraps decrypt failures with a clear service error', async () => {
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ apiKeyEncrypted: 'not-decryptable' }),
    );
    const secret = {
      decrypt: jest.fn(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      }),
    };

    const service = new AgentConfigService(prisma as any, secret as any);

    await expect(
      service.getEnabledSupplementImportConfigForUse(),
    ).rejects.toThrow('补剂识别 Agent 密钥无法解密，请重新保存 API Key');
  });

  it('records success when models endpoint is reachable', async () => {
    const secret = new AgentSecretService();
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ apiKeyEncrypted: secret.encrypt('sk-live-value') }),
    );
    prisma.agentConfig.upsert.mockResolvedValue(configRecord());
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    const service = new AgentConfigService(prisma as any, secret);
    const result = await service.testSupplementImportConfig('admin-1');

    expect(result).toEqual({
      ok: true,
      message: 'Model endpoint is reachable',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('models', 'https://api.example.com/v1/'),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer sk-live-value' },
      }),
    );
    expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastTestStatus: 'success',
          lastTestMessage: 'Model endpoint is reachable',
          updatedBy: 'admin-1',
        }),
      }),
    );
  });

  it('records failure when models endpoint is not reachable', async () => {
    const secret = new AgentSecretService();
    prisma.agentConfig.findUnique.mockResolvedValue(
      configRecord({ apiKeyEncrypted: secret.encrypt('sk-live-value') }),
    );
    prisma.agentConfig.upsert.mockResolvedValue(configRecord());
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 401 } as Response);

    const service = new AgentConfigService(prisma as any, secret);
    const result = await service.testSupplementImportConfig('admin-1');

    expect(result).toEqual({
      ok: false,
      message: 'Model endpoint returned 401',
    });
    expect(prisma.agentConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          lastTestStatus: 'failed',
          lastTestMessage: 'Model endpoint returned 401',
          updatedBy: 'admin-1',
        }),
      }),
    );
  });
});
