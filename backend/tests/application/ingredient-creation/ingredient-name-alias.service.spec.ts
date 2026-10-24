import { BadRequestException } from '@nestjs/common';
import { IngredientNameAliasService } from '../../../src/application/ingredient-creation/ingredient-name-alias.service';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const RUNTIME = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-test',
  reviewModel: 'deepseek-test',
  apiKey: 'test-key',
  maxConcurrency: 1,
  requestTimeoutMs: 30000,
  retryCount: 0,
};

function createPrismaMock() {
  const findMany = jest.fn(async (_args: any) => []);
  const updateMany = jest.fn(async (_args: any) => ({ count: 0 }));
  const upsert = jest.fn(async (_args: any) => ({}));

  return {
    ingredientNameAlias: { findMany, updateMany, upsert },
    findMany,
    updateMany,
    upsert,
  };
}

function createConfigMock(implementation?: () => Promise<typeof RUNTIME>): {
  service: AgentProviderConfigService;
  getRuntime: jest.Mock;
} {
  const getRuntime = jest.fn(
    implementation ??
      (async () => {
        throw new BadRequestException('DeepSeek Agent 设置未启用');
      }),
  );
  return {
    service: {
      getEnabledDeepSeekRuntimeConfig: getRuntime,
    } as unknown as AgentProviderConfigService,
    getRuntime,
  };
}

function mockFetchJson(content: string): jest.Mock {
  const fetchMock = jest.fn(async (_url: string, _init?: any) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  }));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe('IngredientNameAliasService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('按中文词批量查词典，去重并跳过空词', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    const service = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      config.service,
    );

    await service.findAliases([' 西洋菜 ', '西洋菜', '', '山药']);

    expect(prisma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { zhTerm: { in: ['西洋菜', '山药'] } },
      }),
    );
  });

  it('词典命中时批量累加 hitCount 并刷新 lastHitAt', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    const service = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      config.service,
    );

    await service.markAliasesHit(['alias-a', 'alias-a', 'alias-b']);

    expect(prisma.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['alias-a', 'alias-b'] } },
      data: {
        hitCount: { increment: 1 },
        lastHitAt: expect.any(Date),
      },
    });
  });

  it('模型翻译：解析 2-4 个外文候选词', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock(async () => RUNTIME);
    const fetchMock = mockFetchJson(
      JSON.stringify({
        translations: [
          { term: 'Chinese yam', language: 'en' },
          { term: 'yam', language: 'en' },
          { term: '山药', language: 'zh' },
          { term: 'Chinese yam', language: 'en' },
        ],
      }),
    );
    const service = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.translateToForeignTerms('山药');

    expect(result).toEqual({
      model: 'deepseek-test',
      translations: [
        { term: 'Chinese yam', language: 'en' },
        { term: 'yam', language: 'en' },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('模型未配置或调用失败时返回 null，不抛 500', async () => {
    const prisma = createPrismaMock();
    const unavailable = createConfigMock();
    const unavailableService = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      unavailable.service,
    );

    await expect(
      unavailableService.translateToForeignTerms('山药'),
    ).resolves.toBeNull();

    const config = createConfigMock(async () => RUNTIME);
    (global as any).fetch = jest.fn(async () => {
      throw new Error('network down');
    });
    const failingService = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      config.service,
    );

    await expect(
      failingService.translateToForeignTerms('山药'),
    ).resolves.toBeNull();
  });

  it('只把命中的翻译写进词典：source=AI_TRANSLATION、hitCount=1、记录首个来源', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    const service = new IngredientNameAliasService(
      prisma as unknown as PrismaService,
      config.service,
    );

    await service.recordAiTranslation({
      zhTerm: '西洋菜',
      translations: [
        {
          term: 'watercress',
          language: 'en',
          sourceRecordId: 'usda-watercress',
        },
      ],
    });

    expect(prisma.upsert).toHaveBeenCalledWith({
      where: {
        zhTerm_foreignTerm_language: {
          zhTerm: '西洋菜',
          foreignTerm: 'watercress',
          language: 'en',
        },
      },
      create: expect.objectContaining({
        zhTerm: '西洋菜',
        foreignTerm: 'watercress',
        language: 'en',
        source: 'AI_TRANSLATION',
        hitCount: 1,
        lastHitAt: expect.any(Date),
        sourceRecordId: 'usda-watercress',
      }),
      update: {
        hitCount: { increment: 1 },
        lastHitAt: expect.any(Date),
      },
    });
  });
});
