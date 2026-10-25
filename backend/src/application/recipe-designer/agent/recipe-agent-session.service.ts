import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  RecipeDesignAgentMessage,
  RecipeDesignAgentSession,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma.service';
import type {
  AgentMessageRecord,
  AgentMessageRole,
  AgentSessionRecord,
  AgentSessionStatus,
} from './recipe-agent-session.types';

const TERMINAL_STATUSES = new Set<AgentSessionStatus>([
  'COMPLETED',
  'STOPPED',
  'FAILED',
  'INTERRUPTED',
]);

@Injectable()
export class RecipeAgentSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(input: {
    designRecipeId: string;
    createdBy: string;
    skillName: string;
    skillVersion: string;
  }): Promise<AgentSessionRecord> {
    const session = await this.prisma.recipeDesignAgentSession.create({
      data: {
        designRecipeId: input.designRecipeId,
        createdBy: input.createdBy,
        skillName: input.skillName,
        skillVersion: input.skillVersion,
        status: 'RUNNING',
      },
    });
    return this.toSessionRecord(session);
  }

  async appendMessage(input: {
    sessionId: string;
    role: AgentMessageRole;
    content: string;
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
  }): Promise<AgentMessageRecord> {
    const message = await this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.recipeDesignAgentMessage.aggregate({
        where: { sessionId: input.sessionId },
        _max: { seq: true },
      });
      const seq = (aggregate._max.seq ?? 0) + 1;

      return tx.recipeDesignAgentMessage.create({
        data: {
          sessionId: input.sessionId,
          seq,
          role: input.role,
          content: input.content,
          toolName: input.toolName ?? null,
          toolArgs: this.toJsonInput(input.toolArgs),
          toolResult: this.toJsonInput(input.toolResult),
        },
      });
    });
    return this.toMessageRecord(message);
  }

  async listMessages(
    sessionId: string,
    afterSeq = 0,
  ): Promise<AgentMessageRecord[]> {
    const messages = await this.prisma.recipeDesignAgentMessage.findMany({
      where: { sessionId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
    });
    return messages.map((message) => this.toMessageRecord(message));
  }

  async updateStatus(
    sessionId: string,
    status: AgentSessionStatus,
    lastError?: string | null,
  ): Promise<void> {
    const data: Prisma.RecipeDesignAgentSessionUpdateInput = { status };
    if (TERMINAL_STATUSES.has(status)) {
      data.endedAt = new Date();
    } else {
      data.endedAt = null;
    }
    if (lastError !== undefined) {
      data.lastError = lastError;
    } else if (status !== 'FAILED' && status !== 'INTERRUPTED') {
      // 旧错误不能跟着会话进入下一次运行/完成状态；否则 UI 会在
      // “已完成/等待回答”下面继续显示上一轮的“超过运行上限”。
      data.lastError = null;
    }

    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data,
    });
  }

  /**
   * 条件状态迁移（compare-and-set）：只有当前状态落在 `from` 里才写入 `to`。
   *
   * 运行态是并发入口（开始 / 继续 / 停止），不能先读再写：读到的
   * 状态可能在写之前就被别处改掉。这里用一条带 `status in (...)` 的
   * `updateMany` 把判断和写入合成一个原子操作，返回是否真的迁移成功。
   */
  async transitionStatus(
    sessionId: string,
    from: AgentSessionStatus[],
    to: AgentSessionStatus,
    lastError?: string | null,
  ): Promise<boolean> {
    const data: Prisma.RecipeDesignAgentSessionUpdateManyMutationInput = {
      status: to,
      endedAt: TERMINAL_STATUSES.has(to) ? new Date() : null,
    };
    if (lastError !== undefined) {
      data.lastError = lastError;
    } else if (to !== 'FAILED' && to !== 'INTERRUPTED') {
      data.lastError = null;
    }

    const result = await this.prisma.recipeDesignAgentSession.updateMany({
      where: { id: sessionId, status: { in: from } },
      data,
    });
    return result.count === 1;
  }

  async recordUsage(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
  ): Promise<void> {
    this.assertTokenCount(promptTokens, 'promptTokens');
    this.assertTokenCount(completionTokens, 'completionTokens');

    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: {
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
      },
    });
  }

  async incrementStep(sessionId: string): Promise<void> {
    await this.prisma.recipeDesignAgentSession.update({
      where: { id: sessionId },
      data: { stepCount: { increment: 1 } },
    });
  }

  async getActiveSession(
    designRecipeId: string,
  ): Promise<AgentSessionRecord | null> {
    const session = await this.prisma.recipeDesignAgentSession.findFirst({
      where: {
        designRecipeId,
        status: { in: ['RUNNING', 'WAITING_USER'] },
      },
      orderBy: { startedAt: 'desc' },
    });
    return session ? this.toSessionRecord(session) : null;
  }

  async assertNoActiveRun(designRecipeId: string): Promise<void> {
    const active = await this.getActiveSession(designRecipeId);
    if (active) {
      throw new ConflictException('这个草稿已经有一个 AI 运行；先停掉它');
    }
  }

  async markInterruptedRuns(): Promise<number> {
    const result = await this.prisma.recipeDesignAgentSession.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'INTERRUPTED', endedAt: new Date() },
    });
    return result.count;
  }

  private assertTokenCount(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) {
      throw new BadRequestException(`${label} 必须是 0 到 10000000 之间的整数`);
    }
  }

  private toJsonInput(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private toSessionRecord(
    session: RecipeDesignAgentSession,
  ): AgentSessionRecord {
    return {
      id: session.id,
      designRecipeId: session.designRecipeId,
      status: session.status,
      skillName: session.skillName,
      skillVersion: session.skillVersion,
      stepCount: session.stepCount,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      lastError: session.lastError,
      createdBy: session.createdBy,
    };
  }

  private toMessageRecord(
    message: RecipeDesignAgentMessage,
  ): AgentMessageRecord {
    return {
      id: message.id,
      sessionId: message.sessionId,
      seq: message.seq,
      role: message.role,
      content: message.content,
      toolName: message.toolName,
      toolArgs: message.toolArgs,
      toolResult: message.toolResult,
      createdAt: message.createdAt,
    };
  }
}
