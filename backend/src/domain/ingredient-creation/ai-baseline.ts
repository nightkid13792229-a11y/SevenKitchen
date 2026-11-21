import type { NutritionEvidenceEntry } from '../../application/ingredient-creation/ingredient-creation.types';

/**
 * AI 写入基线（2026-11-21）。
 *
 * 每次 AI 写原料卡/营养字段时记下「AI 当时写的是什么」，**人改不覆盖**。
 * 提交审计用它回答「AI 原来写的 vs 人最后改成什么」；没有基线时退回旧的
 * 缝合方案比较，不把历史草稿误判成人工新增。
 */
export interface AiFieldBaseline {
  value: unknown;
  unit: string | null;
  at: string;
}

export interface AiBaseline {
  /** 来源记录 id -> 字段路径 -> AI 值（一份档案一个来源）。 */
  profiles: Record<string, Record<string, AiFieldBaseline>>;
  /** 原料卡公共字段 -> AI 值。 */
  ingredient: Record<string, AiFieldBaseline>;
  updatedAt: string;
}

export function emptyAiBaseline(at: string): AiBaseline {
  return { profiles: {}, ingredient: {}, updatedAt: at };
}

function clone(base: AiBaseline | null | undefined, at: string): AiBaseline {
  return base
    ? {
        profiles: { ...base.profiles },
        ingredient: { ...base.ingredient },
        updatedAt: base.updatedAt,
      }
    : emptyAiBaseline(at);
}

export function mergeProfileBaseline(
  base: AiBaseline | null | undefined,
  sourceRecordId: string,
  entries: ReadonlyArray<Pick<NutritionEvidenceEntry, 'fieldPath' | 'finalValue' | 'unit'>>,
  at: string,
): AiBaseline {
  const next = clone(base, at);
  const fields = { ...(next.profiles[sourceRecordId] ?? {}) };
  for (const entry of entries) {
    if (entry.finalValue === null || entry.finalValue === undefined) {
      continue;
    }
    fields[entry.fieldPath] = {
      value: entry.finalValue,
      unit: entry.unit,
      at,
    };
  }
  next.profiles[sourceRecordId] = fields;
  next.updatedAt = at;
  return next;
}

export function mergeIngredientBaseline(
  base: AiBaseline | null | undefined,
  fields: Record<string, unknown>,
  at: string,
): AiBaseline {
  const next = clone(base, at);
  for (const [field, value] of Object.entries(fields)) {
    next.ingredient[field] = { value, unit: null, at };
  }
  next.updatedAt = at;
  return next;
}
