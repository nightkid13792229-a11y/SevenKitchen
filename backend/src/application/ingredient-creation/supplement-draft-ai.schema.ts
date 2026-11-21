/**
 * AI 补剂起草结果：字段白名单、决定项安全默认值、解析与校验。
 *
 * 模型只回一份 JSON；这里做三件事：
 * 1. **只留计划内的字段路径**（`basic.*` / `nutrition.*` / `label.*` …），
 *    未知键直接丢，避免 AI 往草稿里塞计划外内容；
 * 2. **把决定项收成固定形状**：缺的/类型不对的用安全默认值补，
 *    理由（reason）能留就留，方便审核屏展示；
 * 3. **对不上允许值的丢掉**：枚举、词表、等价组 id 都要过一遍白名单。
 *
 * 安全默认值的取舍（spec §6.2 / 计划 Task 7）：
 * - `retail.enabled` 默认 false：没拿到明确“上架”证据，就不当作要上架；
 * - `recommendCreate.value` 默认 true：AI 起草失败/没表态时，草稿也不能被
 *   自动丢掉，最终由人决定；
 * - 所有 reason 默认 `''`，但 AI 给了就原样保留。
 *
 * 草稿的正式形状见 `supplement-draft.types.ts`；解析结果只用来合并进草稿，
 * 不直接写库。
 */

import { parseAnalysisJson } from '../../domain/ingredient/supplement-label-analysis';

/** AI 字段值的来源，用于审核屏标注“这是从哪读到的”。 */
export type SupplementAiFieldSource =
  | 'LABEL'
  | 'FRONT'
  | 'LINK'
  | 'CATALOG'
  | 'RULE'
  | 'INFERENCE';

/** AI 字段值的置信度；`LOW` 一般配 `INFERENCE`。 */
export type SupplementAiFieldConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** 一个字段的 AI 提案：值 + 来源 + 置信度 + 理由。 */
export interface SupplementAiField {
  value: unknown;
  source: SupplementAiFieldSource;
  confidence: SupplementAiFieldConfidence;
  reason: string;
}

export interface SupplementAiRecommendCreateDecision {
  /** 是否建议建档；false 只展示理由，不自动丢弃草稿。 */
  value: boolean;
  reason: string;
}

export interface SupplementAiRetailDecision {
  enabled: boolean;
  reason: string;
}

export interface SupplementAiDiyDecision {
  enabled: boolean;
  linkUrl: string;
  imageUrl: string;
  reason: string;
}

export interface SupplementAiProcurementDecision {
  enabled: boolean;
  reason: string;
}

export interface SupplementAiEquivalenceDecision {
  /** 组 id / `__SKIP__`（暂不归组）/ null（还没选）。 */
  groupId: string | null;
  reason: string;
}

/** 决定项：AI 的结论 + 理由；缺省时用安全默认值。 */
export interface SupplementAiDecisions {
  recommendCreate: SupplementAiRecommendCreateDecision;
  retail: SupplementAiRetailDecision;
  noSaleReason: string | null;
  diy: SupplementAiDiyDecision;
  procurement: SupplementAiProcurementDecision;
  equivalence: SupplementAiEquivalenceDecision;
  labelNames: string[];
  defaultTargetFields: string[];
  tagNames: string[];
  addTiming: string | null;
}

/** AI 自己承认没读到/读不准的项；`suggestion` 是补录建议。 */
export interface SupplementAiMissingItem {
  fieldPath: string;
  reason: string;
  suggestion?: string;
}

/** AI 起草过程中的提醒项；`code` 是前端确认记录用的稳定键。 */
export interface SupplementAiWarning {
  code: string;
  message: string;
  fieldPath?: string;
}

/** 一次 AI 起草的解析结果（不含运行状态，状态在 snapshot 上加）。 */
export interface SupplementAiDraft {
  fields: Record<string, SupplementAiField>;
  decisions: SupplementAiDecisions;
  missing: SupplementAiMissingItem[];
  warnings: SupplementAiWarning[];
}

/** 落 `aiSnapshot` 的形状：解析结果 + 本次调用是否完整。 */
export type SupplementAiSnapshot = SupplementAiDraft & {
  status: 'OK' | 'PARTIAL';
};

/** 解析上下文：所有允许值都由调用方（审核服务/目录）给出。 */
export interface SupplementAiParseContext {
  allowedFields: string[];
  allowedTags: string[];
  allowedTimings: string[];
  allowedNoSaleReasons: string[];
  allowedPlatforms: string[];
  groupIds: string[];
}

/** 「暂不归组」的显式表态值，与草稿校验/前端一致。 */
export const SUPPLEMENT_AI_GROUP_SKIPPED = '__SKIP__';

/** DIY 购买平台允许值；与 `supplement-draft-validation.ts` 的 `DIY_PLATFORMS` 一致。 */
export const SUPPLEMENT_AI_DIY_PLATFORMS: readonly string[] = [
  'TAOBAO',
  'JD',
  'PINDUODUO',
  'IHERB',
  'OTHER',
];

/**
 * AI 可以填的字段路径（parser 白名单，prompt 也直接复用这份清单）。
 *
 * `nutrition.servingNutrients.<field>` 是占位：真正的营养素键必须同时
 * 出现在 `allowedFields` 里，否则解析时丢掉。
 */
export const SUPPLEMENT_AI_KNOWN_FIELD_PATHS: readonly string[] = [
  'basic.name',
  'basic.brand',
  'basic.productModel',
  'basic.purchaseChannel',
  'basic.baseUnit',
  'basic.unitDisplayLabel',
  'basic.physicalForm',
  'basic.servingUnitsPerDose',
  'basic.purchaseUnit',
  'basic.purchaseToBaseRatio',
  'basic.currentPricePerPurchaseUnit',
  'basic.productionLossRate',
  'basic.addTiming',
  'nutrition.servingNutrients.<field>',
  'nutrition.defaultTargetFields',
  'nutrition.labelText',
  'label.labelCategory',
  'label.labelNames',
  'label.tagNames',
  'label.labelNameSource',
  'retail.enabled',
  'retail.shelfLifeMonths',
  'retail.openedShelfLifeDays',
  'retail.storageCondition',
  'retail.isOilBased',
  'retail.noSaleReason',
  'diy.enabled',
  'diy.platform',
  'diy.linkUrl',
  'diy.imageUrl',
  'procurement.enabled',
  'equivalence.groupId',
  'equivalence.reapproveGroup',
  'evidence.frontImageUrl',
  'evidence.labelImageUrl',
  'evidence.productUrl',
  'evidence.selectionNote',
];

const KNOWN_FIELD_PATH_SET = new Set(
  SUPPLEMENT_AI_KNOWN_FIELD_PATHS.filter(
    (path) => path !== 'nutrition.servingNutrients.<field>',
  ),
);

const NUTRIENT_FIELD_PREFIX = 'nutrition.servingNutrients.';

const FIELD_SOURCES: readonly SupplementAiFieldSource[] = [
  'LABEL',
  'FRONT',
  'LINK',
  'CATALOG',
  'RULE',
  'INFERENCE',
];

const FIELD_CONFIDENCES: readonly SupplementAiFieldConfidence[] = [
  'HIGH',
  'MEDIUM',
  'LOW',
];

const BASE_UNITS: readonly string[] = ['PCS', 'G', 'ML'];
const PHYSICAL_FORMS: readonly string[] = [
  'POWDER',
  'TABLET',
  'CAPSULE',
  'LIQUID',
];
const LABEL_CATEGORIES: readonly string[] = ['FEED_MATERIAL', 'FEED_ADDITIVE'];

/** 只接受字符串的草稿路径。 */
const STRING_FIELD_PATHS = new Set<string>([
  'basic.name',
  'basic.brand',
  'basic.productModel',
  'basic.purchaseChannel',
  'basic.unitDisplayLabel',
  'basic.purchaseUnit',
  'nutrition.labelText',
  'label.labelNameSource',
  'retail.storageCondition',
  'diy.linkUrl',
  'diy.imageUrl',
  'evidence.frontImageUrl',
  'evidence.labelImageUrl',
  'evidence.productUrl',
  'evidence.selectionNote',
]);

/** 可以为 null 的数值路径（草稿里 null 表示“没填”）。 */
const NULLABLE_NUMBER_FIELD_PATHS = new Set<string>([
  'basic.servingUnitsPerDose',
  'basic.purchaseToBaseRatio',
  'basic.currentPricePerPurchaseUnit',
  'retail.shelfLifeMonths',
  'retail.openedShelfLifeDays',
]);

/** 必须是数值、不接受 null 的路径。 */
const NUMBER_FIELD_PATHS = new Set<string>(['basic.productionLossRate']);

/** 必须是布尔值的路径。 */
const BOOLEAN_FIELD_PATHS = new Set<string>([
  'retail.enabled',
  'retail.isOilBased',
  'diy.enabled',
  'procurement.enabled',
  'equivalence.reapproveGroup',
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function filterAllowed(value: unknown, allowed: readonly string[]): string[] {
  return asStringArray(value).filter((item) => allowed.includes(item));
}

function isKnownFieldPath(path: string): boolean {
  if (KNOWN_FIELD_PATH_SET.has(path)) return true;
  if (!path.startsWith(NUTRIENT_FIELD_PREFIX)) return false;
  return path.length > NUTRIENT_FIELD_PREFIX.length;
}

function isAllowedNutrientField(
  path: string,
  context: SupplementAiParseContext,
): boolean {
  if (!path.startsWith(NUTRIENT_FIELD_PREFIX)) return false;
  const field = path.slice(NUTRIENT_FIELD_PREFIX.length);
  return context.allowedFields.includes(field);
}

type NormalizedFieldValue = { ok: true; value: unknown } | { ok: false };

function ok(value: unknown): NormalizedFieldValue {
  return { ok: true, value };
}

const INVALID: NormalizedFieldValue = { ok: false };

type NormalizedGroupId = { ok: true; value: string | null } | { ok: false };

function appendWarning(
  warnings: SupplementAiWarning[],
  warning: SupplementAiWarning,
): void {
  const key = `${warning.code}|${warning.fieldPath ?? ''}`;
  if (warnings.some((item) => `${item.code}|${item.fieldPath ?? ''}` === key)) {
    return;
  }
  warnings.push(warning);
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 枚举/白名单字段收到了不在允许值里的内容：丢掉整条，并留一条
 * `AI_FIELD_INVALID` 提醒（只给人看，不参与 finalize 门禁）。
 */
function invalidFieldValue(
  warnings: SupplementAiWarning[],
  fieldPath: string,
  value: unknown,
  allowed: readonly string[],
): NormalizedFieldValue {
  appendWarning(warnings, {
    code: 'AI_FIELD_INVALID',
    message: `模型给 ${fieldPath} 的值「${describeValue(value)}」不在允许值（${allowed.join('、')}）里，已忽略`,
    fieldPath,
  });
  return INVALID;
}

/**
 * 归一化等价组 id：
 * - null / 空串 → null（还没选）；
 * - `__SKIP__` → 保留（显式“暂不归组”）；
 * - 在 `groupIds` 里 → 保留；
 * - 其它字符串 → null + 一条 warning（不让模型编造组 id）。
 */
function normalizeGroupId(
  value: unknown,
  context: SupplementAiParseContext,
  warnings: SupplementAiWarning[],
): NormalizedGroupId {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (
    trimmed === SUPPLEMENT_AI_GROUP_SKIPPED ||
    context.groupIds.includes(trimmed)
  ) {
    return { ok: true, value: trimmed };
  }
  appendWarning(warnings, {
    code: 'EQUIVALENCE_GROUP_UNKNOWN',
    message: `模型给的等价组 ${trimmed} 不在候选里，已改为 null`,
    fieldPath: 'equivalence.groupId',
  });
  return { ok: true, value: null };
}

/**
 * 校验一个字段值。返回 `{ok:false}` 表示这个字段整条丢掉；
 * 等价组 id 不合法时保留字段但值改成 null，并留下 warning。
 */
function normalizeFieldValue(
  path: string,
  value: unknown,
  context: SupplementAiParseContext,
  warnings: SupplementAiWarning[],
): NormalizedFieldValue {
  if (path.startsWith(NUTRIENT_FIELD_PREFIX)) {
    return isFiniteNumber(value) ? ok(value) : INVALID;
  }

  switch (path) {
    case 'basic.baseUnit':
      return typeof value === 'string' && BASE_UNITS.includes(value)
        ? ok(value)
        : invalidFieldValue(warnings, path, value, BASE_UNITS);
    case 'basic.physicalForm':
      return typeof value === 'string' && PHYSICAL_FORMS.includes(value)
        ? ok(value)
        : invalidFieldValue(warnings, path, value, PHYSICAL_FORMS);
    case 'label.labelCategory':
      return typeof value === 'string' && LABEL_CATEGORIES.includes(value)
        ? ok(value)
        : invalidFieldValue(warnings, path, value, LABEL_CATEGORIES);
    case 'basic.addTiming':
      return typeof value === 'string' && context.allowedTimings.includes(value)
        ? ok(value)
        : invalidFieldValue(warnings, path, value, context.allowedTimings);
    case 'retail.noSaleReason':
      if (value === null) return ok(null);
      return typeof value === 'string' &&
        context.allowedNoSaleReasons.includes(value)
        ? ok(value)
        : invalidFieldValue(
            warnings,
            path,
            value,
            context.allowedNoSaleReasons,
          );
    case 'diy.platform':
      return typeof value === 'string' &&
        context.allowedPlatforms.includes(value)
        ? ok(value)
        : invalidFieldValue(warnings, path, value, context.allowedPlatforms);
    case 'nutrition.defaultTargetFields':
      return Array.isArray(value)
        ? ok(filterAllowed(value, context.allowedFields))
        : INVALID;
    case 'label.labelNames':
      return Array.isArray(value) ? ok(asStringArray(value)) : INVALID;
    case 'label.tagNames':
      return Array.isArray(value)
        ? ok(filterAllowed(value, context.allowedTags))
        : INVALID;
    case 'equivalence.groupId': {
      const group = normalizeGroupId(value, context, warnings);
      return group.ok ? ok(group.value) : INVALID;
    }
    default:
      break;
  }

  if (STRING_FIELD_PATHS.has(path)) {
    return typeof value === 'string' ? ok(value) : INVALID;
  }
  if (NULLABLE_NUMBER_FIELD_PATHS.has(path)) {
    return value === null || isFiniteNumber(value) ? ok(value) : INVALID;
  }
  if (NUMBER_FIELD_PATHS.has(path)) {
    return isFiniteNumber(value) ? ok(value) : INVALID;
  }
  if (BOOLEAN_FIELD_PATHS.has(path)) {
    return typeof value === 'boolean' ? ok(value) : INVALID;
  }
  return INVALID;
}

function normalizeFields(
  raw: unknown,
  context: SupplementAiParseContext,
  warnings: SupplementAiWarning[],
): Record<string, SupplementAiField> {
  const result: Record<string, SupplementAiField> = {};
  for (const [path, rawEntry] of Object.entries(asRecord(raw))) {
    if (!isKnownFieldPath(path)) continue;
    if (
      path.startsWith(NUTRIENT_FIELD_PREFIX) &&
      !isAllowedNutrientField(path, context)
    ) {
      continue;
    }
    if (!isRecord(rawEntry)) continue;
    const normalized = normalizeFieldValue(
      path,
      rawEntry.value,
      context,
      warnings,
    );
    if (!normalized.ok) continue;
    result[path] = {
      value: normalized.value,
      source: asEnum(rawEntry.source, FIELD_SOURCES, 'INFERENCE'),
      confidence: asEnum(rawEntry.confidence, FIELD_CONFIDENCES, 'LOW'),
      reason: asString(rawEntry.reason),
    };
  }
  return result;
}

function normalizeNoSaleReason(
  value: unknown,
  context: SupplementAiParseContext,
): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' &&
    context.allowedNoSaleReasons.includes(value)
    ? value
    : null;
}

function normalizeDecisions(
  raw: unknown,
  context: SupplementAiParseContext,
  warnings: SupplementAiWarning[],
): SupplementAiDecisions {
  const source = asRecord(raw);
  const recommendCreate = asRecord(source.recommendCreate);
  const retail = asRecord(source.retail);
  const diy = asRecord(source.diy);
  const procurement = asRecord(source.procurement);
  const equivalence = asRecord(source.equivalence);
  const groupId = normalizeGroupId(equivalence.groupId, context, warnings);

  return {
    recommendCreate: {
      value: asBoolean(recommendCreate.value, true),
      reason: asString(recommendCreate.reason),
    },
    retail: {
      enabled: asBoolean(retail.enabled, false),
      reason: asString(retail.reason),
    },
    noSaleReason: normalizeNoSaleReason(source.noSaleReason, context),
    diy: {
      enabled: asBoolean(diy.enabled, false),
      linkUrl: asString(diy.linkUrl),
      imageUrl: asString(diy.imageUrl),
      reason: asString(diy.reason),
    },
    procurement: {
      enabled: asBoolean(procurement.enabled, false),
      reason: asString(procurement.reason),
    },
    equivalence: {
      groupId: groupId.ok ? groupId.value : null,
      reason: asString(equivalence.reason),
    },
    labelNames: Array.isArray(source.labelNames)
      ? asStringArray(source.labelNames)
      : [],
    defaultTargetFields: Array.isArray(source.defaultTargetFields)
      ? filterAllowed(source.defaultTargetFields, context.allowedFields)
      : [],
    tagNames: Array.isArray(source.tagNames)
      ? filterAllowed(source.tagNames, context.allowedTags)
      : [],
    addTiming:
      typeof source.addTiming === 'string' &&
      context.allowedTimings.includes(source.addTiming)
        ? source.addTiming
        : null,
  };
}

function normalizeMissing(raw: unknown): SupplementAiMissingItem[] {
  if (!Array.isArray(raw)) return [];
  const result: SupplementAiMissingItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const fieldPath =
      typeof item.fieldPath === 'string' ? item.fieldPath.trim() : '';
    if (!fieldPath) continue;
    const missing: SupplementAiMissingItem = {
      fieldPath,
      reason: asString(item.reason),
    };
    if (typeof item.suggestion === 'string' && item.suggestion) {
      missing.suggestion = item.suggestion;
    }
    result.push(missing);
  }
  return result;
}

function normalizeWarnings(raw: unknown): SupplementAiWarning[] {
  if (!Array.isArray(raw)) return [];
  const result: SupplementAiWarning[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const code = typeof item.code === 'string' ? item.code.trim() : '';
    if (!code) continue;
    const warning: SupplementAiWarning = {
      code,
      message: asString(item.message),
    };
    if (typeof item.fieldPath === 'string' && item.fieldPath) {
      warning.fieldPath = item.fieldPath;
    }
    result.push(warning);
  }
  return result;
}

/** 去掉模型偶尔包上的 ```json / ``` 围栏（允许 ` ``` json ` 这种带空格的写法）。 */
function stripCodeFences(text: string): string {
  return String(text ?? '')
    .trim()
    .replace(/^```[ \t]*(?:json)?[ \t]*\r?\n?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/**
 * 找文本里的第一个 JSON 起始符。
 *
 * 模型可能先写一句“Here is the result:”，也可能把结果包在围栏里；
 * 只认第一个 `{` 或 `[`：是 `[` 就说明顶层是数组，一律拒绝。
 */
function firstJsonToken(text: string): '{' | '[' | null {
  const cleaned = stripCodeFences(text);
  const objectIndex = cleaned.indexOf('{');
  const arrayIndex = cleaned.indexOf('[');
  if (objectIndex === -1 && arrayIndex === -1) return null;
  if (arrayIndex === -1) return '{';
  if (objectIndex === -1) return '[';
  return arrayIndex < objectIndex ? '[' : '{';
}

/**
 * 解析模型回包（纯文本 → 归一化的起草结果）。
 *
 * 返回 null 只有一种情况：**没有解析出 JSON 对象**（空文本、坏 JSON、数组）。
 * 只要拿到对象，即使所有字段都不合法，也返回一份带安全默认值的草稿，
 * 让上层能存 `aiSnapshot` 并继续让人补。
 */
export function parseSupplementAiDraft(
  text: string,
  context: SupplementAiParseContext,
): SupplementAiDraft | null {
  if (firstJsonToken(text) !== '{') return null;
  const parsed = parseAnalysisJson(text);
  if (!isRecord(parsed)) return null;

  const warnings = normalizeWarnings(parsed.warnings);
  const fields = normalizeFields(parsed.fields, context, warnings);
  const decisions = normalizeDecisions(parsed.decisions, context, warnings);

  return {
    fields,
    decisions,
    missing: normalizeMissing(parsed.missing),
    warnings,
  };
}
