import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { AGENT_TOOLS } from './tools';

/**
 * 三阶段的工具白名单（2026-11-20）。
 *
 * 硬闸不靠提示词：阶段不对，写工具根本不出现在模型面前。
 *   PLAN   → 只读 + ask + propose_plan
 *   SELECT → 只读 + find_food + ask + propose_selection
 *   DESIGN → 全部
 */
export type AgentPhase = 'PLAN' | 'SELECT' | 'DESIGN';

const READ_TOOLS = new Set([
  'read_design_context',
  'read_draft',
  'read_taxonomy',
  'find_food',
  'ask',
  'kb_catalog',
  'kb_find',
  'kb_read',
]);

const PROPOSE_TOOLS = new Set(['propose_plan', 'propose_selection']);
const PLAN_TOOLS = new Set([...READ_TOOLS, 'propose_plan']);
const SELECT_TOOLS = new Set([...READ_TOOLS, 'propose_selection']);

export function toolsForPhase(
  phase: AgentPhase,
  flow: 'ORDER' | 'CATALOG',
): DeepSeekToolDefinition[] {
  return AGENT_TOOLS.filter((tool) => {
    const name = tool.function.name;
    // 产品线的需求分类只对 CATALOG 有意义。
    if (flow === 'ORDER' && name === 'read_taxonomy') {
      return false;
    }
    if (phase === 'DESIGN') return !PROPOSE_TOOLS.has(name);
    if (phase === 'PLAN') return PLAN_TOOLS.has(name);
    return SELECT_TOOLS.has(name);
  });
}

/** 方案/选材阶段到预算阈值后，强制提交，避免无限检索。 */
export function forceProposeToolFor(
  phase: AgentPhase,
  toolCalls: number,
): 'propose_plan' | 'propose_selection' | null {
  if (phase === 'PLAN' && toolCalls >= 18) return 'propose_plan';
  if (phase === 'SELECT' && toolCalls >= 18) return 'propose_selection';
  return null;
}

/** 方案/选材阶段单次读页的 token 预算上限。 */
export function readBudgetForPhase(
  phase: AgentPhase,
  requested: number,
): number {
  if (phase === 'DESIGN') return requested;
  return Math.min(requested, 12000);
}

/** 给模型的一段阶段说明；很短，不重复系统提示词里的规则。 */
export function phaseSystemLine(phase: AgentPhase): string {
  if (phase === 'PLAN') {
    return '当前阶段：方案确认。只读档案和知识库，产出营养方案与可执行约束；用 propose_plan 提交，等用户确认。不要改配方。每类约束找到一处来源即可；最多查 10 次、读 8 页；到 18 次工具调用必须先提交方案，查不到的标待确认。';
  }
  if (phase === 'SELECT') {
    return '当前阶段：选材。基于已确认的方案提出食材与补剂候选；用 propose_selection 提交，等用户确认。补剂只用原料库；库外食材标 MISSING。不要改配方。最多查 10 次；到 18 次工具调用必须先提交候选。';
  }
  return '当前阶段：配方编辑。按已确认的方案和选材编辑配方、跑评估、修缺口。';
}
