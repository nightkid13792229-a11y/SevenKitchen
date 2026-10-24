/**
 * Agent 运行循环（P0b-3 Task 3）。
 *
 * 一次运行 = 一个会话：`start` 建会话后把循环放到后台（HTTP 立刻拿到
 * sessionId），循环负责调模型、执行工具、写消息/步数/用量，并在
 * `ask_user`、`finish_draft`、最终文本、30 次工具调用、6 分钟这几处停下。
 *
 * 状态语义：
 * - `RUNNING`：循环正在跑；
 * - `WAITING_USER`：模型提问或本轮自然结束，等人继续；
 * - `COMPLETED`：`finish_draft` 成功；
 * - `STOPPED`：人工停止，循环不再覆盖；
 * - `FAILED`：异常或超过运行上限，`lastError` 记录原因。
 *
 * 审批状态不在这里判断：`check_ready` / `finish_draft` 由工具箱内部从
 * `getApprovalState()` 读，模型参数不可信。
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma.service';
import { AgentProviderConfigService } from '../../nutrition-governance/agent-provider-config.service';
import { RECIPE_DESIGN_AGENT_PURPOSE } from '../ai-design-suggestion.service';
import {
  callDeepSeekTools,
  type DeepSeekToolCall,
  type DeepSeekToolDefinition,
  type DeepSeekToolsMessage,
  type DeepSeekToolsUsage,
} from '../deepseek-tools-chat';
import { RecipeDesignerService } from '../recipe-designer.service';
import type { AgentToolResult, HealthTagPolicy } from './agent-types';
import { DraftHealthTagPolicy } from './draft-health-tag-policy';
import { RecipeAgentApprovalService } from './recipe-agent-approval.service';
import { RecipeAgentControlService } from './recipe-agent-control.service';
import type {
  RecipeAgentControlPort,
  RecipeAgentDraftPort,
} from './recipe-agent.port';
import { RecipeAgentSessionService } from './recipe-agent-session.service';
import { RecipeDesignerAgentAdapter } from './recipe-designer-agent.adapter';
import type { AgentToolDefinition } from './tool-registry';
import { createRecipeAgentToolkit, type RecipeAgentToolkit } from './toolkit';

/** 一次运行的最大工具调用次数。 */
const MAX_TOOL_CALLS = 30;
/** 一次运行的最大墙钟时间。 */
const MAX_RUN_MS = 6 * 60 * 1000;
/** 失败时给会话留下的错误码文案；与外层 HTTP 错误无关。 */
const OVER_LIMIT_MESSAGE = '超过运行上限';

/**
 * 模型调用函数。默认是 DeepSeek 工具调用客户端；测试或后续切供应商时
 * 可以注入一个同签名的实现。
 */
export const RECIPE_AGENT_CALL_MODEL = Symbol('RECIPE_AGENT_CALL_MODEL');

export type RecipeAgentCallModel = typeof callDeepSeekTools;

/** 调工具的当前员工身份；与后台草稿接口的 access 入参保持一致。 */
export interface RecipeAgentRunActor {
  userId: string;
  role?: string | null;
  customerId?: string | null;
}

/** 一次运行所需的适配器、控制面与工具箱。 */
export interface RecipeAgentRuntime {
  adapter: RecipeAgentDraftPort;
  control: RecipeAgentControlPort;
  toolkit: RecipeAgentToolkit;
  tagPolicy: HealthTagPolicy;
}

/** 会改草稿内容、需要重建健康标签策略的工具。 */
const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'add_ingredient',
  'replace_ingredient',
  'update_weight',
  'remove_ingredient',
  'set_preparation',
  'set_copy',
  'set_production_steps',
  'run_assessment',
]);

const SYSTEM_PROMPT = `你是 SevenKitchen 的食谱设计 Agent，负责在当前草稿上完成配方、文案和制作步骤。

工作规则：
- 必须通过工具读写草稿，不要凭空编造原料、克数、营养数据或审批状态。
- 开始先调用 get_draft 读当前草稿；内容被改过后要重新读。
- 每次写完原料 / 文案 / 制作步骤后，调用 run_assessment 重新评估，再用 check_ready 看交付条件。
- 只有 check_ready 通过后才能调用 finish_draft；没通过就继续修复，不要跳过检查。
- 例外只能调用 request_exception 申请，审批只能由人做；绝不要自称已批准或绕过检查。
- 信息不足、需要人拍板时调用 ask_user 提问；不确定就停下来问，不要猜。
- 营养指标按“目标区间内留 20% 余量”作为工作标准，不要把数值卡在边界上。
- 回复用简洁中文，说明改了什么、还差什么。`;

/**
 * 一次运行的后台循环：模型调用、工具执行、状态推进与停止条件。
 *
 * 运行时（适配器 / 控制面 / 工具箱）由 `createRuntime` 构造，
 * 测试可以整体替换它来避开真实数据库。
 */
@Injectable()
export class RecipeAgentRunService {
  private readonly running = new Map<string, Promise<void>>();
  private readonly stopped = new Set<string>();

  constructor(
    private readonly sessionService: RecipeAgentSessionService,
    private readonly approvalService: RecipeAgentApprovalService,
    private readonly designerService: RecipeDesignerService,
    private readonly prisma: PrismaService,
    private readonly providerConfig: AgentProviderConfigService,
    @Optional()
    @Inject(RECIPE_AGENT_CALL_MODEL)
    private readonly callModel: RecipeAgentCallModel = callDeepSeekTools,
  ) {}

  /** 开一次新运行：先抢运行锁，建会话，再把循环放到后台。 */
  async start(input: {
    draftId: string;
    actor: RecipeAgentRunActor;
    message: string;
  }): Promise<{ sessionId: string }> {
    await this.sessionService.assertNoActiveRun(input.draftId);

    const session = await this.sessionService.createSession({
      designRecipeId: input.draftId,
      createdBy: input.actor.userId,
      skillName: 'recipe-design',
      skillVersion: 'v1',
    });
    const sessionId = session.id;

    try {
      await this.sessionService.appendMessage({
        sessionId,
        role: 'USER',
        content: input.message,
      });
    } catch (error) {
      // 会话已经建出来了，不能再把异常抛给 HTTP；失败落到状态里。
      await this.failSession(sessionId, error);
      return { sessionId };
    }

    this.launch(sessionId, input.draftId, input.actor, input.message);
    return { sessionId };
  }

  /** 人回答 / 继续之后恢复运行；只有 WAITING_USER 的会话可以继续。 */
  async resume(input: {
    sessionId: string;
    actor: RecipeAgentRunActor;
    message: string;
  }): Promise<void> {
    const session = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session) {
      throw new NotFoundException('会话不存在');
    }
    if (session.status !== 'WAITING_USER') {
      throw new BadRequestException('只有等待用户回答的会话可以继续');
    }

    try {
      await this.sessionService.appendMessage({
        sessionId: input.sessionId,
        role: 'USER',
        content: input.message,
      });
      await this.sessionService.updateStatus(input.sessionId, 'RUNNING');
    } catch (error) {
      await this.failSession(input.sessionId, error);
      return;
    }

    this.launch(
      input.sessionId,
      session.designRecipeId,
      input.actor,
      input.message,
    );
  }

  /** 人工停止：先记账再落状态，循环看到标记后不再覆盖。 */
  async stop(sessionId: string): Promise<void> {
    this.stopped.add(sessionId);
    await this.sessionService.updateStatus(sessionId, 'STOPPED');
  }

  /** 等某次运行的后台循环结束；测试和 controller 测试用。 */
  async waitForIdle(sessionId: string): Promise<void> {
    const running = this.running.get(sessionId);
    if (running) {
      await running;
    }
  }

  /** 进程启动时把上次中断的 RUNNING 会话标记为 INTERRUPTED。 */
  async markInterruptedOnBoot(): Promise<number> {
    return this.sessionService.markInterruptedRuns();
  }

  /**
   * 造当前运行需要的适配器 / 控制面 / 工具箱 / 健康标签策略。
   *
   * 每次写工具之后都会重新调用一次：写操作会让内容版本和营养摘要变化，
   * 健康标签策略必须基于**新的草稿**重建，否则会用旧摘要误挂标签。
   */
  protected async createRuntime(
    draftId: string,
    actor: RecipeAgentRunActor,
    sessionId: string,
  ): Promise<RecipeAgentRuntime> {
    const adapter = new RecipeDesignerAgentAdapter(
      this.designerService,
      this.prisma,
      actor,
      draftId,
    );
    const control = new RecipeAgentControlService(
      this.sessionService,
      this.approvalService,
      this.prisma,
      adapter,
      sessionId,
      draftId,
    );

    const draft = await adapter.getDraft(draftId);
    const tagPolicy = new DraftHealthTagPolicy({
      fatWetPercent: draft.nutritionSummary?.fatWetPercent ?? null,
      moisturePercent: draft.nutritionSummary?.moisturePercent ?? null,
      animalSpecies: draft.animalSpecies ?? [],
      unknownAnimalProtein: draft.unknownAnimalProtein ?? false,
    });

    const toolkit = createRecipeAgentToolkit({
      port: adapter,
      controlPort: control,
      tagPolicy,
      draftId,
    });

    return { adapter, control, toolkit, tagPolicy };
  }

  /** 后台跑循环；任何异常都收在会话状态里，不往外抛。 */
  private launch(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentRunActor,
    message: string,
  ): void {
    const running = this.runLoop(sessionId, draftId, actor, message).catch(
      async (error) => {
        await this.failSession(sessionId, error);
      },
    );

    this.running.set(sessionId, running);
    void running.finally(() => {
      if (this.running.get(sessionId) === running) {
        this.running.delete(sessionId);
      }
    });
  }

  private async runLoop(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentRunActor,
    message: string,
  ): Promise<void> {
    const startedAt = Date.now();
    let toolCallCount = 0;

    try {
      let runtime = await this.createRuntime(draftId, actor, sessionId);
      const config = await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_DESIGN_AGENT_PURPOSE,
      });
      const tools = toToolDefinitions(runtime.toolkit.definitions);

      // 每次运行只带 system + 本轮用户输入；历史消息留在库里做审计，
      // 模型需要上下文时用 get_draft 重新读草稿。
      const messages: DeepSeekToolsMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ];

      while (true) {
        if (this.isStopped(sessionId)) return;
        if (this.isOverTime(startedAt)) {
          await this.failOverLimit(sessionId);
          return;
        }

        let usageReported = false;
        let usagePromise: Promise<void> = Promise.resolve();
        const response = await this.callModel({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          requestTimeoutMs: config.requestTimeoutMs,
          messages,
          tools,
          onUsage: (usage: DeepSeekToolsUsage) => {
            usageReported = true;
            usagePromise = this.sessionService.recordUsage(
              sessionId,
              usage.promptTokens,
              usage.completionTokens,
            );
          },
        });
        await usagePromise;
        if (!usageReported && response.usage) {
          await this.sessionService.recordUsage(
            sessionId,
            response.usage.promptTokens,
            response.usage.completionTokens,
          );
        }
        if (this.isStopped(sessionId)) return;

        const content = normalizeContent(response.content);
        const toolCalls = response.toolCalls ?? [];

        // 模型给了最终文本：本轮自然结束，等用户继续。
        if (toolCalls.length === 0) {
          if (content) {
            await this.appendAssistant(sessionId, content);
          }
          await this.markWaitingForUser(sessionId);
          return;
        }

        // OpenAI 协议要求 assistant(tool_calls) 在 tool 消息之前。
        messages.push({
          role: 'assistant',
          content: content ?? null,
          tool_calls: toolCalls,
        });
        if (content) {
          await this.appendAssistant(sessionId, content);
        }

        for (const toolCall of toolCalls) {
          if (this.isStopped(sessionId)) return;
          if (toolCallCount >= MAX_TOOL_CALLS || this.isOverTime(startedAt)) {
            await this.failOverLimit(sessionId);
            return;
          }

          const outcome = await this.executeToolCall(runtime, toolCall);
          if (this.isStopped(sessionId)) return;

          const serialized = JSON.stringify(outcome.result);
          await this.sessionService.appendMessage({
            sessionId,
            role: 'TOOL',
            content: serialized,
            toolName: outcome.name,
            toolArgs: outcome.args,
            toolResult: outcome.result,
          });
          await this.sessionService.incrementStep(sessionId);
          toolCallCount += 1;
          messages.push({
            role: 'tool',
            tool_call_id: outcome.id,
            content: serialized,
          });

          // 控制类工具是明确的停止点；只有成功时才改状态，
          // 失败（例如 finish_draft 被 check_ready 拒绝）要让模型继续修。
          if (outcome.result.ok && outcome.name === 'ask_user') {
            await this.ensureStatus(sessionId, 'WAITING_USER');
            return;
          }
          if (outcome.result.ok && outcome.name === 'finish_draft') {
            await this.ensureStatus(sessionId, 'COMPLETED');
            return;
          }

          // 写工具之后用新的草稿重建标签策略和工具箱。
          if (WRITE_TOOL_NAMES.has(outcome.name)) {
            runtime = await this.createRuntime(draftId, actor, sessionId);
          }

          if (toolCallCount >= MAX_TOOL_CALLS || this.isOverTime(startedAt)) {
            await this.failOverLimit(sessionId);
            return;
          }
        }
      }
    } catch (error) {
      await this.failSession(sessionId, error);
    }
  }

  /** 解析参数并执行一个工具；所有失败都变成工具结果，不中断本轮。 */
  private async executeToolCall(
    runtime: RecipeAgentRuntime,
    toolCall: DeepSeekToolCall,
  ): Promise<{
    id: string;
    name: string;
    args: unknown;
    result: AgentToolResult<unknown>;
  }> {
    const name = toolCall.function?.name ?? '';
    const rawArguments = toolCall.function?.arguments;
    const parsed = parseToolArguments(rawArguments);

    if (!parsed.ok) {
      return {
        id: toolCall.id,
        name,
        args: rawArguments,
        result: invalidArgument('参数 JSON 解析失败'),
      };
    }

    const handler = runtime.toolkit.handlers[name];
    if (!handler) {
      return {
        id: toolCall.id,
        name,
        args: parsed.value,
        result: invalidArgument(`未知工具：${name}`),
      };
    }

    return {
      id: toolCall.id,
      name,
      args: parsed.value,
      result: await handler(parsed.value),
    };
  }

  private async appendAssistant(
    sessionId: string,
    content: string,
  ): Promise<void> {
    if (this.isStopped(sessionId)) return;
    await this.sessionService.appendMessage({
      sessionId,
      role: 'ASSISTANT',
      content,
    });
  }

  private async ensureStatus(
    sessionId: string,
    status: 'WAITING_USER' | 'COMPLETED',
  ): Promise<void> {
    if (this.isStopped(sessionId)) return;
    await this.sessionService.updateStatus(sessionId, status);
  }

  /**
   * 模型自然收尾：置 WAITING_USER，等人继续。
   *
   * 但如果会话已经被别处置成 COMPLETED / STOPPED（例如控制面先落状态、
   * 后续写消息失败），不要把它改回 WAITING_USER。读状态失败时按“未结束”
   * 处理，不能因为一次读失败就让本轮没有状态。
   */
  private async markWaitingForUser(sessionId: string): Promise<void> {
    if (this.isStopped(sessionId)) return;

    let currentStatus: string | undefined;
    try {
      const session = await this.prisma.recipeDesignAgentSession.findUnique({
        where: { id: sessionId },
        select: { status: true },
      });
      currentStatus = session?.status;
    } catch {
      currentStatus = undefined;
    }

    if (currentStatus === 'COMPLETED' || currentStatus === 'STOPPED') {
      return;
    }
    await this.sessionService.updateStatus(sessionId, 'WAITING_USER');
  }

  /** 超过 30 次工具调用或 6 分钟：记一条错误消息，置 FAILED。 */
  private async failOverLimit(sessionId: string): Promise<void> {
    if (this.isStopped(sessionId)) return;

    try {
      await this.sessionService.appendMessage({
        sessionId,
        role: 'ASSISTANT',
        content: `这次运行已经超过上限（${MAX_TOOL_CALLS} 次工具调用 / 6 分钟），已停止。`,
      });
    } catch {
      // 消息写不进去也要把状态落下来。
    }
    if (this.isStopped(sessionId)) return;

    try {
      await this.sessionService.updateStatus(
        sessionId,
        'FAILED',
        OVER_LIMIT_MESSAGE,
      );
    } catch {
      // 后台循环不向外抛错。
    }
  }

  /** 未预期异常：写一条错误消息并置 FAILED，不覆盖 STOPPED。 */
  private async failSession(sessionId: string, error: unknown): Promise<void> {
    if (this.isStopped(sessionId)) return;
    const message = errorMessage(error);

    try {
      await this.sessionService.appendMessage({
        sessionId,
        role: 'ASSISTANT',
        content: `这次运行出错了：${message}`,
      });
    } catch {
      // 同样：状态比错误消息更重要。
    }
    if (this.isStopped(sessionId)) return;

    try {
      await this.sessionService.updateStatus(sessionId, 'FAILED', message);
    } catch {
      // 后台循环不向外抛错。
    }
  }

  private isStopped(sessionId: string): boolean {
    return this.stopped.has(sessionId);
  }

  private isOverTime(startedAt: number): boolean {
    return Date.now() - startedAt > MAX_RUN_MS;
  }
}

/** 工具箱定义 → DeepSeek 工具定义（字段原样透传）。 */
function toToolDefinitions(
  definitions: AgentToolDefinition[],
): DeepSeekToolDefinition[] {
  return definitions.map((definition) => ({
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
    },
  }));
}

/** 空字符串 / 纯空白内容不落库，也不送进下一轮上下文。 */
function normalizeContent(content: unknown): string | null {
  return typeof content === 'string' && content.trim().length > 0
    ? content
    : null;
}

type ParsedToolArguments =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false };

/** 工具参数是模型给的 JSON 字符串；空串按 `{}` 处理。 */
function parseToolArguments(raw: unknown): ParsedToolArguments {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: {} };
  }
  if (typeof raw !== 'string') {
    return { ok: false };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

function invalidArgument(message: string): AgentToolResult<never> {
  return { ok: false, error: { code: 'INVALID_ARGUMENT', message } };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}
