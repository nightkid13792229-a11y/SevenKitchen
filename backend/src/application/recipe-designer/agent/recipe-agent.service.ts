/**
 * 新 Agent 运行时（2026-10-31 重建，替代原来的 1,135 行循环 + 适配器）。
 *
 * 与旧版的四处关键差异：
 * 1. 工具预算 200 → 60；单次运行 6 分钟不变。
 * 2. 历史只回灌「人说的话 + AI 的结论」，工具结果不回灌 ——
 *    草稿本身就是工具结果的沉淀，模型下次读草稿即可。
 * 3. 目的（会话第一条用户消息）固定放在上下文最前面，永远不会被截断丢掉。
 * 4. 不再有审批、快照、交付确认卡；三个不可逆动作由人来点。
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../infrastructure/prisma.service';
import { AgentProviderConfigService } from '../../nutrition-governance/agent-provider-config.service';
import { RECIPE_DESIGN_AGENT_PURPOSE } from '../recipe-design-agent-purpose';
import {
  callDeepSeekTools,
  type DeepSeekToolCall,
  type DeepSeekToolsMessage,
} from '../deepseek-tools-chat';
import { RecipeDesignerService } from '../recipe-designer.service';
import { buildSystemPrompt } from './prompt';
import { RecipeDraftPort } from './draft-port';
import { AGENT_TOOLS, executeTool } from './tools';
import type { RecipeAgentActor } from './agent-types';

/** 一次运行最多调多少次工具。旧版 200 次，实测平均就要 59 次。 */
const MAX_TOOL_CALLS = 60;
/** 一次运行最长多久。 */
const MAX_RUN_MS = 6 * 60 * 1000;
/** 回灌给模型的历史条数（只含用户与助手）。 */
const HISTORY_MESSAGES = 30;

@Injectable()
export class RecipeAgentService {
  /** 一个草稿同一时间只允许一次运行。 */
  private readonly active = new Set<string>();
  private readonly stopped = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerConfig: AgentProviderConfigService,
    private readonly designer: RecipeDesignerService,
  ) {}

  private accessFor(actor: RecipeAgentActor) {
    return {
      userId: actor.userId,
      role: actor.role ?? null,
      customerId: actor.customerId ?? null,
    } as Parameters<RecipeDesignerService['getDraft']>[1];
  }

  /** 开跑：校验访问权 → 抢草稿锁 → 复用或新建会话 → 后台跑。 */
  async start(input: {
    draftId: string;
    actor: RecipeAgentActor;
    message: string;
  }): Promise<{ sessionId: string }> {
    if (this.active.has(input.draftId)) {
      throw new ConflictException('这个草稿已经有一个 AI 运行');
    }
    this.active.add(input.draftId);

    let launched = false;
    try {
      const access = this.accessFor(input.actor);
      await this.designer.getDraft(input.draftId, access);

      const existing = await this.prisma.recipeDesignAgentSession.findFirst({
        where: { designRecipeId: input.draftId },
        orderBy: { startedAt: 'desc' },
      });
      let sessionId: string;
      if (existing) {
        if (existing.status === 'RUNNING') {
          throw new ConflictException('会话正在运行');
        }
        await this.prisma.recipeDesignAgentSession.update({
          where: { id: existing.id },
          data: { status: 'RUNNING', lastError: null, endedAt: null },
        });
        sessionId = existing.id;
      } else {
        const session = await this.prisma.recipeDesignAgentSession.create({
          data: {
            designRecipeId: input.draftId,
            status: 'RUNNING',
            skillName: 'recipe-design',
            skillVersion: 'v2',
            createdBy: input.actor.userId,
          },
        });
        sessionId = session.id;
      }

      await this.appendMessage(sessionId, 'USER', input.message);
      this.launch(sessionId, input.draftId, input.actor, input.message);
      launched = true;
      return { sessionId };
    } finally {
      if (!launched) {
        this.active.delete(input.draftId);
      }
    }
  }

  /** 会话视图：会话 + 全部消息（给抽屉展示）。 */
  async getSession(draftId: string, actor: RecipeAgentActor) {
    await this.designer.getDraft(draftId, this.accessFor(actor));
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: { designRecipeId: draftId },
      orderBy: { startedAt: 'desc' },
    });
    if (!session) return null;
    const messages = await this.prisma.recipeDesignAgentMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { seq: 'asc' },
    });
    return { session, messages };
  }

  /** 人工停止。 */
  async stop(sessionId: string, actor: RecipeAgentActor): Promise<void> {
    const session = await this.prisma.recipeDesignAgentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('会话不存在');
    await this.designer.getDraft(
      session.designRecipeId,
      this.accessFor(actor),
    );
    this.stopped.add(sessionId);
    await this.prisma.recipeDesignAgentSession.updateMany({
      where: { id: sessionId, status: { in: ['RUNNING', 'WAITING_USER'] } },
      data: { status: 'STOPPED', endedAt: new Date() },
    });
  }

  private launch(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
    message: string,
  ): void {
    void this.run(sessionId, draftId, actor, message)
      .catch(async (error: unknown) => {
        await this.prisma.recipeDesignAgentSession
          .update({
            where: { id: sessionId },
            data: {
              status: 'FAILED',
              lastError: (error as Error)?.message?.slice(0, 500) ?? '运行失败',
              endedAt: new Date(),
            },
          })
          .catch(() => undefined);
      })
      .finally(() => {
        this.active.delete(draftId);
        this.stopped.delete(sessionId);
      });
  }

  private async run(
    sessionId: string,
    draftId: string,
    actor: RecipeAgentActor,
    message: string,
  ): Promise<void> {
    const startedAt = Date.now();
    const config = await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: RECIPE_DESIGN_AGENT_PURPOSE,
    });
    const port = new RecipeDraftPort(
      this.designer,
      this.accessFor(actor),
      draftId,
    );

    const messages = await this.buildMessages(sessionId, message);
    let toolCalls = 0;
    let askedQuestion = false;

    while (true) {
      if (this.stopped.has(sessionId)) return;
      if (Date.now() - startedAt > MAX_RUN_MS) {
        await this.fail(sessionId, '超过运行时长上限');
        return;
      }

      const response = await callDeepSeekTools({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        requestTimeoutMs: config.requestTimeoutMs,
        messages,
        tools: AGENT_TOOLS,
      });

      await this.recordUsage(
        sessionId,
        response.usage?.promptTokens ?? 0,
        response.usage?.completionTokens ?? 0,
      );
      if (this.stopped.has(sessionId)) return;

      const calls = response.toolCalls ?? [];
      if (calls.length === 0) {
        if (response.content) {
          await this.appendMessage(sessionId, 'ASSISTANT', response.content);
        }
        await this.markWaiting(sessionId);
        return;
      }

      messages.push({
        role: 'assistant',
        content: response.content ?? null,
        tool_calls: calls,
      });
      if (response.content) {
        await this.appendMessage(sessionId, 'ASSISTANT', response.content);
      }

      for (const call of calls) {
        if (toolCalls >= MAX_TOOL_CALLS) {
          await this.fail(sessionId, '超过工具调用上限');
          return;
        }
        const outcome = await this.runTool(port, call, (question) => {
          askedQuestion = true;
          void this.appendMessage(sessionId, 'ASSISTANT', question);
        });
        toolCalls += 1;

        await this.recordTool(sessionId, call, outcome.result);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome.result),
        });

        if (askedQuestion) {
          await this.markWaiting(sessionId);
          return;
        }
      }
    }
  }

  private async runTool(
    port: RecipeDraftPort,
    call: DeepSeekToolCall,
    onAsk: (question: string) => void,
  ): Promise<{ result: unknown }> {
    let args: unknown = {};
    try {
      args = call.function.arguments
        ? JSON.parse(call.function.arguments)
        : {};
    } catch {
      args = {};
    }
    const result = await executeTool(call.function.name, args, {
      port,
      onAsk: (question) => onAsk(question),
    });
    return { result };
  }

  /**
   * 组装上下文：
   *   系统提示词（约 200 字）
   *   本份食谱的目的（会话第一条用户消息，固定置顶）
   *   最近的历史（只含用户与助手，不含工具结果）
   *   本轮用户输入
   */
  private async buildMessages(
    sessionId: string,
    currentMessage: string,
  ): Promise<DeepSeekToolsMessage[]> {
    const rows = await this.prisma.recipeDesignAgentMessage.findMany({
      where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { seq: 'asc' },
    });

    const purpose =
      rows.find((row) => row.role === 'USER')?.content?.trim() ?? null;
    // 最后一条 USER 就是本轮输入，不再重复放进历史。
    const historyRows = rows.slice(0, -1).slice(-HISTORY_MESSAGES);

    const messages: DeepSeekToolsMessage[] = [
      { role: 'system', content: buildSystemPrompt() },
    ];
    if (purpose) {
      messages.push({
        role: 'system',
        content: `本份食谱的目的：${purpose}`,
      });
    }
    for (const row of historyRows) {
      messages.push({
        role: row.role === 'USER' ? 'user' : 'assistant',
        content: row.content ?? '',
      });
    }
    messages.push({ role: 'user', content: currentMessage });
    return messages;
  }

  private async appendMessage(
    sessionId: string,
    role: 'USER' | 'ASSISTANT' | 'TOOL',
    content: string,
    extra?: { toolName?: string; toolArgs?: unknown; toolResult?: unknown },
  ): Promise<void> {
    const count = await this.prisma.recipeDesignAgentMessage.count({
      where: { sessionId },
    });
    await this.prisma.recipeDesignAgentMessage.create({
      data: {
        sessionId,
        seq: count + 1,
        role,
        content,
        toolName: extra?.toolName ?? null,
        toolArgs: (extra?.toolArgs ?? null) as never,
        toolResult: (extra?.toolResult ?? null) as never,
      },
    });
  }

  private async recordTool(
    sessionId: string,
    call: DeepSeekToolCall,
    result: unknown,
  ): Promise<void> {
    const parsedArgs = safeParse(call.function.arguments);
    await this.appendMessage(
      sessionId,
      'TOOL',
      JSON.stringify(result),
      {
        toolName: call.function.name,
        toolArgs: parsedArgs,
        toolResult: result,
      },
    );
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: { stepCount: { increment: 1 } },
    });
  }

  private async recordUsage(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    if (promptTokens === 0 && completionTokens === 0) return;
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: {
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
      },
    });
  }

  private async markWaiting(sessionId: string): Promise<void> {
    await this.prisma.recipeDesignAgentSession.updateMany({
      where: { id: sessionId, status: 'RUNNING' },
      data: { status: 'WAITING_USER', endedAt: new Date() },
    });
  }

  private async fail(sessionId: string, reason: string): Promise<void> {
    await this.prisma.recipeDesignAgentSession
      .update({
        where: { id: sessionId },
        data: { status: 'FAILED', lastError: reason, endedAt: new Date() },
      })
      .catch(() => undefined);
  }

  /** 不做额外校验，只为把错误信息说清楚。 */
  private assertMessage(message: string): void {
    if (!message.trim()) throw new BadRequestException('消息不能为空');
  }
}

function safeParse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
