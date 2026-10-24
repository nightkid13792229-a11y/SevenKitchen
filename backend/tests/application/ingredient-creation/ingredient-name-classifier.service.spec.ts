import {
  IngredientNameClassifierService,
  normalizeClassificationMethod,
} from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
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

type ExistingRow = {
  recordId: string;
  state: string;
  method: string;
  cutLabel: string | null;
  cutGroup: string | null;
  evidence: string | null;
  confidence: number | null;
  model: string | null;
  classifiedAt: Date;
  correctedBy: string | null;
  correctedAt: Date | null;
};

function row(overrides: Partial<ExistingRow> & { recordId: string }): ExistingRow {
  return {
    state: 'RAW',
    method: 'NONE',
    cutLabel: '牛绞肉',
    cutGroup: 'ground',
    evidence: 'ground',
    confidence: 0.9,
    model: 'deepseek-test',
    classifiedAt: new Date('2026-10-24T00:00:00.000Z'),
    correctedBy: null,
    correctedAt: null,
    ...overrides,
  };
}

function createPrismaMock(existing: ExistingRow[] = []) {
  const findMany = jest.fn(async (_args: any) => existing);
  const upsert = jest.fn(async (_args: any) => ({}));
  return {
    nutritionRecordClassification: { findMany, upsert },
    findMany,
    upsert,
  };
}

function createConfigMock(
  implementation?: () => Promise<typeof RUNTIME>,
): { service: AgentProviderConfigService; getRuntime: jest.Mock } {
  const getRuntime = jest.fn(
    implementation ?? (async () => RUNTIME),
  );
  return {
    service: {
      getEnabledDeepSeekRuntimeConfig: getRuntime,
    } as unknown as AgentProviderConfigService,
    getRuntime,
  };
}

function mockFetchJson(content: unknown): jest.Mock {
  const fetchMock = jest.fn(async (_url: string, _init?: any) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  }));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function modelResults(
  entries: Array<Record<string, unknown>>,
): { results: Array<Record<string, unknown>> } {
  return { results: entries };
}

describe('IngredientNameClassifierService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('逐条判断生熟 / 加工方式 / 部位，evidence 必须能在词条名里找到', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    const fetchMock = mockFetchJson(
      modelResults([
        {
          id: 'r1',
          state: 'RAW',
          method: 'NONE',
          cutLabel: '牛绞肉 85/15',
          cutGroup: 'ground',
          evidence: 'ground',
          confidence: 0.93,
        },
        {
          id: 'r2',
          state: 'COOKED',
          method: 'STEAMED',
          cutLabel: '牛腩',
          cutGroup: 'brisket',
          evidence: '蒸し焼き',
          confidence: 0.8,
        },
      ]),
    );
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [
        { id: 'r1', name: 'Beef, ground, raw (85/15)' },
        { id: 'r2', name: '牛バラ肉 蒸し焼き' },
      ],
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        id: 'r1',
        state: 'RAW',
        method: 'NONE',
        cutLabel: '牛绞肉 85/15',
        cutGroup: 'ground',
        evidence: 'ground',
        confidence: 0.93,
      }),
      expect.objectContaining({
        id: 'r2',
        state: 'COOKED',
        method: 'STEAMED',
        cutLabel: '牛腩',
        cutGroup: 'brisket',
        evidence: '蒸し焼き',
        confidence: 0.8,
      }),
    ]);
    expect(result.counts.byState).toEqual({ RAW: 1, COOKED: 1, UNKNOWN: 0 });
    expect(result.counts.byMethod).toMatchObject({ STEAMED: 1, NONE: 1 });
    expect(result.counts.byCutGroup).toEqual({ ground: 1, brisket: 1 });

    // 每批请求都带目标词与词条 id / name，输出落库。
    const request = fetchMock.mock.calls[0]?.[1] as any;
    const payload = JSON.parse(request.body);
    const user = JSON.parse(payload.messages[1].content);
    expect(user.targetName).toBe('牛肉');
    expect(user.items).toEqual([
      { id: 'r1', name: 'Beef, ground, raw (85/15)' },
      { id: 'r2', name: '牛バラ肉 蒸し焼き' },
    ]);
    expect(prisma.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recordId: 'r1' },
        create: expect.objectContaining({
          recordId: 'r1',
          state: 'RAW',
          evidence: 'ground',
          model: 'deepseek-test',
        }),
      }),
    );
  });

  it('evidence 不在词条名里（大小写 / 全半角归一后也不在）→ UNKNOWN + invalidEvidence', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    mockFetchJson(
      modelResults([
        {
          id: 'r1',
          state: 'COOKED',
          method: 'FRIED',
          cutLabel: '鸡胸',
          cutGroup: 'breast',
          evidence: 'chicken',
          confidence: 0.95,
        },
      ]),
    );
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [{ id: 'r1', name: 'ＢＥＥＦ，ＧＲＯＵＮＤ，ＲＡＷ' }],
    });

    expect(result.results[0]).toMatchObject({
      id: 'r1',
      state: 'UNKNOWN',
      method: 'NONE',
      invalidEvidence: true,
    });
    expect(result.counts.byState.UNKNOWN).toBe(1);
  });

  it('evidence 命中时按 NFKC + 不分大小写判断', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    mockFetchJson(
      modelResults([
        {
          id: 'r1',
          state: 'RAW',
          method: 'NONE',
          cutLabel: '牛绞肉',
          cutGroup: 'ground',
          evidence: 'ＧＲＯＵＮＤ',
          confidence: 0.9,
        },
      ]),
    );
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [{ id: 'r1', name: 'Beef, ground, raw' }],
    });

    expect(result.results[0]).toMatchObject({
      id: 'r1',
      state: 'RAW',
      evidence: 'ＧＲＯＵＮＤ',
    });
    expect(result.results[0]?.invalidEvidence).toBeUndefined();
  });

  it('已有分类直接复用：命中缓存不重复调用模型', async () => {
    const prisma = createPrismaMock([
      row({ recordId: 'r1', state: 'COOKED', method: 'BOILED' }),
    ]);
    const config = createConfigMock();
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [{ id: 'r1', name: 'Beef, boiled' }],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(config.getRuntime).not.toHaveBeenCalled();
    expect(prisma.upsert).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      id: 'r1',
      state: 'COOKED',
      method: 'BOILED',
      evidence: 'ground',
    });
  });

  it('人工纠正过的分类永不被覆盖，也不送去模型重新判断', async () => {
    const prisma = createPrismaMock([
      row({
        recordId: 'r1',
        state: 'RAW',
        method: 'NONE',
        cutGroup: 'chuck',
        evidence: 'chuck',
        correctedBy: 'admin-1',
        correctedAt: new Date('2026-10-25T00:00:00.000Z'),
      }),
    ]);
    const config = createConfigMock();
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [{ id: 'r1', name: 'Beef, chuck, cooked' }],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.upsert).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      id: 'r1',
      state: 'RAW',
      cutGroup: 'chuck',
      correctedBy: 'admin-1',
    });
  });

  it('模型不可用：全部 UNKNOWN、不抛异常、不缓存失败结果', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock(async () => {
      throw new Error('DeepSeek Agent 设置未启用');
    });
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [
        { id: 'r1', name: 'Beef, ground, raw' },
        { id: 'r2', name: 'Beef, chuck, cooked' },
      ],
    });

    expect(result.results.map((entry) => entry.state)).toEqual([
      'UNKNOWN',
      'UNKNOWN',
    ]);
    expect(result.counts.byState).toEqual({ RAW: 0, COOKED: 0, UNKNOWN: 2 });
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it('模型调用失败：同样降级为全部 UNKNOWN，不阻塞调用方', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    (global as any).fetch = jest.fn(async () => {
      throw new Error('network down');
    });
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const result = await service.classifyNames({
      targetName: '牛肉',
      items: [{ id: 'r1', name: 'Beef, ground, raw' }],
    });

    expect(result.results[0]?.state).toBe('UNKNOWN');
    expect(prisma.upsert).not.toHaveBeenCalled();
  });

  it('每批最多 80 条：85 条分两次调用，结果顺序与输入一致', async () => {
    const prisma = createPrismaMock();
    const config = createConfigMock();
    const fetchMock = jest.fn(async (_url: string, init?: any) => {
      const payload = JSON.parse(init.body);
      const user = JSON.parse(payload.messages[1].content);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  results: user.items.map((item: { id: string; name: string }) => ({
                    id: item.id,
                    state: 'RAW',
                    method: 'NONE',
                    cutLabel: null,
                    cutGroup: null,
                    evidence: item.name.slice(0, 4),
                    confidence: 0.5,
                  })),
                }),
              },
            },
          ],
        }),
      };
    });
    (global as any).fetch = fetchMock;
    const service = new IngredientNameClassifierService(
      prisma as unknown as PrismaService,
      config.service,
    );

    const items = Array.from({ length: 85 }, (_, index) => ({
      id: `r${index}`,
      name: `Beef item ${index}`,
    }));
    const result = await service.classifyNames({ targetName: '牛肉', items });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const payload = JSON.parse((call[1] as any).body);
      const user = JSON.parse(payload.messages[1].content);
      expect(user.items.length).toBeLessThanOrEqual(80);
    }
    expect(result.results).toHaveLength(85);
    expect(result.results.map((entry) => entry.id)).toEqual(
      items.map((item) => item.id),
    );
    expect(prisma.upsert).toHaveBeenCalledTimes(85);
  });

  it('混合做法按否决项归一：蒸し焼き → 烤，不会被「蒸」抢先', () => {
    expect(normalizeClassificationMethod('蒸し焼き')).toBe('GRILLED');
    expect(normalizeClassificationMethod('boiled & fried')).toBe('FRIED');
    expect(normalizeClassificationMethod('水煮')).toBe('BOILED');
    expect(normalizeClassificationMethod('清蒸')).toBe('STEAMED');
  })

});
