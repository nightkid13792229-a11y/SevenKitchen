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
  IngredientDraftAgentService,
  type IngredientAgentRunResult,
} from '../../../src/application/ingredient-creation/ingredient-draft-agent.service';
import { IngredientCandidateReviewService } from '../../../src/application/ingredient-creation/ingredient-candidate-review.service';
import { IngredientCreationAuditService } from '../../../src/application/ingredient-creation/ingredient-creation-audit.service';
import { IngredientCreationCandidateService } from '../../../src/application/ingredient-creation/ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from '../../../src/application/ingredient-creation/ingredient-creation-check.service';
import { IngredientCreationCommitService } from '../../../src/application/ingredient-creation/ingredient-creation-commit.service';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import { IngredientCreationIntakeService } from '../../../src/application/ingredient-creation/ingredient-creation-intake.service';
import { IngredientCreationMergeService } from '../../../src/application/ingredient-creation/ingredient-creation-merge.service';
import { IngredientCreationOnlineService } from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { IngredientCreationToolsService } from '../../../src/application/ingredient-creation/ingredient-creation-tools.service';
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

const CANDIDATE_RESULT: CandidateSearchResult = {
  keywords: ['鸡肝', 'Chicken liver'],
  candidates: [
    {
      sourceRecordId: 'rec-liver-raw',
      sourceType: 'USDA_FDC',
      foodName: 'Chicken, liver, raw',
      foodNameEn: 'Chicken, liver, raw',
      preparationState: 'RAW',
      cookingMethod: null,
      coveragePercent: 82,
      missingFields: ['minerals.iodine'],
      matchScore: 0.9,
      matchedBy: 'EN_PARTIAL',
      matchedKeyword: 'Chicken liver',
      matchedSourceName: 'Chicken, liver, raw',
      notes: [],
    },
  ],
  excludedCount: 0,
  coverage: {
    state: 'RAW',
    candidateCount: 1,
    bestCoveragePercent: 82,
    bestMissingFieldCount: 1,
  },
};

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

function chatResponse(message: unknown, usage?: { total_tokens: number }) {
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
    findCandidates: jest.fn(async () => options.candidates ?? CANDIDATE_RESULT),
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
      async () => options.runtime ?? buildRuntime(),
    ),
  };

  const reviewService: { reviewCandidates: jest.Mock } = {
    reviewCandidates: jest.fn(
      async (input: { candidates: Array<{ id: string }> }) =>
        input.candidates.map((candidate) => ({
          id: candidate.id,
          verdict: 'RELEVANT' as const,
          reason: '就是目标食材',
        })),
    ),
  };

  const tools = new IngredientCreationToolsService(
    candidateService as unknown as IngredientCreationCandidateService,
    draftService as unknown as IngredientCreationDraftService,
    checkService as unknown as IngredientCreationCheckService,
    prisma as never,
    reviewService as unknown as IngredientCandidateReviewService,
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
    reviewService,
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
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe('IngredientDraftAgentService · 工具循环', () => {
  it('模型第一步请求 searchLocalNutrition 时工具被调用，结果回灌给下一步', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchLocalNutrition', {
            keyword: '鸡肝',
            state: 'RAW',
          }),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('本地库找到一条生鸡肝来源，覆盖率 82%。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(harness.candidateService.findCandidates).toHaveBeenCalledWith({
      name: '鸡肝',
      state: 'RAW',
    });

    expect(result).toMatchObject({
      draftId: DRAFT_ID,
      reply: '本地库找到一条生鸡肝来源，覆盖率 82%。',
      steps: 2,
      toolCalls: [
        {
          name: 'searchLocalNutrition',
          args: { keyword: '鸡肝', state: 'RAW' },
          ok: true,
        },
      ],
    });
    // 工具调用记录要带上结构化结果，页面才能展开「匹配依据」。
    expect(result.toolCalls[0]?.result).toMatchObject({
      found: true,
      keywords: ['鸡肝', 'Chicken liver'],
      candidates: [
        {
          foodName: 'Chicken, liver, raw',
          matchedBy: 'EN_PARTIAL',
          matchedKeyword: 'Chicken liver',
          score: 0.9,
        },
      ],
    });

    // 第二次请求必须把「工具返回」作为 role=tool 的消息带给模型。
    const second = requestBody(fetchMock, 1);
    const toolMessage = second.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage).toBeDefined();
    expect(toolMessage.tool_call_id).toBe('call_1');
    expect(toolMessage.content).toContain('rec-liver-raw');
    expect(toolMessage.content).toContain('Chicken, liver, raw');
    expect(toolMessage.content).toContain('82');

    // 工具调用要留日志：工具名、参数摘要、耗时、成功/失败。
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('tool=searchLocalNutrition'),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('durationMs='));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ok=true'));
  });

  it('查库零命中时工具结果带 found=false，最终回复补上“没找到”和关键词', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall('searchLocalNutrition', {
            keyword: '西洋菜',
            state: 'RAW',
          }),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('已完成。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ candidates: EMPTY_CANDIDATE_RESULT });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加西洋菜',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]?.result).toMatchObject({
      found: false,
      candidateCount: 0,
      keywords: ['西洋菜', 'watercress'],
    });
    expect(result.reply).toContain('没有找到匹配词条');
    expect(result.reply).toContain('西洋菜');
    expect(result.reply).toContain('watercress');
  });

  it('模型写非法单位时返回错误文本，模型改对后 runCheck 通过', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 20,
              unit: '两',
              sourceRecordId: 'src-1',
            },
            'call_bad_unit',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 20,
              unit: 'g',
              sourceRecordId: 'src-1',
            },
            'call_fixed',
          ),
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
      name: 'updateNutritionField',
      ok: false,
    });
    expect(result.toolCalls[0].error).toContain('单位');
    expect(result.toolCalls[0].error).toContain('两');
    expect(result.toolCalls[1]).toMatchObject({
      name: 'updateNutritionField',
      ok: true,
    });
    expect(result.toolCalls[2]).toMatchObject({ name: 'runCheck', ok: true });

    // 错误文本必须作为 role=tool 的消息回灌给模型，否则它没法自纠。
    const secondRequest = requestBody(fetchMock, 1);
    const feedback = secondRequest.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(feedback.content).toContain('单位');
    expect(feedback.content).toContain('两');

    // 非法单位那次没有落库；改对后才写进草稿。
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

    const secondRequest = requestBody(fetchMock, 1);
    const toolMessage = secondRequest.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage.content).toContain('未知工具');
    expect(result.steps).toBe(2);
  });

  it('硬保险丝：单轮最多 80 次工具调用，到线即停并保留 transcript', async () => {
    let sourceSequence = 0;
    const fetchMock = jest.fn();
    for (let index = 0; index < 80; index += 1) {
      fetchMock.mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            `call_${index + 1}`,
          ),
        ),
      );
    }
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    // 每次检索都返回一个没出现过的来源 id，避免触发「连续无进展」软停止。
    harness.candidateService.findCandidates.mockImplementation(async () => {
      sourceSequence += 1;
      return {
        ...CANDIDATE_RESULT,
        candidates: [
          {
            ...CANDIDATE_RESULT.candidates[0],
            sourceRecordId: `rec-${sourceSequence}`,
          },
        ],
      };
    });

    const result = await harness.agent.run({
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(80);
    expect(result.steps).toBe(80);
    expect(result.toolCallCount).toBe(80);
    expect(result.toolCalls).toHaveLength(80);
    expect(result.stopReason).toBe('TOOL_CALL_LIMIT');
    expect(result.reply).toContain('我跑到上限了');
    expect(result.reply).toContain('80');
    expect(result.reply).toContain('已完成');
    expect(result.reply).toContain('还没做完');
    expect(result.toolCalls[79]).toMatchObject({
      name: 'searchLocalNutrition',
      ok: true,
    });
    // 「带上已有 transcript」：每一步都留痕，不能只给一句上限提示。
    expect(
      result.transcript.filter((entry) => entry.type === 'tool_result'),
    ).toHaveLength(80);
    expect(result.transcript.some((entry) => entry.type === 'limit')).toBe(
      true,
    );
  });

  it('总时长 3 分钟用完时停止，返回“我跑到上限了”，不报 503', async () => {
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const fetchMock = jest.fn(async () => {
      // 模拟一次模型调用把 180 秒预算全部耗尽。
      now += 181_000;
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

    nowSpy.mockRestore();
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
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.notAField',
              value: 20,
              unit: 'g',
            },
            'call_bad_field',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 20,
              unit: 'g',
              sourceRecordId: 'missing-source',
            },
            'call_missing_source',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('字段和来源都不对，我停下来问用户。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ draft: draftWithProfile() });
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].ok).toBe(false);
    expect(result.toolCalls[0].error).toContain('不在营养字段目录');
    expect(result.toolCalls[1].ok).toBe(false);
    expect(result.toolCalls[1].error).toContain('不存在');
    expect(harness.currentDraft()?.payload.profiles?.[0].entries).toEqual([]);

    // 两条错误都以 role=tool 的形式回灌给模型。
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
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 20,
              unit: 'g',
              sourceRecordId: 'src-1',
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
    global.fetch = fetchMock as unknown as typeof global.fetch;

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

  it('完整一轮：查库 → 单位改对 → 终检发现缺熟 → 补熟档案 → 通过', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'mg',
              sourceRecordId: 'rec-liver-raw',
            },
            'call_bad_unit',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-liver-raw',
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
            'updateNutritionField',
            {
              profileIndex: 1,
              fieldPath: 'macros.crudeProtein',
              value: 25.1,
              unit: 'g',
              sourceRecordId: 'rec-liver-cooked',
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
          assistantReply('生熟两份档案都填好粗蛋白，终检通过，请人工审核。'),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      draft: createDraft(),
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

    // 第一次终检缺熟档案；补完之后第二次通过（只剩提醒）。
    harness.checkService.runCheck
      .mockResolvedValueOnce({
        blocking: [
          {
            code: 'REQUIRED_STATE_MISSING',
            message: '缺少必需的熟档案（COOKED），需要补数据或登记例外。',
          },
        ],
        exceptionable: [],
        warnings: [],
      })
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
      'searchLocalNutrition',
      'updateNutritionField',
      'updateNutritionField',
      'runCheck',
      'updateNutritionField',
      'runCheck',
    ]);
    expect(result.toolCalls[1].ok).toBe(false);
    expect(result.toolCalls[1].error).toContain('单位');
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
  });

  it('模型调用链：检索 → 读整条营养记录 → 用返回的数值写字段', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'getNutritionRecord',
            { sourceRecordId: 'rec-liver-raw' },
            'call_record',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-liver-raw',
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('已把来源里的粗蛋白 19.5 g 写进草稿。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      draft: createDraft(),
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
      'searchLocalNutrition',
      'getNutritionRecord',
      'updateNutritionField',
    ]);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);

    // 第一次请求的工具定义里必须有新工具。
    const first = requestBody(fetchMock, 0);
    expect(first.tools.map((tool: any) => tool.function.name)).toContain(
      'getNutritionRecord',
    );

    // 读完整条记录后，下一次模型请求必须真的拿到 19.5 g 这个值。
    const third = requestBody(fetchMock, 2);
    const toolMessages = third.messages.filter(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessages).toHaveLength(2);
    expect(toolMessages[1].content).toContain('macros.crudeProtein');
    expect(toolMessages[1].content).toContain('19.5');
    expect(toolMessages[1].content).toContain('"unit":"g"');

    // 最终草稿按来源值写入，且状态来自来源记录。
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

  it('AI 配置不可用时 503，不发起模型请求', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    harness.configService.getEnabledDeepSeekRuntimeConfig.mockRejectedValue(
      new Error('DeepSeek Agent 设置未启用'),
    );

    await expect(
      harness.agent.run({
        draftId: DRAFT_ID,
        text: '鸡肝',
        userId: 'admin-1',
      }),
    ).rejects.toMatchObject({
      status: 503,
      message:
        'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('模型两次都调用失败时 503，文案沿用 intake 口径', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();

    let caught: unknown;
    try {
      await harness.agent.run({
        draftId: DRAFT_ID,
        text: '鸡肝',
        userId: 'admin-1',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as ServiceUnavailableException).getStatus()).toBe(503);
    expect((caught as Error).message).toBe('AI 暂时不可用，请稍后重试');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('连续 3 次工具调用没有新进展时停止，reply 含“没有新进展”并保留 transcript', async () => {
    const fetchMock = jest.fn();
    for (let index = 0; index < 4; index += 1) {
      fetchMock.mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            `call_${index + 1}`,
          ),
        ),
      );
    }
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      text: '帮我加鸡肝',
      userId: 'admin-1',
    });

    // 第 1 次检索到新来源算进展，之后 3 次重复检索都不算 → 第 4 次后停止。
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.steps).toBe(4);
    expect(result.toolCallCount).toBe(4);
    expect(result.toolCalls).toHaveLength(4);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);
    expect(result.stopReason).toBe('NO_PROGRESS');
    expect(result.reply).toContain('没有新进展');
    expect(result.reply).toContain('已完成');
    expect(result.reply).toContain('还没做完');
    expect(
      result.transcript.filter((entry) => entry.type === 'tool_result'),
    ).toHaveLength(4);
    expect(result.transcript.some((entry) => entry.type === 'limit')).toBe(
      true,
    );
  });

  it('有进展时重置无进展计数，不提前停', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search_1',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search_2',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search_3',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-liver-raw',
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search_4',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('已写入粗蛋白 19.5 g。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      draft: draftWithProfile(),
      sourceRecords: [
        {
          id: 'rec-liver-raw',
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

    // 两次重复检索后有一次成功写入（进展），计数清零，所以还能继续跑到回复。
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(result.steps).toBe(6);
    expect(result.toolCallCount).toBe(5);
    expect(result.stopReason).toBeNull();
    expect(result.reply).toContain('19.5');
    expect(result.transcript.some((entry) => entry.type === 'limit')).toBe(
      false,
    );
  });

  it('一次模型回复里的多个 tool_call 全部执行：steps 是轮次，toolCallCount 是动作数', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCalls([
            {
              name: 'updateNutritionFields',
              id: 'call_batch_1',
              args: {
                profileIndex: 0,
                entries: [
                  {
                    fieldPath: 'macros.crudeProtein',
                    value: 19.5,
                    unit: 'g',
                    sourceRecordId: 'rec-liver-raw',
                  },
                  {
                    fieldPath: 'macros.energyKcal',
                    value: 120,
                    unit: 'kcal',
                    sourceRecordId: 'rec-liver-raw',
                  },
                ],
              },
            },
            {
              name: 'updateNutritionFields',
              id: 'call_batch_2',
              args: {
                profileIndex: 0,
                entries: [
                  {
                    fieldPath: 'minerals.calcium',
                    value: 120,
                    unit: 'mg',
                    sourceRecordId: 'rec-liver-raw',
                  },
                ],
              },
            },
            { name: 'runCheck', id: 'call_check', args: {} },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('批量写入 3 个字段，终检通过。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      draft: createDraft(),
      sourceRecords: [
        {
          id: 'rec-liver-raw',
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

    expect(result.steps).toBe(2);
    expect(result.toolCallCount).toBe(3);
    expect(result.toolCalls.map((call) => call.name)).toEqual([
      'updateNutritionFields',
      'updateNutritionFields',
      'runCheck',
    ]);
    expect(result.toolCalls.every((call) => call.ok)).toBe(true);
    expect(result.stopReason).toBeNull();

    const profiles = harness.currentDraft()?.payload.profiles ?? [];
    expect(profiles).toHaveLength(1);
    expect(profiles[0].entries).toHaveLength(3);
  });

  it('token 成本上限用完时停止，保留已完成的 transcript', async () => {
    const previousBudget = process.env.INGREDIENT_AGENT_TOKEN_BUDGET;
    process.env.INGREDIENT_AGENT_TOKEN_BUDGET = '100';

    try {
      let sourceSequence = 0;
      const fetchMock = jest.fn();
      for (let index = 0; index < 2; index += 1) {
        fetchMock.mockResolvedValueOnce(
          chatResponse(
            assistantToolCall(
              'searchLocalNutrition',
              { keyword: '鸡肝', state: 'RAW' },
              `call_${index + 1}`,
            ),
            { total_tokens: 60 },
          ),
        );
      }
      global.fetch = fetchMock as unknown as typeof global.fetch;

      const harness = createHarness();
      harness.candidateService.findCandidates.mockImplementation(async () => {
        sourceSequence += 1;
        return {
          ...CANDIDATE_RESULT,
          candidates: [
            {
              ...CANDIDATE_RESULT.candidates[0],
              sourceRecordId: `rec-${sourceSequence}`,
            },
          ],
        };
      });

      const result = await harness.agent.run({
        text: '帮我加鸡肝',
        userId: 'admin-1',
      });

      // 每次模型请求 60 tokens；第二次之后累计 120 > 100，停止。
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.stopReason).toBe('TOKEN_BUDGET');
      expect(result.toolCallCount).toBe(2);
      expect(result.reply).toContain('我跑到上限了');
      expect(result.reply).toContain('成本');
      expect(
        result.transcript.filter((entry) => entry.type === 'tool_result'),
      ).toHaveLength(2);
    } finally {
      if (previousBudget === undefined) {
        delete process.env.INGREDIENT_AGENT_TOKEN_BUDGET;
      } else {
        process.env.INGREDIENT_AGENT_TOKEN_BUDGET = previousBudget;
      }
    }
  });

  it('模型请求的 max_tokens 提到 8000，避免工具参数被截断', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '鸡肝',
      userId: 'admin-1',
    });

    expect(requestBody(fetchMock, 0).max_tokens).toBe(8000);
  });

  it('流式回调：3 次工具调用按 step_start → step_end → … → reply → done 发事件', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '西洋菜', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-liver-raw',
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check')),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('三步都跑完了。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          normalizedNutrition: { meta: { sampleState: 'RAW' } },
        },
      ],
    });

    const events: any[] = [];
    const input = {
      draftId: DRAFT_ID,
      text: '帮我加西洋菜',
      userId: 'admin-1',
      onEvent: (event: any) => events.push(event),
    };
    const result = await harness.agent.run(input);

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
      name: 'searchLocalNutrition',
    });
    expect(events[0].summary).toBe('查本地库 西洋菜·生');
    expect(events[1]).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
      found: true,
    });
    expect(events[1].resultSummary).toContain('命中');
    expect(events[2]).toMatchObject({
      type: 'step_start',
      index: 2,
      name: 'updateNutritionField',
    });
    expect(events[2].summary).toBe('写字段 粗蛋白 = 19.5 g');
    expect(events[3]).toMatchObject({
      type: 'step_end',
      index: 2,
      ok: true,
    });
    expect(events[3].found).toBeUndefined();
    expect(events[4]).toMatchObject({
      type: 'step_start',
      index: 3,
      name: 'runCheck',
    });
    expect(events[4].summary).toBe('跑终检');
    expect(events[5]).toMatchObject({
      type: 'step_end',
      index: 3,
      ok: true,
    });
    expect(events[6]).toMatchObject({
      type: 'reply',
      reply: '三步都跑完了。',
      draftId: DRAFT_ID,
      steps: 4,
      toolCallCount: 3,
    });
    expect(events[7]).toEqual({ type: 'done' });
    expect(result.toolCallCount).toBe(3);
  });

  it('流式回调：查库 step_end 带 matches / keywords（最多 12 条），读记录带 record 摘要', async () => {
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      ...CANDIDATE_RESULT.candidates[0],
      sourceRecordId: index === 0 ? 'rec-liver-raw' : `rec-liver-${index}`,
      foodName: `Chicken, liver, raw ${index + 1}`,
      matchScore: Number((0.9 - index * 0.01).toFixed(2)),
    }));
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'getNutritionRecord',
            { sourceRecordId: 'rec-liver-raw' },
            'call_record',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantToolCall('runCheck', {}, 'call_check')),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('三步都跑完了。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      candidates: {
        ...CANDIDATE_RESULT,
        candidates,
        coverage: { ...CANDIDATE_RESULT.coverage, candidateCount: 7 },
      },
      sourceRecords: [
        {
          id: 'rec-liver-raw',
          status: 'ACTIVE',
          foodName: 'Chicken, liver, raw',
          normalizedNutrition: {
            meta: { sampleState: 'RAW' },
            macros: { energyKcal: 120, crudeProtein: 19.5 },
            minerals: { calcium: 120 },
          },
        },
      ],
    });

    const events: any[] = [];
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加鸡肝',
      userId: 'admin-1',
      onEvent: (event: any) => events.push(event),
    });

    const searchEnd = events[1];
    expect(searchEnd).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
      found: true,
    });
    expect(searchEnd.keywords).toEqual(['鸡肝', 'Chicken liver']);
    expect(searchEnd.candidateCount).toBe(7);
    expect(searchEnd.matches).toHaveLength(7);
    expect(searchEnd.matches[0]).toEqual({
      name: 'Chicken, liver, raw 1',
      matchedBy: 'EN_PARTIAL',
      matchedKeyword: 'Chicken liver',
      score: 0.9,
      review: { verdict: 'RELEVANT', reason: '就是目标食材' },
    });
    expect(Object.keys(searchEnd.matches[0]).sort()).toEqual([
      'matchedBy',
      'matchedKeyword',
      'name',
      'review',
      'score',
    ]);
    expect(searchEnd.record).toBeUndefined();

    const recordEnd = events[3];
    expect(recordEnd).toMatchObject({
      type: 'step_end',
      index: 2,
      ok: true,
    });
    expect(recordEnd.record).toEqual({
      name: 'Chicken, liver, raw',
      coverage: Math.round((3 / NUTRITION_FIELD_CATALOG.length) * 1000) / 10,
      valueCount: 3,
    });
    expect(recordEnd.matches).toBeUndefined();
    expect(recordEnd.keywords).toBeUndefined();

    // 其它工具（开始 / 结束）都不带查库匹配依据。
    for (const index of [0, 2, 4, 5]) {
      expect(events[index].matches).toBeUndefined();
      expect(events[index].keywords).toBeUndefined();
      expect(events[index].record).toBeUndefined();
    }
  });

  it('流式回调：查库零命中时 step_end 带空 matches 与本次实际关键词', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '西洋菜', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('本地库没有找到西洋菜。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ candidates: EMPTY_CANDIDATE_RESULT });
    const events: any[] = [];
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '帮我加西洋菜',
      userId: 'admin-1',
      onEvent: (event: any) => events.push(event),
    });

    expect(events[1]).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
      found: false,
      resultSummary: '没有找到匹配词条',
    });
    expect(events[1].matches).toEqual([]);
    expect(events[1].keywords).toEqual(['西洋菜', 'watercress']);
    expect(events[1].candidateCount).toBe(0);
  });

  it('流式回调：模型失败时只发 error，不带 done；原异常仍按 503 抛出', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const events: any[] = [];

    await expect(
      harness.agent.run({
        draftId: DRAFT_ID,
        text: '鸡肝',
        userId: 'admin-1',
        onEvent: (event: any) => events.push(event),
      } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(events[0].message).toBe('AI 暂时不可用，请稍后重试');
    expect(events.some((event) => event.type === 'done')).toBe(false);
  });
});

describe('IngredientDraftAgentService · askUser（先问人，再动手）', () => {
  const BEEF_QUESTION = '牛肉用哪个部位？';
  const BEEF_OPTIONS = ['牛腩（肥瘦相间）', '牛腱子（筋膜多）', '牛里脊（瘦）'];

  it('模型调用 askUser 时存下 pendingQuestion，事件以 ask + done 收尾', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            { question: BEEF_QUESTION, options: BEEF_OPTIONS },
            'call_ask',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const events: any[] = [];
    const result = await harness.agent.run(
      { draftId: DRAFT_ID, text: '牛肉', userId: 'admin-1' },
      (event) => events.push(event),
    );

    // 问完就结束本轮：不再请求模型，也不自己挑一个部位往下写。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion).toMatchObject({
      question: BEEF_QUESTION,
      options: BEEF_OPTIONS,
    });
    expect(Date.parse(String(result.pendingQuestion?.askedAt))).not.toBeNaN();
    expect(result.reply).toBe(BEEF_QUESTION);
    expect(result.toolCalls).toEqual([
      expect.objectContaining({ name: 'askUser', ok: true }),
    ]);

    // 问题必须落在草稿里：下次带同一个 draftId 才能接上。
    expect(harness.currentDraft()?.payload.pendingQuestion).toMatchObject({
      question: BEEF_QUESTION,
      options: BEEF_OPTIONS,
    });

    const types = events.map((event) => event.type);
    expect(types.slice(-2)).toEqual(['ask', 'done']);
    expect(events[types.length - 2]).toMatchObject({
      type: 'ask',
      question: BEEF_QUESTION,
      options: BEEF_OPTIONS,
      draftId: DRAFT_ID,
    });
  });

  it('带同一 draftId 回答时，提示词包含问题与回答，并清空 pendingQuestion', async () => {
    const harness = createHarness({
      draft: createDraft({
        payload: {
          pendingQuestion: {
            question: BEEF_QUESTION,
            options: BEEF_OPTIONS,
            askedAt: '2026-10-24T12:00:00.000Z',
          },
        },
      }),
    });

    const fetchMock = jest.fn(async () => {
      // 清空必须发生在继续之前，而不是等这一轮跑完。
      expect(harness.currentDraft()?.payload.pendingQuestion).toBeNull();
      return chatResponse(assistantReply('已按牛腩建好草稿。'));
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛腩',
      userId: 'admin-1',
    });

    const messages = requestBody(fetchMock, 0).messages as Array<{
      role: string;
      content: string | null;
    }>;
    const prompt = messages
      .map((message) => String(message.content ?? ''))
      .join('\n');
    expect(prompt).toContain('你刚问');
    expect(prompt).toContain(BEEF_QUESTION);
    expect(prompt).toContain('用户答');
    expect(prompt).toContain('牛腩');
    // 回答之后不许假装早就知道答案，也不许把同一个问题再问一遍。
    expect(prompt).toContain('不要假装');
    expect(prompt).toContain('不要重复问');

    expect(harness.currentDraft()?.payload.pendingQuestion).toBeNull();
    // 清空要真的落库，不能只改内存对象骗过下一次 run。
    expect(harness.draftService.patch).toHaveBeenCalledWith(
      DRAFT_ID,
      'INTAKE',
      { pendingQuestion: null },
    );
    expect(result.pendingQuestion).toBeNull();
    expect(result.stopReason).toBeNull();
    expect(result.reply).toBe('已按牛腩建好草稿。');
  });

  it('系统提示词：歧义必须先 askUser，一次只问一个问题、给 2–5 个选项', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    const system = String(requestBody(fetchMock, 0).messages[0].content);
    expect(system).toContain('askUser');
    expect(system).toContain('部位');
    expect(system).toContain('不许自己猜');
    expect(system).toContain('一次只问一个问题');
    expect(system).toContain('2–5');
    expect(system).toContain('不要重复问同一个问题');
    expect(system).toContain('不要假装');
  });

  it('askUser 选项少于 2 个时返回错误文本，不写 pendingQuestion', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            { question: '牛肉用哪个部位？', options: ['牛腩'] },
            'call_bad_options',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('选项不够，我改一下再问。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: false,
    });
    expect(result.toolCalls[0].error).toContain('2');
    expect(result.stopReason).toBeNull();
    expect(harness.currentDraft()?.payload.pendingQuestion).toBeUndefined();
  });

  it('askUser 的 question 超过 200 字时自动截断，不再让模型重试', async () => {
    const longQuestion = '牛'.repeat(201);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            { question: longQuestion, options: ['牛腩', '牛腱子'] },
            'call_long_question',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    // 问题照样问出去：截断的是文案，不是这次提问。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: true,
    });
    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.question).toBe(`${'牛'.repeat(197)}…`);
    expect(Array.from(result.pendingQuestion?.question ?? '')).toHaveLength(198);
    expect(harness.currentDraft()?.payload.pendingQuestion).toMatchObject({
      question: `${'牛'.repeat(197)}…`,
    });
  });

  it('askUser 的 question 恰好 200 字时原样提问（200 是允许的上限）', async () => {
    const question = '牛'.repeat(200);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            { question, options: ['牛腩', '牛腱子'] },
            'call_boundary_question',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: true,
    });
    expect(result.pendingQuestion?.question).toBe(question);
  });

  it('askUser 选项超过 5 个时拒绝', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            {
              question: '牛肉用哪个部位？',
              options: ['牛腩', '牛腱子', '牛里脊', '牛尾', '牛舌', '牛骨'],
            },
            'call_too_many_options',
          ),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('选项太多了。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: false,
    });
    expect(result.toolCalls[0].error).toContain('2–5');
    expect(harness.currentDraft()?.payload.pendingQuestion).toBeUndefined();
  });

  it('askUser 单个选项 41 字时照常提问，不再让模型缩短重试', async () => {
    // 线上就是这一档：41 字刚超过旧的 40 字上限，模型被迫重写文案。
    const option = '牛'.repeat(41);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            { question: '牛肉用哪个部位？', options: [option, '牛腱子'] },
            'call_typed_option',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: true,
    });
    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.options[0]).toBe(option);
  });

  it('askUser 单个选项超过 120 字时自动截断（前 117 字 + …）', async () => {
    const longOption = '牛'.repeat(121);
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            {
              question: '牛肉用哪个部位？',
              options: [longOption, '牛腱子'],
            },
            'call_long_option',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: true,
    });
    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.options[0]).toBe(`${'牛'.repeat(117)}…`);
    expect(Array.from(result.pendingQuestion?.options[0] ?? '')).toHaveLength(
      118,
    );
    expect(harness.currentDraft()?.payload.pendingQuestion).toMatchObject({
      options: [`${'牛'.repeat(117)}…`, '牛腱子'],
    });
  });

  it('ask 事件带上选项的库内核实标记：未收录的保留并带后缀', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            {
              question: '山药你指的是哪一种？',
              options: ['铁棍山药', '菜山药', '毛山药'],
            },
            'call_ask_checks',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    (harness.candidateService.findCandidates as jest.Mock).mockImplementation(
      async (input: { name: string }) =>
        input.name === '毛山药' ? EMPTY_CANDIDATE_RESULT : CANDIDATE_RESULT,
    );

    const events: any[] = [];
    const result = await harness.agent.run(
      { draftId: DRAFT_ID, text: '山药', userId: 'admin-1' },
      (event) => events.push(event),
    );

    // 选项原文仍按字符串存（旧页面 / 旧草稿兼容），核实结果平行放在
    // optionChecks 里；未收录的展示文案带「会去线上找」的后缀。
    expect(result.pendingQuestion?.options).toEqual([
      '铁棍山药',
      '菜山药',
      '毛山药',
    ]);
    expect(result.pendingQuestion?.optionChecks).toEqual([
      {
        label: '铁棍山药',
        inLibrary: true,
        matchedName: 'Chicken, liver, raw',
        displayLabel: '铁棍山药',
      },
      {
        label: '菜山药',
        inLibrary: true,
        matchedName: 'Chicken, liver, raw',
        displayLabel: '菜山药',
      },
      {
        label: '毛山药',
        inLibrary: false,
        matchedName: null,
        displayLabel: '毛山药（库里未收录，选了会去线上找）',
      },
    ]);

    const askEvent = events.find((event) => event.type === 'ask');
    expect(askEvent).toMatchObject({
      question: '山药你指的是哪一种？',
      options: ['铁棍山药', '菜山药', '毛山药'],
      optionChecks: result.pendingQuestion?.optionChecks,
      draftId: DRAFT_ID,
    });
    expect(harness.currentDraft()?.payload.pendingQuestion).toMatchObject({
      options: ['铁棍山药', '菜山药', '毛山药'],
      optionChecks: result.pendingQuestion?.optionChecks,
    });
  });

  it('所有选项都查不到时把错误文本回灌给模型，不写待回答问题', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            {
              question: '山药你指的是哪一种？',
              options: ['铁棍山药', '菜山药', '毛山药', '山药干'],
            },
            'call_ask_all_miss',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('这几类本地库都没有，我换个问法。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    harness.candidateService.findCandidates.mockResolvedValue(
      EMPTY_CANDIDATE_RESULT,
    );

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '山药',
      userId: 'admin-1',
    });

    expect(result.toolCalls[0]).toMatchObject({
      name: 'askUser',
      ok: false,
    });
    expect(result.toolCalls[0].error).toContain('全部未收录');
    expect(result.toolCalls[0].error).toContain('可能库里没有');
    expect(result.toolCalls[0].error).toContain('更宽');
    expect(result.stopReason).toBeNull();

    // 模型必须能看到这段错误文本，才有机会改问法；草稿里不能留下问题。
    const second = requestBody(fetchMock, 1);
    const toolMessage = second.messages.find(
      (message: any) => message.role === 'tool',
    );
    expect(toolMessage?.content).toContain('全部未收录');
    expect(toolMessage?.content).toContain('更宽');
    expect(harness.currentDraft()?.payload.pendingQuestion).toBeUndefined();
  });

  it('回答未收录的选项时提示模型走线上或留空，不编造', async () => {
    const harness = createHarness({
      draft: createDraft({
        payload: {
          pendingQuestion: {
            question: '山药你指的是哪一种？',
            options: ['铁棍山药', '毛山药'],
            optionChecks: [
              {
                label: '铁棍山药',
                inLibrary: true,
                matchedName: 'Yam, raw',
                displayLabel: '铁棍山药',
              },
              {
                label: '毛山药',
                inLibrary: false,
                matchedName: null,
                displayLabel: '毛山药（库里未收录，选了会去线上找）',
              },
            ],
            askedAt: '2026-10-24T12:00:00.000Z',
          },
        },
      }),
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('我去线上找毛山药。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '毛山药',
      userId: 'admin-1',
    });

    const messages = requestBody(fetchMock, 0).messages as Array<{
      role: string;
      content: string | null;
    }>;
    const prompt = messages
      .map((message) => String(message.content ?? ''))
      .join('\n');
    expect(prompt).toContain('你刚问');
    expect(prompt).toContain('用户答：毛山药');
    expect(prompt).toContain('库里未收录');
    expect(prompt).toContain('线上');
    expect(prompt).toContain('留空');
  });
});

describe('IngredientDraftAgentService · AI 复核候选（判断交给 AI，选择交给人）', () => {
  function twoCandidates(): CandidateSearchResult {
    return {
      ...CANDIDATE_RESULT,
      candidates: [
        CANDIDATE_RESULT.candidates[0],
        {
          ...CANDIDATE_RESULT.candidates[0],
          sourceRecordId: 'rec-liver-cooked',
          foodName: 'Chicken, liver, cooked',
          foodNameEn: 'Chicken, liver, cooked',
          // 生查询不会返回熟候选；这里保持 RAW，避免触发“跨生熟”收窄，
          // 本用例验证的是「≥2 条相关先问人」而不是状态收窄。
          preparationState: 'RAW',
        },
      ],
      coverage: { ...CANDIDATE_RESULT.coverage, candidateCount: 2 },
    };
  }

  it('系统提示词：先看复核再写；相关≥2 先问人、=1 说明理由、=0 不硬选', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '山药',
      userId: 'admin-1',
    });

    const system = String(requestBody(fetchMock, 0).messages[0].content);
    expect(system).toContain('RELEVANT');
    expect(system).toContain('IRRELEVANT');
    expect(system).toContain('不要因为候选里有不相关项就丢弃');
    expect(system).toContain('相关候选 ≥2');
    expect(system).toContain('askUser');
    expect(system).toContain('候选名 —— 相关/存疑/不相关');
    expect(system).toContain('我选了这条');
    expect(system).toContain('去线上找');
    expect(system).toContain('留空');
  });

  it('回答带 AI 判断的选项时，提示词同时给出 AI 判断与「以用户选择为准」', async () => {
    const harness = createHarness({
      draft: createDraft({
        payload: {
          pendingQuestion: {
            question: '鸡肝用哪一条？',
            options: [
              'Chicken, liver, raw —— 相关：就是鸡肝',
              'Chicken, liver, cooked —— 相关：也是鸡肝',
            ],
            optionChecks: [
              {
                label: 'Chicken, liver, raw —— 相关：就是鸡肝',
                candidateLabel: 'Chicken, liver, raw',
                aiVerdict: 'RELEVANT',
                aiReason: '就是鸡肝',
                inLibrary: true,
                matchedName: 'Chicken, liver, raw',
                displayLabel: 'Chicken, liver, raw',
              },
              {
                label: 'Chicken, liver, cooked —— 相关：也是鸡肝',
                candidateLabel: 'Chicken, liver, cooked',
                aiVerdict: 'RELEVANT',
                aiReason: '也是鸡肝',
                inLibrary: true,
                matchedName: 'Chicken, liver, cooked',
                displayLabel: 'Chicken, liver, cooked',
              },
            ],
            askedAt: '2026-10-24T12:00:00.000Z',
          },
        },
      }),
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('按生的那条继续。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    await harness.agent.run({
      draftId: DRAFT_ID,
      text: 'Chicken, liver, raw —— 相关：就是鸡肝',
      userId: 'admin-1',
    });

    const messages = requestBody(fetchMock, 0).messages as Array<{
      role: string
      content: string | null
    }>;
    const prompt = messages
      .map((message) => String(message.content ?? ''))
      .join('\n');
    expect(prompt).toContain('AI 当时的判断：相关——就是鸡肝');
    expect(prompt).toContain('用户已经选了这条，以用户的选择为准');
    expect(prompt).toContain('用户答：Chicken, liver, raw');
  });

  it('≥2 条相关：模型直接写入会被拒，改调 askUser 后选项带 AI 判断与理由', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '鸡肝', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 19.5,
              unit: 'g',
              sourceRecordId: 'rec-liver-raw',
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'askUser',
            {
              question: '鸡肝用哪一条？',
              options: [
                'Chicken, liver, raw —— 相关：就是鸡肝',
                'Chicken, liver, cooked —— 相关：也是鸡肝',
              ],
            },
            'call_ask',
          ),
        ),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ candidates: twoCandidates() });
    harness.reviewService.reviewCandidates.mockResolvedValue([
      { id: 'rec-liver-raw', verdict: 'RELEVANT', reason: '就是鸡肝' },
      { id: 'rec-liver-cooked', verdict: 'RELEVANT', reason: '也是鸡肝' },
    ]);

    const events: any[] = [];
    const result = await harness.agent.run(
      { draftId: DRAFT_ID, text: '鸡肝', userId: 'admin-1' },
      (event) => events.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const writeResult = JSON.parse(
      String(
        (requestBody(fetchMock, 2).messages as any[])
          .filter((message) => message.role === 'tool')
          .pop()?.content,
      ),
    );
    expect(writeResult.ok).toBe(false);
    expect(writeResult.error).toContain('askUser');

    // 写入被闸门拦住，草稿里没有营养档案。
    expect(harness.currentDraft()?.payload.profiles).toBeUndefined();

    expect(result.stopReason).toBe('waiting_user');
    expect(result.pendingQuestion?.options).toEqual([
      'Chicken, liver, raw —— 相关：就是鸡肝',
      'Chicken, liver, cooked —— 相关：也是鸡肝',
    ]);
    expect(result.pendingQuestion?.optionChecks?.map((option) => ({
      candidateLabel: option.candidateLabel,
      aiVerdict: option.aiVerdict,
      aiReason: option.aiReason,
    }))).toEqual([
      {
        candidateLabel: 'Chicken, liver, raw',
        aiVerdict: 'RELEVANT',
        aiReason: '就是鸡肝',
      },
      {
        candidateLabel: 'Chicken, liver, cooked',
        aiVerdict: 'RELEVANT',
        aiReason: '也是鸡肝',
      },
    ]);
    expect(harness.currentDraft()?.payload.candidateReviewGate).toBeNull();
    expect(events.map((event) => event.type).slice(-2)).toEqual([
      'ask',
      'done',
    ]);
  });

  it('0 条相关：写入被拒并明确让模型走线上 / 留空，不硬选', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '山药', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'updateNutritionField',
            {
              profileIndex: 0,
              fieldPath: 'macros.crudeProtein',
              value: 1.5,
              unit: 'g',
              sourceRecordId: 'rec-jicama',
            },
            'call_write',
          ),
        ),
      )
      .mockResolvedValueOnce(
        chatResponse(assistantReply('本地没有相关来源，我去线上找或先留空。')),
      );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({
      candidates: {
        ...CANDIDATE_RESULT,
        candidates: [
          {
            ...CANDIDATE_RESULT.candidates[0],
            sourceRecordId: 'rec-jicama',
            foodName: 'Yambean (jicama), raw',
            foodNameEn: 'Yambean (jicama), raw',
          },
        ],
      },
    });
    harness.reviewService.reviewCandidates.mockResolvedValue([
      { id: 'rec-jicama', verdict: 'IRRELEVANT', reason: '凉薯，不是山药' },
    ]);

    const result = await harness.agent.run({
      draftId: DRAFT_ID,
      text: '山药',
      userId: 'admin-1',
    });

    const writeResult = JSON.parse(
      String(
        (requestBody(fetchMock, 2).messages as any[])
          .filter((message) => message.role === 'tool')
          .pop()?.content,
      ),
    );
    expect(writeResult.ok).toBe(false);
    expect(writeResult.error).toContain('线上');
    expect(writeResult.error).toContain('留空');
    expect(harness.currentDraft()?.payload.profiles).toBeUndefined();
    expect(result.reply).toContain('线上');
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
        { provide: IngredientCreationCommitService, useValue: {} },
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
describe('IngredientDraftAgentService · 候选太多先收窄', () => {
  function beefCandidates(): CandidateSearchResult {
    const row = (
      sourceRecordId: string,
      foodName: string,
    ): CandidateSearchResult['candidates'][number] => ({
      ...CANDIDATE_RESULT.candidates[0]!,
      sourceRecordId,
      foodName,
      foodNameEn: foodName,
      matchedKeyword: 'beef',
    });
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) =>
        row(`ground-${index}`, `Beef, ground, raw ${index + 1}`),
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        row(`tenderloin-${index}`, `Beef, tenderloin, raw ${index + 1}`),
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        row(`brisket-${index}`, `Beef, brisket, raw ${index + 1}`),
      ),
    ];
    return {
      keywords: ['牛肉', 'beef'],
      candidates,
      excludedCount: 0,
      coverage: {
        ...CANDIDATE_RESULT.coverage,
        candidateCount: candidates.length,
      },
    };
  }

  it('系统提示词：先按部位收窄、说清条数、最后加「都不对，我直接说」', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness();
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛肉',
      userId: 'admin-1',
    });

    const system = String(requestBody(fetchMock, 0).messages[0].content);
    expect(system).toContain('NARROW_GROUP');
    expect(system).toContain('先按部位分组');
    expect(system).toContain('这一组 N 条');
    expect(system).toContain('都不对，我直接说');
    expect(system).toContain('生 / 熟');
    expect(system).toContain('≤5 条');
  });

  it('查库 step_end 带 totalCandidates / groups / reviewSummary，前端可画分组概览', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        chatResponse(
          assistantToolCall(
            'searchLocalNutrition',
            { keyword: '牛肉', state: 'RAW' },
            'call_search',
          ),
        ),
      )
      .mockResolvedValueOnce(chatResponse(assistantReply('先按部位收窄。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const harness = createHarness({ candidates: beefCandidates() });
    const events: any[] = [];
    await harness.agent.run(
      {
        draftId: DRAFT_ID,
        text: '牛肉',
        userId: 'admin-1',
      },
      (event) => events.push(event),
    );

    const searchEnd = events[1];
    expect(searchEnd).toMatchObject({
      type: 'step_end',
      index: 1,
      ok: true,
      found: true,
      resultSummary: '命中 11 条 · 11 条相关',
    });
    expect(searchEnd.totalCandidates).toBe(11);
    expect(searchEnd.candidateCount).toBe(11);
    expect(searchEnd.groups).toEqual([
      { key: 'ground', label: '牛绞肉', count: 6, states: ['RAW'] },
      { key: 'tenderloin', label: '牛里脊', count: 3, states: ['RAW'] },
      { key: 'brisket', label: '牛腩', count: 2, states: ['RAW'] },
    ]);
    expect(searchEnd.reviewSummary).toMatchObject({
      relevantCount: 11,
      uncertainCount: 0,
      irrelevantCount: 0,
      failed: false,
    });
  });

  it('下一轮系统提示词带收窄分组 key，用户答组名后能接着传 group', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(chatResponse(assistantReply('好的。')));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const draft = createDraft({
      payload: {
        candidateNarrowing: {
          keyword: '牛肉',
          state: 'RAW',
          stateSpecified: true,
          totalCandidates: 50,
          relevantCount: 11,
          required: true,
          kind: 'GROUP',
          reason: 'MULTIPLE_GROUPS',
          question: '牛…',
          options: ['牛绞肉（6 条）', '牛里脊（3 条）'],
          choices: [
            {
              kind: 'GROUP',
              key: 'ground',
              label: '牛绞肉',
              count: 6,
            },
            {
              kind: 'GROUP',
              key: 'tenderloin',
              label: '牛里脊',
              count: 3,
            },
          ],
          groups: [
            { key: 'ground', label: '牛绞肉', count: 6, states: ['RAW'] },
            { key: 'tenderloin', label: '牛里脊', count: 3, states: ['RAW'] },
          ],
          selectedGroupKey: null,
          updatedAt: new Date().toISOString(),
        },
      },
    });
    const harness = createHarness({ draft });
    await harness.agent.run({
      draftId: DRAFT_ID,
      text: '牛绞肉（6 条）',
      userId: 'admin-1',
    });

    const system = String(requestBody(fetchMock, 0).messages[0].content);
    expect(system).toContain('ground=牛绞肉(6条)');
    expect(system).toContain('GROUP=ground(牛绞肉)');
    expect(system).toContain('牛绞肉（6 条）');
  });
});
