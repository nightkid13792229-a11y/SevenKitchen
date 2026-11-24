import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { AGENT_TOOLS } from './tools';
import { CFCT_CLASS_PROMPT } from '../../../domain/recipe-designer/cfct-classes';

/**
 * 三阶段的工具白名单（2026-11-20；2026-11-24 加营养档案与试算）。
 *
 * 硬闸不靠提示词：阶段不对，写工具根本不出现在模型面前。
 *   PLAN   → 只读 + ask + propose_plan
 *   SELECT → 只读（不含 find_food）+ ask + propose_selection + 营养档案/试算
 *            选食材先按营养/忌口，库里有没有由后端提交后匹配，避免被库存牵着走；
 *            试算只用于“这套搭配够不够”，不改草稿。
 *   DESIGN → 全部
 */
export type AgentPhase = 'PLAN' | 'SELECT' | 'DESIGN';

const READ_TOOLS = new Set([
  'read_design_context',
  'read_draft',
  'read_taxonomy',
  'read_nutrition_profile',
  'read_order_recipes',
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
  'read_nutrition_profile',
  'read_order_recipes',
  'preview_assessment',
  'propose_selection',
  'revise_plan',
]);

/**
 * 强制某个工具时收窄工具表。
 *
 * 2026-11-24 线上事故：连续改 20 次后强制 assess，模型在长上下文里
 * 两次无视 tool_choice，继续调 edit_recipe 微调同一克数；系统只能报
 * “模型未调用 assess”。这里在强制评估时把写工具从工具表里拿掉，
 * 模型没有别的可调，只能评估。
 */
export function toolsForForcedCall(
  tools: DeepSeekToolDefinition[],
  forcedTool: string | null,
): DeepSeekToolDefinition[] {
  if (forcedTool !== 'assess') return tools;
  const only = tools.filter((tool) => tool.function.name === 'assess');
  return only.length > 0 ? only : tools;
}

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
