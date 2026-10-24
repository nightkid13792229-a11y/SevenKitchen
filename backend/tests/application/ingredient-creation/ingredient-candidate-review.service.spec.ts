import { BadRequestException, Logger } from '@nestjs/common';
import {
  IngredientCandidateReviewService,
  type CandidateReviewInput,
} from '../../../src/application/ingredient-creation/ingredient-candidate-review.service';
import type { AgentProviderConfigService } from '../../../src/application/nutrition-governance/agent-provider-config.service';

const RUNTIME = {
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-review-test',
  reviewModel: 'deepseek-review-test',
  apiKey: 'test-key',
  maxConcurrency: 1,
  requestTimeoutMs: 30_000,
  retryCount: 0,
};

const TARGET = { zh: '山药', en: 'yam', state: 'RAW' as const };

function candidate(
  id: string,
  name: string,
  coverage = 80,
): CandidateReviewInput['candidates'][number] {
  return { id, name, sourceType: 'USDA_FDC', coverage };
}

function createConfigMock(
  implementation?: () => Promise<typeof RUNTIME>,
): { service: AgentProviderConfigService; getRuntime: jest.Mock } {
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
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  }));
  (global as any).fetch = fetchMock;
  return fetchMock;
}

function createService(
  config: ReturnType<typeof createConfigMock>,
): IngredientCandidateReviewService {
  return new IngredientCandidateReviewService(config.service);
}

describe('IngredientCandidateReviewService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('解析模型输出：按输入顺序返回，保留相关 / 存疑 / 不相关与一句理由', async () => {
    const config = createConfigMock(async () => RUNTIME);
    // 模型故意打乱顺序，服务必须按输入候选的顺序还原。
    const fetchMock = mockFetchJson(
      JSON.stringify({
        reviews: [
          {
            id: 'jicama',
            verdict: 'IRRELEVANT',
            reason: 'Yambean 是凉薯，不是山药',
          },
          {
            id: 'yam',
            verdict: 'RELEVANT',
            reason: '就是山药（Chinese yam）',
          },
          {
            id: 'celery',
            verdict: 'UNCERTAIN',
            reason: '名字对不上，信息不足',
          },
        ],
      }),
    );
    const service = createService(config);

    const result = await service.reviewCandidates({
      target: TARGET,
      candidates: [
        candidate('yam', 'Yam, raw'),
        candidate('jicama', 'Yambean (jicama), raw'),
        candidate('celery', 'Celery, raw'),
      ],
    });

    expect(result).toEqual([
      { id: 'yam', verdict: 'RELEVANT', reason: '就是山药（Chinese yam）' },
      {
        id: 'jicama',
        verdict: 'IRRELEVANT',
        reason: 'Yambean 是凉薯，不是山药',
      },
      { id: 'celery', verdict: 'UNCERTAIN', reason: '名字对不上，信息不足' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('提示词要求逐一判定、不改顺序、理由不超过 40 字', async () => {
    const config = createConfigMock(async () => RUNTIME);
    const fetchMock = mockFetchJson(JSON.stringify({ reviews: [] }));
    const service = createService(config);

    await service.reviewCandidates({
      target: TARGET,
      candidates: [candidate('yam', 'Yam, raw')],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toContain('/chat/completions');
    const body = JSON.parse(String(init.body));
    const system = String(body.messages[0].content);
    expect(system).toContain('RELEVANT');
    expect(system).toContain('UNCERTAIN');
    expect(system).toContain('IRRELEVANT');
    expect(system).toContain('40');
    expect(system).toContain('顺序');
    const payload = JSON.parse(String(body.messages[1].content));
    expect(payload.target).toEqual(TARGET);
    expect(payload.candidates).toEqual([
      {
        id: 'yam',
        name: 'Yam, raw',
        sourceType: 'USDA_FDC',
        coverage: 80,
      },
    ]);
  });

  it('非法 verdict / 缺条 / 重复条：缺的一律降级为 UNCERTAIN + 空理由，保持顺序', async () => {
    const config = createConfigMock(async () => RUNTIME);
    mockFetchJson(
      JSON.stringify({
        reviews: [
          { id: 'yam', verdict: 'YES', reason: '这个说法不合法' },
          { id: 'jicama', verdict: 'irrelevant', reason: '  凉薯  ' },
          { id: 'jicama', verdict: 'RELEVANT', reason: '重复条不覆盖第一条' },
        ],
      }),
    );
    const service = createService(config);

    const result = await service.reviewCandidates({
      target: TARGET,
      candidates: [
        candidate('yam', 'Yam, raw'),
        candidate('jicama', 'Yambean (jicama), raw'),
        candidate('celery', 'Celery, raw'),
      ],
    });

    expect(result).toEqual([
      { id: 'yam', verdict: 'UNCERTAIN', reason: '' },
      { id: 'jicama', verdict: 'IRRELEVANT', reason: '凉薯' },
      { id: 'celery', verdict: 'UNCERTAIN', reason: '' },
    ]);
  });

  it('理由超过 40 字时截断，不把模型的长解释塞回页面', async () => {
    const config = createConfigMock(async () => RUNTIME);
    const longReason = '这是很长的理由'.repeat(20);
    mockFetchJson(
      JSON.stringify({
        reviews: [{ id: 'yam', verdict: 'RELEVANT', reason: longReason }],
      }),
    );
    const service = createService(config);

    const [result] = await service.reviewCandidates({
      target: TARGET,
      candidates: [candidate('yam', 'Yam, raw')],
    });

    expect(Array.from(result.reason).length).toBe(40);
    expect(result.verdict).toBe('RELEVANT');
  });

  it('模型没配 / 请求失败 / 返回非数组：全部 UNCERTAIN + 空理由，不抛异常', async () => {
    const unavailable = createService(createConfigMock());
    const fallback = await unavailable.reviewCandidates({
      target: TARGET,
      candidates: [candidate('yam', 'Yam, raw')],
    });
    expect(fallback).toEqual([
      { id: 'yam', verdict: 'UNCERTAIN', reason: '' },
    ]);

    const config = createConfigMock(async () => RUNTIME);
    (global as any).fetch = jest.fn(async () => {
      throw new Error('network down');
    });
    const failing = createService(config);
    const failed = await failing.reviewCandidates({
      target: TARGET,
      candidates: [candidate('yam', 'Yam, raw')],
    });
    expect(failed).toEqual([{ id: 'yam', verdict: 'UNCERTAIN', reason: '' }]);

    const configInvalid = createConfigMock(async () => RUNTIME);
    mockFetchJson(JSON.stringify({ reviews: 'not-an-array' }));
    const invalid = createService(configInvalid);
    const invalidResult = await invalid.reviewCandidates({
      target: TARGET,
      candidates: [candidate('yam', 'Yam, raw')],
    });
    expect(invalidResult).toEqual([
      { id: 'yam', verdict: 'UNCERTAIN', reason: '' },
    ]);
  });

  it('一次调用最多复核 12 条：第 13 条不参与提示词，直接标 UNCERTAIN', async () => {
    const config = createConfigMock(async () => RUNTIME);
    const candidates = Array.from({ length: 13 }, (_, index) =>
      candidate(`rec-${index}`, `Food ${index}`),
    );
    const fetchMock = mockFetchJson(
      JSON.stringify({
        reviews: Array.from({ length: 12 }, (_, index) => ({
          id: `rec-${index}`,
          verdict: 'RELEVANT',
          reason: `第 ${index} 条`,
        })),
      }),
    );
    const service = createService(config);

    const result = await service.reviewCandidates({ target: TARGET, candidates });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as any)[1].body));
    const payload = JSON.parse(String(body.messages[1].content));
    expect(payload.candidates).toHaveLength(12);
    expect(result).toHaveLength(13);
    expect(result[11]).toMatchObject({ id: 'rec-11', verdict: 'RELEVANT' });
    expect(result[12]).toEqual({
      id: 'rec-12',
      verdict: 'UNCERTAIN',
      reason: '',
    });
  });

  it('没有候选时直接返回空数组，不请求模型', async () => {
    const config = createConfigMock(async () => RUNTIME);
    const fetchMock = mockFetchJson(JSON.stringify({ reviews: [] }));
    const service = createService(config);

    await expect(
      service.reviewCandidates({ target: TARGET, candidates: [] }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
