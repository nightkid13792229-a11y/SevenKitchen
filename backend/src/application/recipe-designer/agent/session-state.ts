/**
 * Agent 会话状态 → 模型上下文（2026-11-21）。
 *
 * 为什么要有这一层：
 *   · 方案/选材提交后只写进 `recipe_design_agent_session`，不写 ASSISTANT 消息；
 *     下一轮如果只回灌已确认的 JSON，模型就看不到“上一次提交、但还没确认”的版本，
 *     用户说“把脂肪改成 12”时只能重造方案/清单。
 *   · 这里把所有状态（不论是否确认）都投影成 system 消息，并明确标注
 *     “待确认/已确认”，让模型在上一版基础上改，而不是从零开始。
 *
 * 只做纯函数，方便单测；不访问 Prisma。
 */
import type { DeepSeekToolsMessage } from '../deepseek-tools-chat';
import type { AgentNutritionPlan, AgentSelection } from './propose-plan';

/** 方案/选材 JSON 的上下文上限，避免把整份长清单塞爆。 */
const MAX_STATE_JSON_LENGTH = 20000;

export interface AgentSessionState {
  plan: AgentNutritionPlan | null;
  planConfirmedAt: Date | string | null;
  selection: AgentSelection | null;
  selectionConfirmedAt: Date | string | null;
}

function stringifyState(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.length <= MAX_STATE_JSON_LENGTH) return text;
  return `${text.slice(0, MAX_STATE_JSON_LENGTH)}…（已截断）`;
}

/**
 * 把当前方案/选材投影成 system 消息。
 *
 * - 未确认：标注“上次提交、尚未确认”，并告诉模型在此基础上调整；
 * - 已确认：沿用原来的 `已确认…（JSON）` 文案，保持兼容。
 */
export function buildSessionStateMessages(
  state: AgentSessionState,
): DeepSeekToolsMessage[] {
  const messages: DeepSeekToolsMessage[] = [];

  if (state.plan) {
    const confirmed = Boolean(state.planConfirmedAt);
    messages.push({
      role: 'system',
      content: confirmed
        ? `已确认营养方案（JSON）：\n${stringifyState(state.plan)}`
        : `当前待确认营养方案（JSON，上次提交，尚未确认）：\n${stringifyState(
            state.plan,
          )}\n用户可能要求修改；请在此基础上调整，不要重造方案。`,
    });
  }

  if (state.selection) {
    const confirmed = Boolean(state.selectionConfirmedAt);
    messages.push({
      role: 'system',
      content: confirmed
        ? `已确认选材（JSON）：\n${stringifyState(state.selection)}`
        : `当前待确认选材（JSON，上次提交，尚未确认）：\n${stringifyState(
            state.selection,
          )}\n用户可能要求增删；请在此基础上调整，不要重造清单。`,
    });
  }

  return messages;
}

/**
 * 方案修订的落库数据：只更新方案本身，**不动** phase / selection。
 *
 * 旧实现会把 phase 退回 SELECT 并清空 selection，一次小改就要重选整份食材；
 * 现在改为“方案待重新确认”，由人工确认后继续核对现有选材/配方。
 */
export function planRevisionUpdate(plan: AgentNutritionPlan) {
  return {
    plan: plan as never,
    planConfirmedAt: null,
    status: 'WAITING_USER' as const,
    endedAt: new Date(),
  };
}

/**
 * 选材提交的落库数据：**永远**回到 SELECT、等待人工确认。
 *
 * 不再接受模型传的 `confirmed`：阶段推进只能由 `confirmSelection` 端点触发。
 */
export function selectionSubmissionUpdate(selection: AgentSelection) {
  const { confirmed: _confirmed, ...persisted } = selection;
  return {
    selection: persisted as never,
    phase: 'SELECT' as const,
    selectionConfirmedAt: null,
    status: 'WAITING_USER' as const,
    endedAt: new Date(),
  };
}
