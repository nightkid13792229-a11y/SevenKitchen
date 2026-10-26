/**
 * 写工具（P0a Task 3）。
 *
 * 七个工具都只写当前这一份草稿：`add_ingredient` / `replace_ingredient` /
 * `update_weight` / `remove_ingredient` / `set_preparation` / `set_copy` /
 * `set_production_steps`。所有校验失败都返回 `{ ok: false, error }`，
 * 不抛异常，让模型自己改参数；成功时统一标记 `ASSESSMENT` / `READY` 过期。
 *
 * 入参来自模型（运行时会绕过 TypeScript 类型），所以每个字段先做 `typeof`
 * 守卫：非法值返回 `INVALID_ARGUMENT` / `INVALID_WEIGHT`，绝不让 `TypeError`
 * 冒出去。校验顺序：先看必填 id / 字符串，再看克数；文案先看长度和标签，
 * 最后扫禁用词。端口自身抛出的异常（如原料不存在）也统一转成数据。
 */
import { BadRequestException } from '@nestjs/common';

import { RECIPE_PRESENTATION_LIMITS } from '../../../interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  assertCopywritingCompliant,
  scanForbiddenClaims,
} from '../recipe-copywriting-compliance';
import {
  RecipeAgentPortError,
  type AgentCopyPatch,
  type AgentDraftItem,
  type AgentProductionStep,
  type AgentToolErrorCode,
  type AgentToolResult,
  type HealthTagPolicy,
} from './agent-types';
import type { RecipeAgentDraftPort } from './recipe-agent.port';

/** 单条原料的最小克数。 */
export const MIN_ITEM_WEIGHT_G = 0.1;
/** 单条原料的最大克数。 */
export const MAX_ITEM_WEIGHT_G = 10_000;
/** 一份草稿最多允许的制作步骤数。 */
export const MAX_PRODUCTION_STEPS = 30;

/** 系列名上限（规格书要求「代码查非空」，长度按 200 卡住模型乱写）。 */
const MAX_COPY_NAME_LENGTH = 200;
/** 预处理备注上限。 */
const MAX_PREPARATION_NOTE_LENGTH = 500;

const STALE_AFTER_WRITE = ['ASSESSMENT', 'READY'] as const;
const STALE_NOTE = '评估与交付检查已过期，需要重跑。';
const WEIGHT_MESSAGE = `weightG 必须是 ${MIN_ITEM_WEIGHT_G}–${MAX_ITEM_WEIGHT_G}g 之间的有限数字。`;

export interface AddIngredientArgs {
  nutritionFoodId: string;
  ingredientId?: string;
  weightG: number;
  preparationMethod?: string;
}

export interface ReplaceIngredientArgs {
  itemId: string;
  nutritionFoodId: string;
  ingredientId?: string;
  weightG: number;
}

export interface UpdateWeightArgs {
  itemId: string;
  weightG: number;
}

export interface RemoveIngredientArgs {
  itemId: string;
}

export interface SetPreparationArgs {
  itemId: string;
  method: string;
  note?: string | null;
}

export interface SetCopyArgs {
  name?: string;
  coverTitle?: string;
  sellingPoint?: string;
  description?: string;
  targetHealthTags?: string[];
}

export interface SetProductionStepsArgs {
  steps: AgentProductionStep[];
}

/** `createWriteTools` 的返回类型；Task 5 的注册表按这个形状挂 handler。 */
export interface RecipeAgentWriteTools {
  add_ingredient(
    args: AddIngredientArgs,
  ): Promise<AgentToolResult<AgentDraftItem>>;
  replace_ingredient(
    args: ReplaceIngredientArgs,
  ): Promise<AgentToolResult<AgentDraftItem>>;
  update_weight(
    args: UpdateWeightArgs,
  ): Promise<AgentToolResult<AgentDraftItem>>;
  remove_ingredient(
    args: RemoveIngredientArgs,
  ): Promise<
    AgentToolResult<{ itemId: string; name: string; totalWeightG: number }>
  >;
  set_preparation(
    args: SetPreparationArgs,
  ): Promise<AgentToolResult<AgentDraftItem>>;
  set_copy(args: SetCopyArgs): Promise<AgentToolResult<AgentCopyPatch>>;
  set_production_steps(
    args: SetProductionStepsArgs,
  ): Promise<AgentToolResult<AgentProductionStep[]>>;
}

export interface WriteToolDeps {
  port: RecipeAgentDraftPort;
  draftId: string;
  tagPolicy: HealthTagPolicy;
}

type RawToolArgs = Record<string, unknown>;

const fail = <T>(
  code: AgentToolErrorCode,
  message: string,
): AgentToolResult<T> => ({
  ok: false,
  error: { code, message },
});

/** 写成功统一带上「哪些结果过期了」；文案也算，因为交付检查依赖文案。 */
const okWrite = <T>(data: T, summary: string): AgentToolResult<T> => ({
  ok: true,
  data,
  summary,
  stale: [...STALE_AFTER_WRITE],
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/**
 * 端口调用统一在这里兜住：端口抛错（原料不存在、DB 异常）也变成数据，
 * 不让异常穿过工具层。
 *
 * `RecipeAgentPortError` 自带业务错误码（如 `INGREDIENT_NOT_FOUND`），原样带上；
 * 其他异常没有错误码，由调用方回退成 `INVALID_ARGUMENT`。
 */
async function callPort<T>(
  action: () => Promise<T>,
): Promise<
  | { ok: true; value: T }
  | { ok: false; code?: AgentToolErrorCode; message: string }
> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    return {
      ok: false,
      ...(error instanceof RecipeAgentPortError ? { code: error.code } : {}),
      message: `操作失败：${errorMessage(error)}`,
    };
  }
}

function asRawArgs(args: unknown): RawToolArgs | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return null;
  }
  return args as RawToolArgs;
}

/** 必填 id：必须是字符串，trim 后非空。 */
function readRequiredId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** 可选字符串：没传 → undefined；类型不对 → null；有效值 → trim 后（空串当没传）。 */
function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  return value.trim() || undefined;
}

/** 克数：必须是有限数，且落在 [0.1, 10000]。 */
function readWeightG(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < MIN_ITEM_WEIGHT_G || value > MAX_ITEM_WEIGHT_G) return null;
  return value;
}

const COPY_FIELD_LABELS: Record<keyof AgentCopyPatch, string> = {
  name: '系列名',
  coverTitle: '封面标题',
  sellingPoint: '卖点',
  description: '描述',
  targetHealthTags: '健康标签',
};

/**
 * 造七个写工具。
 *
 * @param deps.port 草稿端口（P0a 用内存假端口）
 * @param deps.draftId 当前这份草稿的 id
 * @param deps.tagPolicy 健康标签白名单
 */
export function createWriteTools(deps: WriteToolDeps): RecipeAgentWriteTools {
  const { port, draftId, tagPolicy } = deps;

  return {
    async add_ingredient(
      args: AddIngredientArgs,
    ): Promise<AgentToolResult<AgentDraftItem>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const nutritionFoodId = readRequiredId(raw.nutritionFoodId);
      if (!nutritionFoodId) {
        return fail('INVALID_ARGUMENT', 'nutritionFoodId 不能为空。');
      }
      const ingredientId = readOptionalString(raw.ingredientId);
      if (ingredientId === null) {
        return fail('INVALID_ARGUMENT', 'ingredientId 必须是字符串。');
      }
      const preparationMethod = readOptionalString(raw.preparationMethod);
      if (preparationMethod === null) {
        return fail('INVALID_ARGUMENT', 'preparationMethod 必须是字符串。');
      }

      const weightG = readWeightG(raw.weightG);
      if (weightG === null) {
        return fail('INVALID_WEIGHT', WEIGHT_MESSAGE);
      }

      const written = await callPort(() =>
        port.addItem(draftId, {
          nutritionFoodId,
          weightG,
          ...(ingredientId ? { ingredientId } : {}),
          ...(preparationMethod ? { preparationMethod } : {}),
        }),
      );
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      const item = written.value;
      return okWrite(
        item,
        `已加入原料「${item.name}」${weightG}g；${STALE_NOTE}`,
      );
    },

    async replace_ingredient(
      args: ReplaceIngredientArgs,
    ): Promise<AgentToolResult<AgentDraftItem>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const itemId = readRequiredId(raw.itemId);
      if (!itemId) {
        return fail('INVALID_ARGUMENT', 'itemId 不能为空。');
      }
      const nutritionFoodId = readRequiredId(raw.nutritionFoodId);
      if (!nutritionFoodId) {
        return fail('INVALID_ARGUMENT', 'nutritionFoodId 不能为空。');
      }
      const ingredientId = readOptionalString(raw.ingredientId);
      if (ingredientId === null) {
        return fail('INVALID_ARGUMENT', 'ingredientId 必须是字符串。');
      }

      const weightG = readWeightG(raw.weightG);
      if (weightG === null) {
        return fail('INVALID_WEIGHT', WEIGHT_MESSAGE);
      }

      const written = await callPort(() =>
        port.replaceItem(itemId, {
          nutritionFoodId,
          weightG,
          ...(ingredientId ? { ingredientId } : {}),
        }),
      );
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      const item = written.value;
      return okWrite(
        item,
        `已把「${item.name}」替换为${weightG}g；${STALE_NOTE}`,
      );
    },

    async update_weight(
      args: UpdateWeightArgs,
    ): Promise<AgentToolResult<AgentDraftItem>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const itemId = readRequiredId(raw.itemId);
      if (!itemId) {
        return fail('INVALID_ARGUMENT', 'itemId 不能为空。');
      }

      const weightG = readWeightG(raw.weightG);
      if (weightG === null) {
        return fail('INVALID_WEIGHT', WEIGHT_MESSAGE);
      }

      const written = await callPort(() => port.updateWeight(itemId, weightG));
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      return okWrite(
        written.value,
        `已把原料克数改为 ${weightG}g；${STALE_NOTE}`,
      );
    },

    async remove_ingredient(
      args: RemoveIngredientArgs,
    ): Promise<
      AgentToolResult<{ itemId: string; name: string; totalWeightG: number }>
    > {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const itemId = readRequiredId(raw.itemId);
      if (!itemId) {
        return fail('INVALID_ARGUMENT', 'itemId 不能为空。');
      }

      const draftResult = await callPort(() => port.getDraft(draftId));
      if (!draftResult.ok) {
        return fail(
          draftResult.code ?? 'INVALID_ARGUMENT',
          draftResult.message,
        );
      }
      const item = draftResult.value.items.find((entry) => entry.id === itemId);
      if (!item) {
        return fail('INVALID_ARGUMENT', `找不到原料「${itemId}」。`);
      }

      const totalWeightG =
        Math.round((draftResult.value.totalWeightG - item.weightG) * 100) / 100;
      if (totalWeightG <= 0) {
        return fail(
          'DRAFT_EMPTY',
          `删掉「${item.name}」后总重会变成 ${totalWeightG}g，不能把草稿删空。`,
        );
      }

      const removed = await callPort(() => port.removeItem(itemId));
      if (!removed.ok) {
        return fail(removed.code ?? 'INVALID_ARGUMENT', removed.message);
      }

      return okWrite(
        { itemId, name: item.name, totalWeightG },
        `已删除原料「${item.name}」；剩余总重 ${totalWeightG}g；${STALE_NOTE}`,
      );
    },

    async set_preparation(
      args: SetPreparationArgs,
    ): Promise<AgentToolResult<AgentDraftItem>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const itemId = readRequiredId(raw.itemId);
      if (!itemId) {
        return fail('INVALID_ARGUMENT', 'itemId 不能为空。');
      }
      if (typeof raw.method !== 'string') {
        return fail('INVALID_ARGUMENT', 'method 必须是非空字符串。');
      }
      const method = raw.method.trim();
      if (!method) {
        return fail('INVALID_ARGUMENT', 'method 必须是非空字符串。');
      }

      let note: string | null | undefined;
      if (raw.note !== undefined) {
        if (raw.note === null) {
          note = null;
        } else if (typeof raw.note === 'string') {
          const trimmedNote = raw.note.trim();
          if (trimmedNote.length > MAX_PREPARATION_NOTE_LENGTH) {
            return fail(
              'INVALID_ARGUMENT',
              `note 不能超过 ${MAX_PREPARATION_NOTE_LENGTH} 字。`,
            );
          }
          note = trimmedNote || null;
        } else {
          return fail('INVALID_ARGUMENT', 'note 必须是字符串或 null。');
        }
      }

      const written = await callPort(() =>
        port.setPreparation(itemId, {
          method,
          ...(note !== undefined ? { note } : {}),
        }),
      );
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      return okWrite(
        written.value,
        `已设置原料部位 / 状态 / 预处理「${method}」；${STALE_NOTE}`,
      );
    },

    async set_copy(
      args: SetCopyArgs,
    ): Promise<AgentToolResult<AgentCopyPatch>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }

      const patch: AgentCopyPatch = {};
      const changed: string[] = [];

      if (raw.name !== undefined) {
        if (typeof raw.name !== 'string') {
          return fail('INVALID_ARGUMENT', 'name 必须是字符串。');
        }
        const name = raw.name.trim();
        if (!name) {
          return fail('INVALID_ARGUMENT', 'name 不能为空。');
        }
        if (name.length > MAX_COPY_NAME_LENGTH) {
          return fail(
            'INVALID_ARGUMENT',
            `name 不能超过 ${MAX_COPY_NAME_LENGTH} 字。`,
          );
        }
        patch.name = name;
        changed.push(COPY_FIELD_LABELS.name);
      }

      if (raw.coverTitle !== undefined) {
        if (typeof raw.coverTitle !== 'string') {
          return fail('INVALID_ARGUMENT', 'coverTitle 必须是字符串。');
        }
        const coverTitle = raw.coverTitle.trim();
        if (!coverTitle) {
          return fail('INVALID_ARGUMENT', 'coverTitle 不能为空。');
        }
        if (coverTitle.length > RECIPE_PRESENTATION_LIMITS.coverTitle) {
          return fail(
            'INVALID_ARGUMENT',
            `coverTitle 不能超过 ${RECIPE_PRESENTATION_LIMITS.coverTitle} 字。`,
          );
        }
        patch.coverTitle = coverTitle;
        changed.push(COPY_FIELD_LABELS.coverTitle);
      }

      if (raw.sellingPoint !== undefined) {
        if (typeof raw.sellingPoint !== 'string') {
          return fail('INVALID_ARGUMENT', 'sellingPoint 必须是字符串。');
        }
        const sellingPoint = raw.sellingPoint.trim();
        if (!sellingPoint) {
          return fail('INVALID_ARGUMENT', 'sellingPoint 不能为空。');
        }
        if (sellingPoint.length > RECIPE_PRESENTATION_LIMITS.sellingPoint) {
          return fail(
            'INVALID_ARGUMENT',
            `sellingPoint 不能超过 ${RECIPE_PRESENTATION_LIMITS.sellingPoint} 字。`,
          );
        }
        patch.sellingPoint = sellingPoint;
        changed.push(COPY_FIELD_LABELS.sellingPoint);
      }

      if (raw.description !== undefined) {
        if (typeof raw.description !== 'string') {
          return fail('INVALID_ARGUMENT', 'description 必须是字符串。');
        }
        const description = raw.description.trim();
        if (!description) {
          return fail('INVALID_ARGUMENT', 'description 不能为空。');
        }
        if (description.length > RECIPE_PRESENTATION_LIMITS.description) {
          return fail(
            'INVALID_ARGUMENT',
            `description 不能超过 ${RECIPE_PRESENTATION_LIMITS.description} 字。`,
          );
        }
        patch.description = description;
        changed.push(COPY_FIELD_LABELS.description);
      }

      if (raw.targetHealthTags !== undefined) {
        const tagsValue = raw.targetHealthTags;
        if (
          !Array.isArray(tagsValue) ||
          tagsValue.some((tag) => typeof tag !== 'string')
        ) {
          return fail(
            'INVALID_ARGUMENT',
            'targetHealthTags 必须是字符串数组。',
          );
        }
        const tags = (tagsValue as string[]).map((tag) => tag.trim());
        if (tags.some((tag) => !tag)) {
          return fail('TAG_NOT_ALLOWED', '健康标签不能是空串。');
        }
        const uniqueTags = Array.from(new Set(tags));
        const rejected = uniqueTags.filter(
          (tag) => !tagPolicy.isAllowedTag(tag),
        );
        if (rejected.length > 0) {
          return fail(
            'TAG_NOT_ALLOWED',
            `健康标签「${rejected.join('、')}」不在白名单内；v1 只允许「低脂」「易消化」「单一动物蛋白」。`,
          );
        }
        patch.targetHealthTags = uniqueTags;
        changed.push(COPY_FIELD_LABELS.targetHealthTags);
      }

      if (changed.length === 0) {
        return fail(
          'INVALID_ARGUMENT',
          '至少提供一个文案字段：name、coverTitle、sellingPoint、description 或 targetHealthTags。',
        );
      }

      // 卖点 / 描述先用现有合规函数兜底；系列名和封面标题单独扫一遍。
      try {
        assertCopywritingCompliant({
          sellingPoint: patch.sellingPoint ?? '',
          description: patch.description ?? '',
          suggestedTags: [],
          basis: '',
        });
      } catch (error) {
        if (error instanceof BadRequestException) {
          return fail('COPY_FORBIDDEN_CLAIM', error.message);
        }
        throw error;
      }
      const headingHits = scanForbiddenClaims(patch.name, patch.coverTitle);
      if (headingHits.length > 0) {
        return fail(
          'COPY_FORBIDDEN_CLAIM',
          `系列名或封面标题命中禁用表述：${headingHits.join('、')}。请改写后再写。`,
        );
      }

      const written = await callPort(() => port.setCopy(draftId, patch));
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      return okWrite(patch, `已更新${changed.join('、')}；${STALE_NOTE}`);
    },

    async set_production_steps(
      args: SetProductionStepsArgs,
    ): Promise<AgentToolResult<AgentProductionStep[]>> {
      const raw = asRawArgs(args);
      if (!raw) {
        return fail('INVALID_ARGUMENT', '参数必须是对象。');
      }
      const stepsValue = raw.steps;
      if (!Array.isArray(stepsValue)) {
        return fail('INVALID_ARGUMENT', 'steps 必须是数组。');
      }
      if (stepsValue.length < 1 || stepsValue.length > MAX_PRODUCTION_STEPS) {
        return fail(
          'INVALID_ARGUMENT',
          `steps 需要 1–${MAX_PRODUCTION_STEPS} 步。`,
        );
      }

      const steps: AgentProductionStep[] = [];
      for (const [index, stepValue] of stepsValue.entries()) {
        const position = `第 ${index + 1} 步`;
        const stepRaw = asRawArgs(stepValue);
        if (!stepRaw) {
          return fail('INVALID_ARGUMENT', `${position}必须是对象。`);
        }

        const sortOrder = stepRaw.sortOrder;
        if (
          typeof sortOrder !== 'number' ||
          !Number.isInteger(sortOrder) ||
          sortOrder !== index + 1
        ) {
          return fail(
            'INVALID_ARGUMENT',
            `${position}的 sortOrder 必须是 ${index + 1}（从 1 连续递增）。`,
          );
        }

        if (
          typeof stepRaw.instruction !== 'string' ||
          !stepRaw.instruction.trim()
        ) {
          return fail(
            'INVALID_ARGUMENT',
            `${position}的 instruction 不能为空。`,
          );
        }

        const step: AgentProductionStep = {
          sortOrder,
          instruction: stepRaw.instruction,
        };
        for (const key of ['duration', 'temperature', 'equipment'] as const) {
          const value = stepRaw[key];
          if (value === undefined) continue;
          if (value !== null && typeof value !== 'string') {
            return fail(
              'INVALID_ARGUMENT',
              `${position}的 ${key} 必须是字符串或 null。`,
            );
          }
          step[key] = value;
        }
        steps.push(step);
      }

      const written = await callPort(() =>
        port.setProductionSteps(draftId, steps),
      );
      if (!written.ok) {
        return fail(written.code ?? 'INVALID_ARGUMENT', written.message);
      }
      return okWrite(steps, `已写入 ${steps.length} 步制作步骤；${STALE_NOTE}`);
    },
  };
}
