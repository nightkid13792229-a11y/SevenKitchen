/**
 * 新 Agent 的最小类型集（2026-10-31 从零重建）。
 *
 * 旧实现的 agent-types.ts 有 18KB，因为每个工具都定义了独立的返回结构。
 * 新版只有 6 个工具，统一用 ToolOutcome 表达结果：要么成功带数据，
 * 要么失败带一个模型看得懂的 code + message。
 */

/** 当前操作者；与草稿接口的 access 入参保持一致。 */
export interface RecipeAgentActor {
  userId: string;
  role?: string | null;
  customerId?: string | null;
}

export interface ToolError {
  code: string;
  message: string;
}

export interface ToolOutcome<T = unknown> {
  ok: boolean;
  data?: T;
  /** 给模型看的一句话摘要；工具结果同时会落库给前端看 */
  summary?: string;
  error?: ToolError;
}

/** 工具内部用来抛「可预期错误」的异常；运行时会转成 ToolOutcome.error。 */
export class AgentToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AgentToolError';
  }
}

export function ok<T>(data: T, summary?: string): ToolOutcome<T> {
  return { ok: true, data, summary };
}

export function fail(code: string, message: string): ToolOutcome<never> {
  return { ok: false, error: { code, message } };
}

/** 一次编辑操作。add 需要 nutritionFoodId；set_weight / remove 需要 itemId。 */
export type RecipeEditOp =
  | {
      op: 'add';
      nutritionFoodId: string;
      ingredientId?: string;
      weightG: number;
      preparationMethod?: string;
    }
  | { op: 'set_weight'; itemId: string; weightG: number }
  | { op: 'replace'; itemId: string; nutritionFoodId: string; ingredientId?: string }
  | { op: 'remove'; itemId: string };
