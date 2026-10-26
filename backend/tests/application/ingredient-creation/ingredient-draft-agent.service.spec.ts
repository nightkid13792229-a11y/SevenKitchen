import {
  INestApplication,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  INGREDIENT_AGENT_MAX_TOOL_CALLS,
  INGREDIENT_AGENT_TIMEOUT_MS,
  IngredientDraftAgentService,
  type AgentRunReport,
  type IngredientAgentRunResult,
} from '../../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationAuthorizeService } from '../../../src/application/ingredient-creation/ingredient-creation-authorize.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
import { buildKeywordNameSummary } from '../../../src/application/ingredient-creation/ingredient-name-summary';
import type {
  CandidateSearchResult,
  FinalCheckResult,
  IngredientCreationDraft,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../../../src/application/nutrition-governance/agent-provider-config.service';
import { NUTRITION_FIELD_CATALOG } from '../../../src/domain/ingredient/nutrition-field-catalog';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { IngredientCreationController } from '../../../src/interfaces/controllers/ingredient-creation.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const DRAFT_ID = 'draft-1';
const BASE_URL = 'https://api.deepseek.test';
const MODEL = 'deepseek-v4-flash';
const REVIEW_MODEL = 'deepseek-v4-pro';
const AGENT_PATH = '/api/v1/admin/ingredient-creation/agent/run';
const AGENT_STREAM_PATH = '/api/v1/admin/ingredient-creation/agent/stream';

const EMPTY_CANDIDATE_RESULT: CandidateSearchResult = {
  keywords: ['西洋菜', 'watercress'],
  candidates: [],
  excludedCount: 0,
  coverage: {
    state: 'RAW',
    candidateCount: 0,
    bestCoveragePercent: null,
    bestMissingFieldCount: null,
  },
};

const PASSING_CHECK: FinalCheckResult = {
  blocking: [],
  exceptionable: [],
  warnings: [],
};

const BLOCKING_CHECK: FinalCheckResult = {
  blocking: [
    {
      code: 'REQUIRED_STATE_MISSING',
      message: '缺少必需的熟档案（COOKED），需要补数据或登记例外。',
    },
  ],
  exceptionable: [],
  warnings: [],
};

function createDraft(
  overrides: Partial<IngredientCreationDraft> = {},
): IngredientCreationDraft {
  return {
    id: DRAFT_ID,
    name: '鸡肝',
    type: 'FOOD',
    step: 'INTAKE',
    payload: {},
    createdBy: 'admin-1',
    createdAt: new Date('2026-10-23T00:00:00.000Z'),
    updatedAt: new Date('2026-10-23T00:00:00.000Z'),
    ...overrides,
  };
}

function buildRunReport(
  overrides: Partial<AgentRunReport> = {},
): AgentRunReport {
  return {
    runId: 'run-1',
    draftId: DRAFT_ID,
    text: '鸡肝',
    steps: 1,
    toolCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    durationMs: 10,
    stopReason: null,
    tools: [],
    failedTools: [],
    result: 'FINISHED',
    ...overrides,
  };
}

function draftWithProfile(): IngredientCreationDraft {
  return createDraft({
    payload: {
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'src-1',
          entries: [],
          notes: null,
        },
      ],
    },
  });
}

function buildRuntime(): DeepSeekRuntimeConfig {
  return {
    provider: 'deepseek',
    baseUrl: BASE_URL,
    model: MODEL,
    reviewModel: REVIEW_MODEL,
    apiKey: 'sk-agent-test',
    maxConcurrency: 1,
    requestTimeoutMs: 90_000,
    retryCount: 2,
  };
}

function assistantToolCall(
  name: string,
  args: Record<string, unknown>,
  id = 'call_1',
) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function assistantToolCalls(
  calls: Array<{ name: string; args: Record<string, unknown>; id: string }>,
) {
  return {
    role: 'assistant',
    content: null,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.args) },
    })),
  };
}

function assistantReply(content: string) {
  return { role: 'assistant', content };
}

function chatResponse(
  message: unknown,
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  },
) {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message }],
      ...(usage ? { usage } : {}),
    }),
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

interface HarnessOptions {
  draft?: IngredientCreationDraft | null;
  names?: Array<{ id: string; name: string; sourceType: string }>;
  namesTotal?: number;
  namesKeywords?: string[];
  candidates?: CandidateSearchResult;
  checkResult?: FinalCheckResult;
  runtime?: DeepSeekRuntimeConfig;
  sourceRecords?: Array<{
    id: string;
    status: string;
    foodName?: string;
    foodNameEn?: string | null;
    normalizedNutrition?: unknown;
  }>;
}

function createHarness(options: HarnessOptions = {}) {
  let draft: IngredientCreationDraft | null =
    options.draft === undefined ? createDraft() : options.draft;

  const draftService = {
    create: jest.fn(
      async (input: { name: string; type: 'FOOD'; createdBy: string }) => {
        draft = createDraft({
          id: 'draft-created',
          name: input.name,
          createdBy: input.createdBy,
          payload: {},
        });
        return draft;
      },
    ),
    get: jest.fn(async (id: string) => {
      if (!draft || draft.id !== id) {
        throw new NotFoundException(
          `Ingredient creation draft ${id} not found`,
        );
      }
      return draft;
    }),
    patch: jest.fn(
      async (
        id: string,
        step: IngredientCreationDraft['step'],
        payload: Partial<IngredientCreationDraft['payload']>,
      ) => {
        if (!draft || draft.id !== id) {
          throw new NotFoundException(
            `Ingredient creation draft ${id} not found`,
          );
        }
        draft = {
          ...draft,
          step,
          payload: { ...draft.payload, ...payload },
          updatedAt: new Date(),
        };
        return draft;
      },
    ),
  };

  const candidateService = {
    findCandidates: jest.fn(
      async () => options.candidates ?? EMPTY_CANDIDATE_RESULT,
    ),
    listNutritionNames: jest.fn(async () => ({
      total: options.namesTotal ?? options.names?.length ?? 0,
      names: options.names ?? [],
      keywords: options.namesKeywords ?? ['鸡肝'],
    })),
  };

  const checkService = {
    runCheck: jest.fn(async () => options.checkResult ?? PASSING_CHECK),
  };

  const prisma = {
    nutritionSourceRecord: {
      findUnique: jest.fn(async (query: { where: { id: string } }) => {
        const records = options.sourceRecords ?? [];
        return records.find((record) => record.id === query.where.id) ?? null;
      }),
    },
  };

  const configService = {
    getEnabledDeepSeekRuntimeConfig: jest.fn(
      async (_input: { purpose?: string; fallbackToDefault?: boolean } = {}) =>
        options.runtime ?? buildRuntime(),
    ),
  };

  const nameClassifierService = {
    summarizeNames: jest.fn(async (input: any) => ({
      ...buildKeywordNameSummary(input.items),
      degraded: false,
      notice: null,
    })),
  };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    checkService as unknown as IngredientCreationCheckService,
    prisma as never,
    nameClassifierService as never,
  );

  const agent = new IngredientDraftAgentService(
    configService as unknown as AgentProviderConfigService,
    tools,
    draftService as unknown as IngredientCreationDraftService,
  );

  return {
    agent,
    tools,
    draftService,
    candidateService,
    checkService,
    prisma,
    configService,
    nameClassifierService,
    currentDraft: () => draft,
  };
}

function requestBody(fetchMock: jest.Mock, index: number): any {
  const [, init] = fetchMock.mock.calls[index];
  return JSON.parse(String(init.body));
}

const originalFetch = global.fetch;
let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('IngredientDraftAgentService · 原子工具循环', () => {
  it('模型第一步 searchNames 时工具被调用，名字结果回灌给下一步', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('searchNames', { keyword: '鸡肝' })),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('本地库找到两条生鸡肝来源。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
        {
          id: 'rec-liver-raw-2',
          name: 'Chicken, liver, raw, simmered',
          sourceType: 'CFCT',
        },
      ],
      namesTotal: 42,
      namesKeywords: ['鸡肝', 'Chicken liver'],
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(harness.candidateService.listNutritionNames).toHaveBeenCalledWith({
      keyword: '鸡肝',
      limit: 3000,
    });
    expect(result).toMatchObject({
      draftId: DRAFT_ID,
      reply: '本地库找到两条生鸡肝来源。',
      steps: 2,
      toolCalls: [
        {
          name: 'searchNames',
          args: { keyword: '鸡肝' },
          ok: true,
        },
      ],
    });
    expect(result.toolCalls[0]?.result).toMatchObject({
      total: 42,
      found: true,
    });
    expect((result.toolCalls[0]?.result as any).names[0]).toEqual({
      id: 'rec-liver-raw',
      name: 'Chicken, liver, raw',
      sourceType: 'USDA_FDC',
    });

    // 第二次请求必须把工具结果作为 role=tool 的消息带给模型。
    const second = requestBody(fetchMock, 1);
    const toolMessage = second.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage).toBeDefined();
    expect(toolMessage.tool_call_id).toBe('call_1');
    expect(toolMessage.content).toContain('rec-liver-raw');
    expect(toolMessage.content).toContain('Chicken, liver, raw');
    expect(toolMessage.content).toContain('42');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('tool=searchNames'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('durationMs='));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ok=true'));
  });

  it('查库零命中时工具结果带 found=false，最终回复补上“没找到”和关键词', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('searchNames', { keyword: '西洋菜' })),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('已完成。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      names: [],
      namesTotal: 0,
      namesKeywords: ['西洋菜', 'watercress'],
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加西洋菜',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]?.result).toMatchObject({
      found: false,
      total: 0,
      keywords: ['西洋菜', 'watercress'],
    });
    expect(result.reply).toContain('没有找到匹配词条');
    expect(result.reply).toContain('西洋菜');
    expect(result.reply).toContain('watercress');
  });

  it('模型写非法单位时返回错误文本，模型改对后 runCheck 通过', async () => {
    const badEntry = {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 20,
          unit: '两',
          sourceRecordId: 'src-1',
        },
      ],
    };
    const fixedEntry = {
      profileIndex: 0,
      entries: [
        {
          fieldPath: 'macros.crudeProtein',
          value: 20,
          unit: 'g',
          sourceRecordId: 'src-1',
        },
      ],
    };
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('writeNutrition', badEntry, 'call_bad_unit'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('writeNutrition', fixedEntry, 'call_fixed'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check')),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('已按来源填好粗蛋白，终检通过。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      draft: draftWithProfile(),
      sourceRecords: [
        {
          id: 'src-1',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          foodNameEn: 'Chicken, liver, raw',
          normalizedNutrition: { meta: { sampleState: 'RAW' } },
        },
      ],
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls).toHaveLength(3);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'writeNutrition',
      ok: false,
    });
    expect((result.toolCalls[0]?.result as any).failed[0].error).toContain(
      '单位「两」不合法',
    );
    expect(result.toolCalls[1]).toMatchObject({
      name: 'writeNutrition',
      ok: true,
    });
    expect((result.toolCalls[1]?.result as any).applied).toBe(1);
    expect(result.toolCalls[2]).toMatchObject({ name: 'runCheck', ok: true });

    // 错误文本必须作为 role=tool 的消息回灌给模型，否则它没法自纠。
    const secondRequest = requestBody(fetchMock, 1);
    const feedback = secondRequest.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(feedback.content).toContain('单位');
    expect(feedback.content).toContain('两');

    const draft = harness.currentDraft();
    expect(draft?.payload.profiles?.[0].entries).toEqual([
      expect.objectContaining({
        fieldPath: 'macros.crudeProtein',
        finalValue: 20,
        unit: 'g',
        sourceRecordId: 'src-1',
      }),
    ]);
    expect(harness.checkService.runCheck).toHaveBeenCalledWith(DRAFT_ID);
    expect(result.steps).toBe(4);
    expect(result.reply).toContain('终检通过');
  });

  it('模型调用不存在的工具时返回错误文本，不崩', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('deleteIngredient', { id: 'x' }, 'call_unknown'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('没有这个工具，我停下来。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'deleteIngredient',
      ok: false,
    });
    expect(result.toolCalls[0].error).toContain('未知工具');
    expect(result.toolCalls[0].error).toContain('searchNames');
    expect(result.toolCalls[0].error).toContain('finish');

    const secondRequest = requestBody(fetchMock, 1);
    const toolMessage = secondRequest.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage.content).toContain('未知工具');
    expect(result.steps).toBe(2);
  });

  it('预算常量：工具调用 200 次 / 总时长 10 分钟', () => {
    expect(INGREDIENT_AGENT_MAX_TOOL_CALLS).toBe(200);
    expect(INGREDIENT_AGENT_TIMEOUT_MS).toBe(600_000);
  });

  it('硬保险丝：单轮最多 200 次工具调用，到线即停并保留 transcript', async () => {
    let sourceSequence = 0;
    const fetchMock = jest.fn();
    for (let index = 0; index < INGREDIENT_AGENT_MAX_TOOL_CALLS; index += 1) {
      fetchMock.mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchNames',
            { keyword: '鸡肝' },
            `call_${index + 1}`,
          ),
        ),
      );
    }
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    // 每次检索都返回一个没出现过的来源 id，避免触发「连续无进展」软停止。
    harness.candidateService.listNutritionNames.mockImplementation(async () => {
      sourceSequence += 1;
      return {
        total: 1,
        names: [
          {
            id: `rec-${sourceSequence}`,
            name: `Chicken liver ${sourceSequence}`,
            sourceType: 'USDA_FDC',
          },
        ],
        keywords: ['鸡肝'],
      };
    });

    const result = await harness.agent.run({
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(INGREDIENT_AGENT_MAX_TOOL_CALLS);
    expect(result.steps).toBe(INGREDIENT_AGENT_MAX_TOOL_CALLS);
    expect(result.toolCallCount).toBe(INGREDIENT_AGENT_MAX_TOOL_CALLS);
    expect(result.toolCalls).toHaveLength(INGREDIENT_AGENT_MAX_TOOL_CALLS);
    expect(result.stopReason).toBe('TOOL_CALL_LIMIT');
    expect(result.reply).toContain('我跑到上限了');
    expect(result.reply).toContain(String(INGREDIENT_AGENT_MAX_TOOL_CALLS));
    expect(result.reply).toContain('已完成');
    expect(result.reply).toContain('还没做完');
    expect(result.toolCalls[INGREDIENT_AGENT_MAX_TOOL_CALLS - 1]).toMatchObject(
      {
        name: 'searchNames',
        ok: true,
      },
    );
    expect(
      result.transcript.filter((entry) => entry.type === 'tool_result'),
    ).toHaveLength(INGREDIENT_AGENT_MAX_TOOL_CALLS);
    expect(result.transcript.some((entry) => entry.type === 'limit')).toBe(
      true,
    );
  });

  it('连续 3 次工具调用没有新进展时停止，报告 result=NO_PROGRESS', async () => {
    const fetchMock = jest.fn();
    for (let index = 0; index < 3; index += 1) {
      fetchMock.mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchNames',
            { keyword: '不存在的原料' },
            `call_${index + 1}`,
          ),
        ),
      );
    }
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ names: [], namesTotal: 0 });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.steps).toBe(3);
    expect(result.toolCallCount).toBe(3);
    expect(result.stopReason).toBe('NO_PROGRESS');
    expect(result.report).toMatchObject({
      stopReason: 'NO_PROGRESS',
      result: 'NO_PROGRESS',
      steps: 3,
      toolCalls: 3,
    });
  });

  it('总时长 10 分钟用完时停止，返回“我跑到上限了”，不报 503', async () => {
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = jest.fn(async () => {
      now += 601_000;
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.reply).toContain('我跑到上限了');
    expect(result.steps).toBe(1);
    expect(result.stopReason).toBe('TIMEOUT');
    expect(result.transcript.some((entry) => entry.type === 'limit')).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.report).toMatchObject({
      draftId: DRAFT_ID,
      steps: 1,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      stopReason: 'TIMEOUT',
      result: 'TIMEOUT',
      tools: [],
      failedTools: [],
    });
    expect(result.report.durationMs).toBeGreaterThanOrEqual(601_000);

    nowSpy.mockRestore();
  });

  it('输出上限探测：从小到大，8192 合法就命中并缓存，不再试大值', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('第一次跑完。')))
      .mockResolvedValueOnce(chatResponse(assistantReply('第二次跑完。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const first = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    const second = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '再补一次',
      userId: 'admin-1',
    });

    expect(first.reply).toBe('第一次跑完。');
    expect(second.reply).toBe('第二次跑完。');
    // 未探测成功前默认用 8192，第一档成功就不往上试。
    expect(requestBody(fetchMock, 0).max_tokens).toBe(8192);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第二次 run 直接用缓存值，不重新探测。
    expect(requestBody(fetchMock, 1).max_tokens).toBe(8192);

    const logs = logSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(logs).toContain('maxTokensProbe');
    expect(logs).toContain('selected=8192');
    expect(logs).toContain('tried=8192→16384→32768');
  });

  it('输出上限探测：8192 参数错误后升到 16384，后续调用沿用 16384', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        errorResponse(400, {
          error: { message: 'max_tokens is too large for this model' },
        }),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('第一次跑完。')))
      .mockResolvedValueOnce(chatResponse(assistantReply('第二次跑完。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const first = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    const second = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '再补一次',
      userId: 'admin-1',
    });

    expect(first.reply).toBe('第一次跑完。');
    expect(second.reply).toBe('第二次跑完。');
    expect(requestBody(fetchMock, 0).max_tokens).toBe(8192);
    expect(requestBody(fetchMock, 1).max_tokens).toBe(16384);
    // 第二次 run 直接使用探测结果，不再从 8192 试错。
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestBody(fetchMock, 2).max_tokens).toBe(16384);

    const logs = logSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(logs).toContain('maxTokensProbe');
    expect(logs).toContain('selected=16384');
  });

  it('输出上限探测：无效响应也算失败；全部失败后回落到 8192 并记 probeExhausted', async () => {
    const invalidMessage = chatResponse({
      role: 'assistant',
      content: null,
      tool_calls: [],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(invalidMessage) // 8192：无效响应
      .mockRejectedValueOnce(
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
      ) // 16384：超时
      .mockResolvedValueOnce(invalidMessage) // 32768：无效响应
      .mockResolvedValueOnce(chatResponse(assistantReply('回落到 8192 跑完。')))
      .mockResolvedValueOnce(
        chatResponse(assistantReply('缓存后继续用 8192。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const first = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    const second = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '再跑一次',
      userId: 'admin-1',
    });

    expect(first.reply).toBe('回落到 8192 跑完。');
    expect(second.reply).toBe('缓存后继续用 8192。');
    expect(requestBody(fetchMock, 0).max_tokens).toBe(8192);
    expect(requestBody(fetchMock, 1).max_tokens).toBe(16384);
    expect(requestBody(fetchMock, 2).max_tokens).toBe(32768);
    // 三档都失败后仍用 8192 发起最终请求，而不是把探测失败当成 500。
    expect(requestBody(fetchMock, 3).max_tokens).toBe(8192);
    expect(requestBody(fetchMock, 4).max_tokens).toBe(8192);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const allLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(allLogs).toContain('maxTokensProbe');
    expect(allLogs).toContain('probeExhausted');
    expect(allLogs).toContain('8192');
  });

  it('缓存的 32768 返回无效响应时视为失败，降回 8192 并改缓存', async () => {
    const invalidMessage = chatResponse({
      role: 'assistant',
      content: null,
      tool_calls: [],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(invalidMessage) // 8192 无效
      .mockResolvedValueOnce(invalidMessage) // 16384 无效
      .mockResolvedValueOnce(chatResponse(assistantReply('先用 32768 跑完。')))
      .mockResolvedValueOnce(invalidMessage) // 缓存的 32768 这次无效
      .mockResolvedValueOnce(chatResponse(assistantReply('降回 8192 跑完。')))
      .mockResolvedValueOnce(chatResponse(assistantReply('继续用 8192。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const first = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    const second = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '再跑一次',
      userId: 'admin-1',
    });
    const third = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '第三次',
      userId: 'admin-1',
    });

    expect(first.reply).toBe('先用 32768 跑完。');
    expect(second.reply).toBe('降回 8192 跑完。');
    expect(third.reply).toBe('继续用 8192。');
    expect([
      requestBody(fetchMock, 0).max_tokens,
      requestBody(fetchMock, 1).max_tokens,
      requestBody(fetchMock, 2).max_tokens,
      requestBody(fetchMock, 3).max_tokens,
      requestBody(fetchMock, 4).max_tokens,
      requestBody(fetchMock, 5).max_tokens,
    ]).toEqual([8192, 16384, 32768, 32768, 8192, 8192]);
    expect(fetchMock).toHaveBeenCalledTimes(6);

    const allLogs = [...logSpy.mock.calls, ...warnSpy.mock.calls]
      .map((args) => args.map(String).join(' '))
      .join('\n');
    expect(allLogs).toContain('cachedRejected');
    expect(allLogs).toContain('selected=8192');
  });

  it('单次模型调用最多 90 秒：超时按失败升档重试，不跟随 600 秒总时长', async () => {
    jest.useFakeTimers();
    const abortedAt: number[] = [];
    const startedAt = Date.now();
    const fetchMock = jest.fn((_url: string, init: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener(
            'abort',
            () => {
              abortedAt.push(Date.now() - startedAt);
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              );
            },
            { once: true },
          );
        });
      }
      return Promise.resolve(
        chatResponse(assistantReply('超时后升到 16384 跑完。')),
      );
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      runtime: { ...buildRuntime(), requestTimeoutMs: 600_000 },
    });
    const runPromise = harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    await jest.advanceTimersByTimeAsync(89_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(abortedAt).toEqual([]);

    // 第 90 秒：这一次请求被强制中止，按失败处理并升档重试。
    await jest.advanceTimersByTimeAsync(1);
    expect(abortedAt).toEqual([90_000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock, 0).max_tokens).toBe(8192);
    expect(requestBody(fetchMock, 1).max_tokens).toBe(16384);

    const result = await runPromise;
    expect(result.reply).toBe('超时后升到 16384 跑完。');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('连续单次超时最终让该步失败，不会一直等到 600 秒总时长', async () => {
    jest.useFakeTimers();
    const abortedAt: number[] = [];
    const startedAt = Date.now();
    const fetchMock = jest.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener(
          'abort',
          () => {
            abortedAt.push(Date.now() - startedAt);
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          },
          { once: true },
        );
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      runtime: {
        ...buildRuntime(),
        reviewModel: MODEL,
        requestTimeoutMs: 600_000,
      },
    });
    const runPromise = harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    const rejection = expect(runPromise).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    // 8192 / 16384 / 32768 / 回落 8192 各最多等 90 秒。
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await jest.advanceTimersByTimeAsync(90_000);
    }

    await rejection;
    expect(abortedAt).toEqual([90_000, 180_000, 270_000, 360_000]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect([
      requestBody(fetchMock, 0).max_tokens,
      requestBody(fetchMock, 1).max_tokens,
      requestBody(fetchMock, 2).max_tokens,
      requestBody(fetchMock, 3).max_tokens,
    ]).toEqual([8192, 16384, 32768, 8192]);
  });

  it('实际使用回落配置时 WARN 建议单独启用 INGREDIENT_INTAKE', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(assistantReply('回落到设计配置也跑完。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    harness.configService.getEnabledDeepSeekRuntimeConfig.mockImplementation(
      async (
        input: {
          purpose?: string;
          fallbackToDefault?: boolean;
        } = {},
      ) => {
        if (
          input.purpose === 'INGREDIENT_INTAKE' ||
          input.purpose === 'DEFAULT'
        ) {
          throw new Error(`DeepSeek Agent 设置未启用：${input.purpose}`);
        }
        return buildRuntime();
      },
    );

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.reply).toBe('回落到设计配置也跑完。');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('purpose=RECIPE_DESIGN'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('建议单独启用 INGREDIENT_INTAKE 配置'),
    );
  });

  it('模型不支持 tools 时退化为 JSON 动作模式，并在报文里去掉 tools 参数', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        errorResponse(400, {
          error: { message: 'tools is not supported by this model' },
        }),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantReply(JSON.stringify({ reply: 'JSON 动作模式也能回话。' })),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.mode).toBe('JSON_ACTION');
    expect(result.reply).toBe('JSON 动作模式也能回话。');
    expect(result.steps).toBe(1);

    const first = requestBody(fetchMock, 0);
    expect(first.tools).toBeDefined();
    const second = requestBody(fetchMock, 1);
    expect(second.tools).toBeUndefined();
    expect(second.response_format).toEqual({ type: 'json_object' });
    expect(second.messages).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('JSON 动作'));
  });

  it('没有 draftId 时先建草稿，再在草稿上跑循环', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(assistantReply('草稿已建好。')),
      ) as any;

    const harness = createHarness({ draft: null });
    const result = await harness.agent.run({
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(harness.draftService.create).toHaveBeenCalledWith({
      name: '帮我加鸡肝',
      type: 'FOOD',
      createdBy: 'admin-1',
    });
    expect(result.draftId).toBe('draft-created');
    expect(result.reply).toBe('草稿已建好。');
  });

  it('字段不在目录、来源不存在时都返回错误文本，且不写入草稿', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 0,
              entries: [
                {
                  fieldPath: 'macros.notAField',
                  value: 20,
                  unit: 'g',
                  sourceRecordId: 'src-1',
                },
              ],
            },
            'call_bad_field',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 0,
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 20,
                  unit: 'g',
                  sourceRecordId: 'missing-source',
                },
              ],
            },
            'call_missing_source',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('字段和来源都不对，我停下来问用户。')),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({ draft: draftWithProfile() });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls).toHaveLength(2);
    expect((result.toolCalls[0]?.result as any).failed[0].error).toContain(
      '不在营养字段目录',
    );
    expect((result.toolCalls[1]?.result as any).failed[0].error).toContain(
      '不存在',
    );
    expect(harness.currentDraft()?.payload.profiles?.[0].entries).toEqual([]);

    const secondRequest = requestBody(fetchMock, 1);
    const feedback = secondRequest.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(feedback.content).toContain('不在营养字段目录');
  });

  it('草稿还没有档案时，第一次写入按来源记录自动建档案（状态不猜）', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 20,
                  unit: 'g',
                  sourceRecordId: 'src-1',
                },
              ],
            },
            'call_first_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check')),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('已建生档案并填好粗蛋白，终检通过。')),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: createDraft(),
      sourceRecords: [
        {
          id: 'src-1',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          foodNameEn: 'Chicken, liver, raw',
          normalizedNutrition: { meta: { sampleState: 'RAW' } },
        },
      ],
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    const profiles = harness.currentDraft()?.payload.profiles ?? [];
    expect(profiles).toHaveLength(1);
    expect(profiles[0].preparationState).toBe('RAW');
    expect(profiles[0].sourceRecordId).toBe('src-1');
    expect(profiles[0].entries).toEqual([
      expect.objectContaining({
        fieldPath: 'macros.crudeProtein',
        finalValue: 20,
        unit: 'g',
      }),
    ]);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);
    expect(result.steps).toBe(3);
  });

  it('没有来源的写入被拒：模型拿到错误文本后不会落库', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 20,
                  unit: 'g',
                },
              ],
            },
            'call_no_source',
          ),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('先去查来源。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({ draft: createDraft() });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect((result.toolCalls[0]?.result as any).failed[0].error).toContain(
      'sourceRecordId',
    );
    expect(harness.currentDraft()?.payload.profiles).toBeUndefined();
  });

  it('完整一轮：查名字 → 单位改对 → 终检缺熟 → 补熟档案 → 终检通过 → finish', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_search'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 0,
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 19.5,
                  unit: 'mg',
                  sourceRecordId: 'rec-liver-raw',
                },
              ],
            },
            'call_bad_unit',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 0,
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 19.5,
                  unit: 'g',
                  sourceRecordId: 'rec-liver-raw',
                },
              ],
            },
            'call_fix_unit',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check_1')),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 1,
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 25.1,
                  unit: 'g',
                  sourceRecordId: 'rec-liver-cooked',
                },
              ],
            },
            'call_cooked',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check_2')),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'finish',
            { summary: '生熟两份档案都填好粗蛋白，终检通过，请人工审核。' },
            'call_finish',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: createDraft(),
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
        {
          id: 'rec-liver-cooked',
          name: 'Chicken, liver, cooked, simmered',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 2,
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          foodNameEn: 'Chicken, liver, raw',
          normalizedNutrition: { meta: { sampleState: 'RAW' } },
        },
        {
          id: 'rec-liver-cooked',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, cooked, simmered',
          foodNameEn: 'Chicken, liver, cooked, simmered',
          normalizedNutrition: { meta: { sampleState: 'COOKED' } },
        },
      ],
    });

    harness.checkService.runCheck
      .mockResolvedValueOnce(BLOCKING_CHECK)
      .mockResolvedValueOnce({
        blocking: [],
        exceptionable: [],
        warnings: [
          {
            code: 'ENERGY_CROSS_CHECK_DEVIATION',
            message: '能量与按 4/9/4 反算的值偏差 12.0%，超过 10%。',
          },
        ],
      });

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(result.steps).toBe(7);
    expect(result.toolCalls.map((call) => call.name)).toEqual([
      'searchNames',
      'writeNutrition',
      'writeNutrition',
      'runCheck',
      'writeNutrition',
      'runCheck',
      'finish',
    ]);
    expect((result.toolCalls[1]?.result as any).failed[0].error).toContain(
      '单位',
    );
    expect(result.toolCalls.slice(2).every((call) => call.ok)).toBe(true);
    expect(result.reply).toContain('终检通过');

    const profiles = harness.currentDraft()?.payload.profiles ?? [];
    expect(profiles.map((profile) => profile.preparationState)).toEqual([
      'RAW',
      'COOKED',
    ]);
    expect(profiles.map((profile) => profile.entries[0].finalValue)).toEqual([
      19.5, 25.1,
    ]);
    expect(harness.checkService.runCheck).toHaveBeenCalledTimes(2);
    // finish 之后不再请求模型。
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('模型调用链：searchNames → getRecord → writeNutrition → finish', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_search'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'getRecord',
            { id: 'rec-liver-raw' },
            'call_record',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 19.5,
                  unit: 'g',
                  sourceRecordId: 'rec-liver-raw',
                },
              ],
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'finish',
            { summary: '已把来源里的粗蛋白 19.5 g 写进草稿。' },
            'call_finish',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: createDraft(),
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 1,
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          foodNameEn: 'Chicken, liver, raw',
          normalizedNutrition: {
            meta: { rawBasisType: 'PER_100_G', sampleState: 'RAW' },
            macros: {
              energyKcal: 120,
              crudeProtein: 19.5,
              crudeFat: null,
              moisture: null,
            },
            minerals: { calcium: 120, selenium: 0.25 },
          },
        },
      ],
    });

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(result.steps).toBe(4);
    expect(result.toolCalls.map((call) => call.name)).toEqual([
      'searchNames',
      'getRecord',
      'writeNutrition',
      'finish',
    ]);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);

    const first = requestBody(fetchMock, 0);
    expect(first.tools.map((tool: any) => tool.function.name)).toContain(
      'getRecord',
    );

    const third = requestBody(fetchMock, 2);
    const toolMessages = third.messages.filter(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[1].content).toContain('macros.crudeProtein');
    expect(toolMessages[1].content).toContain('19.5');
    expect(toolMessages[1].content).toContain('"unit":"g"');

    const profiles = harness.currentDraft()?.payload.profiles ?? [];
    expect(profiles).toHaveLength(1);
    expect(profiles[0].preparationState).toBe('RAW');
    expect(profiles[0].entries[0]).toMatchObject({
      fieldPath: 'macros.crudeProtein',
      finalValue: 19.5,
      unit: 'g',
      sourceRecordId: 'rec-liver-raw',
    });
    expect(result.reply).toContain('19.5');
  });

  it('模型可以自由决定顺序：跳过检索，直接 getRecord → writeNutrition → finish', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'getRecord',
            { id: 'rec-liver-raw' },
            'call_record',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'writeNutrition',
            {
              profileIndex: 0,
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 19.5,
                  unit: 'g',
                  sourceRecordId: 'rec-liver-raw',
                },
              ],
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('finish', {}, 'call_finish')),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: draftWithProfile(),
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          normalizedNutrition: {
            meta: { sampleState: 'RAW' },
            macros: { crudeProtein: 19.5 },
          },
        },
      ],
    });

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls.map((call) => call.name)).toEqual([
      'getRecord',
      'writeNutrition',
      'finish',
    ]);
    expect(harness.candidateService.listNutritionNames).not.toHaveBeenCalled();
    expect(result.steps).toBe(3);
    // finish 没给 summary、assistant 也没正文 → 中性收尾。
    expect(result.reply).toBe('本轮已完成。');
    expect(harness.currentDraft()?.payload.profiles?.[0].entries).toHaveLength(
      1,
    );
  });

  it('finish 与其它工具出现在同一条回复里：finish 之后的不再执行', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      chatResponse(
        assistantToolCalls([
          {
            name: 'finish',
            args: { summary: '先结束。' },
            id: 'call_finish',
          },
          {
            name: 'writeNutrition',
            args: {
              entries: [
                {
                  fieldPath: 'macros.crudeProtein',
                  value: 20,
                  unit: 'g',
                  sourceRecordId: 'src-1',
                },
              ],
            },
            id: 'call_after_finish',
          },
        ]),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({ draft: draftWithProfile() });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls.map((call) => call.name)).toEqual(['finish']);
    expect(result.reply).toBe('先结束。');
    expect(harness.currentDraft()?.payload.profiles?.[0].entries).toEqual([]);
  });

  it('运行报告：成功时返回完整 AgentRunReport（含 token 与工具）并写日志', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_1'),
          { total_tokens: 120, prompt_tokens: 100, completion_tokens: 20 },
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('finish', { summary: '好了。' }, 'call_2'),
          {
            total_tokens: 80,
            prompt_tokens: 60,
            completion_tokens: 20,
          },
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 1,
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.report).toMatchObject({
      draftId: DRAFT_ID,
      text: '鸡肝',
      steps: 2,
      toolCalls: 2,
      tokensIn: 160,
      tokensOut: 40,
      stopReason: null,
      tools: ['searchNames', 'finish'],
      failedTools: [],
      result: 'FINISHED',
    });
    expect(typeof result.report.runId).toBe('string');
    expect(result.report.runId.length).toBeGreaterThan(0);
    expect(result.report.durationMs).toBeGreaterThanOrEqual(0);

    const reportLog = logSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .find((line) => line.includes('runReport'));
    expect(reportLog).toBeDefined();
    const reportJson = JSON.parse(
      String(reportLog).slice(String(reportLog).indexOf('{')),
    );
    expect(reportJson).toMatchObject({
      draftId: DRAFT_ID,
      result: 'FINISHED',
      tokensIn: 160,
      tokensOut: 40,
    });
  });

  it('运行报告：失败工具进 failedTools，整体仍算 FINISHED', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('deleteIngredient', { id: 'x' }, 'call_bad'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('没有这个工具，我停下来。')),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.report.result).toBe('FINISHED');
    expect(result.report.tools).toEqual(['deleteIngredient']);
    expect(result.report.failedTools).toHaveLength(1);
    expect(result.report.failedTools[0]).toMatchObject({
      name: 'deleteIngredient',
    });
    expect(result.report.failedTools[0].error).toContain('未知工具');
  });

  it('运行报告：模型失败时 result=ERROR，error 事件与日志都带报告', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_1'),
          { total_tokens: 50, prompt_tokens: 40, completion_tokens: 10 },
        ),
      )
      .mockResolvedValue(errorResponse(500, { error: { message: 'boom' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 1,
    });
    const events: any[] = [];
    await expect(
      harness.agent.run(
        { draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1' },
        (event) => events.push(event),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(events.map((event) => event.type)).toEqual([
      'step_start',
      'step_end',
      'error',
    ]);
    const report: AgentRunReport = events[2].report;
    expect(report).toMatchObject({
      draftId: DRAFT_ID,
      text: '鸡肝',
      steps: 2,
      toolCalls: 1,
      tokensIn: 40,
      tokensOut: 10,
      stopReason: 'ERROR',
      tools: ['searchNames'],
      failedTools: [],
      result: 'ERROR',
    });

    const reportLog = logSpy.mock.calls
      .map((args) => args.map(String).join(' '))
      .find((line) => line.includes('runReport'));
    expect(reportLog).toBeDefined();
    expect(reportLog).toContain('"result":"ERROR"');
  });

  it('系统提示词引用 skill 要点：原子工具 + 模糊词先汇总 + 生熟多选 + 来源必填', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    const system = String(requestBody(fetchMock, 0).messages[0].content);
    expect(system).toContain('skills/ingredient-agent/SKILL.md');
    expect(system).toContain('searchNames');
    expect(system).toContain('summarizeByKeyword');
    expect(system).toContain('生 + 熟都要');
    expect(system).toContain('都不对，我直接说');
    expect(system).toContain('sourceRecordId');
    expect(system).toContain('finish');
    expect(system).not.toContain('searchLocalNutrition');
    expect(system).not.toContain('candidateNarrowing');
  });
});

describe('IngredientDraftAgentService · askUser（无流程闸门）', () => {
  it('模型调用 askUser 时存下 pendingQuestion，事件以 ask + done 收尾', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      chatResponse(
        assistantToolCall('askUser', {
          question: '你要生的还是熟的？',
          options: ['生的', '熟的', '生 + 熟都要'],
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    const events: any[] = [];
    const result = await harness.agent.run(
      {
        draftId: DRAFT_ID,
        text: '帮我加鸡肝',
        userId: 'admin-1',
      },
      (event) => events.push(event),
    );

    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion).toMatchObject({
      question: '你要生的还是熟的？',
      options: ['生的', '熟的', '生 + 熟都要'],
    });
    expect(result.toolCalls[0]?.name).toBe('askUser');
    expect(harness.currentDraft()?.payload.pendingQuestion).toMatchObject({
      question: '你要生的还是熟的？',
    });

    expect(events.map((event) => event.type)).toEqual([
      'step_start',
      'step_end',
      'ask',
      'done',
    ]);
    expect(events[2]).toMatchObject({
      type: 'ask',
      question: '你要生的还是熟的？',
      options: ['生的', '熟的', '生 + 熟都要'],
      draftId: DRAFT_ID,
    });
  });

  it('旧草稿里有 narrowing.required=true 也不拦 askUser', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      chatResponse(
        assistantToolCall('askUser', {
          question: '你要哪个部位？',
          options: ['牛绞肉', '牛肩肉'],
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: createDraft({
        payload: {
          candidateNarrowing: {
            required: true,
            selectedGroupKey: null,
            question: '要哪个部位？',
            options: ['ground', 'chuck'],
            choices: [],
            groups: [],
          } as never,
        },
      }),
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.question).toBe('你要哪个部位？');
  });

  it('带同一 draftId 回答时，提示词包含问题与回答，并清空 pendingQuestion', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的，按熟的来。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      draft: createDraft({
        payload: {
          pendingQuestion: {
            question: '你要生的还是熟的？',
            options: ['生的', '熟的'],
            askedAt: '2026-10-25T00:00:00.000Z',
          },
        },
      }),
    });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '熟的',
      userId: 'admin-1',
    });

    const body = requestBody(fetchMock, 0);
    const userMessage = body.messages.find(
      (message: any) => message.role === 'user',
    );
    expect(userMessage.content).toContain('你刚问：你要生的还是熟的？');
    expect(userMessage.content).toContain('用户答：熟的');
    expect(harness.currentDraft()?.payload.pendingQuestion).toBeNull();
    expect(result.reply).toBe('好的，按熟的来。');
  });

  it('askUser 选项少于 2 个时返回错误文本，不写 pendingQuestion', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('askUser', {
            question: '选一个？',
            options: ['只有一个'],
          }),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('我重新问。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]?.ok).toBe(false);
    expect(result.toolCalls[0]?.error).toContain('2–5');
    expect(harness.currentDraft()?.payload.pendingQuestion).toBeUndefined();
    expect(result.stopReason).toBeNull();
  });

  it('ask 事件带选项的库内核实标记：未收录的保留并带后缀', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      chatResponse(
        assistantToolCall('askUser', {
          question: '要哪一条？',
          options: ['鸡肝', '鸭肝'],
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    harness.candidateService.findCandidates.mockImplementation(
      async (input: { name: string }) => ({
        ...EMPTY_CANDIDATE_RESULT,
        candidates:
          input.name === '鸡肝'
            ? [
                {
                  sourceRecordId: 'rec-liver-raw',
                  sourceType: 'USDA_FDC',
                  foodName: 'Chicken, liver, raw',
                  foodNameEn: 'Chicken, liver, raw',
                  preparationState: 'RAW',
                  cookingMethod: null,
                  coveragePercent: 80,
                  missingFields: [],
                  matchScore: 0.9,
                  matchedBy: 'EN_EXACT',
                  matchedKeyword: input.name,
                  matchedSourceName: 'Chicken, liver, raw',
                  notes: [],
                },
              ]
            : [],
      }),
    );

    const events: any[] = [];
    await harness.agent.run(
      {
        draftId: DRAFT_ID,
        text: '鸡肝还是鸭肝',
        userId: 'admin-1',
      },
      (event) => events.push(event),
    );

    const ask = events.find((event) => event.type === 'ask');
    expect(ask.optionChecks[0]).toMatchObject({
      label: '鸡肝',
      inLibrary: true,
      matchedName: 'Chicken, liver, raw',
    });
    expect(ask.optionChecks[1]).toMatchObject({
      label: '鸭肝',
      inLibrary: false,
    });
    expect(ask.optionChecks[1].displayLabel).toContain('去线上找');
  });

  it('所有选项都查不到时也照常提问，不再退回错误文本', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      chatResponse(
        assistantToolCall('askUser', {
          question: '要哪一条？',
          options: ['不存在的甲', '不存在的乙'],
        }),
      ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '不存在的原料',
      userId: 'admin-1',
    });

    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.options).toEqual([
      '不存在的甲',
      '不存在的乙',
    ]);
  });
});

describe('IngredientDraftAgentService · 流式事件', () => {
  it('3 次工具调用按 step_start → step_end → … → reply → done 发事件', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_1'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_2')),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('finish', { summary: '好了。' }, 'call_3'),
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 1,
    });
    const events: any[] = [];
    await harness.agent.run(
      { draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1' },
      (event) => events.push(event),
    );

    expect(events.map((event) => event.type)).toEqual([
      'step_start',
      'step_end',
      'step_start',
      'step_end',
      'step_start',
      'step_end',
      'reply',
      'done',
    ]);
    expect(events[0]).toMatchObject({
      type: 'step_start',
      index: 1,
      name: 'searchNames',
    });
    expect(events[1]).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
      found: true,
      resultSummary: '列出 1 条名字（返回 1 条）',
    });
    expect(events[4]).toMatchObject({
      type: 'step_start',
      name: 'finish',
    });
    expect(events[6]).toMatchObject({
      type: 'reply',
      reply: '好了。',
    });
  });

  it('查库 step_end 带 matches / keywords，读记录带 record 摘要', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '鸡肝' }, 'call_1'),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('getRecord', { id: 'rec-liver-raw' }, 'call_2'),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('看完了。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      names: [
        {
          id: 'rec-liver-raw',
          name: 'Chicken, liver, raw',
          sourceType: 'USDA_FDC',
        },
      ],
      namesTotal: 7,
      namesKeywords: ['鸡肝', 'Chicken liver'],
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          normalizedNutrition: {
            meta: { sampleState: 'RAW' },
            macros: { crudeProtein: 19.5 },
          },
        },
      ],
    });
    const events: any[] = [];
    await harness.agent.run(
      { draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1' },
      (event) => events.push(event),
    );

    const searchEnd = events[1];
    expect(searchEnd).toMatchObject({
      type: 'step_end',
      ok: true,
      found: true,
      keywords: ['鸡肝', 'Chicken liver'],
      candidateCount: 7,
      totalCandidates: 7,
    });
    expect(searchEnd.matches).toEqual([
      {
        name: 'Chicken, liver, raw',
        matchedBy: 'NAME',
        matchedKeyword: '鸡肝',
        score: null,
      },
    ]);
    const recordEnd = events[3];
    expect(recordEnd.record).toMatchObject({
      name: 'Chicken, liver, raw',
      valueCount: 1,
    });
  });

  it('查库零命中时 step_end 带空 matches 与本次实际关键词', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchNames', { keyword: '西洋菜' }, 'call_1'),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('没找到。')));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness({
      names: [],
      namesTotal: 0,
      namesKeywords: ['西洋菜', 'watercress'],
    });
    const events: any[] = [];
    await harness.agent.run(
      { draftId: DRAFT_ID, text: '西洋菜', userId: 'admin-1' },
      (event) => events.push(event),
    );

    expect(events[1]).toMatchObject({
      type: 'step_end',
      ok: true,
      found: false,
      matches: [],
      keywords: ['西洋菜', 'watercress'],
    });
  });

  it('模型失败时只发 error，不带 done；原异常仍按 503 抛出', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(errorResponse(500, { error: { message: 'boom' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const harness = createHarness();
    const events: any[] = [];
    await expect(
      harness.agent.run(
        { draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1' },
        (event) => events.push(event),
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(events[0].message).toBeTruthy();
  });
});

describe('POST /api/v1/admin/ingredient-creation/agent/run', () => {
  let app: INestApplication;
  let agentService: { run: jest.Mock };

  beforeEach(async () => {
    agentService = { run: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [IngredientCreationController],
      providers: [
        { provide: IngredientCreationDraftService, useValue: {} },
        { provide: IngredientCreationCandidateService, useValue: {} },
        { provide: IngredientCreationOnlineService, useValue: {} },
        { provide: IngredientCreationMergeService, useValue: {} },
        { provide: IngredientCreationCheckService, useValue: {} },
        { provide: IngredientCreationAuthorizeService, useValue: {} },
        { provide: IngredientCreationAuditService, useValue: {} },
        { provide: IngredientCreationIntakeService, useValue: {} },
        { provide: IngredientDraftAgentService, useValue: agentService },
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

  it('未登录 → 401，且不调用起草服务', async () => {
    await http().post(AGENT_PATH).send({ text: '鸡肝' }).expect(401);

    expect(agentService.run).not.toHaveBeenCalled();
  });

  it('已登录时把 draftId / text / userId 交给服务，并用 ApiResponseDto 包裹', async () => {
    const runResult: IngredientAgentRunResult = {
      draftId: DRAFT_ID,
      reply: '已填好。',
      toolCalls: [],
      steps: 1,
      toolCallCount: 0,
      transcript: [],
      mode: 'FUNCTION_CALLING',
      stopReason: null,
      report: buildRunReport(),
    };
    agentService.run.mockResolvedValue(runResult);

    const response = await http()
      .post(AGENT_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ draftId: DRAFT_ID, text: '鸡肝' })
      .expect(201);

    expect(agentService.run).toHaveBeenCalledWith({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });
    expect(response.body).toEqual({
      code: 0,
      message: 'Success',
      data: runResult,
    });
  });

  it('缺少 text → 400，且不调用起草服务', async () => {
    await http()
      .post(AGENT_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ draftId: DRAFT_ID })
      .expect(400);

    expect(agentService.run).not.toHaveBeenCalled();
  });

  it('流式接口未登录 → 401', async () => {
    await http().post(AGENT_STREAM_PATH).send({ text: '鸡肝' }).expect(401);

    expect(agentService.run).not.toHaveBeenCalled();
  });

  it('流式接口返回 text/event-stream，逐条 flush 事件并以 done 收尾', async () => {
    agentService.run.mockImplementation(async (input: any) => {
      expect(typeof input.onEvent).toBe('function');
      input.onEvent({
        type: 'step_start',
        index: 1,
        name: 'runCheck',
        summary: '跑终检',
      });
      input.onEvent({
        type: 'step_end',
        index: 1,
        ok: true,
        resultSummary: '终检通过',
      });
      input.onEvent({
        type: 'reply',
        reply: '好了。',
        draftId: DRAFT_ID,
        steps: 2,
        toolCallCount: 1,
      });
      input.onEvent({ type: 'done' });
      return {
        draftId: DRAFT_ID,
        reply: '好了。',
        toolCalls: [],
        steps: 2,
        toolCallCount: 1,
        transcript: [],
        mode: 'FUNCTION_CALLING',
        stopReason: null,
        report: buildRunReport({ steps: 2, toolCalls: 1 }),
      } as IngredientAgentRunResult;
    });

    const response = await http()
      .post(AGENT_STREAM_PATH)
      .set('Authorization', 'Bearer admin-token')
      .send({ draftId: DRAFT_ID, text: '鸡肝' })
      .buffer(true)
      .parse((res: any, callback: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () =>
          callback(null, Buffer.concat(chunks).toString('utf8')),
        );
      })
      .expect(200);

    expect(String(response.headers['content-type'])).toContain(
      'text/event-stream',
    );
    expect(agentService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: DRAFT_ID,
        text: '鸡肝',
        userId: 'admin-1',
        onEvent: expect.any(Function),
      }),
    );

    const frames = String(response.body)
      .split('\n\n')
      .map((frame) => frame.trim())
      .filter(Boolean);
    const events = frames.map((frame) => {
      expect(frame.startsWith('data: ')).toBe(true);
      return JSON.parse(frame.slice('data: '.length));
    });
    expect(events.map((event) => event.type)).toEqual([
      'step_start',
      'step_end',
      'reply',
      'done',
    ]);
    expect(events[0]).toMatchObject({
      type: 'step_start',
      index: 1,
      name: 'runCheck',
    });
    expect(events[1]).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
    });
    expect(events[2]).toMatchObject({
      type: 'reply',
      draftId: DRAFT_ID,
      steps: 2,
      toolCallCount: 1,
    });
  });

  it('控制器收到一条事件就写一帧（不攒到结束）', async () => {
    const chunks: string[] = [];
    const flush = jest.fn();
    let ended = false;
    const fakeResponse = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      on: jest.fn(),
      flush,
      write: jest.fn((chunk: string) => {
        chunks.push(chunk);
        return true;
      }),
      end: jest.fn(() => {
        ended = true;
      }),
      get writableEnded() {
        return ended;
      },
    };

    agentService.run.mockImplementation(async (input: any) => {
      input.onEvent({
        type: 'step_start',
        index: 1,
        name: 'runCheck',
        summary: '跑终检',
      });
      // 工具还没结束，第一帧必须已经写出去了。
      expect(chunks).toHaveLength(1);
      input.onEvent({
        type: 'step_end',
        index: 1,
        ok: true,
        resultSummary: '终检通过',
      });
      expect(chunks).toHaveLength(2);
      input.onEvent({
        type: 'reply',
        reply: '好了。',
        draftId: DRAFT_ID,
        steps: 1,
        toolCallCount: 1,
      });
      input.onEvent({ type: 'done' });
      return {
        draftId: DRAFT_ID,
        reply: '好了。',
        toolCalls: [],
        steps: 1,
        toolCallCount: 1,
        transcript: [],
        mode: 'FUNCTION_CALLING',
        stopReason: null,
        report: buildRunReport({ steps: 2, toolCalls: 1 }),
      } as IngredientAgentRunResult;
    });

    const controller = app.get(IngredientCreationController);
    await controller.streamAgent(
      { draftId: DRAFT_ID, text: '鸡肝' },
      { userId: 'admin-1', customerId: 'admin-1', role: 'ADMIN' },
      fakeResponse as never,
    );

    expect(chunks).toHaveLength(4);
    expect(flush).toHaveBeenCalledTimes(4);
    expect(chunks[0]).toBe(
      'data: {"type":"step_start","index":1,"name":"runCheck","summary":"跑终检"}\n\n',
    );
    expect(ended).toBe(true);
  });
});
