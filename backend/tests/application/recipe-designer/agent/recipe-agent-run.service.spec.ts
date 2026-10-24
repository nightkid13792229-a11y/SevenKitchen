import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AgentToolResult } from 'src/application/recipe-designer/agent/agent-types';
import { RecipeAgentRunService } from 'src/application/recipe-designer/agent/recipe-agent-run.service';
import type { DeepSeekToolsResult } from 'src/application/recipe-designer/deepseek-tools-chat';

/**
 * 运行循环（P0b-3 Task 3）。
 *
 * 这里只验证「一草稿一运行」的编排：会话/消息、模型调用参数、工具执行、
 * 停止条件（ask_user / finish_draft / 30 次 / 6 分钟 / 最终文本）和状态落库。
 * 真实草稿读写由 `createRuntime` 负责，测试里整体替换成假 toolkit。
 */

const SESSION_ID = 'session-1';
const DRAFT_ID = 'draft-1';
const ACTOR = { userId: 'user-1', role: 'STAFF' };

const DRAFT_SNAPSHOT = {
  draftId: DRAFT_ID,
  seriesId: null,
  name: '低脂鸡肉饭',
  scenario: 'MAIN',
  contentRevision: 3,
  totalWeightG: 100,
  items: [],
  copy: {
    coverTitle: null,
    sellingPoint: null,
    description: null,
    targetHealthTags: [],
  },
  productionSteps: [],
  lastAssessment: null,
  nutritionSummary: { fatWetPercent: 6, moisturePercent: 60 },
  animalSpecies: ['鸡'],
  unknownAnimalProtein: false,
};

const TOOL_DEFINITIONS = [
  {
    name: 'get_draft',
    description: '读取当前草稿',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'ask_user',
    description: '停下来向人提问',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'finish_draft',
    description: '生成交付确认卡',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

function okResult<T>(data: T, summary = 'ok'): AgentToolResult<T> {
  return { ok: true, data, summary };
}

function toolCallResponse(
  name: string,
  args = '{}',
  id = 'call-1',
): DeepSeekToolsResult {
  return {
    content: null,
    toolCalls: [{ id, type: 'function', function: { name, arguments: args } }],
    usage: { promptTokens: 10, completionTokens: 5 },
  };
}

function finalResponse(content: string): DeepSeekToolsResult {
  return {
    content,
    toolCalls: [],
    usage: { promptTokens: 7, completionTokens: 3 },
  };
}

function makeSessionService() {
  return {
    assertNoActiveRun: jest.fn().mockResolvedValue(undefined),
    createSession: jest.fn().mockResolvedValue({
      id: SESSION_ID,
      designRecipeId: DRAFT_ID,
      status: 'RUNNING',
    }),
    appendMessage: jest.fn().mockResolvedValue({ id: 'message-1' }),
    listMessages: jest.fn().mockResolvedValue([]),
    transitionStatus: jest.fn().mockResolvedValue(true),
    recordUsage: jest.fn().mockResolvedValue(undefined),
    incrementStep: jest.fn().mockResolvedValue(undefined),
    markInterruptedRuns: jest.fn().mockResolvedValue(0),
  };
}

function historyMessage(
  seq: number,
  role: 'USER' | 'ASSISTANT' | 'TOOL',
  content: string,
  extra: { toolName?: string; toolResult?: unknown } = {},
) {
  return {
    id: `message-${seq}`,
    sessionId: SESSION_ID,
    seq,
    role,
    content,
    toolName: extra.toolName ?? null,
    toolArgs: null,
    toolResult: extra.toolResult ?? null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeRuntime(handlers: Record<string, jest.Mock>) {
  return {
    adapter: { getDraft: jest.fn().mockResolvedValue(DRAFT_SNAPSHOT) },
    control: { getApprovalState: jest.fn() },
    toolkit: { definitions: TOOL_DEFINITIONS, handlers },
    tagPolicy: { isAllowedTag: jest.fn().mockReturnValue(true) },
  };
}

function makeRunService(options: {
  handlers: Record<string, jest.Mock>;
  responses?: DeepSeekToolsResult[];
  callModel?: jest.Mock;
  sessionService?: ReturnType<typeof makeSessionService>;
  prisma?: any;
  designerService?: { getDraft: jest.Mock };
  approvalService?: { getApprovalState?: jest.Mock; decide?: jest.Mock };
}) {
  const sessionService = options.sessionService ?? makeSessionService();
  const designerService = options.designerService ?? {
    getDraft: jest.fn().mockResolvedValue({ draftId: DRAFT_ID }),
  };
  const providerConfig = {
    getEnabledDeepSeekRuntimeConfig: jest.fn().mockResolvedValue({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.test',
      model: 'deepseek-chat',
      reviewModel: 'deepseek-chat',
      apiKey: 'test-key',
      maxConcurrency: 1,
      requestTimeoutMs: 90000,
      retryCount: 2,
    }),
  };
  const prisma = options.prisma ?? {
    recipeDesignAgentSession: { findUnique: jest.fn() },
  };
  const runtime = makeRuntime(options.handlers);

  // 模型收到的消息数组会被循环原地追加，这里在调用当时存一份角色快照。
  const messageRoles: string[][] = [];

  let callIndex = 0;
  const callModel =
    options.callModel ??
    jest.fn(async (input: any) => {
      messageRoles.push(input.messages.map((message: any) => message.role));
      const responses = options.responses ?? [];
      const response =
        responses[Math.min(callIndex, responses.length - 1)] ??
        finalResponse('完成');
      callIndex += 1;
      if (response.usage) {
        input.onUsage?.(response.usage);
      }
      return response;
    });

  const service = new RecipeAgentRunService(
    sessionService as any,
    (options.approvalService ?? { getApprovalState: jest.fn() }) as any,
    designerService as any,
    prisma as any,
    providerConfig as any,
    callModel as any,
  );

  const createRuntime = jest
    .spyOn(service as any, 'createRuntime')
    .mockResolvedValue(runtime);

  return {
    service,
    sessionService,
    designerService,
    providerConfig,
    prisma,
    runtime,
    callModel,
    createRuntime,
    messageRoles,
  };
}

function messageCalls(sessionService: ReturnType<typeof makeSessionService>) {
  return sessionService.appendMessage.mock.calls.map(([message]) => message);
}

const APPROVAL_ID = 'approval-1';

function makeApprovalDecisionPrisma(
  overrides: { approval?: any; session?: any } = {},
) {
  return {
    recipeDesignAgentApproval: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.approval === undefined
          ? {
              id: APPROVAL_ID,
              sessionId: SESSION_ID,
              type: 'CATEGORY_OMISSION',
              status: 'PENDING',
            }
          : overrides.approval,
      ),
    },
    recipeDesignAgentSession: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.session === undefined
            ? { id: SESSION_ID, designRecipeId: DRAFT_ID }
            : overrides.session,
        ),
    },
  };
}

describe('RecipeAgentRunService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('start 先读草稿再回复：返回 sessionId，记录消息/步骤/用量，最后 WAITING_USER', async () => {
    const getDraft = jest
      .fn()
      .mockResolvedValue(okResult({ draftId: DRAFT_ID }, '草稿'));
    const { service, sessionService, providerConfig, callModel, messageRoles } =
      makeRunService({
        handlers: {
          get_draft: getDraft,
          ask_user: jest.fn(),
          finish_draft: jest.fn(),
        },
        responses: [
          toolCallResponse('get_draft'),
          finalResponse('草稿看过了，先不动。'),
        ],
      });

    const result = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '帮我看看这份草稿',
    });

    expect(result).toEqual({ sessionId: SESSION_ID });
    expect(sessionService.assertNoActiveRun).toHaveBeenCalledWith(DRAFT_ID);
    expect(sessionService.createSession).toHaveBeenCalledWith({
      designRecipeId: DRAFT_ID,
      createdBy: 'user-1',
      skillName: 'recipe-design',
      skillVersion: 'v1',
    });

    await service.waitForIdle(SESSION_ID);

    const messages = messageCalls(sessionService);
    expect(messages[0]).toMatchObject({
      sessionId: SESSION_ID,
      role: 'USER',
      content: '帮我看看这份草稿',
    });

    const toolMessage = messages.find((message) => message.role === 'TOOL');
    expect(toolMessage).toMatchObject({
      sessionId: SESSION_ID,
      toolName: 'get_draft',
      toolArgs: {},
      toolResult: { ok: true },
    });
    expect(toolMessage.content).toBe(JSON.stringify(toolMessage.toolResult));

    const assistantMessage = messages.find(
      (message) =>
        message.role === 'ASSISTANT' &&
        message.content === '草稿看过了，先不动。',
    );
    expect(assistantMessage).toBeDefined();

    expect(sessionService.incrementStep).toHaveBeenCalledTimes(1);
    expect(sessionService.incrementStep).toHaveBeenCalledWith(SESSION_ID);
    expect(sessionService.recordUsage).toHaveBeenCalledTimes(2);
    expect(sessionService.recordUsage).toHaveBeenNthCalledWith(
      1,
      SESSION_ID,
      10,
      5,
    );
    expect(sessionService.recordUsage).toHaveBeenNthCalledWith(
      2,
      SESSION_ID,
      7,
      3,
    );
    expect(sessionService.transitionStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'WAITING_USER',
    );

    // 模型配置按食谱设计用途取，工具定义原样交给模型。
    expect(providerConfig.getEnabledDeepSeekRuntimeConfig).toHaveBeenCalledWith(
      {
        purpose: 'RECIPE_DESIGN',
      },
    );
    const firstCall = callModel.mock.calls[0][0];
    expect(firstCall).toMatchObject({
      baseUrl: 'https://api.deepseek.test',
      model: 'deepseek-chat',
      apiKey: 'test-key',
      requestTimeoutMs: 90000,
    });
    expect(firstCall.tools[0]).toEqual({
      type: 'function',
      function: TOOL_DEFINITIONS[0],
    });
    // start 的消息是 system + 本次用户输入；第二轮带上 assistant/tool。
    expect(messageRoles[0]).toEqual(['system', 'user']);
    expect(messageRoles[1]).toEqual(['system', 'user', 'assistant', 'tool']);
  });

  it('start 只把本轮用户消息作为 user，刚追加的那条不会重复进历史 transcript', async () => {
    const sessionService = makeSessionService();
    // 真实 listMessages 在 appendMessage 之后调用，所以一定包含本轮用户消息。
    sessionService.listMessages.mockResolvedValue([
      historyMessage(1, 'USER', '开始'),
    ]);
    const { service, callModel } = makeRunService({
      handlers: {},
      sessionService,
      responses: [finalResponse('好的')],
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '开始',
    });
    await service.waitForIdle(sessionId);

    expect(sessionService.listMessages).toHaveBeenCalledWith(SESSION_ID);
    const messages: Array<{ role: string; content?: string | null }> =
      callModel.mock.calls[0][0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: '开始' });
  });

  it('start 在 getDraft 拒绝时不建会话也不写消息', async () => {
    const designerService = {
      getDraft: jest
        .fn()
        .mockRejectedValue(new NotFoundException('设计草稿不存在')),
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      designerService,
    });

    await expect(
      service.start({
        draftId: DRAFT_ID,
        actor: ACTOR,
        message: '开始',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(designerService.getDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.objectContaining({ userId: 'user-1', role: 'STAFF' }),
    );
    expect(sessionService.createSession).not.toHaveBeenCalled();
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
    expect(sessionService.listMessages).not.toHaveBeenCalled();
  });

  it('本轮自然收尾时不会把已 COMPLETED 的会话改回 WAITING_USER', async () => {
    // 用一个有状态的条件更新模拟数据库：只有当前状态在 from 里才允许改。
    let dbStatus = 'COMPLETED';
    const sessionService = makeSessionService();
    sessionService.transitionStatus.mockImplementation(
      async (_id: string, from: string[], to: string) => {
        if (!from.includes(dbStatus)) return false;
        dbStatus = to;
        return true;
      },
    );
    const { service } = makeRunService({
      handlers: {},
      sessionService,
      responses: [finalResponse('已经完成了')],
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '收尾',
    });
    await service.waitForIdle(sessionId);

    expect(sessionService.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'ASSISTANT',
        content: '已经完成了',
      }),
    );
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      sessionId,
      ['RUNNING'],
      'WAITING_USER',
    );
    expect(dbStatus).toBe('COMPLETED');
  });

  it('ask_user 之后置 WAITING_USER 并停在第一次工具调用', async () => {
    const askUser = jest.fn().mockResolvedValue(okResult({}, '已在对话里提问'));
    const { service, sessionService, callModel } = makeRunService({
      handlers: {
        get_draft: jest.fn(),
        ask_user: askUser,
        finish_draft: jest.fn(),
      },
      responses: [
        toolCallResponse(
          'ask_user',
          JSON.stringify({ questions: [{ question: '主蛋白用鸡胸吗？' }] }),
        ),
      ],
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '开始',
    });
    await service.waitForIdle(sessionId);

    expect(askUser).toHaveBeenCalledTimes(1);
    expect(askUser).toHaveBeenCalledWith({
      questions: [{ question: '主蛋白用鸡胸吗？' }],
    });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(sessionService.incrementStep).toHaveBeenCalledTimes(1);
    expect(sessionService.transitionStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'WAITING_USER',
    );
  });

  it('finish_draft 之后置 COMPLETED 并停在第一次工具调用', async () => {
    const finishDraft = jest
      .fn()
      .mockResolvedValue(okResult({}, '交付确认卡已生成'));
    const { service, sessionService, callModel } = makeRunService({
      handlers: {
        get_draft: jest.fn(),
        ask_user: jest.fn(),
        finish_draft: finishDraft,
      },
      responses: [
        toolCallResponse('finish_draft', JSON.stringify({ summary: '已完成' })),
      ],
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '交付吧',
    });
    await service.waitForIdle(sessionId);

    expect(finishDraft).toHaveBeenCalledTimes(1);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(sessionService.transitionStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'COMPLETED',
    );
  });

  it('模型一直要工具时在第 30 次之后停下，置 FAILED 且不会无限循环', async () => {
    const getDraft = jest.fn().mockResolvedValue(okResult({}, '草稿'));
    let callIndex = 0;
    const callModel = jest.fn(async (input: any) => {
      callIndex += 1;
      return toolCallResponse(
        'get_draft',
        '{}',
        `call-${callIndex}`,
      ) as DeepSeekToolsResult;
    });
    const { service, sessionService } = makeRunService({
      handlers: {
        get_draft: getDraft,
        ask_user: jest.fn(),
        finish_draft: jest.fn(),
      },
      callModel,
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '一直读',
    });
    await service.waitForIdle(sessionId);

    expect(getDraft).toHaveBeenCalledTimes(30);
    expect(callModel).toHaveBeenCalledTimes(30);
    expect(sessionService.incrementStep).toHaveBeenCalledTimes(30);
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'FAILED',
      '超过运行上限',
    );
    expect(sessionService.transitionStatus).not.toHaveBeenCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'WAITING_USER',
    );
  });

  it('超过 6 分钟预算就不再执行工具，置 FAILED', async () => {
    let now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const getDraft = jest.fn().mockResolvedValue(okResult({}, '草稿'));
    const callModel = jest.fn(async () => {
      // 模拟一次很慢的模型调用，把 6 分钟预算用光。
      now += 7 * 60 * 1000;
      return toolCallResponse('get_draft');
    });
    const { service, sessionService } = makeRunService({
      handlers: {
        get_draft: getDraft,
        ask_user: jest.fn(),
        finish_draft: jest.fn(),
      },
      callModel,
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '开始',
    });
    await service.waitForIdle(sessionId);

    expect(callModel).toHaveBeenCalledTimes(1);
    expect(getDraft).not.toHaveBeenCalled();
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'FAILED',
      '超过运行上限',
    );
  });

  it('已有活跃会话时 start 直接拒绝，不建会话也不跑循环', async () => {
    const sessionService = makeSessionService();
    sessionService.assertNoActiveRun.mockRejectedValue(
      new ConflictException('这个草稿已经有一个 AI 运行；先停掉它'),
    );
    const { service, createRuntime } = makeRunService({
      handlers: { get_draft: jest.fn() },
      sessionService,
      responses: [finalResponse('不该跑到这里')],
    });

    await expect(
      service.start({
        draftId: DRAFT_ID,
        actor: ACTOR,
        message: '开始',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(sessionService.createSession).not.toHaveBeenCalled();
    expect(createRuntime).not.toHaveBeenCalled();
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
  });

  it('stop 置 STOPPED，模型迟到的回复不会把状态改回 WAITING_USER', async () => {
    let release: ((value: DeepSeekToolsResult) => void) | undefined;
    const callModel = jest.fn(
      () =>
        new Promise<DeepSeekToolsResult>((resolve) => {
          release = resolve;
        }),
    );
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'RUNNING',
        }),
      },
    };
    const { service, sessionService } = makeRunService({
      handlers: {
        get_draft: jest.fn(),
        ask_user: jest.fn(),
        finish_draft: jest.fn(),
      },
      prisma,
      callModel,
    });

    const { sessionId } = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '开始',
    });
    // 等循环真的发起模型调用后，再停。
    await new Promise((resolve) => setImmediate(resolve));
    expect(callModel).toHaveBeenCalledTimes(1);

    await service.stop(sessionId, ACTOR);
    expect(sessionService.transitionStatus).toHaveBeenLastCalledWith(
      sessionId,
      ['RUNNING', 'WAITING_USER'],
      'STOPPED',
    );

    release?.(finalResponse('这是被停掉之后迟到的回复'));
    await service.waitForIdle(sessionId);

    expect(sessionService.transitionStatus).toHaveBeenCalledTimes(1);
    expect(sessionService.transitionStatus).not.toHaveBeenCalledWith(
      sessionId,
      ['RUNNING'],
      'WAITING_USER',
    );
    expect(
      messageCalls(sessionService).filter(
        (message) => message.role === 'ASSISTANT',
      ),
    ).toHaveLength(0);
  });

  it('stop 在 getDraft 拒绝时不改会话状态', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'RUNNING',
        }),
      },
    };
    const designerService = {
      getDraft: jest
        .fn()
        .mockRejectedValue(new NotFoundException('设计草稿不存在')),
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
      designerService,
    });

    await expect(service.stop(SESSION_ID, ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(designerService.getDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(sessionService.transitionStatus).not.toHaveBeenCalled();
  });

  it('两个并发 start 同一个草稿只有一个成功，createSession 只调用一次', async () => {
    const { service, sessionService } = makeRunService({
      handlers: {},
      responses: [finalResponse('好了')],
    });

    const results = await Promise.allSettled([
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '第一个' }),
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '第二个' }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason.message).toBe('这个草稿已经有一个 AI 运行');
    expect(sessionService.createSession).toHaveBeenCalledTimes(1);

    await service.waitForIdle(SESSION_ID);
  });

  it('草稿锁一直持有到后台循环结束，结束之后才允许下一次 start', async () => {
    let release: ((value: DeepSeekToolsResult) => void) | undefined;
    const callModel = jest.fn(
      () =>
        new Promise<DeepSeekToolsResult>((resolve) => {
          release = resolve;
        }),
    );
    const sessionService = makeSessionService();
    sessionService.createSession
      .mockResolvedValueOnce({
        id: 'session-1',
        designRecipeId: DRAFT_ID,
        status: 'RUNNING',
      })
      .mockResolvedValueOnce({
        id: 'session-2',
        designRecipeId: DRAFT_ID,
        status: 'RUNNING',
      });
    const { service } = makeRunService({
      handlers: {},
      sessionService,
      callModel,
    });

    const first = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '第一次',
    });
    expect(first.sessionId).toBe('session-1');
    await new Promise((resolve) => setImmediate(resolve));

    // 循环还在跑：草稿锁不能放。
    await expect(
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '插队' }),
    ).rejects.toBeInstanceOf(ConflictException);

    release?.(finalResponse('第一次完成'));
    await service.waitForIdle('session-1');

    const second = await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '第二次',
    });
    expect(second.sessionId).toBe('session-2');

    await new Promise((resolve) => setImmediate(resolve));
    release?.(finalResponse('第二次完成'));
    await service.waitForIdle('session-2');
  });

  it('start 在 getDraft 拒绝后释放草稿锁', async () => {
    const designerService = {
      getDraft: jest
        .fn()
        .mockRejectedValueOnce(new NotFoundException('设计草稿不存在'))
        .mockResolvedValue({ draftId: DRAFT_ID }),
    };
    const { service } = makeRunService({
      handlers: {},
      designerService,
      responses: [finalResponse('好了')],
    });

    await expect(
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '第一次' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '第二次' }),
    ).resolves.toEqual({ sessionId: SESSION_ID });
    await service.waitForIdle(SESSION_ID);
  });

  it('resume 启动的循环持有草稿锁：stop 之后 start 仍被拒绝，直到旧循环结束', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    // 让 resume 启动的循环卡在工具里：此时 stop 不会释放草稿锁。
    let releaseTool: ((value: AgentToolResult<unknown>) => void) | undefined;
    const getDraft = jest.fn(
      () =>
        new Promise<AgentToolResult<unknown>>((resolve) => {
          releaseTool = resolve;
        }),
    );
    const sessionService = makeSessionService();
    sessionService.createSession.mockResolvedValueOnce({
      id: 'session-2',
      designRecipeId: DRAFT_ID,
      status: 'RUNNING',
    });
    const { service } = makeRunService({
      handlers: {
        get_draft: getDraft,
        ask_user: jest.fn(),
        finish_draft: jest.fn(),
      },
      prisma,
      sessionService,
      responses: [toolCallResponse('get_draft'), finalResponse('旧循环结束')],
    });

    await service.resume({
      sessionId: SESSION_ID,
      actor: ACTOR,
      message: '继续',
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(getDraft).toHaveBeenCalledTimes(1);

    // stop 只落状态，不释放草稿锁：旧循环还在飞。
    await service.stop(SESSION_ID, ACTOR);
    expect(sessionService.createSession).not.toHaveBeenCalled();

    const error = await service
      .start({ draftId: DRAFT_ID, actor: ACTOR, message: '插队' })
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('这个草稿已经有一个 AI 运行');
    expect(sessionService.createSession).not.toHaveBeenCalled();

    // 放行旧循环，让它自己走完 finally 释放草稿锁。
    releaseTool?.(okResult({}, '草稿'));
    await service.waitForIdle(SESSION_ID);

    await expect(
      service.start({ draftId: DRAFT_ID, actor: ACTOR, message: '重新开始' }),
    ).resolves.toEqual({ sessionId: 'session-2' });
    expect(sessionService.createSession).toHaveBeenCalledTimes(1);
    await service.waitForIdle('session-2');
  });

  it('两个并发 resume 同一个 WAITING 会话只有一个成功，用户消息只追加一次', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
      responses: [finalResponse('继续了')],
    });

    const results = await Promise.allSettled([
      service.resume({
        sessionId: SESSION_ID,
        actor: ACTOR,
        message: '继续一',
      }),
      service.resume({
        sessionId: SESSION_ID,
        actor: ACTOR,
        message: '继续二',
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);
    expect(rejected[0].reason.message).toBe('这个会话正在运行');
    expect(
      sessionService.transitionStatus.mock.calls.filter(
        ([, , to]) => to === 'RUNNING',
      ),
    ).toHaveLength(1);
    expect(
      messageCalls(sessionService).filter((message) => message.role === 'USER'),
    ).toHaveLength(1);

    await service.waitForIdle(SESSION_ID);
  });

  it('正在运行的会话不能 resume', async () => {
    let release: ((value: DeepSeekToolsResult) => void) | undefined;
    const callModel = jest.fn(
      () =>
        new Promise<DeepSeekToolsResult>((resolve) => {
          release = resolve;
        }),
    );
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
      callModel,
    });

    await service.start({
      draftId: DRAFT_ID,
      actor: ACTOR,
      message: '开始',
    });
    await new Promise((resolve) => setImmediate(resolve));

    const error = await service
      .resume({ sessionId: SESSION_ID, actor: ACTOR, message: '继续' })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('这个会话正在运行');
    expect(
      sessionService.transitionStatus.mock.calls.filter(
        ([, , to]) => to === 'RUNNING',
      ),
    ).toHaveLength(0);

    release?.(finalResponse('完成'));
    await service.waitForIdle(SESSION_ID);
  });

  it('stop 之后再 resume 会被拒绝，状态保持 STOPPED', async () => {
    let dbStatus = 'WAITING_USER';
    const sessionService = makeSessionService();
    sessionService.transitionStatus.mockImplementation(
      async (_id: string, from: string[], to: string) => {
        if (!from.includes(dbStatus)) return false;
        dbStatus = to;
        return true;
      },
    );
    const prisma = {
      recipeDesignAgentSession: {
        // 模拟并发窗口：停止之后仍然读到旧快照（WAITING_USER）。
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    const { service, createRuntime } = makeRunService({
      handlers: {},
      prisma,
      sessionService,
    });

    await service.stop(SESSION_ID, ACTOR);
    expect(dbStatus).toBe('STOPPED');

    sessionService.appendMessage.mockClear();
    const error = await service
      .resume({ sessionId: SESSION_ID, actor: ACTOR, message: '继续' })
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('会话已经结束或被停止');
    expect(dbStatus).toBe('STOPPED');
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('stop 一个已经 COMPLETED 的会话抛冲突，状态不会变成 STOPPED', async () => {
    let dbStatus = 'COMPLETED';
    const sessionService = makeSessionService();
    sessionService.transitionStatus.mockImplementation(
      async (_id: string, from: string[], to: string) => {
        if (!from.includes(dbStatus)) return false;
        dbStatus = to;
        return true;
      },
    );
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'COMPLETED',
        }),
      },
    };
    const { service } = makeRunService({
      handlers: {},
      prisma,
      sessionService,
    });

    const error = await service
      .stop(SESSION_ID, ACTOR)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).toBe('会话已经结束');
    expect(dbStatus).toBe('COMPLETED');
  });

  it('stop 已经 STOPPED 的会话是幂等的，不抛冲突', async () => {
    const dbStatus = 'STOPPED';
    const sessionService = makeSessionService();
    sessionService.transitionStatus.mockResolvedValue(false);
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: dbStatus,
        }),
      },
    };
    const { service } = makeRunService({
      handlers: {},
      prisma,
      sessionService,
    });

    await expect(service.stop(SESSION_ID, ACTOR)).resolves.toBeUndefined();
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      SESSION_ID,
      ['RUNNING', 'WAITING_USER'],
      'STOPPED',
    );
  });

  it('getSessionView 在 getDraft 拒绝时不查会话和消息', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findFirst: jest.fn().mockResolvedValue({ id: SESSION_ID }),
      },
    };
    const designerService = {
      getDraft: jest
        .fn()
        .mockRejectedValue(new NotFoundException('设计草稿不存在')),
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
      designerService,
    });

    await expect(
      service.getSessionView(DRAFT_ID, ACTOR),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.recipeDesignAgentSession.findFirst).not.toHaveBeenCalled();
    expect(sessionService.listMessages).not.toHaveBeenCalled();
  });

  it('getSessionView 返回会话、消息、审批（按申请时间升序）和空的交付卡', async () => {
    const requestedAt = new Date('2026-10-24T10:00:00Z');
    const approval = {
      id: APPROVAL_ID,
      sessionId: SESSION_ID,
      type: 'CATEGORY_OMISSION',
      status: 'PENDING',
      reason: '用户不要内脏',
      detail: { categories: ['内脏'] },
      requestedAt,
      decidedBy: null,
      decidedAt: null,
    };
    const session = {
      id: SESSION_ID,
      designRecipeId: DRAFT_ID,
      status: 'WAITING_USER',
    };
    const message = historyMessage(1, 'USER', '不要内脏');
    const prisma = {
      recipeDesignAgentSession: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
      recipeDesignAgentApproval: {
        findMany: jest.fn().mockResolvedValue([approval]),
      },
      recipeDesignAgentSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const sessionService = makeSessionService();
    sessionService.listMessages.mockResolvedValue([message]);
    const { service } = makeRunService({
      handlers: {},
      prisma,
      sessionService,
    });

    await expect(service.getSessionView(DRAFT_ID, ACTOR)).resolves.toEqual({
      session,
      messages: [message],
      approvals: [{ ...approval, createdAt: requestedAt }],
      delivery: null,
    });
    expect(prisma.recipeDesignAgentApproval.findMany).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: { requestedAt: 'asc' },
    });
  });

  it('getSessionView 用最近一次快照构建交付卡', async () => {
    const createdAt = new Date('2026-10-24T12:30:00Z');
    const session = {
      id: SESSION_ID,
      designRecipeId: DRAFT_ID,
      status: 'COMPLETED',
    };
    const snapshotRow = {
      snapshot: {
        draft: { draftId: DRAFT_ID },
        summary: '七类齐全、评估达标，可以交付。',
        warnings: ['钙接近下限，建议下轮再补一点。'],
      },
      contentRevision: 7,
      createdAt,
    };
    const prisma = {
      recipeDesignAgentSession: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
      recipeDesignAgentApproval: { findMany: jest.fn().mockResolvedValue([]) },
      recipeDesignAgentSnapshot: {
        findFirst: jest.fn().mockResolvedValue(snapshotRow),
      },
    };
    const { service } = makeRunService({ handlers: {}, prisma });

    await expect(service.getSessionView(DRAFT_ID, ACTOR)).resolves.toEqual({
      session,
      messages: [],
      approvals: [],
      delivery: {
        summary: '七类齐全、评估达标，可以交付。',
        warnings: ['钙接近下限，建议下轮再补一点。'],
        contentRevision: 7,
        createdAt,
      },
    });
    expect(prisma.recipeDesignAgentSnapshot.findFirst).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID },
      orderBy: { createdAt: 'desc' },
      select: { snapshot: true, contentRevision: true, createdAt: true },
    });
  });

  it('getSessionView 在快照结构不完整时不返回交付卡', async () => {
    const session = {
      id: SESSION_ID,
      designRecipeId: DRAFT_ID,
      status: 'COMPLETED',
    };
    const prisma = {
      recipeDesignAgentSession: {
        findFirst: jest.fn().mockResolvedValue(session),
      },
      recipeDesignAgentApproval: { findMany: jest.fn().mockResolvedValue([]) },
      recipeDesignAgentSnapshot: {
        findFirst: jest.fn().mockResolvedValue({
          // 缺 summary：当坏数据，不拼半张卡给前端。
          snapshot: { warnings: [] },
          contentRevision: 7,
          createdAt: new Date('2026-10-24T12:30:00Z'),
        }),
      },
    };
    const { service } = makeRunService({ handlers: {}, prisma });

    const view = await service.getSessionView(DRAFT_ID, ACTOR);

    expect(view?.delivery).toBeNull();
  });

  describe('decideApproval', () => {
    it('校验草稿访问后委托审批服务决定，并带上审批人和结果', async () => {
      const prisma = makeApprovalDecisionPrisma();
      const decided = {
        id: APPROVAL_ID,
        sessionId: SESSION_ID,
        type: 'CATEGORY_OMISSION',
        status: 'APPROVED',
      };
      const approvalService = {
        getApprovalState: jest.fn(),
        decide: jest.fn().mockResolvedValue(decided),
      };
      const { service, designerService } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      await expect(
        service.decideApproval(APPROVAL_ID, { status: 'APPROVED' }, ACTOR),
      ).resolves.toBe(decided);

      expect(designerService.getDraft).toHaveBeenCalledWith(DRAFT_ID, ACTOR);
      expect(approvalService.decide).toHaveBeenCalledWith(APPROVAL_ID, {
        status: 'APPROVED',
        decidedBy: ACTOR.userId,
      });
    });

    it('无草稿访问权时拒绝，且不写审批结果', async () => {
      const prisma = makeApprovalDecisionPrisma();
      const designerService = {
        getDraft: jest
          .fn()
          .mockRejectedValue(new NotFoundException('设计草稿不存在')),
      };
      const approvalService = { decide: jest.fn() };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        designerService,
        approvalService,
      });

      await expect(
        service.decideApproval(APPROVAL_ID, { status: 'APPROVED' }, ACTOR),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(approvalService.decide).not.toHaveBeenCalled();
    });

    it('审批不存在时返回 404，不再查会话', async () => {
      const prisma = makeApprovalDecisionPrisma({ approval: null });
      const approvalService = { decide: jest.fn() };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      const error = await service
        .decideApproval(APPROVAL_ID, { status: 'APPROVED' }, ACTOR)
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('审批不存在');
      expect(prisma.recipeDesignAgentSession.findUnique).not.toHaveBeenCalled();
      expect(approvalService.decide).not.toHaveBeenCalled();
    });

    it('审批所属会话不存在时返回 404', async () => {
      const prisma = makeApprovalDecisionPrisma({ session: null });
      const approvalService = { decide: jest.fn() };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      const error = await service
        .decideApproval(APPROVAL_ID, { status: 'APPROVED' }, ACTOR)
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('会话不存在');
      expect(approvalService.decide).not.toHaveBeenCalled();
    });

    it('达标例外只有 ADMIN 能决定；普通员工被拒且不写审批结果', async () => {
      const prisma = makeApprovalDecisionPrisma({
        approval: {
          id: APPROVAL_ID,
          sessionId: SESSION_ID,
          type: 'COMPLIANCE_EXCEPTION',
          status: 'PENDING',
        },
      });
      const approvalService = { decide: jest.fn() };
      const { service, designerService } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      const error = await service
        .decideApproval(
          APPROVAL_ID,
          { status: 'APPROVED' },
          { ...ACTOR, role: 'STAFF' },
        )
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error.message).toBe('只有管理员可以批准达标例外');
      expect(designerService.getDraft).toHaveBeenCalledTimes(1);
      expect(approvalService.decide).not.toHaveBeenCalled();
    });

    it('ADMIN 可以决定达标例外', async () => {
      const prisma = makeApprovalDecisionPrisma({
        approval: {
          id: APPROVAL_ID,
          sessionId: SESSION_ID,
          type: 'COMPLIANCE_EXCEPTION',
          status: 'PENDING',
        },
      });
      const approvalService = {
        decide: jest.fn().mockResolvedValue({ id: APPROVAL_ID }),
      };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      await expect(
        service.decideApproval(
          APPROVAL_ID,
          { status: 'APPROVED' },
          { ...ACTOR, role: 'ADMIN' },
        ),
      ).resolves.toEqual({ id: APPROVAL_ID });
      expect(approvalService.decide).toHaveBeenCalledWith(APPROVAL_ID, {
        status: 'APPROVED',
        decidedBy: ACTOR.userId,
      });
    });

    it('已经处理过的审批返回冲突，不重复写', async () => {
      const prisma = makeApprovalDecisionPrisma({
        approval: {
          id: APPROVAL_ID,
          sessionId: SESSION_ID,
          type: 'CATEGORY_OMISSION',
          status: 'APPROVED',
        },
      });
      const approvalService = { decide: jest.fn() };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        approvalService,
      });

      const error = await service
        .decideApproval(APPROVAL_ID, { status: 'REJECTED' }, ACTOR)
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toBe('这条审批已经处理过了');
      expect(approvalService.decide).not.toHaveBeenCalled();
    });

    it('先校验访问权再校验管理员权限，未授权者拿不到角色错误', async () => {
      const prisma = makeApprovalDecisionPrisma({
        approval: {
          id: APPROVAL_ID,
          sessionId: SESSION_ID,
          type: 'COMPLIANCE_EXCEPTION',
          status: 'PENDING',
        },
      });
      const designerService = {
        getDraft: jest
          .fn()
          .mockRejectedValue(new NotFoundException('设计草稿不存在')),
      };
      const approvalService = { decide: jest.fn() };
      const { service } = makeRunService({
        handlers: {},
        prisma,
        designerService,
        approvalService,
      });

      await expect(
        service.decideApproval(
          APPROVAL_ID,
          { status: 'APPROVED' },
          { ...ACTOR, role: 'STAFF' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(approvalService.decide).not.toHaveBeenCalled();
    });
  });

  it('resume 只接受 WAITING_USER，追加用户消息后重置 RUNNING 并继续跑', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    const getDraft = jest.fn().mockResolvedValue(okResult({}, '草稿'));
    const { service, sessionService } = makeRunService({
      handlers: {
        get_draft: getDraft,
        ask_user: jest.fn(),
        finish_draft: jest.fn(),
      },
      prisma,
      responses: [toolCallResponse('get_draft'), finalResponse('继续看过了')],
    });

    await service.resume({
      sessionId: SESSION_ID,
      actor: ACTOR,
      message: '继续',
    });
    await service.waitForIdle(SESSION_ID);

    expect(sessionService.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        role: 'USER',
        content: '继续',
      }),
    );
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      SESSION_ID,
      ['WAITING_USER'],
      'RUNNING',
    );
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(sessionService.transitionStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
      ['RUNNING'],
      'WAITING_USER',
    );
  });

  it('resume 遇到非 WAITING_USER 的会话拒绝', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'COMPLETED',
        }),
      },
    };
    const { service, createRuntime } = makeRunService({
      handlers: { get_draft: jest.fn() },
      prisma,
    });

    await expect(
      service.resume({
        sessionId: SESSION_ID,
        actor: ACTOR,
        message: '继续',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('resume 把上一轮助手提问和工具结果放进 system transcript，模型能看到用户回答的是什么', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'WAITING_USER',
        }),
      },
    };
    const sessionService = makeSessionService();
    // 包含刚追加的“第二个”，运行服务应该把它从 transcript 里剔除，
    // 只作为最后一条 user 消息传给模型。
    sessionService.listMessages.mockResolvedValue([
      historyMessage(1, 'USER', '开始设计'),
      historyMessage(2, 'ASSISTANT', '主蛋白用鸡胸还是三文鱼？'),
      historyMessage(
        3,
        'TOOL',
        JSON.stringify({ ok: true, summary: '已在对话里提问' }),
        {
          toolName: 'ask_user',
          toolResult: { ok: true, summary: '已在对话里提问' },
        },
      ),
      historyMessage(4, 'USER', '第二个'),
    ]);
    const { service, callModel } = makeRunService({
      handlers: {},
      prisma,
      sessionService,
      responses: [finalResponse('那用三文鱼。')],
    });

    await service.resume({
      sessionId: SESSION_ID,
      actor: ACTOR,
      message: '第二个',
    });
    await service.waitForIdle(SESSION_ID);

    expect(sessionService.listMessages).toHaveBeenCalledWith(SESSION_ID);
    const messages: Array<{ role: string; content?: string | null }> =
      callModel.mock.calls[0][0].messages;

    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('system');
    const historyTranscript = messages[1].content as string;
    expect(historyTranscript).toContain('历史对话（最近 3 条）：');
    expect(historyTranscript).toContain('助手：主蛋白用鸡胸还是三文鱼？');
    expect(historyTranscript).toContain('工具 ask_user：');
    expect(historyTranscript).not.toContain('用户：第二个');
    expect(messages[messages.length - 1]).toEqual({
      role: 'user',
      content: '第二个',
    });
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(
      1,
    );
  });

  it('resume 先校验草稿访问，再判断会话状态', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: SESSION_ID,
          designRecipeId: DRAFT_ID,
          status: 'COMPLETED',
        }),
      },
    };
    const designerService = {
      getDraft: jest
        .fn()
        .mockRejectedValue(new NotFoundException('设计草稿不存在')),
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
      designerService,
    });

    // 访问失败优先于“只有 WAITING_USER 可以继续”的状态校验。
    await expect(
      service.resume({
        sessionId: SESSION_ID,
        actor: ACTOR,
        message: '继续',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(designerService.getDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
    expect(sessionService.transitionStatus).not.toHaveBeenCalled();
    expect(sessionService.listMessages).not.toHaveBeenCalled();
  });

  it('markInterruptedOnBoot 委托会话服务', async () => {
    const sessionService = makeSessionService();
    sessionService.markInterruptedRuns.mockResolvedValue(2);
    const { service } = makeRunService({ handlers: {}, sessionService });

    await expect(service.markInterruptedOnBoot()).resolves.toBe(2);
    expect(sessionService.markInterruptedRuns).toHaveBeenCalledTimes(1);
  });
});
