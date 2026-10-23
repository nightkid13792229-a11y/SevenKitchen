/**
 * 食谱 AI Agent 会话与消息的持久化类型（P0b Task 3）。
 *
 * 这些类型是对 Prisma 模型的窄化：只暴露会话服务需要读写的字段，
 * 时间字段保持 `Date`，不在这里做 JSON 序列化。
 */

export type AgentSessionStatus =
  | 'RUNNING'
  | 'WAITING_USER'
  | 'COMPLETED'
  | 'STOPPED'
  | 'FAILED'
  | 'INTERRUPTED';

export type AgentMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

export interface AgentSessionRecord {
  id: string;
  designRecipeId: string;
  status: AgentSessionStatus;
  skillName: string;
  skillVersion: string;
  stepCount: number;
  promptTokens: number;
  completionTokens: number;
  startedAt: Date;
  endedAt: Date | null;
  lastError: string | null;
  createdBy: string;
}

export interface AgentMessageRecord {
  id: string;
  sessionId: string;
  seq: number;
  role: AgentMessageRole;
  content: string;
  toolName: string | null;
  toolArgs: unknown;
  toolResult: unknown;
  createdAt: Date;
}
