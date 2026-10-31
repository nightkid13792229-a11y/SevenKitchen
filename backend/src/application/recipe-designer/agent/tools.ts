/**
 * 6 个工具（2026-10-31 重建，替代原来的 22 个）。
 *
 * 原则：工具的数量和返回体积，就是模型的"操作规程"。
 * 所以不加"你必须先…"的说明，而是让工具本身只回这一步需要的东西。
 */
import type { DeepSeekToolDefinition } from '../deepseek-tools-chat';
import { RecipeDraftPort } from './draft-port';
import {
  AgentToolError,
  fail,
  ok,
  type RecipeEditOp,
  type ToolOutcome,
} from './agent-types';

const NO_ARGS = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export const AGENT_TOOLS: DeepSeekToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_draft',
      description:
        '读当前草稿：目的之外的状态（名称、阶段、现有原料与克数、上次评估是否最新）。开工前和每次大改后读一次。',
      parameters: NO_ARGS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_food',
      description:
        '按关键词找原料，每条只回名称、分类、状态和一个可直接使用的档案 id。一次最多 8 条。',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: '关键词，如「鸭肉」「南瓜」' },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        },
        required: ['search'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_recipe',
      description:
        '修改当前草稿的原料。一次可传多个操作，按顺序执行并逐条回报结果。',
      parameters: {
        type: 'object',
        properties: {
          ops: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
              type: 'object',
              properties: {
                op: {
                  type: 'string',
                  enum: ['add', 'set_weight', 'replace', 'remove'],
                },
                nutritionFoodId: { type: 'string' },
                ingredientId: { type: 'string' },
                itemId: { type: 'string' },
                weightG: { type: 'number', minimum: 0 },
                preparationMethod: { type: 'string', maxLength: 20 },
              },
              required: ['op'],
              additionalProperties: false,
            },
          },
        },
        required: ['ops'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'assess',
      description:
        '在当前内容上跑营养评估。只回：过没过、各项计数、还差的项（最多 12 条）、命中的过敏原。',
      parameters: NO_ARGS,
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_copy',
      description: '写名称、封面标题、卖点和描述。配方定了再写。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 200 },
          coverTitle: { type: 'string', maxLength: 20 },
          sellingPoint: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 4000 },
        },
        minProperties: 1,
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask',
      description:
        '只有在"目的不清楚"或"两个方向都合理但选错要重做"时才用。一次只问一个问题。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, maxItems: 5 },
        },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
];

export interface ToolExecutionContext {
  port: RecipeDraftPort;
  /** ask 工具把问题交回运行时：运行时暂停并等用户回答。 */
  onAsk: (question: string, options: string[]) => void;
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  context: ToolExecutionContext,
): Promise<ToolOutcome> {
  const args = isRecord(rawArgs) ? rawArgs : {};

  try {
    switch (name) {
      case 'read_draft': {
        const summary = await context.port.readDraft();
        return ok(summary, summarizeDraft(summary));
      }

      case 'find_food': {
        const search =
          typeof args.search === 'string' ? args.search.trim() : '';
        if (!search) {
          return fail('INVALID_ARGUMENT', 'search 不能为空');
        }
        const candidates = await context.port.findFoods({
          search,
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        });
        return ok(
          candidates,
          candidates.length === 0
            ? `没有找到「${search}」，换个说法或先入库`
            : `找到 ${candidates.length} 条`,
        );
      }

      case 'edit_recipe': {
        const ops = Array.isArray(args.ops) ? args.ops : [];
        if (ops.length === 0) {
          return fail('INVALID_ARGUMENT', 'ops 不能为空');
        }
        const parsed = parseOps(ops);
        if (!parsed.ok) {
          return fail('INVALID_ARGUMENT', parsed.message);
        }
        const results = await context.port.editRecipe(parsed.ops);
        const failed = results.filter((item) => !item.ok);
        const summary =
          failed.length === 0
            ? `${results.length} 项已执行`
            : `${results.length - failed.length} 项成功，${failed.length} 项失败：${failed
                .map((item) => item.message)
                .join('；')}`;
        return { ok: failed.length === 0, data: results, summary };
      }

      case 'assess': {
        const summary = await context.port.assess();
        return ok(summary, summarizeAssessment(summary));
      }

      case 'write_copy': {
        const changed = await context.port.writeCopy({
          name: readText(args.name),
          coverTitle: readText(args.coverTitle),
          sellingPoint: readText(args.sellingPoint),
          description: readText(args.description),
        });
        return ok(
          changed,
          changed.length === 0 ? '没有需要写的内容' : `已写：${changed.join('、')}`,
        );
      }

      case 'ask': {
        const question = readText(args.question);
        if (!question) {
          return fail('INVALID_ARGUMENT', 'question 不能为空');
        }
        const options = Array.isArray(args.options)
          ? args.options.filter((item): item is string => typeof item === 'string')
          : [];
        context.onAsk(question, options);
        return ok({ question, options }, `已向用户提问：${question}`);
      }

      default:
        return fail('UNKNOWN_TOOL', `没有这个工具：${name}`);
    }
  } catch (error) {
    if (error instanceof AgentToolError) {
      return fail(error.code, error.message);
    }
    return fail('TOOL_FAILED', (error as Error).message || '工具执行失败');
  }
}

function parseOps(
  raw: unknown[],
): { ok: true; ops: RecipeEditOp[] } | { ok: false; message: string } {
  const ops: RecipeEditOp[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return { ok: false, message: 'ops 里的每一项必须是对象' };
    }
    const op = entry.op;
    if (op === 'add') {
      const nutritionFoodId = readText(entry.nutritionFoodId);
      const weightG = Number(entry.weightG);
      if (!nutritionFoodId || !Number.isFinite(weightG) || weightG <= 0) {
        return { ok: false, message: 'add 需要 nutritionFoodId 和 weightG' };
      }
      ops.push({
        op: 'add',
        nutritionFoodId,
        ingredientId: readText(entry.ingredientId),
        weightG,
        preparationMethod: readText(entry.preparationMethod),
      });
      continue;
    }
    if (op === 'set_weight') {
      const itemId = readText(entry.itemId);
      const weightG = Number(entry.weightG);
      if (!itemId || !Number.isFinite(weightG) || weightG <= 0) {
        return { ok: false, message: 'set_weight 需要 itemId 和 weightG' };
      }
      ops.push({ op: 'set_weight', itemId, weightG });
      continue;
    }
    if (op === 'remove') {
      const itemId = readText(entry.itemId);
      if (!itemId) return { ok: false, message: 'remove 需要 itemId' };
      ops.push({ op: 'remove', itemId });
      continue;
    }
    if (op === 'replace') {
      const itemId = readText(entry.itemId);
      const nutritionFoodId = readText(entry.nutritionFoodId);
      if (!itemId || !nutritionFoodId) {
        return { ok: false, message: 'replace 需要 itemId 和 nutritionFoodId' };
      }
      ops.push({
        op: 'replace',
        itemId,
        nutritionFoodId,
        ingredientId: readText(entry.ingredientId),
      });
      continue;
    }
    return { ok: false, message: `不认识的 op：${String(op)}` };
  }
  return { ok: true, ops };
}

function summarizeDraft(summary: {
  name: string;
  itemCount: number;
  totalWeightG: number;
  scenario: string;
  lastAssessment: { isCompliant: boolean; stale: boolean } | null;
}): string {
  const assessment = summary.lastAssessment
    ? summary.lastAssessment.stale
      ? '上次评估已过期'
      : summary.lastAssessment.isCompliant
        ? '上次评估达标'
        : '上次评估未达标'
    : '还没评估过';
  return `${summary.name || '未命名'}：${summary.scenario}，${summary.itemCount} 项原料、共 ${Math.round(
    summary.totalWeightG,
  )}g；${assessment}`;
}

function summarizeAssessment(summary: {
  isCompliant: boolean;
  counts: { deficient: number; excess: number; missingData: number };
  gaps: Array<{ label: string }>;
  allergens: string[];
}): string {
  const parts = [
    summary.isCompliant ? '达标' : '未达标',
    `缺 ${summary.counts.deficient} 项 / 超 ${summary.counts.excess} 项 / 缺数据 ${summary.counts.missingData} 项`,
  ];
  if (summary.gaps.length > 0) {
    parts.push(`主要缺口：${summary.gaps.map((gap) => gap.label).join('、')}`);
  }
  if (summary.allergens.length > 0) {
    parts.push(`⚠ 命中过敏原：${summary.allergens.join('、')}`);
  }
  return parts.join('；');
}

function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
