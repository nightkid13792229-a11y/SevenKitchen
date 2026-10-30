import { BadRequestException } from '@nestjs/common';
import {
  AgentProviderConfigService,
  RECIPE_COVER_IMAGE_PURPOSE,
  ZHIPU_PROVIDER,
} from 'src/application/nutrition-governance/agent-provider-config.service';

/**
 * 智谱封面图配置（2026-10-27）
 *
 * 只读写 recipe_cover_image / ZHIPU 这一行：
 *  · 没配过 → 返回默认值（关、glm-image、https://open.bigmodel.cn）；
 *  · 保存 → 只 upsert 这一行，Key 加密、只回末四位；
 *  · 启用前必须有 Key；
 *  · 连接测试只 ping 文本模型（不生成图片、不花钱）。
 */
describe('AgentProviderConfigService · 智谱封面图', () => {
  const originalEnv = { ...process.env };
  const prisma = {
    agentProviderConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
  let service: AgentProviderConfigService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'development',
      JWT_SECRET: 'test-jwt-secret',
      AGENT_CONFIG_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
    service = new AgentProviderConfigService(prisma);
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('没配过：返回智谱默认值，且查的是这一行', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue(null);

    const view = await service.getZhipuImageSettings();

    expect(prisma.agentProviderConfig.findUnique).toHaveBeenCalledWith({
      where: {
        purpose_provider: {
          purpose: RECIPE_COVER_IMAGE_PURPOSE,
          provider: ZHIPU_PROVIDER,
        },
      },
    });
    expect(view).toEqual({
      purpose: 'RECIPE_COVER_IMAGE',
      provider: 'ZHIPU',
      enabled: false,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKeyConfigured: false,
      apiKeyLast4: null,
      requestTimeoutMs: 90000,
      updatedAt: null,
    });
  });

  it('已配置：返回末四位，不返回明文 Key', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue({
      purpose: RECIPE_COVER_IMAGE_PURPOSE,
      provider: ZHIPU_PROVIDER,
      enabled: true,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKeyEncrypted: 'v1:iv:tag:cipher',
      apiKeyLast4: '5678',
      requestTimeoutMs: 90000,
      updatedAt: new Date('2026-10-27T00:00:00.000Z'),
    });

    const view = await service.getZhipuImageSettings();

    expect(view).toEqual(
      expect.objectContaining({
        enabled: true,
        apiKeyConfigured: true,
        apiKeyLast4: '5678',
        updatedAt: '2026-10-27T00:00:00.000Z',
      }),
    );
    expect(JSON.stringify(view)).not.toContain('v1:iv:tag:cipher');
  });

  it('保存：只 upsert 智谱这一行，Key 加密且只存末四位', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue(null);
    prisma.agentProviderConfig.upsert.mockImplementation(
      async ({ create }: any) => ({
        ...create,
        id: 'config-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const view = await service.updateZhipuImageSettings(
      { enabled: true, apiKey: 'zhipu-secret-5678' },
      'admin-1',
    );

    expect(prisma.agentProviderConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          purpose_provider: {
            purpose: RECIPE_COVER_IMAGE_PURPOSE,
            provider: ZHIPU_PROVIDER,
          },
        },
        create: expect.objectContaining({
          purpose: RECIPE_COVER_IMAGE_PURPOSE,
          provider: ZHIPU_PROVIDER,
          enabled: true,
          model: 'glm-image',
          baseUrl: 'https://open.bigmodel.cn',
          apiKeyLast4: '5678',
          updatedBy: 'admin-1',
        }),
        update: expect.objectContaining({
          enabled: true,
          apiKeyLast4: '5678',
          updatedBy: 'admin-1',
        }),
      }),
    );
    expect(JSON.stringify(view)).not.toContain('zhipu-secret-5678');
    expect(view.apiKeyLast4).toBe('5678');
  });

  it('不填新 Key：保留现有 Key', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue({
      purpose: RECIPE_COVER_IMAGE_PURPOSE,
      provider: ZHIPU_PROVIDER,
      enabled: true,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKeyEncrypted: 'v1:existing',
      apiKeyLast4: '5678',
      requestTimeoutMs: 90000,
    });
    prisma.agentProviderConfig.upsert.mockImplementation(
      async ({ create, update }: any) => ({
        ...create,
        ...update,
        updatedAt: new Date(),
      }),
    );

    await service.updateZhipuImageSettings({ model: 'glm-image' });

    const [args] = prisma.agentProviderConfig.upsert.mock.calls[0];
    expect(args.update.apiKeyEncrypted).toBeUndefined();
    expect(args.update.apiKeyLast4).toBeUndefined();
  });

  it('清除 Key：把加密字段和末四位一起清空', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue({
      purpose: RECIPE_COVER_IMAGE_PURPOSE,
      provider: ZHIPU_PROVIDER,
      enabled: false,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKeyEncrypted: 'v1:existing',
      apiKeyLast4: '5678',
      requestTimeoutMs: 90000,
    });
    prisma.agentProviderConfig.upsert.mockImplementation(
      async ({ create, update }: any) => ({
        ...create,
        ...update,
        updatedAt: new Date(),
      }),
    );

    await service.updateZhipuImageSettings({ clearApiKey: true });

    const [args] = prisma.agentProviderConfig.upsert.mock.calls[0];
    expect(args.update.apiKeyEncrypted).toBeNull();
    expect(args.update.apiKeyLast4).toBeNull();
  });

  it('没有 Key 时不允许启用', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue(null);

    await expect(
      service.updateZhipuImageSettings({ enabled: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.agentProviderConfig.upsert).not.toHaveBeenCalled();
  });

  it('连接测试：没有 Key 直接拒绝', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue(null);

    await expect(service.testZhipuImageSettings()).rejects.toThrow(
      '请先保存智谱 API Key',
    );
  });

  it('连接测试：只 ping 文本模型，不调生图接口', async () => {
    let saved: any;
    prisma.agentProviderConfig.findUnique.mockResolvedValue(null);
    prisma.agentProviderConfig.upsert.mockImplementation(
      async ({ create }: any) => {
        saved = { ...create, id: 'config-1', updatedAt: new Date() };
        return saved;
      },
    );
    await service.updateZhipuImageSettings({
      enabled: true,
      apiKey: 'zhipu-secret-5678',
    });

    prisma.agentProviderConfig.findUnique.mockResolvedValue(saved);
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ choices: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.testZhipuImageSettings();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('glm-4-flash');
    expect(body.messages[0].content).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('zhipu-secret-5678');
  });

  it('连接测试：智谱报错时把原因带出来', async () => {
    prisma.agentProviderConfig.findUnique.mockResolvedValue({
      purpose: RECIPE_COVER_IMAGE_PURPOSE,
      provider: ZHIPU_PROVIDER,
      enabled: true,
      baseUrl: 'https://open.bigmodel.cn',
      model: 'glm-image',
      apiKeyEncrypted: 'v1:invalid',
      apiKeyLast4: '5678',
      requestTimeoutMs: 90000,
    });
    jest
      .spyOn(service as any, 'decryptApiKey')
      .mockReturnValue('zhipu-secret-5678');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: async () =>
        JSON.stringify({ error: { message: '身份验证失败。' } }),
    }) as unknown as typeof fetch;

    await expect(service.testZhipuImageSettings()).rejects.toThrow(
      '智谱连接失败：身份验证失败。',
    );
  });
});
