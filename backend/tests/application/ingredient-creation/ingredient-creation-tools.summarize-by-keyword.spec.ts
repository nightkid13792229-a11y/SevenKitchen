import { Logger } from '@nestjs/common';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import { IngredientNameClassifierService } from '../../../src/application/ingredient-creation/ingredient-name-classifier.service';
import { NAME_SUMMARY_MAX_TOKENS } from '../../../src/application/ingredient-creation/ingredient-name-summary';
import type { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import type { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import type { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type { PrismaService } from '../../../src/infrastructure/prisma.service';

const DRAFT_ID = 'draft-1';
const RUN_ID = 'run-1';

interface NameRow {
  id: string;
  name: string;
  sourceType: string;
}

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

/** 1,600 条：前一半 ground，后一半 chuck，和线上「牛肉」的形态接近。 */
function beefNames(count: number): NameRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `rec-${index}`,
    name:
      index < count / 2
        ? `Beef, ground, raw ${index + 1}`
        : `Beef, chuck, boiled ${index + 1}`,
    sourceType: index % 2 === 0 ? 'USDA_FDC' : 'CFCT',
  }));
}

function rowsOf(names: readonly string[]): NameRow[] {
  return names.map((name, index) => ({
    id: `rec-${index}`,
    name,
    sourceType: 'USDA_FDC',
  }));
}

interface HarnessOptions {
  classifier?: 'real' | 'missing' | 'throwing';
  keywords?: string[];
}

function createHarness(rows: NameRow[], options: HarnessOptions = {}) {
  const listNutritionNames = jest.fn(async (_input: unknown) => ({
    total: rows.length,
    names: rows,
    keywords: options.keywords ?? ['牛肉', 'beef'],
  }));
  const candidateService = {
    findCandidates: jest.fn(),
    listNutritionNames,
  };
  const draftService = {
    get: jest.fn(),
    patch: jest.fn(),
  };
  const config = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(async () => RUNTIME),
  };

  let classifier: IngredientNameClassifierService | undefined;
  if (options.classifier === 'throwing') {
    classifier = {
      summarizeNames: jest.fn(async () => {
        throw new Error('model down');
      }),
    } as unknown as IngredientNameClassifierService;
  } else if (options.classifier !== 'missing') {
    classifier = new IngredientNameClassifierService(
      {} as unknown as PrismaService,
      config as never,
    );
  }

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    { runCheck: jest.fn() } as unknown as IngredientCreationCheckService,
    {} as unknown as PrismaService,
    classifier,
  );

  return { tools, listNutritionNames, config, classifier };
}

async function executeTool(
  tools: IngredientCreationToolsService,
  name: string,
  args: Record<string, unknown>,
) {
  const execution = await tools.execute({
    runId: RUN_ID,
    draftId: DRAFT_ID,
    name,
    args,
  });
  return {
    ...execution,
    body: JSON.parse(execution.content) as any,
  };
}

function mockSummaryFetch(summary: unknown): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(summary) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  }));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function requestPayload(fetchMock: jest.Mock, index = 0) {
  const init = fetchMock.mock.calls[index]?.[1] as any;
  const body = JSON.parse(init.body);
  return {
    body,
    user: JSON.parse(body.messages[1].content) as {
      targetName: string;
      total: number;
      names: string[];
    },
  };
}

const FULL_SUMMARY = {
  byState: { RAW: 620, COOKED: 830, UNKNOWN: 150 },
  byMethod: {
    BOILED: 300,
    STEAMED: 180,
    GRILLED: 260,
    FRIED: 90,
    OTHER: 100,
    NONE: 670,
  },
  byCutGroup: { ground: 800, chuck: 800 },
  examples: {
    ground: ['Beef, ground, raw 1', 'Beef, ground, raw 2'],
    chuck: ['Beef, chuck, boiled 801'],
  },
  irrelevantExamples: ['Beef, tongue, raw'],
};

const GROUND_SUMMARY = {
  byState: { RAW: 4, COOKED: 0, UNKNOWN: 0 },
  byMethod: {
    BOILED: 0,
    STEAMED: 0,
    GRILLED: 0,
    FRIED: 0,
    OTHER: 0,
    NONE: 4,
  },
  byCutGroup: { ground: 4 },
  examples: { ground: ['Beef, ground, raw 2'] },
  irrelevantExamples: [],
};

describe('IngredientCreationToolsService · summarizeByKeyword', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('1,600 条名字：服务端取全量、模型只调 1 次、请求里带全部名字、返回不含 names', async () => {
    const rows = beefNames(1600);
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools, listNutritionNames } = createHarness(rows);

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    // 服务端自己取名字：一次取到上限 3000，不需要模型抄任何名字。
    expect(listNutritionNames).toHaveBeenCalledTimes(1);
    expect(listNutritionNames).toHaveBeenCalledWith({
      keyword: '牛肉',
      limit: 3000,
    });

    // 只调一次汇总模型。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { body, user } = requestPayload(fetchMock);
    expect(body.max_tokens).toBe(NAME_SUMMARY_MAX_TOKENS);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(user.targetName).toBe('牛肉');
    expect(user.total).toBe(1600);
    expect(user.names).toHaveLength(1600);
    expect(user.names[0]).toBe('Beef, ground, raw 1');
    expect(user.names[799]).toBe('Beef, ground, raw 800');
    expect(user.names[800]).toBe('Beef, chuck, boiled 801');
    expect(user.names[1599]).toBe('Beef, chuck, boiled 1600');
    expect(new Set(user.names).size).toBe(1600);
    // 名字是模型的输入，不是它的输出：提示词明确禁止逐条回抄。
    expect(body.messages[0].content).toContain('绝对不要逐条输出判断');

    expect(result.body.total).toBe(1600);
    expect(result.body.byState).toEqual({
      RAW: 620,
      COOKED: 830,
      UNKNOWN: 150,
    });
    expect(result.body.byMethod.BOILED).toBe(300);
    expect(result.body.byCutGroup).toEqual({ ground: 800, chuck: 800 });
    expect(result.body.examples.ground).toHaveLength(2);
    expect(result.body.irrelevantExamples).toEqual(['Beef, tongue, raw']);
    expect(result.body.keywords).toEqual(['牛肉', 'beef']);
    expect(result.body.degraded).toBe(false);
    // 名字清单不再回灌给模型（examples 里的代表名除外）。
    expect(result.body).not.toHaveProperty('names');
    expect(result.body).not.toHaveProperty('returnedCount');
  });

  it('同 keyword + 同名字集合第二次命中缓存：不重复调模型', async () => {
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools, listNutritionNames } = createHarness(beefNames(20));

    const first = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });
    const second = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // 名字每次都要重新取（库可能变），但汇总不重复调模型。
    expect(listNutritionNames).toHaveBeenCalledTimes(2);
    expect(second.body.total).toBe(first.body.total);
    expect(second.body.byState).toEqual(first.body.byState);
    expect(second.body.byCutGroup).toEqual(first.body.byCutGroup);
  });

  it('名字集合变了（哈希不同）→ 缓存不串，重新调模型', async () => {
    const rows = beefNames(20);
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools, listNutritionNames } = createHarness(rows);

    await executeTool(tools, 'summarizeByKeyword', { keyword: '牛肉' });
    listNutritionNames.mockResolvedValueOnce({
      total: rows.length + 1,
      names: [
        ...rows,
        {
          id: 'rec-new',
          name: 'Beef, ground, raw 21',
          sourceType: 'USDA_FDC',
        },
      ],
      keywords: ['牛肉', 'beef'],
    });
    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.body.total).toBe(rows.length + 1);
  });

  it('缓存 24 小时后过期：同一 keyword 会重新调模型', async () => {
    const base = Date.parse('2026-10-25T00:00:00.000Z');
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(base);
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools } = createHarness(beefNames(10));

    await executeTool(tools, 'summarizeByKeyword', { keyword: '牛肉' });
    await executeTool(tools, 'summarizeByKeyword', { keyword: '牛肉' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(base + 24 * 60 * 60 * 1000 + 1);
    await executeTool(tools, 'summarizeByKeyword', { keyword: '牛肉' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('groupHint 只统计该部位组：请求里只有该组名字，total 是该组条数', async () => {
    const rows = rowsOf([
      'Beef, ground, 85% lean',
      'Beef, ground, raw',
      '牛绞肉',
      '牛肉馅',
      'Beef, chuck, boiled',
      '牛肩肉',
      'Beef, chuck, roasted',
      'Beef, brisket, raw',
      '牛腩',
    ]);
    const fetchMock = mockSummaryFetch(GROUND_SUMMARY);
    const { tools } = createHarness(rows);

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
      groupHint: 'ground',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { user } = requestPayload(fetchMock);
    expect(user.names).toHaveLength(4);
    expect(user.names).toEqual(
      expect.arrayContaining([
        'Beef, ground, 85% lean',
        'Beef, ground, raw',
        '牛绞肉',
        '牛肉馅',
      ]),
    );
    expect(
      user.names.some((name) => /chuck|brisket|牛肩|牛腩/u.test(name)),
    ).toBe(false);
    expect(result.body.total).toBe(4);
    expect(result.body.groupHint).toBe('ground');
    expect(result.body.byState).toEqual({
      RAW: 4,
      COOKED: 0,
      UNKNOWN: 0,
    });
  });

  it('groupHint 不同组各自用名字集合区分缓存，互不串用', async () => {
    const rows = rowsOf([
      'Beef, ground, raw',
      'Beef, ground, cooked',
      'Beef, chuck, boiled',
      'Beef, chuck, roasted',
      '牛肩肉',
    ]);
    const fetchMock = mockSummaryFetch(GROUND_SUMMARY);
    const { tools } = createHarness(rows);

    await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
      groupHint: 'ground',
    });
    const chuckResult = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
      groupHint: 'chuck',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { user } = requestPayload(fetchMock, 1);
    expect(user.names).toHaveLength(3);
    expect(chuckResult.body.total).toBe(3);
  });

  it('groupHint 没有匹配到名字：total=0 且不调模型，notice 说明原因', async () => {
    const fetchMock = mockSummaryFetch(GROUND_SUMMARY);
    const { tools } = createHarness(beefNames(10));

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
      groupHint: 'liver',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body.total).toBe(0);
    expect(result.body.degraded).toBe(false);
    expect(result.body.notice).toContain('部位组');
  });

  it('模型调用失败：degraded=true + 关键词兜底 + notice，不抛错', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    });
    (global as any).fetch = fetchMock;
    const { tools } = createHarness(beefNames(10));

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.body.degraded).toBe(true);
    expect(result.body.notice).toContain('关键词');
    expect(result.body.total).toBe(10);
    expect(
      result.body.byState.RAW +
        result.body.byState.COOKED +
        result.body.byState.UNKNOWN,
    ).toBe(10);
  });

  it('模型未配置：degraded=true + 关键词兜底 + notice', async () => {
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
    const { tools, config } = createHarness(beefNames(6));
    config.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new Error('no runtime'),
    );

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body.degraded).toBe(true);
    expect(result.body.notice).toContain('关键词');
    expect(result.body.total).toBe(6);
  });

  it('分类服务未装配：degraded=true + 关键词兜底，不抛错', async () => {
    const { tools } = createHarness(beefNames(6), { classifier: 'missing' });

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    expect(result.body.degraded).toBe(true);
    expect(result.body.notice).toContain('关键词');
    expect(result.body.total).toBe(6);
  });

  it('分类服务直接抛错：同样降级，不抛错', async () => {
    const { tools } = createHarness(beefNames(6), {
      classifier: 'throwing',
    });

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '牛肉',
    });

    expect(result.ok).toBe(true);
    expect(result.body.degraded).toBe(true);
    expect(result.body.notice).toContain('关键词');
    expect(result.body.total).toBe(6);
  });

  it('keyword 为空返回错误文本，不查名字也不调模型', async () => {
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools, listNutritionNames } = createHarness(beefNames(6));

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '   ',
    });

    expect(result.ok).toBe(false);
    expect(result.body.ok).toBe(false);
    expect(listNutritionNames).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('零命中：total=0、不调模型，仍返回 keywords', async () => {
    const fetchMock = mockSummaryFetch(FULL_SUMMARY);
    const { tools } = createHarness([], { keywords: ['西洋菜'] });

    const result = await executeTool(tools, 'summarizeByKeyword', {
      keyword: '西洋菜',
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body.total).toBe(0);
    expect(result.body.found).toBeUndefined();
    expect(result.body.keywords).toEqual(['西洋菜']);
  });

  it('工具定义：keyword 必填、groupHint 可选、没有 names 参数，旧工具已不存在', async () => {
    const { tools } = createHarness([]);
    const definition = tools
      .getDefinitions()
      .find((tool) => tool.function.name === 'summarizeByKeyword');

    expect(definition).toBeDefined();
    expect(definition?.function.parameters).toMatchObject({
      type: 'object',
      required: ['keyword'],
      properties: {
        keyword: { type: 'string' },
        groupHint: { type: 'string' },
      },
    });
    expect(
      (definition?.function.parameters.properties as Record<string, unknown>)
        .names,
    ).toBeUndefined();
    expect(tools.availableToolNames()).not.toContain('summarizeNames');

    const legacy = await executeTool(tools, 'summarizeNames', {
      names: ['Beef, ground, raw'],
    });
    expect(legacy.ok).toBe(false);
    expect(legacy.error).toContain('未知工具');
  });
});
