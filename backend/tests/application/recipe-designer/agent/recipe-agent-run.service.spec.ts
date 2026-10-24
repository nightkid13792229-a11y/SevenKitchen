import { BadRequestException, ConflictException } from '@nestjs/common';
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
    updateStatus: jest.fn().mockResolvedValue(undefined),
    recordUsage: jest.fn().mockResolvedValue(undefined),
    incrementStep: jest.fn().mockResolvedValue(undefined),
    markInterruptedRuns: jest.fn().mockResolvedValue(0),
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
}) {
  const sessionService = options.sessionService ?? makeSessionService();
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
    { getApprovalState: jest.fn() } as any,
    {} as any,
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
    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
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

  it('本轮自然收尾时不会把已 COMPLETED 的会话改回 WAITING_USER', async () => {
    const prisma = {
      recipeDesignAgentSession: {
        findUnique: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      },
    };
    const { service, sessionService } = makeRunService({
      handlers: {},
      prisma,
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
    expect(sessionService.updateStatus).not.toHaveBeenCalledWith(
      sessionId,
      'WAITING_USER',
    );
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
    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
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
    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
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
    expect(sessionService.updateStatus).toHaveBeenCalledWith(
      SESSION_ID,
      'FAILED',
      '超过运行上限',
    );
    expect(sessionService.updateStatus).not.toHaveBeenCalledWith(
      SESSION_ID,
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
    expect(sessionService.updateStatus).toHaveBeenCalledWith(
      SESSION_ID,
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
    const { service, sessionService } = makeRunService({
      handlers: {
        get_draft: jest.fn(),
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
    // 等循环真的发起模型调用后，再停。
    await new Promise((resolve) => setImmediate(resolve));
    expect(callModel).toHaveBeenCalledTimes(1);

    await service.stop(sessionId);
    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      sessionId,
      'STOPPED',
    );

    release?.(finalResponse('这是被停掉之后迟到的回复'));
    await service.waitForIdle(sessionId);

    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      sessionId,
      'STOPPED',
    );
    expect(sessionService.updateStatus).not.toHaveBeenCalledWith(
      sessionId,
      'WAITING_USER',
    );
    expect(
      messageCalls(sessionService).filter(
        (message) => message.role === 'ASSISTANT',
      ),
    ).toHaveLength(0);
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
    expect(sessionService.updateStatus).toHaveBeenCalledWith(
      SESSION_ID,
      'RUNNING',
    );
    expect(getDraft).toHaveBeenCalledTimes(1);
    expect(sessionService.updateStatus).toHaveBeenLastCalledWith(
      SESSION_ID,
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

  it('markInterruptedOnBoot 委托会话服务', async () => {
    const sessionService = makeSessionService();
    sessionService.markInterruptedRuns.mockResolvedValue(2);
    const { service } = makeRunService({ handlers: {}, sessionService });

    await expect(service.markInterruptedOnBoot()).resolves.toBe(2);
    expect(sessionService.markInterruptedRuns).toHaveBeenCalledTimes(1);
  });
});
