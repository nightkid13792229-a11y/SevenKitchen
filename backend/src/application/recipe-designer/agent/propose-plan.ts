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
  /** 饲喂餐次；属于饲喂安排，不是热量目标。不填也能提交。 */
  mealsPerDay?: number;
  /** 只放疾病特异性/比默认评估更严的数值约束；通用项不要放。 */
  constraints: AgentPlanConstraint[];
  /** 非数值约束，文案形式，展示在约束表格后面。 */
  nonNutrient: AgentPlanNonNutrientConstraint[];
  notes?: string;
}

export interface AgentSelectionItem {
  kind: 'FOOD' | 'SUPPLEMENT';
  name: string;
  ingredientId?: string;
  nutritionFoodId?: string;
  reason: string;
  /** AVAILABLE = 库内有可用档案；MISSING = 库内没有；NEEDS_PROFILE = 有原料但档案不全 */
  dataStatus: 'AVAILABLE' | 'MISSING' | 'NEEDS_PROFILE';
}

export interface AgentSelection {
  summary: string;
  items: AgentSelectionItem[];
  notes?: string;
}

const PROPOSE_PLAN_DESCRIPTION =
  '提交本单营养方案与约束，等用户确认。只在方案确认阶段使用；提交后本次运行暂停。' +
  'summary 只写方案定位，不要复述年龄/体重/品种/BCS（编辑器已经展示）；理由与建议写 rationale。' +
  'constraints 只放疾病特异性、或比 FEDIAF 2025 默认评估更严的数值上下限（例如心脏病控钠）；' +
  '营养评估已经覆盖的通用蛋白/脂肪/钙磷等上下限不要重复写。每条带 key、label、单位、依据和来源。' +
  '非数值约束（禁用食材、工艺、餐次等）放 nonNutrient，文案形式。' +
  '不要写“每日总热量/kcal 目标”；需要控制能量时用 key=energyDensity、unit=KCAL_PER_100G 或 KCAL_PER_KG 的约束。';

const PROPOSE_SELECTION_DESCRIPTION =
  '提交食材与补剂候选，等用户确认。只在选材阶段使用；提交后本次运行暂停。' +
  '补剂必须来自现有原料库并带 ingredientId 或 nutritionFoodId；库外食材标 MISSING，等用户新增原料后再进入配方编辑。';

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
        mealsPerDay: { type: 'integer', minimum: 1, maximum: 6 },
        constraints: {
          type: 'array',
          minItems: 1,
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
      required: ['summary', 'constraints'],
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
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['FOOD', 'SUPPLEMENT'] },
              name: { type: 'string' },
              ingredientId: { type: 'string' },
              nutritionFoodId: { type: 'string' },
              reason: { type: 'string' },
              dataStatus: {
                type: 'string',
                enum: ['AVAILABLE', 'MISSING', 'NEEDS_PROFILE'],
              },
            },
            required: ['kind', 'name', 'reason'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['summary', 'items'],
      additionalProperties: false,
    },
  },
};

export function normalizePlan(raw: unknown): AgentNutritionPlan {
  const input = isRecord(raw) ? raw : {};
  const summary = readText(input.summary, 'summary', 4000);
  const rationale = readOptionalText(input.rationale, 6000);
  const mealsPerDay =
    input.mealsPerDay === undefined || input.mealsPerDay === null
      ? undefined
      : Number(input.mealsPerDay);
  if (
    mealsPerDay !== undefined &&
    (!Number.isInteger(mealsPerDay) || mealsPerDay < 1 || mealsPerDay > 6)
  ) {
    throw new AgentToolError(
      'INVALID_ARGUMENT',
      'mealsPerDay 必须是 1–6 的整数',
    );
  }
  const rawConstraints = Array.isArray(input.constraints)
    ? input.constraints
    : [];
  if (rawConstraints.length === 0) {
    throw new AgentToolError('INVALID_ARGUMENT', 'constraints 不能为空');
  }
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
  const nonNutrient = rawNonNutrient.map((entry, index) =>
    normalizeNonNutrient(entry, index),
  );

  return {
    summary,
    ...(rationale ? { rationale } : {}),
    ...(mealsPerDay !== undefined ? { mealsPerDay } : {}),
    constraints,
    nonNutrient,
    ...(readOptionalText(input.notes, 2000)
      ? { notes: readOptionalText(input.notes, 2000)! }
      : {}),
  };
}

export function normalizeSelection(raw: unknown): AgentSelection {
  const input = isRecord(raw) ? raw : {};
  const summary = readText(input.summary, 'summary', 4000);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) {
    throw new AgentToolError('INVALID_ARGUMENT', 'items 不能为空');
  }
  const items = rawItems.map((entry, index) =>
    normalizeSelectionItem(entry, index),
  );
  return {
    summary,
    items,
    ...(readOptionalText(input.notes, 2000)
      ? { notes: readOptionalText(input.notes, 2000)! }
      : {}),
  };
}

export function summarizePlan(plan: AgentNutritionPlan): string {
  const lines = [`【方案待确认】${plan.summary}`];
  if (plan.rationale) {
    lines.push('理由与建议：', plan.rationale);
  }
  if (plan.mealsPerDay) {
    lines.push(`每日 ${plan.mealsPerDay} 餐。`);
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
        `- ${item.kind === 'FOOD' ? '食材' : '补剂'}「${item.name}」：${item.reason}（${dataStatusLabel(item.dataStatus)}）`,
    ),
    '确认后进入配方编辑阶段；库外食材需要先新增原料。',
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
  if (min === null && max === null) {
    throw new AgentToolError('INVALID_ARGUMENT', `${key} 至少要有 min 或 max`);
  }
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
  const reason = readText(input.reason, `items[${index}].reason`, 1000);
  const ingredientId = readOptionalText(input.ingredientId, 80);
  const nutritionFoodId = readOptionalText(input.nutritionFoodId, 80);
  if (kind === 'SUPPLEMENT' && !ingredientId && !nutritionFoodId) {
    throw new AgentToolError(
      'INVALID_ARGUMENT',
      `补剂「${name}」必须来自原料库，并带 ingredientId 或 nutritionFoodId`,
    );
  }
  const dataStatus =
    input.dataStatus === 'MISSING' || input.dataStatus === 'NEEDS_PROFILE'
      ? input.dataStatus
      : ingredientId || nutritionFoodId
        ? 'AVAILABLE'
        : 'MISSING';
  return {
    kind,
    name,
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
