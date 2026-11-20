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

/** 方案/选材阶段的工具预算；必须大于下面的强制提交阈值。 */
export const PHASE_TOOL_BUDGET = {
  PLAN: 60,
  SELECT: 60,
} as const;

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
  // 只在资源预算快用尽时兜底，不用来替代“证据够不够”的判断。
  if (phase === 'DESIGN') return null;
  const forceAt = PHASE_TOOL_BUDGET[phase] - 6;
  if (toolCalls < forceAt) return null;
  return phase === 'PLAN' ? 'propose_plan' : 'propose_selection';
  return null;
}

/** 给模型的一段阶段说明；很短，不重复系统提示词里的规则。 */
export function phaseSystemLine(phase: AgentPhase): string {
  if (phase === 'PLAN') {
    return '当前阶段：方案确认。只读档案和知识库，产出营养方案与可执行约束；用 propose_plan 提交，等用户确认。不要改配方。方案摘要和理由都只写营养方案，不复述年龄/体重/品种/BCS/性别/检验值/用药名称（编辑器已展示）；数值约束只列疾病特异性/比 FEDIAF 2025 默认评估更严的那一侧，默认下限不重复写，通用项以营养评估为准；非数值约束用文案写在 nonNutrient。MAINTAIN 不要列能量密度；钠只有比 FEDIAF 上限 0.55 g/1000 kcal 更严才列；胰腺炎与肿瘤蛋白冲突时以胰腺炎安全为先，蛋白上限不超过 30% DM，30–45% 只写理由并标待确认。不要算每日总热量；需要控制能量时用 energyDensity 约束（KCAL_PER_100G 或 KCAL_PER_KG）。0 命中就换词或换文档，不要重复原查询；每类约束找到一处来源即可，证据不足的标待确认；方案优先于穷尽检索。方案阶段不查药物/补剂的 mg/kg 剂量。';
  }
  if (phase === 'SELECT') {
    return '当前阶段：选材。基于已确认的方案提出食材与补剂候选；用 propose_selection 提交，等用户确认。补剂只用原料库；库外食材标 MISSING。不要改配方。0 命中就换词或换文档，不要重复原查询。';
  }
  return '当前阶段：配方编辑。按已确认的方案和选材编辑配方、跑评估、修缺口。';
}
