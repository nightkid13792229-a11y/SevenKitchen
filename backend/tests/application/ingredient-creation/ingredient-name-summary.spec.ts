import {
  IngredientNameClassifierService,
  type ClassifyNameItem,
} from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
import {
  NAME_SUMMARY_MAX_TOKENS,
  buildKeywordNameSummary,
  parseNameSummary,
} from '../../../src/application/ingredient-creation/ingredient-name-summary';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const RUNTIME = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-test',
  reviewModel: 'deepseek-test',
  apiKey: 'test-key',
  maxConcurrency: 1,
  requestTimeoutMs: 60000,
  retryCount: 0,
};

function createService() {
  const prisma = {
    nutritionRecordClassification: {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
    },
  };
  const config = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(async () => RUNTIME),
  };
  const service = new IngredientNameClassifierService(
    prisma as unknown as PrismaService,
    config as unknown as AgentProviderConfigService,
  );
  return { service, prisma, config };
}

function mockFetchJson(content: unknown): jest.Mock {
  const fetchMock = jest.fn(async () => ({
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

function mockFetchRaw(content: string): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  }));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function items(count: number): ClassifyNameItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `rec-${index}`,
    name:
      index < 420
        ? `Beef, ground, raw ${index + 1}`
        : index < 1400
          ? `Beef, chuck, boiled ${index + 1}`
          : `Beef, variety meats, ${index + 1}`,
  }));
}

const FULL_SUMMARY = {
  total: 1651,
  byState: { RAW: 420, COOKED: 980, UNKNOWN: 251 },
  byMethod: {
    BOILED: 300,
    STEAMED: 180,
    GRILLED: 260,
    FRIED: 120,
    OTHER: 120,
    NONE: 420,
  },
  byCutGroup: { ground: 210, chuck: 40, brisket: 30 },
  examples: {
    ground: ['Beef, ground, 85% lean', 'Beef, ground, raw'],
    chuck: ['Beef, chuck, boiled'],
    brisket: ['Beef, brisket, raw'],
  },
  irrelevantExamples: [
    'Beef, variety meats and by-products, liver',
    'Beef, tongue, raw',
  ],
};

describe('Ingredient name summary · 解析', () => {
  it('数字 / 例子 / 无关项按模型汇总原样解析，不逐条返回判断', () => {
    const summary = parseNameSummary(FULL_SUMMARY, 1651);

    expect(summary).not.toBeNull();
    expect(summary?.total).toBe(1651);
    expect(summary?.byState).toEqual({ RAW: 420, COOKED: 980, UNKNOWN: 251 });
    expect(summary?.byMethod).toEqual(FULL_SUMMARY.byMethod);
    expect(summary?.byCutGroup).toEqual({
      ground: 210,
      chuck: 40,
      brisket: 30,
    });
    expect(summary?.examples.ground).toEqual([
      'Beef, ground, 85% lean',
      'Beef, ground, raw',
    ]);
    expect(summary?.examples.chuck).toEqual(['Beef, chuck, boiled']);
    expect(summary?.irrelevantExamples).toEqual(
      FULL_SUMMARY.irrelevantExamples,
    );
    // 汇总只带统计与代表名，没有逐条 results。
    expect(summary).not.toHaveProperty('results');
  });

  it('非法 payload（缺统计 / 全是字符串）返回 null，由调用方降级', () => {
    expect(parseNameSummary({}, 10)).toBeNull();
    expect(
      parseNameSummary(
        {
          total: 10,
          byState: { RAW: '很多', COOKED: null },
          byMethod: {},
          byCutGroup: {},
        },
        10,
      ),
    ).toBeNull();
    expect(parseNameSummary(null, 10)).toBeNull();
  });

  it('输出超长（组数 / 例子数超出上限）按非法处理，不崩', () => {
    const hugeGroups = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`group-${index}`, 1]),
    );
    const hugeExamples = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [
        `group-${index}`,
        Array.from(
          { length: 20 },
          (_, nameIndex) => `Name ${index}-${nameIndex}`,
        ),
      ]),
    );

    expect(
      parseNameSummary(
        {
          ...FULL_SUMMARY,
          byCutGroup: hugeGroups,
          examples: hugeExamples,
        },
        1651,
      ),
    ).toBeNull();
  });

  it('例子过多但没超硬上限时按每组 ≤3 条裁剪，数字仍然可用', () => {
    const summary = parseNameSummary(
      {
        ...FULL_SUMMARY,
        byCutGroup: { ground: 5 },
        examples: {
          ground: ['A', 'B', 'C', 'D', 'E'],
        },
      },
      5,
    );

    expect(summary?.byCutGroup).toEqual({ ground: 5 });
    expect(summary?.examples.ground).toEqual(['A', 'B', 'C']);
  });
});

describe('Ingredient name summary · 关键词降级', () => {
  it('按名字关键词粗略统计生 / 熟 / 做法 / 部位，并给每组代表名', () => {
    const summary = buildKeywordNameSummary([
      { name: 'Beef, ground, raw' },
      { name: 'Beef, ground, cooked' },
      { name: 'Beef, chuck, boiled' },
      { name: 'Beef, brisket, grilled' },
      { name: 'Beef, variety meats, liver' },
    ]);

    expect(summary.total).toBe(5);
    expect(summary.byState).toEqual({ RAW: 1, COOKED: 3, UNKNOWN: 1 });
    expect(summary.byMethod.BOILED).toBe(1);
    expect(summary.byMethod.GRILLED).toBe(1);
    expect(summary.byMethod.OTHER).toBe(1);
    expect(summary.byCutGroup.ground).toBe(2);
    expect(summary.byCutGroup.chuck).toBe(1);
    expect(summary.byCutGroup.brisket).toBe(1);
    expect(summary.byCutGroup.liver).toBe(1);
    expect(summary.examples.ground).toEqual([
      'Beef, ground, raw',
      'Beef, ground, cooked',
    ]);
  });

  it('中文词条名也能识别常见部位组（groupHint 过滤用同一套口径）', () => {
    const summary = buildKeywordNameSummary([
      { name: '牛绞肉' },
      { name: '牛肉馅' },
      { name: '牛腩' },
      { name: '牛腱子' },
      { name: '牛肩肉' },
      { name: '牛里脊' },
      { name: '鸡肝' },
      { name: '牛心' },
    ]);

    expect(summary.byCutGroup).toEqual({
      ground: 2,
      brisket: 1,
      shank: 1,
      chuck: 1,
      tenderloin: 1,
      liver: 1,
      heart: 1,
    });
  });
});

describe('IngredientNameClassifierService · summarizeNames', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('1,600 条名字只发 1 次汇总请求，输出上限 2000 token，不逐条判断', async () => {
    const { service } = createService();
    const fetchMock = mockFetchJson(FULL_SUMMARY);
    const payloadItems = items(1600);

    const result = await service.summarizeNames({
      targetName: '牛肉',
      items: payloadItems,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1600);
    expect(result.byState).toEqual({ RAW: 420, COOKED: 980, UNKNOWN: 251 });
    expect(result.examples.ground).toHaveLength(2);
    expect(result.irrelevantExamples).toHaveLength(2);
    expect(result.degraded).toBe(false);

    const request = fetchMock.mock.calls[0]?.[1] as any;
    const body = JSON.parse(request.body);
    expect(body.max_tokens).toBe(NAME_SUMMARY_MAX_TOKENS);
    expect(body.max_tokens).toBeLessThanOrEqual(2000);
    expect(body.thinking).toEqual({ type: 'disabled' });
    const user = JSON.parse(body.messages[1].content);
    expect(user.names).toHaveLength(1600);
    expect(user.targetName).toBe('牛肉');
    // 汇总请求只要名字，不带 id / 逐条结果字段。
    expect(user.names[0]).toBe('Beef, ground, raw 1');
  });

  it('非法 JSON → 降级为关键词粗略计数，不抛异常、不阻塞', async () => {
    const { service } = createService();
    mockFetchRaw('{"total": 1651, "byState": {broken');

    const result = await service.summarizeNames({
      targetName: '牛肉',
      items: items(20),
    });

    expect(result.degraded).toBe(true);
    expect(result.notice).toContain('关键词');
    expect(result.total).toBe(20);
    expect(
      result.byState.RAW + result.byState.COOKED + result.byState.UNKNOWN,
    ).toBe(20);
    expect(
      Object.values(result.byCutGroup).reduce((sum, count) => sum + count, 0),
    ).toBe(20);
  });

  it('模型不可用 → 同样降级，不抛异常', async () => {
    const { service, config } = createService();
    config.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new Error('no runtime'),
    );

    const result = await service.summarizeNames({
      targetName: '牛肉',
      items: items(6),
    });

    expect(result.degraded).toBe(true);
    expect(result.notice).toContain('关键词');
    expect(result.total).toBe(6);
  });
});
