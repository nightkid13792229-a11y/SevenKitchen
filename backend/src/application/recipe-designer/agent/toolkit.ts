/**
 * Agent 工具箱（P0a Task 6）。
 *
 * 只做组装，不加任何业务规则：把 Task 5 的 20 个工具定义和
 * `createAgentToolHandlers` 造出的同名 handler 合成一个对象，
 * 交给 P0b 的 Agent 运行时逐轮调用。
 *
 * 读工具 / 写工具 / 检查工具 / 控制工具的边界都在各自模块里；
 * 这里不校验参数、不读审批状态、不改草稿。
 */
import type {
  AgentToolDefinition,
  AgentToolHandler,
  AgentToolHandlerDeps,
} from './tool-registry';
import {
  AGENT_TOOL_DEFINITIONS,
  createAgentToolHandlers,
} from './tool-registry';

/** 供 Agent 运行时使用的一张工具表：给模型看的定义 + 后端执行的 handler。 */
export interface RecipeAgentToolkit {
  definitions: AgentToolDefinition[];
  handlers: Record<string, AgentToolHandler>;
}

export type RecipeAgentToolkitDeps = AgentToolHandlerDeps;

/**
 * 造当前这份草稿的工具箱。
 *
 * @param deps.port 草稿端口（读 / 写 / 评估）
 * @param deps.controlPort 控制端口（提问 / 申请例外 / 交付 / 读审批状态）
 * @param deps.tagPolicy 健康标签白名单
 * @param deps.draftId 当前草稿 id
 * @param deps.webTools 可选联网读端口（DeepSeek Web Search / Fetch）
 */
export function createRecipeAgentToolkit(
  deps: RecipeAgentToolkitDeps,
): RecipeAgentToolkit {
  return {
    definitions: AGENT_TOOL_DEFINITIONS,
    handlers: createAgentToolHandlers(deps),
  };
}
