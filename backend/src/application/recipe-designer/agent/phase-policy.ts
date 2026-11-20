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
// 选材阶段不让模型查原料库：先自由选食材，提交后由后端按名称匹配。
SELECT_TOOLS.delete('find_food');

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
    return '当前阶段：方案确认。只读档案和知识库，产出营养方案与可执行约束；用 propose_plan 提交，等用户确认。不要改配方。方案摘要和理由都只写营养方案，不复述年龄/体重/品种/BCS/性别/检验值/用药名称（编辑器已展示）；数值约束只列疾病特异性/比 FEDIAF 2025 默认评估更严的那一侧，默认下限不重复写，通用项以营养评估为准；非数值约束用文案写在 nonNutrient，并且必须覆盖会限制食材选择的质地/纤维/产气、忌口/过敏、工艺/形态、餐次；需要低渣时写清避免豆类/粗纤维/菌藻等。MAINTAIN 不要列能量密度；钠只有比 FEDIAF 上限 0.55 g/1000 kcal 更严才列；胰腺炎与肿瘤蛋白冲突时以胰腺炎安全为先，蛋白上限不超过 30% DM，30–45% 只写理由并标待确认。不要算每日总热量；需要控制能量时用 energyDensity 约束（KCAL_PER_100G 或 KCAL_PER_KG）。0 命中就换词或换文档，不要重复原查询；每类约束找到一处来源即可，证据不足的标待确认；方案优先于穷尽检索。方案阶段不查药物/补剂的 mg/kg 剂量。';
  }
  if (phase === 'SELECT') {
    return (
      '当前阶段：选材。只列食材，不要列补剂：补剂要等配方评估出营养缺口后，在配方编辑阶段再补。先逐条读已确认方案（含 nonNutrient），任何候选违反一条就淘汰；方案约束优先级最高，不要按疾病名做选材特判。按营养与方案约束自由选食材，不要查原料库（本阶段没有 find_food）；库里有没有由系统提交后自动匹配，没匹配到才标库外。按 CFCT 固定 15 类（' +
      CFCT_CLASS_PROMPT +
      '）分组，每个适用类型至少 2 个候选；15 类是词表，不是必须每类都填，不适用/凑不出 2 个安全食材的放 skippedCategories 写原因，不要用补剂、水、加工品、高脂坚果或高碘海藻凑数；严禁把方案忌口食材（牛、羊、鸡、鸡蛋及其制品）列为候选，也不要为了凑类型去列禁忌食材。用 propose_selection 提交，等用户确认；用户明确说“最终确认/就按这份清单”时把 confirmed 设为 true，只列用户确认的食材，不要补替代；清单与方案硬约束冲突时先指出冲突并询问，不要确认。不要改配方。0 命中就换词或换文档，不要重复原查询。'
    );
  }
  return '当前阶段：配方编辑。按已确认的方案和选材编辑配方、跑评估、修缺口。补剂只在 assess 显示明确营养缺口后，再按缺口从原料库查找并添加；不要在食材还没评估前先加补剂。';
}
