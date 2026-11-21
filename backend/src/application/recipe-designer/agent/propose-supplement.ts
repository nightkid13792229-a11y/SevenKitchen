/**
 * 补剂提案（C2，2026-11-22）。
 *
 * AI 只能“提案”，不能直接写配方；人工在提案卡点“加入配方”后才 addItem。
 * 这样补剂不会绕过人选，也不会被模型自己加进评估。
 */
import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { AgentToolError } from './agent-types';

export interface AgentSupplementProposalItem {
  /** 补剂对应的营养食品 id（addItem 必填） */
  nutritionFoodId: string;
  /** 可选：已有原料 id */
  ingredientId?: string;
  /** 展示名，如“锌片” */
  name: string;
  /** 每份加入克数 */
  weightG: number;
  /** 补哪个营养素字段，如 minerals.zinc */
  fieldPath: string;
  /** 人读标签，如“锌” */
  label?: string;
  /** 目标单位，如 mg */
  unit?: string;
  /** 为什么建议加 */
  reason: string;
}

export interface AgentSupplementProposal {
  summary?: string;
  items: AgentSupplementProposalItem[];
}

const PROPOSE_SUPPLEMENT_DESCRIPTION =
  '提交补剂提案，等人工确认后再加入配方。提案本身不写入草稿；每项写清 nutritionFoodId、weightG、fieldPath、name、reason。最多 3 项；先 find_food 确认补剂已开启采购。';

export const PROPOSE_SUPPLEMENT_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: 'propose_supplement',
    description: PROPOSE_SUPPLEMENT_DESCRIPTION,
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', maxLength: 500 },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              nutritionFoodId: { type: 'string' },
              ingredientId: { type: 'string' },
              name: { type: 'string' },
              weightG: { type: 'number', minimum: 0.01 },
              fieldPath: { type: 'string' },
              label: { type: 'string' },
              unit: { type: 'string' },
              reason: { type: 'string', maxLength: 300 },
            },
            required: [
              'nutritionFoodId',
              'name',
              'weightG',
              'fieldPath',
              'reason',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
};

export function normalizeSupplementProposal(
  input: unknown,
): AgentSupplementProposal {
  if (!isRecord(input)) {
    throw new AgentToolError('INVALID_ARGUMENT', '补剂提案必须是对象');
  }
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0 || rawItems.length > 3) {
    throw new AgentToolError(
      'INVALID_ARGUMENT',
      '补剂提案需要 1–3 项',
    );
  }
  const items = rawItems.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项格式不正确`,
      );
    }
    const nutritionFoodId = readText(raw.nutritionFoodId);
    const name = readText(raw.name);
    const fieldPath = readText(raw.fieldPath);
    const reason = readText(raw.reason);
    const weightG = Number(raw.weightG);
    if (!nutritionFoodId) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项缺少 nutritionFoodId`,
      );
    }
    if (!name) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项缺少 name`,
      );
    }
    if (!fieldPath) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项缺少 fieldPath`,
      );
    }
    if (!reason) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项缺少 reason`,
      );
    }
    if (!Number.isFinite(weightG) || weightG <= 0) {
      throw new AgentToolError(
        'INVALID_ARGUMENT',
        `补剂提案第 ${index + 1} 项 weightG 必须大于 0`,
      );
    }
    return {
      nutritionFoodId,
      ...(readText(raw.ingredientId)
        ? { ingredientId: readText(raw.ingredientId) }
        : {}),
      name,
      weightG,
      fieldPath,
      ...(readText(raw.label) ? { label: readText(raw.label) } : {}),
      ...(readText(raw.unit) ? { unit: readText(raw.unit) } : {}),
      reason,
    };
  });
  const summary = readText(input.summary);
  return { ...(summary ? { summary } : {}), items };
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
