import {
  INestApplication,
  Logger,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  buildIngredientIntakeClassifyPrompt,
  IngredientCreationIntakeService,
  type IntakeClassification,
} from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import {
  AgentProviderConfigService,
  type AgentProviderSettingsView,
  type DeepSeekRuntimeConfig,
} from '../../../src/application/nutrition-governance/agent-provider-config.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const INTAKE_PURPOSE = 'INGREDIENT_INTAKE';
const DEFAULT_PURPOSE = 'DEFAULT';
const RECIPE_DESIGN_PURPOSE = 'RECIPE_DESIGN';
const PRIMARY_MODEL = 'deepseek-v4-flash';
const REVIEW_MODEL = 'deepseek-v4-pro';
const BASE_URL = 'https://api.deepseek.test';
const CLASSIFY_PATH = '/api/v1/admin/ingredient-creation/intake/classify';

type PurposeState = 'enabled' | 'disabled' | 'missing-key' | 'missing';

interface PurposeFixture {
  baseUrl: string;
  model: string;
  reviewModel: string;
  apiKey: string;
}

/** 每一级都用完全不同的值，断言才能看出来这次到底用了哪一级。 */
const PURPOSE_FIXTURES: Record<string, PurposeFixture> = {
  [INTAKE_PURPOSE]: {
    baseUrl: BASE_URL,
    model: PRIMARY_MODEL,
    reviewModel: REVIEW_MODEL,
    apiKey: 'sk-ingredient-intake',
  },
  [DEFAULT_PURPOSE]: {
    baseUrl: 'https://default.deepseek.test',
    model: 'default-model',
    reviewModel: 'default-review-model',
    apiKey: 'sk-default',
  },
  [RECIPE_DESIGN_PURPOSE]: {
    baseUrl: 'https://recipe-design.deepseek.test',
    model: 'recipe-design-model',
    reviewModel: 'recipe-design-review-model',
    apiKey: 'sk-recipe-design',
  },
};

interface CreateServiceOptions {
  /** 未列出的用途按生产现状处理：INGREDIENT_INTAKE 启用，DEFAULT 不存在。 */
  purposes?: Partial<Record<string, PurposeState>>;
  runtimeOverrides?: Partial<DeepSeekRuntimeConfig>;
}

const FOOD_RESULT: IntakeClassification = {
  kind: 'FOOD',
  reply: '好，牛肉，按食材处理。',
  suggestions: [],
  intent: 'NEW',
  resolvedText: '牛肉',
};

const SUPPLEMENT_RESULT: IntakeClassification = {
  kind: 'SUPPLEMENT',
  reply: '好，葡萄糖酸锌，按补剂处理。',
  suggestions: [],
  intent: 'NEW',
  resolvedText: null,
};

const UNKNOWN_RESULT: IntakeClassification = {
  kind: 'UNKNOWN',
  reply: '你想加的是食材还是补剂？',
  suggestions: ['食材', '补剂', '我说的是牛肉'],
  intent: 'CLARIFY',
  resolvedText: null,
};

/** 纠正“这不是补剂”但没给新名字：模型只追问，resolvedText 由服务补回原原料名。 */
const CORRECTION_UNKNOWN_RESULT: IntakeClassification = {
  kind: 'UNKNOWN',
  reply: '抱歉，那正确的名字是什么？',
  suggestions: ['这是食材', '我说的是牛肉'],
  intent: 'CORRECTION',
  resolvedText: null,
};

function buildSettings(
  overrides: Partial<AgentProviderSettingsView> = {},
): AgentProviderSettingsView {
  return {
    purpose: 'DEFAULT',
    provider: 'DEEPSEEK',
    enabled: true,
    baseUrl: BASE_URL,
    model: PRIMARY_MODEL,
    reviewModel: REVIEW_MODEL,
    apiKeyConfigured: true,
    apiKeyLast4: '1234',
    maxConcurrency: 1,
    requestTimeoutMs: 90_000,
    retryCount: 2,
    ...overrides,
  };
}

function buildRuntime(
  overrides: Partial<DeepSeekRuntimeConfig> = {},
): DeepSeekRuntimeConfig {
  return {
    provider: 'deepseek',
    baseUrl: BASE_URL,
    model: PRIMARY_MODEL,
    reviewModel: REVIEW_MODEL,
    apiKey: 'sk-test',
    maxConcurrency: 1,
    requestTimeoutMs: 90_000,
    retryCount: 2,
    ...overrides,
  };
}

function chatResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(payload) } }],
    }),
  } as unknown as Response;
}

function rawContentResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    }),
  } as unknown as Response;
}

function errorResponse(status = 500) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue({ error: 'upstream failed' }),
  } as unknown as Response;
}

async function createService(options: CreateServiceOptions = {}) {
  const purposeStates: Record<string, PurposeState> = {
    [INTAKE_PURPOSE]: 'enabled',
    [DEFAULT_PURPOSE]: 'missing',
    [RECIPE_DESIGN_PURPOSE]: 'enabled',
    ...options.purposes,
  };

  const fixtureFor = (purpose: string): PurposeFixture =>
    PURPOSE_FIXTURES[purpose] ?? PURPOSE_FIXTURES[DEFAULT_PURPOSE];

  const runtimeFor = (purpose: string): DeepSeekRuntimeConfig => {
    const fixture = fixtureFor(purpose);
    return buildRuntime({
      baseUrl: fixture.baseUrl,
      model: fixture.model,
      reviewModel: fixture.reviewModel,
      apiKey: fixture.apiKey,
      ...options.runtimeOverrides,
    });
  };

  // 生产版 getSettings 在指定用途没有行时会回落到 DEFAULT；测试替身保留同样行为。
  const getSettings = jest.fn(async (purpose?: string) => {
    const requested = purpose || DEFAULT_PURPOSE;
    const resolved =
      requested !== DEFAULT_PURPOSE && purposeStates[requested] === 'missing'
        ? DEFAULT_PURPOSE
        : requested;
    const state = purposeStates[resolved] ?? 'missing';
    const fixture = fixtureFor(resolved);
    return buildSettings({
      purpose: resolved,
      baseUrl: fixture.baseUrl,
      model: fixture.model,
      reviewModel: fixture.reviewModel,
      enabled: state === 'enabled' || state === 'missing-key',
      apiKeyConfigured: state === 'enabled' || state === 'disabled',
      apiKeyLast4: state === 'missing-key' ? null : '1234',
    });
  });

  const getEnabledDeepSeekRuntimeConfig = jest.fn(
    async (
      input: { purpose?: string; fallbackToDefault?: boolean } = {},
    ): Promise<DeepSeekRuntimeConfig> => {
      let purpose = input.purpose || DEFAULT_PURPOSE;
      if (
        (input.fallbackToDefault ?? true) &&
        purpose !== DEFAULT_PURPOSE &&
        purposeStates[purpose] === 'missing'
      ) {
        purpose = DEFAULT_PURPOSE;
      }

      const state = purposeStates[purpose] ?? 'missing';
      if (state === 'disabled') {
        throw new Error(`DeepSeek Agent 设置未启用：${purpose}`);
      }
      if (state === 'missing-key') {
        throw new Error(`DeepSeek API Key 未配置：${purpose}`);
      }
      if (state !== 'enabled') {
        throw new Error(`DeepSeek 未配置：${purpose}`);
      }
      return runtimeFor(purpose);
    },
  );

  const configService = { getSettings, getEnabledDeepSeekRuntimeConfig };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      IngredientCreationIntakeService,
      { provide: AgentProviderConfigService, useValue: configService },
    ],
  }).compile();

  return {
    service: moduleRef.get(IngredientCreationIntakeService),
    configService,
  };
}

function sentModels(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String(init.body)).model,
  );
}

function firstRequestBody(fetchMock: jest.Mock): any {
  const [, init] = fetchMock.mock.calls[0];
  return JSON.parse(String(init.body));
}

function sentRequests(fetchMock: jest.Mock) {
  return fetchMock.mock.calls.map(([url, init]) => {
    const body = JSON.parse(String(init.body));
    return {
      url,
      model: body.model,
      authorization: init.headers.Authorization,
    };
  });
}

function attemptedPurposes(configService: {
  getEnabledDeepSeekRuntimeConfig: jest.Mock;
}): string[] {
  return configService.getEnabledDeepSeekRuntimeConfig.mock.calls.map(
    ([input]) => String(input.purpose),
  );
}

async function expectServiceUnavailable(
  service: IngredientCreationIntakeService,
): Promise<void> {
  let caught: unknown;
  try {
    await service.classify('牛肉');
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(ServiceUnavailableException);
  expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
  expect((caught as Error).message).toBe(
    'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
  );
}

/** 主模型先失败一次、复核模型成功，顺带验证 baseUrl/model/reviewModel/apiKey 都取自同一级。 */
async function expectUsesPurpose(
  purpose: string,
  options: CreateServiceOptions = {},
) {
  const fetchMock = jest
    .fn()
    .mockResolvedValueOnce(errorResponse(500))
    .mockResolvedValueOnce(chatResponse(FOOD_RESULT));
  global.fetch = fetchMock as unknown as typeof global.fetch;

  const { service, configService } = await createService(options);

  await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);

  const fixture = PURPOSE_FIXTURES[purpose];
  const shared = {
    url: `${fixture.baseUrl}/chat/completions`,
    authorization: `Bearer ${fixture.apiKey}`,
  };
  expect(sentRequests(fetchMock)).toEqual([
    { ...shared, model: fixture.model },
    { ...shared, model: fixture.reviewModel },
  ]);
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining(`purpose=${purpose}`),
  );

  return { fetchMock, configService };
}

const originalFetch = global.fetch;
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  // 非 2xx 时共享的 deepseek-chat 会 console.error 一次；测试里静音。
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('IngredientCreationIntakeService', () => {
  it('食材输入返回 FOOD 与确认话术', async () => {
    const fetchMock = jest.fn().mockResolvedValue(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service, configService } = await createService();

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);

    expect(configService.getEnabledDeepSeekRuntimeConfig).toHaveBeenCalledWith({
      purpose: INTAKE_PURPOSE,
      fallbackToDefault: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    const body = firstRequestBody(fetchMock);
    expect(body.model).toBe(PRIMARY_MODEL);
    expect(body.temperature).toBe(0.2);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('食材');
    expect(body.messages[0].content).toContain('补剂');
    expect(body.messages[0].content).toContain('UNKNOWN');
    expect(body.messages[0].content).toContain('只输出 JSON');
    expect(JSON.parse(body.messages[1].content)).toEqual({ text: '牛肉' });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    // 实际使用的模型名要进日志，便于排查是哪一路模型在判。
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(PRIMARY_MODEL));
  });

  it('补剂输入返回 SUPPLEMENT 与确认话术', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(chatResponse(SUPPLEMENT_RESULT)) as any;

    const { service } = await createService();

    await expect(service.classify('葡萄糖酸锌')).resolves.toEqual(
      SUPPLEMENT_RESULT,
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('拿不准时返回 UNKNOWN 与 2–3 个可点建议', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(chatResponse(UNKNOWN_RESULT)) as any;

    const { service } = await createService();

    const result = await service.classify('今天天气');

    expect(result.kind).toBe('UNKNOWN');
    expect(result.reply).toContain('？');
    expect(result.suggestions).toHaveLength(3);
  });

  it('提示词不再写死三句回复，并要求口语化短回复与四种意图', () => {
    const prompt = buildIngredientIntakeClassifyPrompt();

    expect(prompt).not.toContain('这是食材。好，我们走食材这条路。');
    expect(prompt).not.toContain('这是补剂。好，我们走补剂这条路。');
    expect(prompt).toContain('不超过 40 字');
    expect(prompt).toContain('不要客套');
    expect(prompt).toContain('不要评价营养');
    for (const intent of ['NEW', 'CORRECTION', 'CLARIFY', 'OFF_TOPIC']) {
      expect(prompt).toContain(intent);
    }
    expect(prompt).toContain('只输出 JSON');
  });

  it('带 history 与 current 时，提示词里带上刚才判过什么', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(chatResponse(CORRECTION_UNKNOWN_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();
    const history = [
      { role: 'user' as const, content: '葡萄糖酸锌' },
      { role: 'assistant' as const, content: '这是补剂。' },
    ];
    const current = { text: '葡萄糖酸锌', kind: 'SUPPLEMENT' as const };

    await service.classify('这不是补剂', { history, current });

    const body = firstRequestBody(fetchMock);
    const systemPrompt = String(body.messages[0].content);
    expect(systemPrompt).toContain('葡萄糖酸锌');
    expect(systemPrompt).toContain('这是补剂');
    expect(systemPrompt).toContain('SUPPLEMENT');
    expect(systemPrompt).toContain('CORRECTION');
    // 用户这句话仍作为 user 消息单独送，不和上下文混在一个 JSON 里。
    expect(JSON.parse(body.messages[1].content)).toEqual({
      text: '这不是补剂',
    });
  });

  it('纠错但没给新名字时，判 UNKNOWN 并把 resolvedText 指回当前原料', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(chatResponse(CORRECTION_UNKNOWN_RESULT)) as any;

    const { service } = await createService();

    const result = await service.classify('这不是补剂', {
      current: { text: '葡萄糖酸锌', kind: 'SUPPLEMENT' },
      history: [{ role: 'assistant', content: '这是补剂。' }],
    });

    expect(result).toMatchObject({
      kind: 'UNKNOWN',
      intent: 'CORRECTION',
      resolvedText: '葡萄糖酸锌',
    });
    expect(result.reply).toContain('？');
    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('纠错并给出新名字时，按新名字判并保留新名字', async () => {
    const corrected: IntakeClassification = {
      kind: 'FOOD',
      reply: '好，那就按牛肉算。',
      suggestions: [],
      intent: 'CORRECTION',
      resolvedText: '牛肉',
    };
    global.fetch = jest.fn().mockResolvedValue(chatResponse(corrected)) as any;

    const { service } = await createService();

    const result = await service.classify('搞错了，是牛肉', {
      current: { text: '锌', kind: 'SUPPLEMENT' },
    });

    expect(result).toEqual(corrected);
  });

  it.each([
    ['FOOD', '好的，这是补剂。'],
    ['SUPPLEMENT', '好的，这是食材。'],
  ] as const)(
    'kind=%s 但回复提到另一类时视为不可信，切备模型重试',
    async (kind, contradictoryReply) => {
      const contradictory = {
        kind,
        reply: contradictoryReply,
        suggestions: [],
        intent: 'NEW' as const,
        resolvedText: null,
      };
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce(chatResponse(contradictory))
        .mockResolvedValueOnce(
          chatResponse(kind === 'FOOD' ? FOOD_RESULT : SUPPLEMENT_RESULT),
        );
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const { service } = await createService();

      await expect(service.classify('牛肉')).resolves.toEqual(
        kind === 'FOOD' ? FOOD_RESULT : SUPPLEMENT_RESULT,
      );
      expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, REVIEW_MODEL]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('分类与回复矛盾'),
      );
    },
  );

  it('reply 超过 80 字时截断', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      chatResponse({
        kind: 'FOOD',
        reply: '牛'.repeat(120),
        suggestions: [],
        intent: 'NEW',
        resolvedText: '牛肉',
      }),
    ) as any;

    const { service } = await createService();

    const result = await service.classify('牛肉');

    expect(result.reply).toBe('牛'.repeat(80));
  });

  it('主模型失败时自动切 reviewModel 重试一次', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(errorResponse(500))
      .mockResolvedValueOnce(chatResponse(SUPPLEMENT_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    await expect(service.classify('鱼油')).resolves.toEqual(SUPPLEMENT_RESULT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, REVIEW_MODEL]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(PRIMARY_MODEL),
    );
  });

  it('reviewModel 未配置时用同一个 model 再试一次', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({
      runtimeOverrides: { reviewModel: '' },
    });

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, PRIMARY_MODEL]);
  });

  it('模型返回非 JSON 时视为失败并切备模型', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(rawContentResponse('我觉得这是食材'))
      .mockResolvedValueOnce(chatResponse(FOOD_RESULT));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    await expect(service.classify('牛肉')).resolves.toEqual(FOOD_RESULT);
    expect(sentModels(fetchMock)).toEqual([PRIMARY_MODEL, REVIEW_MODEL]);
  });

  it('两个模型都失败时抛 503，不回退到规则判断', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService();

    let caught: unknown;
    try {
      await service.classify('牛肉');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as Error).message).toBe('AI 暂时不可用，请稍后重试');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(PRIMARY_MODEL),
    );
  });

  it('三级配置都未启用时抛 503，提示去「Agent 设置」启用并配置模型', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({
      purposes: {
        [INTAKE_PURPOSE]: 'disabled',
        [DEFAULT_PURPOSE]: 'disabled',
        [RECIPE_DESIGN_PURPOSE]: 'disabled',
      },
    });

    let caught: unknown;
    try {
      await service.classify('牛肉');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as Error).message).toContain('Agent 设置');
    expect((caught as Error).message).toContain(
      'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('三级配置都没配 API Key 时也抛 503，不发起任何请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service } = await createService({
      purposes: {
        [INTAKE_PURPOSE]: 'missing-key',
        [DEFAULT_PURPOSE]: 'missing-key',
        [RECIPE_DESIGN_PURPOSE]: 'missing-key',
      },
    });

    await expect(service.classify('牛肉')).rejects.toMatchObject({
      message: expect.stringContaining('Agent 设置'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('空白输入直接 400，不查配置也不发请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service, configService } = await createService();

    await expect(service.classify('   ')).rejects.toMatchObject({
      status: 400,
    });
    expect(configService.getSettings).not.toHaveBeenCalled();
    expect(
      configService.getEnabledDeepSeekRuntimeConfig,
    ).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('运行时配置回落链（INGREDIENT_INTAKE → DEFAULT → RECIPE_DESIGN）', () => {
  it('INGREDIENT_INTAKE 存在且启用时直接用它，不再看后面两级', async () => {
    const { configService } = await expectUsesPurpose(INTAKE_PURPOSE);

    expect(attemptedPurposes(configService)).toEqual([INTAKE_PURPOSE]);
  });

  it('INGREDIENT_INTAKE 不存在、DEFAULT 存在且启用时用 DEFAULT', async () => {
    const { configService } = await expectUsesPurpose(DEFAULT_PURPOSE, {
      purposes: {
        [INTAKE_PURPOSE]: 'missing',
        [DEFAULT_PURPOSE]: 'enabled',
      },
    });

    expect(attemptedPurposes(configService)).toEqual([
      INTAKE_PURPOSE,
      DEFAULT_PURPOSE,
    ]);
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(`purpose=${INTAKE_PURPOSE}`),
    );
  });

  it('前两级都没有、RECIPE_DESIGN 启用时用 RECIPE_DESIGN（线上现状）', async () => {
    const { configService } = await expectUsesPurpose(RECIPE_DESIGN_PURPOSE, {
      purposes: {
        [INTAKE_PURPOSE]: 'missing',
        [DEFAULT_PURPOSE]: 'missing',
      },
    });

    expect(attemptedPurposes(configService)).toEqual([
      INTAKE_PURPOSE,
      DEFAULT_PURPOSE,
      RECIPE_DESIGN_PURPOSE,
    ]);
  });

  it('三级都没有配置时仍然 503，文案不变且不发起模型请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { service, configService } = await createService({
      purposes: {
        [INTAKE_PURPOSE]: 'missing',
        [DEFAULT_PURPOSE]: 'missing',
        [RECIPE_DESIGN_PURPOSE]: 'missing',
      },
    });

    await expectServiceUnavailable(service);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attemptedPurposes(configService)).toEqual([
      INTAKE_PURPOSE,
      DEFAULT_PURPOSE,
      RECIPE_DESIGN_PURPOSE,
    ]);
    // 排查时要能从日志看到三级都试过了。
    for (const purpose of [
      INTAKE_PURPOSE,
      DEFAULT_PURPOSE,
      RECIPE_DESIGN_PURPOSE,
    ]) {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(purpose));
    }
  });

  const SKIP_CASES: Array<[string, PurposeState, string]> = [
    [INTAKE_PURPOSE, 'disabled', DEFAULT_PURPOSE],
    [INTAKE_PURPOSE, 'missing-key', DEFAULT_PURPOSE],
    [DEFAULT_PURPOSE, 'disabled', RECIPE_DESIGN_PURPOSE],
    [DEFAULT_PURPOSE, 'missing-key', RECIPE_DESIGN_PURPOSE],
  ];

  describe.each(SKIP_CASES)(
    '%s 为 %s 时跳到 %s',
    (skippedPurpose, state, fallbackPurpose) => {
      it(`使用 ${fallbackPurpose} 的配置`, async () => {
        const purposes: Partial<Record<string, PurposeState>> = {
          [INTAKE_PURPOSE]: 'missing',
          [DEFAULT_PURPOSE]: 'missing',
          [skippedPurpose]: state,
          [fallbackPurpose]: 'enabled',
        };

        const { configService } = await expectUsesPurpose(fallbackPurpose, {
          purposes,
        });

        expect(attemptedPurposes(configService)).toEqual(
          fallbackPurpose === DEFAULT_PURPOSE
            ? [INTAKE_PURPOSE, DEFAULT_PURPOSE]
            : [INTAKE_PURPOSE, DEFAULT_PURPOSE, RECIPE_DESIGN_PURPOSE],
        );
        expect(logSpy).not.toHaveBeenCalledWith(
          expect.stringContaining(`purpose=${skippedPurpose}`),
        );
      });
    },
  );

  const UNAVAILABLE_STATES: PurposeState[] = ['disabled', 'missing-key'];

  describe.each(UNAVAILABLE_STATES)('RECIPE_DESIGN 为 %s 时', (state) => {
    it('三级都不可用，仍然 503 且不发起模型请求', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const { service, configService } = await createService({
        purposes: {
          [INTAKE_PURPOSE]: 'missing',
          [DEFAULT_PURPOSE]: 'missing',
          [RECIPE_DESIGN_PURPOSE]: state,
        },
      });

      await expectServiceUnavailable(service);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(attemptedPurposes(configService)).toEqual([
        INTAKE_PURPOSE,
        DEFAULT_PURPOSE,
        RECIPE_DESIGN_PURPOSE,
      ]);
    });
  });
});

describe('POST /api/v1/admin/ingredient-creation/intake/classify', () => {
  let app: INestApplication;
  let intakeService: { classify: jest.Mock };

  beforeEach(async () => {
    intakeService = { classify: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: {} },
        { provide: IngredientCreationCandidateService, useValue: {} },
        { provide: IngredientCreationOnlineService, useValue: {} },
        { provide: IngredientCreationMergeService, useValue: {} },
        { provide: IngredientCreationCheckService, useValue: {} },
        { provide: IngredientCreationCommitService, useValue: {} },
        { provide: IngredientCreationAuditService, useValue: {} },
        { provide: IngredientCreationIntakeService, useValue: intakeService },
        {
          provide: JwtAuthService,
          useValue: {
            validateToken: jest.fn().mockReturnValue({
              userId: 'admin-1',
              customerId: 'admin-1',
              role: 'ADMIN',
            }),
          },
        },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('未登录 → 401，且不调用分类服务', async () => {
    await http().post(CLASSIFY_PATH).send({ text: '牛肉' }).expect(401);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('已登录时返回 ApiResponseDto 包裹的分类结果', async () => {
    intakeService.classify.mockResolvedValue(FOOD_RESULT);

    const response = await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '牛肉' })
      .expect(201);

    expect(intakeService.classify).toHaveBeenCalledWith('牛肉', {
      history: undefined,
      current: null,
    });
    expect(response.body).toEqual({
      code: 0,
      message: 'Success',
      data: FOOD_RESULT,
    });
  });

  it('带 history 与 current 时原样交给分类服务', async () => {
    intakeService.classify.mockResolvedValue(CORRECTION_UNKNOWN_RESULT);
    const history = [
      { role: 'user', content: '锌是补剂吗' },
      { role: 'assistant', content: '这是补剂。' },
    ];
    const current = { text: '锌', kind: 'SUPPLEMENT' };

    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '这不是补剂', history, current })
      .expect(201);

    const [text, context] = intakeService.classify.mock.calls[0];
    expect(text).toBe('这不是补剂');
    expect(context).toEqual({ history, current });
  });

  it('current 显式传 null 时按未提供处理', async () => {
    intakeService.classify.mockResolvedValue(FOOD_RESULT);

    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '牛肉', current: null })
      .expect(201);

    expect(intakeService.classify).toHaveBeenCalledWith('牛肉', {
      history: undefined,
      current: null,
    });
  });

  it('history 超过 6 条 → 400，且不调用分类服务', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({
        text: '牛肉',
        history: Array.from({ length: 7 }, () => ({
          role: 'user',
          content: '牛肉',
        })),
      })
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('history 单条 content 超过 200 字 → 400', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({
        text: '牛肉',
        history: [{ role: 'user', content: '牛'.repeat(201) }],
      })
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('history 的 role 不是 user / assistant 时 → 400', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({
        text: '牛肉',
        history: [{ role: 'system', content: '牛肉' }],
      })
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('current.kind 不是 FOOD / SUPPLEMENT 时 → 400', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({
        text: '牛肉',
        current: { text: '牛肉', kind: 'UNKNOWN' },
      })
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('缺少 text → 400，且不调用分类服务', async () => {
    await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({})
      .expect(400);

    expect(intakeService.classify).not.toHaveBeenCalled();
  });

  it('AI 未启用时接口返回 503，错误文案指向「Agent 设置」', async () => {
    intakeService.classify.mockRejectedValue(
      new ServiceUnavailableException(
        'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
      ),
    );

    const response = await http()
      .post(CLASSIFY_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ text: '牛肉' })
      .expect(503);

    expect(response.body.message).toContain('Agent 设置');
  });
});
