import { Injectable, Logger } from '@nestjs/common';
import {
  classifyCookingMethod,
  normalizePreparationState,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import { normalizeUnit } from '../../domain/ingredient-creation/unit-guard';
import {
  NUTRITION_FIELD_CATALOG,
  type NutritionFieldDefinition,
} from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import { IngredientCreationCandidateService } from './ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from './ingredient-creation-check.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import type {
  CheckItem,
  IngredientCardField,
  IngredientCreationDraft,
  IngredientDraft,
  NutritionEvidenceEntry,
  ProfileDraft,
} from './ingredient-creation.types';

/**
 * 一次工具调用的结果。
 *
 * `content` 是**回灌给模型**的 JSON 文本：校验失败也走它，不抛 500 ——
 * 模型要靠错误文本自己改（AI 自纠的前提，见架构文档第七节）。
 */
export interface AgentToolExecution {
  ok: boolean;
  content: string;
  error?: string;
  /** 本次工具耗时；只用于日志与 transcript，不回灌给模型。 */
  durationMs: number;
  /** 给起草循环判断「有没有新进展」用；不回灌给模型。 */
  progress?: AgentToolProgress;
}

/** 终检摘要：停止时用来说明「还剩什么没做」。 */
export interface AgentCheckSummary {
  passed: boolean;
  blocking: number;
  exceptionable: number;
  warnings: number;
}

/**
 * 一次工具调用的进展信号。
 *
 * - `writtenFieldPaths`：本次**新增或改变**了值的字段（重复写同一个值不算）；
 * - `sourceRecordIds`：本次读到的来源记录 id（是否「新」由循环自己比对）；
 * - `check`：只有 runCheck 会填。
 */
export interface AgentToolProgress {
  writtenFieldPaths: string[];
  sourceRecordIds: string[];
  check?: AgentCheckSummary;
}

/** OpenAI 兼容的 function calling 工具定义。 */
export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ExecuteAgentToolInput {
  runId: string;
  draftId: string;
  name: string;
  args: Record<string, unknown>;
}

const SEARCH_CANDIDATE_LIMIT = 8;
/** 单次最多回灌多少条营养值，避免把提示词撑爆。 */
const MAX_NUTRITION_RECORD_VALUES = 80;
/** 批量写入单次上限：60 个目录字段一次能装下，且给模型留余量。 */
export const MAX_BATCH_NUTRITION_FIELDS = 70;
const ARGS_LOG_MAX = 300;
const ERROR_MESSAGE_MAX = 300;

/** 候选摘要只给模型看「能不能用」，不带整份营养档案。 */
const SEARCH_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'searchLocalNutrition',
    description:
      '在本地营养库检索某个原料的候选来源（只读）。返回 found、keywords、候选条数，以及每条候选的来源记录 id、名称、生熟状态、必需营养素覆盖率、缺项与匹配依据（matchedBy / matchedKeyword / score）。注意：ok=true 只表示查询执行成功，found=false 表示没有找到匹配词条；这里只有元数据，拿到 sourceRecordId 后要用 getNutritionRecord 读取具体营养数值。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description:
            '要检索的中文名或英文名，例如「鸡肝」「Chicken liver」。',
        },
        state: {
          type: 'string',
          enum: ['RAW', 'COOKED'],
          description: '找生档案还是熟档案；不传按 RAW。',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
};

const GET_RECORD_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'getNutritionRecord',
    description:
      '读取某条来源记录里真实存在的全部营养素值（只读）。返回按营养字段目录输出的 fieldPath / value / unit、目录里缺的字段与生熟状态；coverage 是目录字段中有值的比例（%）。拿到值之后，应当用 updateNutritionFields 把要写的字段一次性批量写入草稿（fieldPath 与 unit 原样照抄；单次最多 70 条）；只有补写单个字段时才用 updateNutritionField。没有值的字段不要编造、不要推算。',
    parameters: {
      type: 'object',
      properties: {
        sourceRecordId: {
          type: 'string',
          description:
            '来源记录 id（searchLocalNutrition 返回的 sourceRecordId）。',
        },
      },
      required: ['sourceRecordId'],
      additionalProperties: false,
    },
  },
};

const UPDATE_FIELD_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'updateNutritionField',
    description:
      '把一个营养数值写进草稿里某份营养档案的某个字段。字段必须在营养字段目录里、单位必须是目录单位；来源记录必须真实存在。任何校验失败都返回错误文本，按错误改正后可以重试。只写一个字段；一次要写多个字段时优先用 updateNutritionFields（一次最多 70 条），不要逐条调用本工具。',
    parameters: {
      type: 'object',
      properties: {
        profileIndex: {
          type: 'integer',
          minimum: 0,
          description:
            '营养档案下标，从 0 开始。等于当前档案数时，会按 sourceRecordId 自动新建一份档案。',
        },
        fieldPath: {
          type: 'string',
          description: '营养字段路径，例如 macros.crudeProtein。',
        },
        value: {
          type: 'number',
          description: '目录单位下的数值，必须是非负有限数字。',
        },
        unit: {
          type: 'string',
          description:
            '目录单位：g / mg / μg / kcal / IU。必须与字段目录单位一致。',
        },
        sourceRecordId: {
          type: 'string',
          description:
            '来源记录 id（searchLocalNutrition 返回的 sourceRecordId）。有来源时这一行标 DIRECT；没有来源则标 MANUAL。',
        },
      },
      required: ['profileIndex', 'fieldPath', 'value', 'unit'],
      additionalProperties: false,
    },
  },
};

const UPDATE_FIELDS_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'updateNutritionFields',
    description:
      '批量把多个营养数值写进草稿里某份营养档案（一次最多 70 条）。**优先用它**：读完 getNutritionRecord 后，把要写的值一次性全写进草稿，不要逐条调用 updateNutritionField。每条都按 updateNutritionField 的同一套规则校验；部分失败时已成功的字段仍会写入，失败项在 failed 里逐条返回（fieldPath + error），按错误改正失败项即可。',
    parameters: {
      type: 'object',
      properties: {
        profileIndex: {
          type: 'integer',
          minimum: 0,
          description:
            '营养档案下标，从 0 开始，对本批所有条目生效。等于当前档案数时，会按条目里的 sourceRecordId 自动新建一份档案。',
        },
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BATCH_NUTRITION_FIELDS,
          description: `一次最多 ${MAX_BATCH_NUTRITION_FIELDS} 条字段写入。`,
          items: {
            type: 'object',
            properties: {
              fieldPath: {
                type: 'string',
                description: '营养字段路径，例如 macros.crudeProtein。',
              },
              value: {
                type: 'number',
                description: '目录单位下的数值，必须是非负有限数字。',
              },
              unit: {
                type: 'string',
                description:
                  '目录单位：g / mg / μg / kcal / IU。必须与字段目录单位一致。',
              },
              sourceRecordId: {
                type: 'string',
                description:
                  '来源记录 id（searchLocalNutrition 返回的 sourceRecordId）。有来源时这一行标 DIRECT；没有来源则标 MANUAL。',
              },
            },
            required: ['fieldPath', 'value', 'unit'],
            additionalProperties: false,
          },
        },
      },
      required: ['profileIndex', 'entries'],
      additionalProperties: false,
    },
  },
};

/** 原料卡可写字段：与 `IngredientCardField` 一一对应，白名单只在这里声明一次。 */
const INGREDIENT_CARD_FIELDS = [
  'name',
  'nameEn',
  'category',
  'baseUnit',
  'unitDisplayLabel',
  'cfctClass',
  'edibleYieldPercent',
] as const satisfies readonly IngredientCardField[];

const INGREDIENT_CARD_FIELD_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CARD_FIELDS,
);

const INGREDIENT_CATEGORIES = [
  'MEAT_ORGAN',
  'STARCHY_VEGETABLE',
  'OTHER',
] as const;

const INGREDIENT_CATEGORY_SET: ReadonlySet<string> = new Set(
  INGREDIENT_CATEGORIES,
);

const INGREDIENT_BASE_UNITS = ['G', 'ML', 'PCS'] as const;
const INGREDIENT_BASE_UNIT_SET: ReadonlySet<string> = new Set(
  INGREDIENT_BASE_UNITS,
);

/** 基准单位对应的默认展示名：AI 改单位但没给展示名时沿用这套。 */
const DEFAULT_UNIT_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  G: '克',
  ML: '毫升',
  PCS: '个',
};

const INGREDIENT_NAME_MAX = 100;
const INGREDIENT_NAME_EN_MAX = 200;
const INGREDIENT_UNIT_LABEL_MAX = 50;
const INGREDIENT_CFCT_CLASS_MAX = 100;

const UPDATE_INGREDIENT_FIELDS_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'updateIngredientFields',
    description:
      '修改草稿里「原料卡」的字段（名称 / 英文名 / 类别 / 基准单位 / 展示名 / CFCT 分类 / 可食部）。只写草稿，不碰正式原料。类别只接受 MEAT_ORGAN / STARCHY_VEGETABLE / OTHER，基准单位只接受 G / ML / PCS，可食部按 0–100 的百分数传。人工审核时改过的字段不会被覆盖，会在 skipped 里逐条说明；要改的字段都写清，校验失败会返回错误文本，按提示改正后重试。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: `原料中文名（1–${INGREDIENT_NAME_MAX} 字）。`,
        },
        nameEn: {
          type: 'string',
          description: '英文名；传空字符串表示清空。没有把握就留空，不要编造。',
        },
        category: {
          type: 'string',
          enum: INGREDIENT_CATEGORIES,
          description:
            '原料类别，用于判断必需的生熟档案：MEAT_ORGAN=肉/内脏/水产/蛋，STARCHY_VEGETABLE=根茎淀粉类蔬菜，OTHER=其他。',
        },
        baseUnit: {
          type: 'string',
          enum: INGREDIENT_BASE_UNITS,
          description: '基准单位：G=克，ML=毫升，PCS=个/件。',
        },
        unitDisplayLabel: {
          type: 'string',
          description: `单位展示名，例如「克」「毫升」「个」（最多 ${INGREDIENT_UNIT_LABEL_MAX} 字）。`,
        },
        cfctClass: {
          type: 'string',
          description:
            'CFCT 分类，例如「禽肉类及制品」；判不准传空字符串清空，不要硬填。',
        },
        edibleYieldPercent: {
          type: 'number',
          description:
            '可食部百分比，必须大于 0 且不超过 100（例如带骨肉 85 表示 85%）；未知就不要传，留作待补。',
        },
      },
      additionalProperties: false,
    },
  },
};

const RUN_CHECK_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'runCheck',
    description:
      '对当前草稿跑一次服务端终检（只读）。返回拦死 / 可例外 / 提醒三档结果；passed=true 表示没有拦死项。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

/** 来源记录里本工具要用的列；`normalizedNutrition` 用来判生熟、读营养值。 */
interface SourceRecordRow {
  id: string;
  status: string;
  foodName: string;
  foodNameEn: string | null;
  normalizedNutrition: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeState(value: unknown): PreparationState | null {
  return value === 'RAW' || value === 'COOKED' ? value : null;
}

/** 模型有时把数字写成字符串（"20"）；仍然要求是有限数字，不当成 0。 */
function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNonNegativeInteger(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/u.test(value.trim())
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function tokenizeName(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * 从来源记录判断生熟：先看 `meta.sampleState`，再看名称里的「生/熟」整词，
 * 最后看做法（认得出水煮/烤等就说明是熟的）。都认不出返回 null，不猜。
 */
function derivePreparationStateFromSource(
  record: SourceRecordRow,
): PreparationState | null {
  const profile = isRecord(record.normalizedNutrition)
    ? record.normalizedNutrition
    : null;
  const meta = profile && isRecord(profile.meta) ? profile.meta : null;
  const sampleState =
    meta && typeof meta.sampleState === 'string'
      ? normalizePreparationState(meta.sampleState)
      : null;
  if (sampleState) {
    return sampleState;
  }

  for (const name of [record.foodName, record.foodNameEn]) {
    if (!name) continue;
    for (const token of tokenizeName(name)) {
      const state = normalizePreparationState(token);
      if (state) return state;
    }
    if (classifyCookingMethod(name)) return 'COOKED';
  }

  return null;
}

interface NutritionRecordValue {
  fieldPath: string;
  value: number;
  unit: string;
}

/** 按目录读一个字段：只认有限数字（含数字字符串），null / 缺失都算没有值。 */
function readCatalogFieldValue(
  profile: unknown,
  fieldPath: string,
): number | null {
  if (!isRecord(profile)) {
    return null;
  }
  const [tabKey, fieldKey] = fieldPath.split('.');
  const tab = tabKey ? profile[tabKey] : undefined;
  if (!isRecord(tab) || !fieldKey) {
    return null;
  }
  return readFiniteNumber(tab[fieldKey]);
}

/**
 * 把 `normalizedNutrition` 压成「只带真实值」的清单。
 *
 * - 只输出目录字段；记录里没有 / 值为 null 的进 `missing`，**不补 0**；
 * - 目录字段超过 80 个时截断，并返回 truncated / omittedFieldCount
 *   （当前目录 60 个字段，这条是目录增长后的防御）。
 */
function collectNutritionRecordValues(profile: unknown): {
  values: NutritionRecordValue[];
  missing: string[];
  truncated: boolean;
  omittedFieldCount: number;
} {
  const values: NutritionRecordValue[] = [];
  const missing: string[] = [];

  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = readCatalogFieldValue(profile, field.fieldPath);
    if (value === null) {
      missing.push(field.fieldPath);
      continue;
    }
    values.push({
      fieldPath: field.fieldPath,
      value,
      unit: field.unit,
    });
  }

  const omittedFieldCount = Math.max(
    0,
    values.length - MAX_NUTRITION_RECORD_VALUES,
  );

  return {
    values: values.slice(0, MAX_NUTRITION_RECORD_VALUES),
    missing,
    truncated: omittedFieldCount > 0,
    omittedFieldCount,
  };
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function okContent(payload: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, ...payload });
}

function errorContent(error: string): string {
  return JSON.stringify({ ok: false, error });
}

/** 终检三档只摘前 20 条，避免一个坏草稿把工具结果撑爆。 */
function summarizeCheckItems(
  items: readonly CheckItem[],
): Array<{ code: string; message: string; fieldPath?: string }> {
  return items.slice(0, 20).map((item) => ({
    code: item.code,
    message: truncate(item.message, 200),
    ...(item.fieldPath ? { fieldPath: item.fieldPath } : {}),
  }));
}

function readProfiles(draft: {
  payload: { profiles?: unknown };
}): ProfileDraft[] {
  return Array.isArray(draft.payload.profiles) ? draft.payload.profiles : [];
}

/** 只认受控类别词表；脏值当作没填，不硬猜。 */
function readIngredientCategory(value: unknown): IngredientDraft['category'] {
  return typeof value === 'string' && INGREDIENT_CATEGORY_SET.has(value)
    ? (value as IngredientDraft['category'])
    : null;
}

function readIngredientBaseUnit(
  value: unknown,
): IngredientDraft['baseUnit'] | null {
  return typeof value === 'string' && INGREDIENT_BASE_UNIT_SET.has(value)
    ? (value as IngredientDraft['baseUnit'])
    : null;
}

/**
 * 从草稿里读原料卡；还没有卡片时按草稿名 / 起手卡兜底出一张空卡。
 *
 * 兜底顺序有意为之：原料卡上的值优先，其次起手卡（人纠正过的名字与类别
 * 在那边更准），最后才是创建草稿时的原始名称。
 */
function readIngredientEditorCard(
  draft: IngredientCreationDraft,
): IngredientDraft {
  const stored = isRecord(draft.payload.ingredient)
    ? draft.payload.ingredient
    : null;
  const intake = isRecord(draft.payload.intake) ? draft.payload.intake : null;

  const baseUnit = readIngredientBaseUnit(stored?.baseUnit) ?? ('G' as const);
  const category =
    readIngredientCategory(stored?.category) ??
    readIngredientCategory(intake?.category);

  const name =
    normalizeText(stored?.name) ||
    normalizeText(intake?.name) ||
    draft.name.trim();
  const nameEn = normalizeText(stored?.nameEn) || normalizeText(intake?.nameEn);
  const unitDisplayLabel =
    normalizeText(stored?.unitDisplayLabel) ||
    DEFAULT_UNIT_DISPLAY_LABELS[baseUnit] ||
    baseUnit;
  const cfctClass = normalizeText(stored?.cfctClass);
  const edibleYieldRate = readFiniteNumber(stored?.edibleYieldRate);
  const manualFields = Array.isArray(stored?.manualFields)
    ? [
        ...new Set(
          stored.manualFields.filter(
            (field): field is IngredientCardField =>
              typeof field === 'string' && INGREDIENT_CARD_FIELD_SET.has(field),
          ),
        ),
      ]
    : [];

  return {
    name,
    nameEn: nameEn || null,
    type: 'FOOD',
    category,
    baseUnit,
    unitDisplayLabel,
    cfctClass: cfctClass || null,
    edibleYieldRate:
      edibleYieldRate !== null && edibleYieldRate > 0 && edibleYieldRate <= 1
        ? edibleYieldRate
        : null,
    manualFields,
  };
}

type IngredientFieldValue = string | number | null;

type IngredientFieldValidation =
  | { ok: true; value: IngredientFieldValue }
  | { ok: false; error: string };

/**
 * 原料卡单字段校验。
 *
 * 与前端表单同一套口径：类别 / 基准单位是枚举，可食部是 (0, 100] 百分数，
 * 长度上限对齐数据库列（展示名 50、CFCT 50 余量到 100、名称 100）。
 */
function validateIngredientField(
  field: IngredientCardField,
  raw: unknown,
): IngredientFieldValidation {
  switch (field) {
    case 'name': {
      const name = normalizeText(raw);
      if (!name) {
        return { ok: false, error: 'name 不能为空。' };
      }
      if (Array.from(name).length > INGREDIENT_NAME_MAX) {
        return {
          ok: false,
          error: `name 最多 ${INGREDIENT_NAME_MAX} 个字符，收到 ${Array.from(name).length} 个。`,
        };
      }
      return { ok: true, value: name };
    }
    case 'nameEn': {
      if (typeof raw !== 'string') {
        return { ok: false, error: 'nameEn 必须是字符串；没有就传空字符串。' };
      }
      const nameEn = raw.trim();
      if (Array.from(nameEn).length > INGREDIENT_NAME_EN_MAX) {
        return {
          ok: false,
          error: `nameEn 最多 ${INGREDIENT_NAME_EN_MAX} 个字符，收到 ${Array.from(nameEn).length} 个。`,
        };
      }
      return { ok: true, value: nameEn || null };
    }
    case 'category': {
      if (typeof raw !== 'string' || !INGREDIENT_CATEGORY_SET.has(raw.trim())) {
        return {
          ok: false,
          error: `category 只能是 ${INGREDIENT_CATEGORIES.join(' / ')}；收到「${normalizeText(raw) || '（空）'}」。`,
        };
      }
      return { ok: true, value: raw.trim() };
    }
    case 'baseUnit': {
      if (
        typeof raw !== 'string' ||
        !INGREDIENT_BASE_UNIT_SET.has(raw.trim())
      ) {
        return {
          ok: false,
          error: `baseUnit 只能是 ${INGREDIENT_BASE_UNITS.join(' / ')}；收到「${normalizeText(raw) || '（空）'}」。`,
        };
      }
      return { ok: true, value: raw.trim() };
    }
    case 'unitDisplayLabel': {
      const label = normalizeText(raw);
      if (!label) {
        return {
          ok: false,
          error:
            'unitDisplayLabel 不能为空；例如基准单位 G 用「克」、ML 用「毫升」。',
        };
      }
      if (Array.from(label).length > INGREDIENT_UNIT_LABEL_MAX) {
        return {
          ok: false,
          error: `unitDisplayLabel 最多 ${INGREDIENT_UNIT_LABEL_MAX} 个字符，收到 ${Array.from(label).length} 个。`,
        };
      }
      return { ok: true, value: label };
    }
    case 'cfctClass': {
      if (raw !== null && typeof raw !== 'string') {
        return {
          ok: false,
          error: 'cfctClass 必须是字符串；判不准就传空字符串清空。',
        };
      }
      const cfctClass = normalizeText(raw);
      if (Array.from(cfctClass).length > INGREDIENT_CFCT_CLASS_MAX) {
        return {
          ok: false,
          error: `cfctClass 最多 ${INGREDIENT_CFCT_CLASS_MAX} 个字符，收到 ${Array.from(cfctClass).length} 个。`,
        };
      }
      return { ok: true, value: cfctClass || null };
    }
    case 'edibleYieldPercent': {
      const percent = readFiniteNumber(raw);
      if (percent === null) {
        return {
          ok: false,
          error: 'edibleYieldPercent 必须是数字（0–100 的百分数）。',
        };
      }
      if (percent <= 0 || percent > 100) {
        return {
          ok: false,
          error: `edibleYieldPercent 必须在 (0, 100] 之间；收到 ${percent}。`,
        };
      }
      return { ok: true, value: percent };
    }
    default:
      return { ok: false, error: `不支持的原料卡字段「${field}」。` };
  }
}

interface ValidatedFieldArgs {
  field: NutritionFieldDefinition;
  fieldPath: string;
  value: number;
  sourceRecordId: string | null;
}

type FieldValidation =
  | ({ ok: true } & ValidatedFieldArgs)
  | { ok: false; fieldPath: string; error: string };

/**
 * 单条字段的纯校验：字段目录 → 单位 → 数值。
 *
 * 批量工具逐条调用它，错误文本与单条工具完全一致（模型换工具也能照旧自纠）。
 */
function validateFieldArgs(raw: Record<string, unknown>): FieldValidation {
  const fieldPath = normalizeText(raw.fieldPath);
  const field = NUTRITION_FIELD_CATALOG.find(
    (candidate) => candidate.fieldPath === fieldPath,
  );
  if (!field) {
    return {
      ok: false,
      fieldPath,
      error: `字段「${fieldPath || '（空）'}」不在营养字段目录里。fieldPath 必须形如「表名.字段名」，可用路径见系统提示里的字段目录。`,
    };
  }

  const unit = normalizeText(raw.unit);
  const normalizedUnit = normalizeUnit(unit);
  if (!normalizedUnit) {
    return {
      ok: false,
      fieldPath,
      error: `单位「${unit || '（空）'}」不合法。只接受 g / mg / μg / kcal / IU。`,
    };
  }
  const catalogUnit = normalizeUnit(field.unit) ?? field.unit;
  if (normalizedUnit !== catalogUnit) {
    return {
      ok: false,
      fieldPath,
      error: `字段 ${fieldPath} 的目录单位是 ${field.unit}，不接受「${unit}」（本工具不做换算）；请把 unit 改成 ${field.unit}，并把数值换算到 ${field.unit}。`,
    };
  }

  const value = readFiniteNumber(raw.value);
  if (value === null) {
    return { ok: false, fieldPath, error: 'value 必须是有限数字。' };
  }
  if (value < 0) {
    return { ok: false, fieldPath, error: 'value 不能是负数。' };
  }

  return {
    ok: true,
    field,
    fieldPath,
    value,
    sourceRecordId: normalizeText(raw.sourceRecordId) || null,
  };
}

/**
 * AI 起草可调用的**全部**写入口。
 *
 * 边界（架构文档第四节、第七节）：
 * - 只碰草稿：不写正式原料 / 营养档案，不提交、不确认可用；
 * - 每个写工具自己做校验，非法输入当场返回错误文本，由模型自己改；
 * - 每次调用都记一条日志（工具名、参数摘要、耗时、成功/失败）。
 */
@Injectable()
export class IngredientCreationToolsService {
  private readonly logger = new Logger(IngredientCreationToolsService.name);

  constructor(
    private readonly candidateService: IngredientCreationCandidateService,
    private readonly draftService: IngredientCreationDraftService,
    private readonly checkService: IngredientCreationCheckService,
    private readonly prisma: PrismaService,
  ) {}

  getDefinitions(): readonly AgentToolDefinition[] {
    return [
      SEARCH_TOOL,
      GET_RECORD_TOOL,
      UPDATE_FIELD_TOOL,
      UPDATE_FIELDS_TOOL,
      UPDATE_INGREDIENT_FIELDS_TOOL,
      RUN_CHECK_TOOL,
    ];
  }

  availableToolNames(): string[] {
    return this.getDefinitions().map((tool) => tool.function.name);
  }

  async execute(input: ExecuteAgentToolInput): Promise<AgentToolExecution> {
    const startedAt = Date.now();
    let execution: Omit<AgentToolExecution, 'durationMs'>;

    try {
      execution = await this.dispatch(input);
    } catch (error) {
      // 非预期异常也要变成「给模型的错误文本」，不能让一次工具失败把整轮打成 500。
      const message = error instanceof Error ? error.message : String(error);
      execution = {
        ok: false,
        error: truncate(message, ERROR_MESSAGE_MAX),
        content: errorContent(truncate(message, ERROR_MESSAGE_MAX)),
      };
    }

    const durationMs = Date.now() - startedAt;
    const logLine =
      `[agent-tool] tool=${input.name} ok=${execution.ok} durationMs=${durationMs} ` +
      `runId=${input.runId} draft=${input.draftId} args=${truncate(
        JSON.stringify(input.args),
        ARGS_LOG_MAX,
      )}` +
      (execution.error
        ? ` error=${truncate(execution.error, ERROR_MESSAGE_MAX)}`
        : '');

    if (execution.ok) {
      this.logger.log(logLine);
    } else {
      this.logger.warn(logLine);
    }

    return { ...execution, durationMs };
  }

  private async dispatch(
    input: ExecuteAgentToolInput,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    switch (input.name) {
      case 'searchLocalNutrition':
        return this.searchLocalNutrition(input.draftId, input.args);
      case 'getNutritionRecord':
        return this.getNutritionRecord(input.args);
      case 'updateNutritionField':
        return this.updateNutritionField(input.draftId, input.args);
      case 'updateNutritionFields':
        return this.updateNutritionFields(input.draftId, input.args);
      case 'updateIngredientFields':
        return this.updateIngredientFields(input.draftId, input.args);
      case 'runCheck':
        return this.runCheck(input.draftId);
      default:
        return this.error(
          `未知工具「${input.name}」。可用工具只有：${this.availableToolNames().join('、')}。`,
        );
    }
  }

  /** 工具 1：只读检索，复用现有候选服务（生熟过滤、烤煎排除、覆盖率都在那边）。 */
  private async searchLocalNutrition(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('searchLocalNutrition 需要非空的 keyword。');
    }
    if (args.state !== undefined && normalizeState(args.state) === null) {
      return this.error('state 只能是 RAW 或 COOKED；不传按 RAW。');
    }
    const state = normalizeState(args.state) ?? 'RAW';

    // 草稿不存在时先报 404，避免给一个不存在的草稿做检索。
    await this.draftService.get(draftId);

    const result = await this.candidateService.findCandidates({
      name: keyword,
      state,
    });

    const candidates = result.candidates
      .slice(0, SEARCH_CANDIDATE_LIMIT)
      .map((candidate) => ({
        sourceRecordId: candidate.sourceRecordId,
        foodName: candidate.foodName,
        foodNameEn: candidate.foodNameEn,
        preparationState: candidate.preparationState,
        coveragePercent: candidate.coveragePercent,
        missingFields: candidate.missingFields,
        notes: candidate.notes,
        // 匹配依据：让页面与模型都能说清「为什么这条算命中」。
        // 本地候选一定有；线上兜底结果没有名字匹配依据，补成 FUZZY。
        matchedBy: candidate.matchedBy ?? 'FUZZY',
        matchedKeyword: candidate.matchedKeyword ?? keyword,
        matchedSourceName: candidate.matchedSourceName ?? candidate.foodName,
        score: candidate.matchScore,
      }));
    const found = candidates.length > 0;

    return {
      ok: true,
      content: okContent({
        keyword,
        keywords: result.keywords,
        state,
        // ok=true 只代表工具执行成功；found 才代表有没有数据。
        found,
        candidateCount: result.candidates.length,
        returnedCount: candidates.length,
        bestCoveragePercent: result.coverage.bestCoveragePercent,
        candidates,
        ...(found
          ? {}
          : {
              hint: `本地库没有找到匹配词条。已尝试关键词：${result.keywords.join('、')}（状态 ${state}）。可以换中文名/英文名再试；仍然没有就如实告诉用户库里缺数据，不要编造数值，也不要把这次工具调用说成“成功找到”。`,
            }),
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: candidates.map(
          (candidate) => candidate.sourceRecordId,
        ),
      },
    };
  }

  /**
   * 工具 2：读某条来源记录里的全部真实营养值（只读）。
   *
   * 只从 `normalizedNutrition` 搬值，不做换算、不推算、不补 0；
   * id 不存在 / 记录非 ACTIVE 都返回错误文本，不抛 500。
   */
  private async getNutritionRecord(
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const sourceRecordId = normalizeText(args.sourceRecordId);
    if (!sourceRecordId) {
      return this.error(
        'getNutritionRecord 需要非空的 sourceRecordId。请先用 searchLocalNutrition 检索，再把候选的 sourceRecordId 传进来。',
      );
    }

    const record = await this.prisma.nutritionSourceRecord.findUnique({
      where: { id: sourceRecordId },
      select: {
        id: true,
        status: true,
        foodName: true,
        foodNameEn: true,
        normalizedNutrition: true,
      },
    });
    if (!record) {
      return this.error(
        `来源记录 ${sourceRecordId} 不存在。请先用 searchLocalNutrition 检索，并把候选的 sourceRecordId 传进来。`,
      );
    }
    if (record.status !== 'ACTIVE') {
      return this.error(
        `来源记录 ${sourceRecordId} 已停用（${record.status}），不能作为营养来源。`,
      );
    }

    const { values, missing, truncated, omittedFieldCount } =
      collectNutritionRecordValues(record.normalizedNutrition);
    const presentFieldCount = values.length + omittedFieldCount;
    const coverage =
      NUTRITION_FIELD_CATALOG.length === 0
        ? 0
        : Math.round(
            (presentFieldCount / NUTRITION_FIELD_CATALOG.length) * 1000,
          ) / 10;

    return {
      ok: true,
      content: okContent({
        record: {
          id: record.id,
          name: record.foodName,
          state: derivePreparationStateFromSource(record),
          coverage,
          values,
          missing,
          ...(truncated ? { truncated: true, omittedFieldCount } : {}),
        },
        ...(values.length === 0
          ? {
              hint: '这条记录没有目录内可用的营养数值，不要编造；请换一条来源，或如实告诉用户缺数据。',
            }
          : {}),
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: [record.id],
      },
    };
  }

  /**
   * 工具 3：写草稿里的一个营养字段。
   *
   * 校验顺序固定：下标 → 字段目录 → 单位 → 数值 → 来源记录 → 档案。
   * 每一步失败都只返回错误文本，不抛 500 —— 模型可以照着改。
   */
  private async updateNutritionField(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const profileIndex = readNonNegativeInteger(args.profileIndex);
    if (profileIndex === null) {
      return this.error('profileIndex 必须是从 0 开始的整数。');
    }

    const validation = validateFieldArgs(args);
    if (!validation.ok) {
      return this.error(validation.error);
    }

    const draft = await this.draftService.get(draftId);
    const write = await this.applyFieldWrite({
      profiles: readProfiles(draft),
      profileIndex,
      field: validation.field,
      fieldPath: validation.fieldPath,
      value: validation.value,
      sourceRecordId: validation.sourceRecordId,
      sourceCache: new Map(),
    });
    if (!write.ok) {
      return this.error(write.error);
    }

    await this.draftService.patch(draftId, draft.step, {
      profiles: write.profiles,
    });

    const saved = write.profiles[profileIndex];
    return {
      ok: true,
      content: okContent({
        profileIndex,
        preparationState: write.preparationState,
        fieldPath: validation.fieldPath,
        value: validation.value,
        unit: validation.field.unit,
        status: validation.sourceRecordId ? 'DIRECT' : 'MANUAL',
        entryCount: saved.entries.length,
      }),
      progress: {
        writtenFieldPaths: write.changed ? [validation.fieldPath] : [],
        sourceRecordIds: [],
      },
    };
  }

  /**
   * 工具 4：批量写同一份营养档案里的多个字段。
   *
   * 逐条复用 `updateNutritionField` 的校验；单条失败只进 `failed`，不影响其它条目。
   * 全部成功条目在**一次 patch** 里落库（部分成功也保留已写入的），
   * 避免 60 个字段打 60 次补丁。
   */
  private async updateNutritionFields(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const profileIndex = readNonNegativeInteger(args.profileIndex);
    if (profileIndex === null) {
      return this.error('profileIndex 必须是从 0 开始的整数。');
    }
    if (!Array.isArray(args.entries)) {
      return this.error(
        `updateNutritionFields 需要 entries 数组（一次最多 ${MAX_BATCH_NUTRITION_FIELDS} 条）。`,
      );
    }
    if (args.entries.length > MAX_BATCH_NUTRITION_FIELDS) {
      return this.error(
        `updateNutritionFields 一次最多写入 ${MAX_BATCH_NUTRITION_FIELDS} 条，收到 ${args.entries.length} 条；请拆成多批，每批不超过 ${MAX_BATCH_NUTRITION_FIELDS} 条。`,
      );
    }
    if (args.entries.length === 0) {
      return this.error('entries 不能为空：至少提供 1 条营养字段。');
    }

    const draft = await this.draftService.get(draftId);
    let profiles = readProfiles(draft);
    const failed: Array<{ fieldPath: string; error: string }> = [];
    const writtenFieldPaths: string[] = [];
    const sourceCache = new Map<string, SourceRecordRow | null>();
    let applied = 0;

    for (let index = 0; index < args.entries.length; index += 1) {
      const raw = args.entries[index];
      if (!isRecord(raw)) {
        failed.push({
          fieldPath: '',
          error: `entries[${index}] 必须是对象。`,
        });
        continue;
      }

      const validation = validateFieldArgs(raw);
      if (!validation.ok) {
        failed.push({
          fieldPath: validation.fieldPath,
          error: validation.error,
        });
        continue;
      }

      const write = await this.applyFieldWrite({
        profiles,
        profileIndex,
        field: validation.field,
        fieldPath: validation.fieldPath,
        value: validation.value,
        sourceRecordId: validation.sourceRecordId,
        sourceCache,
      });
      if (!write.ok) {
        failed.push({
          fieldPath: validation.fieldPath,
          error: write.error,
        });
        continue;
      }

      profiles = write.profiles;
      applied += 1;
      if (write.changed) {
        writtenFieldPaths.push(validation.fieldPath);
      }
    }

    // 部分成功也要落库：失败项跳过，成功项已在 profiles 里。
    if (applied > 0) {
      await this.draftService.patch(draftId, draft.step, { profiles });
    }

    return {
      ok: true,
      content: okContent({ applied, failed }),
      progress: {
        writtenFieldPaths,
        sourceRecordIds: [],
      },
    };
  }

  /**
   * 工具 5：写草稿里的原料卡（名称 / 英文名 / 类别 / 基准单位 / 展示名 /
   * CFCT 分类 / 可食部）。
   *
   * 三道闸门都在这里：
   * - 字段白名单：未知字段直接拒绝，不让 `brand` 之类混进草稿；
   * - 枚举 / 长度 / 范围：非法值返回错误文本，模型可以照着改；
   * - 人工保护：`ingredient.manualFields` 里的字段一律跳过并说明，
   *   AI 不能把审核人刚改过的判断悄悄改回去。
   */
  private async updateIngredientFields(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const unsupported = Object.keys(args).filter(
      (key) => !INGREDIENT_CARD_FIELD_SET.has(key),
    );
    if (unsupported.length > 0) {
      return this.error(
        `updateIngredientFields 不支持字段「${unsupported.join('、')}」。可写字段只有：${INGREDIENT_CARD_FIELDS.join('、')}。`,
      );
    }

    const provided = INGREDIENT_CARD_FIELDS.filter((field) => field in args);
    if (provided.length === 0) {
      return this.error(
        `updateIngredientFields 至少需要一个字段（${INGREDIENT_CARD_FIELDS.join('、')}）。`,
      );
    }

    const draft = await this.draftService.get(draftId);
    const current = readIngredientEditorCard(draft);
    const next: IngredientDraft = {
      ...current,
      manualFields: [...(current.manualFields ?? [])],
    };
    const previousBaseUnit = current.baseUnit;
    const applied: IngredientCardField[] = [];
    const skipped: Array<{ field: IngredientCardField; reason: string }> = [];
    const changed: IngredientCardField[] = [];

    for (const field of provided) {
      if ((next.manualFields ?? []).includes(field)) {
        skipped.push({
          field,
          reason:
            '该字段在人工审核时改过，AI 不覆盖；如确需修改，请让审核人在页面上改。',
        });
        continue;
      }

      const validation = validateIngredientField(field, args[field]);
      if (!validation.ok) {
        return this.error(validation.error);
      }

      if (field === 'edibleYieldPercent') {
        // 页面与工具都用百分数；库里沿用既有比例（0, 1]。
        const percent = validation.value as number;
        const rate = Math.round(percent * 100) / 10000;
        if (next.edibleYieldRate !== rate) {
          next.edibleYieldRate = rate;
          changed.push(field);
        }
        applied.push(field);
        continue;
      }

      if (field === 'name') {
        const value = validation.value as string;
        if (next.name !== value) {
          next.name = value;
          changed.push(field);
        }
        applied.push(field);
        continue;
      }

      if (field === 'nameEn' || field === 'cfctClass') {
        const value = validation.value as string | null;
        if (next[field] !== value) {
          next[field] = value;
          changed.push(field);
        }
        applied.push(field);
        continue;
      }

      if (field === 'category') {
        const value = validation.value as IngredientDraft['category'];
        if (next.category !== value) {
          next.category = value;
          changed.push(field);
        }
        applied.push(field);
        continue;
      }

      if (field === 'baseUnit') {
        const value = validation.value as IngredientDraft['baseUnit'];
        if (next.baseUnit !== value) {
          next.baseUnit = value;
          changed.push(field);
        }
        applied.push(field);

        // 改基准单位但没给展示名：只把「旧单位的默认展示名」换成新单位的默认值。
        if (
          !provided.includes('unitDisplayLabel') &&
          !(next.manualFields ?? []).includes('unitDisplayLabel') &&
          next.unitDisplayLabel ===
            DEFAULT_UNIT_DISPLAY_LABELS[previousBaseUnit]
        ) {
          const label = DEFAULT_UNIT_DISPLAY_LABELS[value] ?? value;
          if (next.unitDisplayLabel !== label) {
            next.unitDisplayLabel = label;
            changed.push('unitDisplayLabel');
            applied.push('unitDisplayLabel');
          }
        }
        continue;
      }

      const value = validation.value as string;
      if (next.unitDisplayLabel !== value) {
        next.unitDisplayLabel = value;
        changed.push(field);
      }
      applied.push(field);
    }

    if (changed.length > 0) {
      await this.draftService.patch(draftId, draft.step, { ingredient: next });
    }

    return {
      ok: true,
      content: okContent({
        applied,
        skipped,
        changed,
        ingredient: next,
        ...(skipped.length > 0
          ? {
              hint: 'skipped 里的字段是人工审核改过的，AI 不覆盖；不要重复尝试写它们。',
            }
          : {}),
      }),
      progress: {
        writtenFieldPaths: changed.map((field) => `ingredient.${field}`),
        sourceRecordIds: [],
      },
    };
  }

  /**
   * 单条字段写入的公共实现：来源记录校验 + 档案定位 + 生成新 profiles。
   *
   * 不落库，由调用方决定 patch 一次还是多次；失败只返回错误文本。
   */
  private async applyFieldWrite(input: {
    profiles: ProfileDraft[];
    profileIndex: number;
    field: NutritionFieldDefinition;
    fieldPath: string;
    value: number;
    sourceRecordId: string | null;
    sourceCache: Map<string, SourceRecordRow | null>;
  }): Promise<
    | {
        ok: true;
        profiles: ProfileDraft[];
        preparationState: PreparationState;
        changed: boolean;
      }
    | { ok: false; error: string }
  > {
    const { field, fieldPath, value, profileIndex, profiles } = input;

    let sourceRecord: SourceRecordRow | null = null;
    if (input.sourceRecordId) {
      sourceRecord = await this.lookupSourceRecord(
        input.sourceRecordId,
        input.sourceCache,
      );
      if (!sourceRecord) {
        return {
          ok: false,
          error: `来源记录 ${input.sourceRecordId} 不存在。请先用 searchLocalNutrition 检索，并把候选的 sourceRecordId 传进来。`,
        };
      }
      if (sourceRecord.status !== 'ACTIVE') {
        return {
          ok: false,
          error: `来源记录 ${input.sourceRecordId} 已停用（${sourceRecord.status}），不能作为营养来源。`,
        };
      }
    }

    const entry: NutritionEvidenceEntry = {
      fieldPath,
      finalValue: value,
      unit: field.unit,
      // 有来源 → DIRECT；没有来源 → MANUAL（架构文档第四节）。
      status: input.sourceRecordId ? 'DIRECT' : 'MANUAL',
      sourceRecordId: input.sourceRecordId,
      // 工具只收到目录单位下的值，不伪造来源原文值 / 原文单位。
      sourceValue: null,
      sourceUnit: null,
      formula: null,
      // 人没有参与这一步：标记 AI 起草，人工审核时再覆盖。
      confirmedBy: input.sourceRecordId ? null : 'AI_AGENT',
      confirmedAt: new Date().toISOString(),
    };

    if (profileIndex < profiles.length) {
      const current = profiles[profileIndex];
      if (
        !current ||
        !Array.isArray(current.entries) ||
        (current.preparationState !== 'RAW' &&
          current.preparationState !== 'COOKED')
      ) {
        return {
          ok: false,
          error: `第 ${profileIndex} 份营养档案的数据不完整，不能写入。`,
        };
      }

      const existing = current.entries.find(
        (candidate) => candidate.fieldPath === fieldPath,
      );
      // 新增字段或值/单位变了才算进展；重复写同一个值不算。
      const changed =
        !existing ||
        existing.finalValue !== value ||
        existing.unit !== field.unit;

      const nextEntries = existing
        ? current.entries.map((candidate) =>
            candidate.fieldPath === fieldPath ? entry : candidate,
          )
        : [...current.entries, entry];
      const nextProfiles = profiles.map((profile, index) =>
        index === profileIndex ? { ...profile, entries: nextEntries } : profile,
      );

      return {
        ok: true,
        profiles: nextProfiles,
        preparationState: current.preparationState,
        changed,
      };
    }

    if (profileIndex === profiles.length && sourceRecord) {
      // 新草稿没有任何档案：第一次写入时按来源记录自动建一份（状态不猜）。
      const state = derivePreparationStateFromSource(sourceRecord);
      if (!state) {
        return {
          ok: false,
          error: `来源记录 ${sourceRecord.id} 判断不出是生还是熟（meta.sampleState、名称、做法都没有生/熟信息）。请换一条明确生熟的候选。`,
        };
      }

      return {
        ok: true,
        profiles: [
          ...profiles,
          {
            preparationState: state,
            sourceRecordId: sourceRecord.id,
            entries: [entry],
            notes: 'AI 起草',
          },
        ],
        preparationState: state,
        changed: true,
      };
    }

    const range =
      profiles.length === 0
        ? '草稿目前还没有任何营养档案'
        : `草稿目前有 ${profiles.length} 份营养档案（可用下标 0..${profiles.length - 1}）`;
    return {
      ok: false,
      error:
        `profileIndex ${profileIndex} 超出范围：${range}` +
        (input.sourceRecordId
          ? '。'
          : '；要新建一份档案，请把 profileIndex 设为当前档案数并带上 sourceRecordId。'),
    };
  }

  /** 同一批里多个字段共用来源时只查一次库。 */
  private async lookupSourceRecord(
    sourceRecordId: string,
    cache: Map<string, SourceRecordRow | null>,
  ): Promise<SourceRecordRow | null> {
    if (cache.has(sourceRecordId)) {
      return cache.get(sourceRecordId) ?? null;
    }

    const record = await this.prisma.nutritionSourceRecord.findUnique({
      where: { id: sourceRecordId },
      select: {
        id: true,
        status: true,
        foodName: true,
        foodNameEn: true,
        normalizedNutrition: true,
      },
    });
    cache.set(sourceRecordId, record ?? null);
    return record ?? null;
  }

  /** 工具 5：跑现有终检服务，只返回三档摘要；服务报错也变成错误文本。 */
  private async runCheck(
    draftId: string,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    try {
      const result = await this.checkService.runCheck(draftId);
      return {
        ok: true,
        content: okContent({
          passed: result.blocking.length === 0,
          counts: {
            blocking: result.blocking.length,
            exceptionable: result.exceptionable.length,
            warnings: result.warnings.length,
          },
          blocking: summarizeCheckItems(result.blocking),
          exceptionable: summarizeCheckItems(result.exceptionable),
          warnings: summarizeCheckItems(result.warnings),
        }),
        progress: {
          writtenFieldPaths: [],
          sourceRecordIds: [],
          check: {
            passed: result.blocking.length === 0,
            blocking: result.blocking.length,
            exceptionable: result.exceptionable.length,
            warnings: result.warnings.length,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.error(`runCheck 跑不了：${message}`);
    }
  }

  private error(message: string): Omit<AgentToolExecution, 'durationMs'> {
    const error = truncate(message, ERROR_MESSAGE_MAX);
    return { ok: false, error, content: errorContent(error) };
  }
}
