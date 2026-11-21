/**
 * 三阶段方案/选材工具（2026-11-20）。
 *
 * 阶段 1 `propose_plan`：把营养方案落成可执行的约束（能量、宏量、特定营养素、
 * 非营养约束），每条带单位与依据；提交后运行暂停，等用户确认。
 *
 * 阶段 2 `propose_selection`：把食材/补剂候选落成清单；补剂必须来自原料库，
 * 库外食材标记为 MISSING，阶段 3 之前必须补档案。
 *
 * 这里只做形状校验与归一化，不判断营养学对错。
 */
import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { AgentToolError } from './agent-types';
import { CFCT_CLASS_PROMPT } from '../../../domain/recipe-designer/cfct-classes';
import { isMedicationItem, stripMedicationSentences } from './medication';

export interface AgentPlanConstraint {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
  /** PERCENT_DM / PER_1000_KCAL / PER_MJ / G_PER_DAY / OTHER */
  unit: string;
  /** 人读的依据说明，如 FEDIAF 2025 Table III-3a */
  basis: string;
  /** 来源文件/机构，如 FEDIAF 2025 / SACN5 */
  source: string;
  /** 知识库引用 id（可选）；阶段 2 用它把约束落到评估目标 */
  citationId?: string;
  hard: boolean;
}

export interface AgentPlanNonNutrientConstraint {
  key: string;
  label: string;
  value: string;
  unit?: string;
  note?: string;
  hard: boolean;
}

export interface AgentNutritionPlan {
  /** 方案定位，简短；不要复述档案里的年龄/体重/品种/BCS。 */
  summary: string;
  /** 方案制定的理由与建议；纯文本。 */
  rationale?: string;
  /** 只放疾病特异性/比默认评估更严的数值约束；通用项不要放。 */
  constraints: AgentPlanConstraint[];
  /** 非数值约束，文案形式，展示在约束表格后面。 */
  nonNutrient: AgentPlanNonNutrientConstraint[];
  notes?: string;
}

export interface AgentSelectionItem {
  /** 选材阶段只允许 FOOD；SUPPLEMENT 兼容旧数据展示。 */
  kind: 'FOOD' | 'SUPPLEMENT';
  name: string;
  /** CFCT 食材类型，如 肉类/水产/谷类/薯类/蔬菜/水果。 */
  foodCategory?: string;
  ingredientId?: string;
  nutritionFoodId?: string;
  reason: string;
  /** AVAILABLE = 库内有可用档案；MISSING = 库内没有；NEEDS_PROFILE = 有原料但档案不全 */
  dataStatus: 'AVAILABLE' | 'MISSING' | 'NEEDS_PROFILE';
}

export interface AgentSelection {
  summary: string;
  items: AgentSelectionItem[];
  /** 用户明确最终确认清单时为 true；由服务端转成 phase=DESIGN，不落库。 */
  confirmed?: boolean;
  /** 15 类里没有列的类型及原因，供选材卡覆盖表展示。 */
  skippedCategories?: Array<{ category: string; reason: string }>;
  notes?: string;
}

const PROPOSE_PLAN_DESCRIPTION =
  '提交本单营养方案与约束，等用户确认。只在方案确认阶段使用；提交后本次运行暂停。' +
  'summary 只写方案定位，不要复述年龄/体重/品种/BCS（编辑器已经展示）；理由与建议写 rationale。' +
  'constraints 只放疾病特异性、或比 FEDIAF 2025 默认评估更严的数值上下限（例如心脏病控钠）；' +
  '营养评估已经覆盖的通用蛋白/脂肪/钙磷等上下限不要重复写。每条带 key、label、单位、依据和来源。' +
  '非数值约束（禁用食材、工艺、餐次等）放 nonNutrient，文案形式。' +
  'nonNutrient 必须覆盖会限制食材选择的非数值条件：忌口/过敏、质地/纤维/产气、工艺/形态、餐次；' +
  '需要低渣时写清避免豆类/粗纤维/菌藻等，让选材阶段能直接执行。' +
  'summary 和 rationale 都不要复述档案：年龄、体重、品种、BCS、性别、检验值；不要提药物、用药、处方或剂量，疾病名可以写。' +
  '只列比 FEDIAF 2025 默认评估更严的那一侧；默认下限不要写，表格只保留疾病特异性边界。' +
  'MAINTAIN 目标不要列 energyDensity；只有减重/增重/特殊能量需求才列，并给出真正有约束力的上限。' +
  '钠只有在比 FEDIAF 2025 上限 0.55 g/1000 kcal 更严时才列；与默认相同不要列。' +
  '胰腺炎与肿瘤蛋白目标冲突时以胰腺炎安全为先：蛋白上限不超过 30% DM；30–45% DM 只写进 rationale 标待确认，不要作为硬约束。' +
  '不要写“每日总热量/kcal 目标”；需要控制能量时用 key=energyDensity、unit=KCAL_PER_100G 或 KCAL_PER_KG 的约束。';

const PROPOSE_SELECTION_DESCRIPTION =
  '提交食材候选，等用户确认。只在选材阶段使用；提交后本次运行暂停。' +
  '选材阶段只列食材，不要列补剂：补剂要等食谱评估出营养缺口后，在配方编辑阶段再补。' +
  '按营养与忌口自由选食材，不要查原料库，也不要填写库 ID；提交后系统会按名称自动匹配原料库，没匹配到才标库外。' +
  `按 CFCT 固定 15 类分组（${CFCT_CLASS_PROMPT}），每个适用类型至少 2 个候选。` +
  '选材前先逐条读已确认方案（含 nonNutrient），任何候选违反一条就淘汰；方案约束优先级最高，不要按疾病名做选材特判。' +
  '只有用户明确说“最终确认/就按这份清单/确认选材”时才把 confirmed 设为 true；此时只列用户确认的食材，不要补替代候选；confirmed=true 时不受“每类至少 2 个”限制；' +
  '如果确认清单与方案硬约束冲突，先指出冲突并询问，不要把 confirmed 设为 true。' +
  '15 类是词表，不是必须每类都填：只在合格食材里分组，每个适用类型至少 2 个；凑不出就放进 skippedCategories，写清违反的是哪条方案约束；' +
  '不要用补剂、水、加工品、高脂坚果或高碘海藻凑数。' +
  '严禁把方案忌口食材（牛、羊、鸡、鸡蛋及其制品）列为候选，也不要为了凑类型去列禁忌食材。';

export const PROPOSE_PLAN_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'propose_plan',
    description: PROPOSE_PLAN_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '方案定位；不要复述年龄/体重/品种/BCS',
        },
        rationale: {
          type: 'string',
          description: '方案制定的理由与建议；纯文本',
        },
        constraints: {
          type: 'array',
          description:
            '只放疾病特异性/比 FEDIAF 2025 默认评估更严的数值约束；通用项不要放',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: '如 fat / protein / sodium' },
              label: { type: 'string' },
              min: { type: 'number' },
              max: { type: 'number' },
              unit: {
                type: 'string',
                enum: [
                  'PERCENT_DM',
                  'PER_1000_KCAL',
                  'PER_MJ',
                  'G_PER_DAY',
                  'OTHER',
                ],
              },
              basis: {
                type: 'string',
                description: '如 FEDIAF 2025 Table III-3a',
              },
              source: { type: 'string', description: '如 FEDIAF 2025 / SACN5' },
              citationId: { type: 'string' },
              hard: { type: 'boolean' },
            },
            required: ['key', 'label', 'unit', 'source'],
            additionalProperties: false,
          },
        },
        nonNutrient: {
          type: 'array',
          description: '非数值约束，文案形式，展示在表格后面',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              label: { type: 'string' },
              value: { type: 'string' },
              unit: { type: 'string' },
              note: { type: 'string' },
              hard: { type: 'boolean' },
            },
            required: ['key', 'label', 'value'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },
};

export const REVISE_PLAN_TOOL: DeepSeekToolDefinition = {
  ...PROPOSE_PLAN_TOOL,
  function: {
    ...PROPOSE_PLAN_TOOL.function,
    name: 'revise_plan',
    description:
      '用户明确要求修改已确认的营养方案时使用。用户的话是最高优先级，不要以“方案已锁定”拒绝。' +
      '传入修改后的完整方案；调用后方案立即更新，原选材会被清空，需要重新核对。' +
      '如果修改涉及硬约束/医学风险，先用一句话说明风险，但仍按用户要求更新。',
  },
};

export const REOPEN_SELECTION_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'reopen_selection',
    description:
      '用户明确要求重新选材/修改已确认选材时使用。方案不变，清空当前选材并回到选材阶段，等用户重新确认清单。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

export const PROPOSE_SELECTION_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'propose_selection',
    description: PROPOSE_SELECTION_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              name: { type: 'string' },
              foodCategory: {
                type: 'string',
                description: 'CFCT 分类；建议用固定 15 类原词',
              },
              reason: { type: 'string' },
            },
            required: ['name', 'reason'],
            additionalProperties: false,
          },
        },
        confirmed: {
          type: 'boolean',
          description:
            '用户明确最终确认这份清单时 true；会直接进入配方编辑阶段',
        },
        skippedCategories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['category', 'reason'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },
};

export function normalizePlan(raw: unknown): AgentNutritionPlan {
  const input = isRecord(raw) ? raw : {};
  const summary =
    stripMedicationSentences(readText(input.summary, 'summary', 4000)) ||
    '营养管理方案';
  const rationaleRaw = readOptionalText(input.rationale, 6000);
  const rationale = rationaleRaw
    ? stripMedicationSentences(rationaleRaw)
    : undefined;
  const rawConstraints = Array.isArray(input.constraints)
    ? input.constraints
    : [];
  const constraints = rawConstraints.map((entry, index) =>
    normalizeConstraint(entry, index),
  );
  for (const constraint of constraints) {
    if (
      constraint.min !== null &&
      constraint.max !== null &&
      constraint.min > constraint.max
    ) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `${constraint.key} 的下限不能大于上限`,
      );
    }
  }

  const rawNonNutrient = Array.isArray(input.nonNutrient)
    ? input.nonNutrient
    : [];
  const nonNutrient = rawNonNutrient
    .map((entry, index) => normalizeNonNutrient(entry, index))
    .filter((item) => !isMedicationItem(item));

  return {
    summary,
    ...(rationale ? { rationale } : {}),
    constraints,
    nonNutrient,
    ...(readOptionalText(input.notes, 2000)
      ? {
          notes: stripMedicationSentences(readOptionalText(input.notes, 2000)!),
        }
      : {}),
  };
}

export function normalizeSelection(raw: unknown): AgentSelection {
  const input = isRecord(raw) ? raw : {};
  const summary =
    stripMedicationSentences(readText(input.summary, 'summary', 4000)) ||
    '食材候选';
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems.map((entry, index) =>
    normalizeSelectionItem(entry, index),
  );
  const rawSkipped = Array.isArray(input.skippedCategories)
    ? input.skippedCategories
    : [];
  const skippedCategories: Array<{ category: string; reason: string }> = [];
  for (const [index, entry] of rawSkipped.entries()) {
    if (!isRecord(entry)) continue;
    const category = readText(
      entry.category,
      `skippedCategories[${index}].category`,
      40,
    );
    if (skippedCategories.some((item) => item.category === category)) {
      continue;
    }
    skippedCategories.push({
      category,
      reason: readText(entry.reason, `skippedCategories[${index}].reason`, 500),
    });
  }
  return {
    summary,
    items,
    ...(input.confirmed === true ? { confirmed: true } : {}),
    ...(skippedCategories.length > 0 ? { skippedCategories } : {}),
    ...(readOptionalText(input.notes, 2000)
      ? {
          notes: stripMedicationSentences(readOptionalText(input.notes, 2000)!),
        }
      : {}),
  };
}

export function summarizePlan(plan: AgentNutritionPlan): string {
  const lines = [`【方案待确认】${plan.summary}`];
  if (plan.rationale) {
    lines.push('理由与建议：', plan.rationale);
  }
  lines.push(
    `数值约束 ${plan.constraints.length} 条，见上方方案卡表格（仅列疾病特异性/比默认评估更严的项；通用项以营养评估为准）。`,
  );
  if (plan.nonNutrient.length > 0) {
    lines.push('非数值约束：');
    for (const item of plan.nonNutrient) {
      lines.push(`- ${item.label}：${item.value}${item.unit ?? ''}`);
    }
  }
  lines.push('确认后进入选材阶段；有问题请直接回复要改的地方。');
  return lines.join('\n');
}

export function summarizeSelection(selection: AgentSelection): string {
  const lines = [
    `【选材待确认】${selection.summary}`,
    `候选 ${selection.items.length} 项：`,
    ...selection.items.map(
      (item) =>
        `- [${item.foodCategory ?? '食材'}]「${item.name}」：${item.reason}（${dataStatusLabel(item.dataStatus)}）`,
    ),
    '确认后进入配方编辑阶段；库外食材需要先新增原料。补剂不在选材阶段选，等配方评估出缺口后再补。',
  ];
  return lines.join('\n');
}

function normalizeConstraint(
  entry: unknown,
  index: number,
): AgentPlanConstraint {
  const input = isRecord(entry) ? entry : {};
  const key = readText(input.key, `constraints[${index}].key`, 80);
  const label = readText(input.label, `constraints[${index}].label`, 120);
  const unit = readText(input.unit, `constraints[${index}].unit`, 40);
  const source = readText(input.source, `constraints[${index}].source`, 200);
  const basis = readOptionalText(input.basis, 200) ?? '';
  const min = readNullableNumber(input.min, `constraints[${index}].min`);
  const max = readNullableNumber(input.max, `constraints[${index}].max`);
  return {
    key,
    label,
    min,
    max,
    unit,
    basis,
    source,
    ...(readOptionalText(input.citationId, 200)
      ? { citationId: readOptionalText(input.citationId, 200)! }
      : {}),
    hard: input.hard !== false,
  };
}

function normalizeNonNutrient(
  entry: unknown,
  index: number,
): AgentPlanNonNutrientConstraint {
  const input = isRecord(entry) ? entry : {};
  return {
    key: readText(input.key, `nonNutrient[${index}].key`, 80),
    label: readText(input.label, `nonNutrient[${index}].label`, 120),
    value: readText(input.value, `nonNutrient[${index}].value`, 500),
    ...(readOptionalText(input.unit, 40)
      ? { unit: readOptionalText(input.unit, 40)! }
      : {}),
    ...(readOptionalText(input.note, 1000)
      ? { note: readOptionalText(input.note, 1000)! }
      : {}),
    hard: input.hard !== false,
  };
}

function normalizeSelectionItem(
  entry: unknown,
  index: number,
): AgentSelectionItem {
  const input = isRecord(entry) ? entry : {};
  const kind = input.kind === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'FOOD';
  const name = readText(input.name, `items[${index}].name`, 120);
  const foodCategory = readOptionalText(input.foodCategory, 40) ?? '未分类';
  const reason =
    stripMedicationSentences(
      readText(input.reason, `items[${index}].reason`, 1000),
    ) || '食材候选';
  const ingredientId = readOptionalText(input.ingredientId, 80);
  const nutritionFoodId = readOptionalText(input.nutritionFoodId, 80);
  const dataStatus =
    input.dataStatus === 'MISSING' || input.dataStatus === 'NEEDS_PROFILE'
      ? input.dataStatus
      : ingredientId || nutritionFoodId
        ? 'AVAILABLE'
        : 'MISSING';
  return {
    kind,
    name,
    foodCategory,
    reason,
    ...(ingredientId ? { ingredientId } : {}),
    ...(nutritionFoodId ? { nutritionFoodId } : {}),
    dataStatus,
  };
}

function readText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new AgentToolError('INVALID_ARGUMENT', `${field} 不能为空`);
  }
  if (text.length > maxLength) {
    throw new AgentToolError(
      'INVALID_ARGUMENT',
      `${field} 不能超过 ${maxLength} 个字符`,
    );
  }
  return text;
}

function readOptionalText(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.slice(0, maxLength);
}

function readNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AgentToolError('INVALID_ARGUMENT', `${field} 必须是数字或 null`);
  }
  return number;
}

function formatRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `≥${min}`;
  if (max !== null) return `≤${max}`;
  return '—';
}

function dataStatusLabel(status: AgentSelectionItem['dataStatus']): string {
  if (status === 'MISSING') return '原料库没有';
  if (status === 'NEEDS_PROFILE') return '营养档案不全';
  return '可用';
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
