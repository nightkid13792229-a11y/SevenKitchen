import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { AGENT_TOOLS } from './tools';
import { CFCT_CLASS_PROMPT } from '../../../domain/recipe-designer/cfct-classes';

/**
 * 三阶段的工具白名单（2026-11-20）。
 *
 * 硬闸不靠提示词：阶段不对，写工具根本不出现在模型面前。
 *   PLAN   → 只读 + ask + propose_plan
 *   SELECT → 只读（不含 find_food）+ ask + propose_selection
 *            选食材先按营养/忌口，库里有没有由后端提交后匹配，避免被库存牵着走。
 *   DESIGN → 全部
 */
export type AgentPhase = 'PLAN' | 'SELECT' | 'DESIGN';

const READ_TOOLS = new Set([
  'read_design_context',
  'read_draft',
  'read_taxonomy',
  'ask',
  'kb_catalog',
  'kb_find',
  'kb_read',
]);

/** 方案/选材阶段的工具预算；必须大于下面的强制提交阈值。 */
export const PHASE_TOOL_BUDGET = {
  PLAN: 120,
  SELECT: 120,
} as const;

const PROPOSE_TOOLS = new Set(['propose_plan', 'propose_selection']);
// 选材专用的“名字对库”工具：DESIGN 不再需要。
const SELECT_ONLY_TOOLS = new Set(['match_food_name']);
const PLAN_TOOLS = new Set([...READ_TOOLS, 'propose_plan']);
// 选材只需要：读档案、问用户、提交候选、用户要求改方案。不要知识库/原料库查询。
const SELECT_TOOLS = new Set([
  'read_design_context',
  'ask',
  'match_food_name',
  'propose_selection',
  'revise_plan',
]);

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
    if (phase === 'DESIGN') {
      return !PROPOSE_TOOLS.has(name) && !SELECT_ONLY_TOOLS.has(name);
    }
    if (phase === 'PLAN') return PLAN_TOOLS.has(name);
    return SELECT_TOOLS.has(name);
  });
}

/** 方案/选材阶段到预算阈值后，强制提交，避免无限检索。 */
export function forceProposeToolFor(
  phase: AgentPhase,
  toolCalls: number,
): 'propose_plan' | 'propose_selection' | null {
  // 只在资源预算快用尽时兜底，不用来替代“证据够不够”的判断。
  if (phase === 'DESIGN') return null;
  const forceAt = PHASE_TOOL_BUDGET[phase] - 12;
  if (toolCalls < forceAt) return null;
  return phase === 'PLAN' ? 'propose_plan' : 'propose_selection';
  return null;
}

/**
 * 阶段说明只保留“当前阶段 + 加载哪个 Skill”。
 * 具体规则在 assets/skills/<name>/SKILL.md，不在这里堆。
 */
export function phaseSystemLine(phase: AgentPhase): string {
  if (phase === 'PLAN') {
    return '当前阶段：方案确认。按 recipe-plan Skill 执行；不要改配方；0 命中就换词或换文档。';
  }
  if (phase === 'SELECT') {
    return '当前阶段：选材。按 recipe-selection Skill 执行；不要改配方。';
  }
  return '当前阶段：配方编辑。按 recipe-design 和 recipe-assessment Skill 执行。';
}
