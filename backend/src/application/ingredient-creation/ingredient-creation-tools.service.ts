import { Injectable, Logger } from '@nestjs/common';
import {
  classifyCookingMethod,
  normalizePreparationState,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import {
  resolveDefaultPrimaryState,
  type CoverageCategory,
} from '../../domain/ingredient-creation/state-coverage';
import { normalizeUnit } from '../../domain/ingredient-creation/unit-guard';
import {
  NUTRITION_FIELD_CATALOG,
  type NutritionFieldDefinition,
} from '../../domain/ingredient/nutrition-field-catalog';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  IngredientCandidateReviewService,
  normalizeReviewReason,
  normalizeReviewVerdict,
} from './ingredient-candidate-review.service';
import { CANDIDATE_GROUP_FALLBACK_OPTION } from './ingredient-candidate-groups';
import { IngredientCreationCandidateService } from './ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from './ingredient-creation-check.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import {
  buildClassificationCounts,
  IngredientNameClassifierService,
  type NameClassification,
} from './ingredient-name-classifier.service';
import {
  buildClassificationListing,
  buildClassificationNarrowing,
  cutGroupLabel,
  resolveClassificationGroupScope,
  type ClassificationName,
  type ClassificationNarrowing,
} from './ingredient-name-narrowing';
import type {
  CandidateNarrowingRecord,
  CandidateReviewGate,
  CandidateReviewVerdict,
  CheckItem,
  IngredientCardField,
  IngredientCreationDraft,
  IngredientDraft,
  NutritionEvidenceEntry,
  PendingQuestion,
  PendingQuestionOption,
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
  /**
   * 只有 `askUser` 成功时会填：本轮必须立刻结束，等用户回答。
   * 起草循环据此把 stopReason 置为 `waiting_user`。
   */
  pendingQuestion?: PendingQuestion;
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

/**
 * 单次查库最多回灌多少条候选。
 *
 * 与复核服务的单批上限一致（12）：召回结果**不按类别 / 词位置过滤**，
 * 候选多了只截断，交给 AI 判断、再交给人选。
 */
const SEARCH_CANDIDATE_LIMIT = 12;
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
      '在本地营养库检索某个原料的候选来源（只读）。返回前会先用 AI 读最多 300 条词条名，判断生熟 / 做法 / 部位并落库复用；再用真实统计生成 narrowing（question / options / stats）。每条候选带 AI 分类 classification（state / method / cutLabel / cutGroup / evidence）与 review.verdict（RELEVANT / UNCERTAIN / IRRELEVANT）。候选太多时 nextAction=NARROW_STATE 或 NARROW_GROUP，必须先按 narrowing.question / narrowing.options 调 askUser 收窄，不许直接列词条；状态支持「生 + 熟都要」，选中后把 states=[\"RAW\",\"COOKED\"] 传回来。选组后再次调用本工具并传 group（来自 narrowing.choices 的 key）只取该组，再用 listing.options 列 ≤5 条词条 + 最后一条「都不对，我直接说」。注意：ok=true 只表示查询执行成功，found=false 表示没有找到匹配词条；拿到 sourceRecordId 后要用 getNutritionRecord 读取具体营养数值。',
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
          enum: ['RAW', 'COOKED', 'ALL'],
          description:
            '找生档案还是熟档案；不传按 RAW 查，但结果会标记 stateSpecified=false，收窄问题里必须让用户选生/熟。ALL 等价于 states=[\"RAW\",\"COOKED\"]。',
        },
        states: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: { type: 'string', enum: ['RAW', 'COOKED'] },
          description:
            '多选状态：用户要「生 + 熟都要」时传 [\"RAW\",\"COOKED\"]，后续会建两份档案。传了它就不要再传 state。',
        },
        group: {
          type: 'string',
          description:
            '选定的部位组 key（来自上一次返回的 narrowing.choices / groups）。传了它只回该组候选并生成 listing；第一次检索不要传。',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
};

/**
 * 只摆事实的工具：按关键词列出本地库真实命中的词条名。
 *
 * 刻意不判断、不截断到 50 条、不返回营养值：模糊词（「牛肉」）先看真实命中
 * 有多少条、都叫什么，再交给 `searchLocalNutrition` 做 AI 分类与收窄。
 */
const LIST_NUTRITION_NAMES_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'listNutritionNames',
    description:
      '按关键词列出本地营养库真实命中的词条名（只读，最多 300 条，默认 300）。只返回 id / name / sourceType 与真实命中总数 total，**不判断生熟 / 做法 / 部位，也不返回营养值**。模糊词（如「牛肉」「猪肉」「鱼」）应先调用它看真实命中，再调用 searchLocalNutrition 做 AI 分类与收窄；中文词会自动走词典 / AI 翻译展开成外文词。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description:
            '要列名字的中文名或英文名，例如「牛肉」「Beef」。',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 300,
          description: '最多返回多少条，默认与上限都是 300。',
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

/**
 * askUser 的文案上限。
 *
 * 超长**不再报错**：模型被长度卡住会缩短文案再试一次，白花一轮模型调用
 * （线上就是这么卡住的）。这里直接截断，问题照常问出去。
 *
 * 截断保留前 `上限 - 3` 个字 + `…`（120 字上限 → 前 117 字 + …）；
 * 词条名本身不截断，结构化字段里保留完整名称，展示层再做单行省略。
 */
const ASK_USER_QUESTION_MAX = 200;
const ASK_USER_OPTION_MAX = 120;
/** 省略号占位：与产品口径「120 字保留前 117 字 + …」对齐。 */
const ASK_USER_TRUNCATE_MARGIN = 3;
const ASK_USER_ELLIPSIS = '…';
const ASK_USER_OPTION_MIN = 2;
/**
 * 普通问题最多 5 个选项；收窄后列词条允许 5 条 + 最后一条「都不对，我直接说」，
 * 共 6 个。第 6 个只认兜底文案，不能变成 6 个普通选项。
 */
const ASK_USER_OPTION_MAX_COUNT = 6;
const ASK_USER_PLAIN_OPTION_MAX_COUNT = 5;
/** 单个选项核实的最长等待；5 个并发，整体不会超过这个值太多。 */
const ASK_OPTION_VERIFY_TIMEOUT_MS = 800;
/** 未收录选项在页面上的后缀：让用户点之前就知道会去线上找。 */
const ASK_OPTION_MISSING_SUFFIX = '（库里未收录，选了会去线上找）';

/** 按“字”截断 askUser 文案：连同省略号不超过 `max` 个字。 */
function truncateAskCopy(value: string, max: number): string {
  const chars = Array.from(value);
  if (chars.length <= max) {
    return value;
  }
  return `${chars.slice(0, max - ASK_USER_TRUNCATE_MARGIN).join('')}${ASK_USER_ELLIPSIS}`;
}

const COVERAGE_CATEGORIES: readonly CoverageCategory[] = [
  'MEAT_ORGAN',
  'STARCHY_VEGETABLE',
  'OTHER',
];

function readCoverageCategory(value: unknown): CoverageCategory | null {
  return typeof value === 'string' &&
    (COVERAGE_CATEGORIES as readonly string[]).includes(value)
    ? (value as CoverageCategory)
    : null;
}

/**
 * 核实 askUser 选项时用当前草稿的「目标状态」。
 *
 * 起手卡显式要求的生熟优先级最高；没有时再看原料卡类别（审核页可能刚改过）、
 * 起手卡类别默认值、已有档案（只有一份时），最后按生档案查。
 * 这只是选检索口径，不会把核实结果写回词典或草稿。
 */
function resolveAskTargetState(
  draft: IngredientCreationDraft,
): PreparationState {
  const payload: unknown = draft.payload;

  const intake =
    isRecord(payload) && isRecord(payload.intake) ? payload.intake : null;
  if (intake && Array.isArray(intake.requiredStates)) {
    for (const raw of intake.requiredStates) {
      const state = normalizeState(raw);
      if (state) return state;
    }
  }

  const ingredient =
    isRecord(payload) && isRecord(payload.ingredient)
      ? payload.ingredient
      : null;
  const ingredientCategory = readCoverageCategory(ingredient?.category);
  if (ingredientCategory) {
    return resolveDefaultPrimaryState(ingredientCategory);
  }

  const intakeCategory = readCoverageCategory(intake?.category);
  if (intakeCategory) {
    return resolveDefaultPrimaryState(intakeCategory);
  }

  const profileStates = new Set<PreparationState>();
  const profiles =
    isRecord(payload) && Array.isArray(payload.profiles)
      ? payload.profiles
      : [];
  for (const profile of profiles) {
    if (!isRecord(profile)) continue;
    const state = normalizeState(profile.preparationState);
    if (state) profileStates.add(state);
  }
  if (profileStates.size === 1) {
    return [...profileStates][0];
  }

  return 'RAW';
}

/**
 * 给一次核实套超时。超时 / 异常都返回 null（状态未知），
 * 不能把「查不动」当成「库里没有」。
 */
async function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 起手卡里的英文名：复核消歧用；没填就不传，不拿中文词硬充英文。 */
function readIntakeNameEn(draft: IngredientCreationDraft): string {
  const payload: unknown = draft.payload;
  if (!isRecord(payload) || !isRecord(payload.intake)) {
    return '';
  }
  return normalizeText(payload.intake.nameEn);
}

/**
 * 从选项文案里拆出候选名与 AI 判断。兼容两种格式：
 * - `候选名 —— 相关：理由`（模型自由写 / 旧版）
 * - `词条名 · 来源 USDA_FDC · 覆盖率 80% · 相关：理由`（收窄后的确定性词条）
 */
function parseAskOptionLabel(label: string): {
  candidateLabel: string;
  aiVerdict: CandidateReviewVerdict | null;
  aiReason: string | null;
  /**
   * 是否是收窄后的确定性词条文案（`词条名 · 来源 … · 覆盖率 … · 相关：理由`）。
   * 这种文案的展示要保留来源库 / 覆盖率，不能像旧版自由文案那样只显示候选名。
   */
  entryFormat: boolean;
} {
  const dashMatch = label.match(
    /^(.*?)\s*(?:——|—{1,2}|--)\s*(不相关|存疑|相关)\s*[:：]\s*(.*)$/u,
  );
  const entryMatch = dashMatch
    ? null
    : label.match(
        /^(.*?)\s*·\s*来源\s+.+?\s*·\s*覆盖率\s+\S+\s*·\s*(不相关|存疑|相关)(?:\s*[:：]\s*(.*))?$/u,
      );
  const match = dashMatch ?? entryMatch;
  if (!match) {
    return {
      candidateLabel: label.trim(),
      aiVerdict: null,
      aiReason: null,
      entryFormat: false,
    };
  }

  const candidateLabel = match[1]?.trim() || label.trim();
  const aiVerdict = normalizeReviewVerdict(match[2] ?? '');
  const aiReason = normalizeReviewReason(match[3] ?? '');
  return {
    candidateLabel,
    aiVerdict,
    aiReason: aiVerdict ? aiReason : null,
    entryFormat: entryMatch !== null,
  };
}

/**
 * 写入前的复核闸门。
 *
 * 只在检索确实带回复核结论时生效；复核失败（全存疑 + 空理由）时返回 null，
 * 不让一次模型故障把正常流程卡死。
 */
function reviewGateBlockReason(
  draft: IngredientCreationDraft,
  sourceRecordId: string | null,
): string | null {
  const payload: unknown = draft.payload;
  if (!isRecord(payload) || !isRecord(payload.candidateReviewGate)) {
    return null;
  }

  const gate = payload.candidateReviewGate;
  if (gate.reviewFailed === true) {
    return null;
  }

  const relevantCount =
    typeof gate.relevantCount === 'number' && Number.isFinite(gate.relevantCount)
      ? gate.relevantCount
      : 0;
  const reviewed = Array.isArray(gate.candidates)
    ? gate.candidates.filter(isRecord)
    : [];
  const hit = sourceRecordId
    ? reviewed.find((candidate) => candidate.id === sourceRecordId)
    : null;
  const verdict =
    hit && (hit.verdict === 'RELEVANT' ||
      hit.verdict === 'UNCERTAIN' ||
      hit.verdict === 'IRRELEVANT')
      ? hit.verdict
      : null;

  if (relevantCount === 0) {
    return '本次检索没有 AI 判为相关的候选，不能硬选。请转“去线上找 / 留空”，或先调用 askUser 让用户决定；不要写营养字段。';
  }
  if (relevantCount >= 2) {
    return `本次检索有 ${relevantCount} 条 AI 判为相关的候选，必须先调用 askUser 让用户选择；不要直接写营养字段。`;
  }
  if (verdict === 'IRRELEVANT') {
    const reason =
      hit && typeof hit.reason === 'string' && hit.reason.trim()
        ? `（${hit.reason.trim()}）`
        : '';
    return `来源记录 ${sourceRecordId ?? ''} 被 AI 复核判为「不相关」${reason}，不能直接写入。请改用相关候选，或先调用 askUser 让用户确认。`;
  }
  if (
    relevantCount === 1 &&
    sourceRecordId &&
    verdict !== null &&
    verdict !== 'RELEVANT'
  ) {
    return '本次只有 1 条 AI 判为相关的候选，当前来源被复核为存疑 / 不相关，不能直接写入。请用那条相关候选，或先让用户确认。';
  }

  return null;
}

/** 全部选项都查不到时回给模型的错误文本：要求换更宽的问法，不要原样再问。 */
function buildAskOptionsMissingError(
  options: readonly string[],
  state: PreparationState,
): string {
  const listed = options.slice(0, 3).join('、');
  const more = options.length > 3 ? ' 等' : '';
  const stateLabel = state === 'COOKED' ? '熟' : '生';
  return (
    `askUser 的选项在本地营养库全部未收录（${listed}${more}；按${stateLabel}档案查）。` +
    '可能库里没有这些具体种类，不要原样再问；请改问更宽的问题（例如确认生/熟，或先留空去线上找），' +
    '并告诉用户可能要走线上检索。'
  );
}

/** askUser 选项的类型：分组 / 生熟 / 自由输入兜底 / 候选词条 / 普通问题。 */
type AskOptionKind = 'GROUP' | 'STATE' | 'FREE' | 'ENTRY' | 'PLAIN';

/** 读草稿里最近一次检索的收窄记录；旧草稿 / 脏数据都当没有。 */
function readCandidateNarrowingRecord(
  draft: IngredientCreationDraft,
): CandidateNarrowingRecord | null {
  const record = draft.payload?.candidateNarrowing;
  if (!isRecord(record) || !Array.isArray(record.options)) {
    return null;
  }
  return record as unknown as CandidateNarrowingRecord;
}

/**
 * 识别一个选项是「分组 / 生熟 / 自由输入 / 候选词条 / 普通答案」。
 *
 * 分组与生熟选项不查库：它们本来就是收窄用的，不能被标成「未收录」，
 * 更不能触发「全部选项未收录」的拒绝。
 */
function resolveAskOptionKind(
  label: string,
  aiVerdict: CandidateReviewVerdict | null,
  narrowing: CandidateNarrowingRecord | null,
): AskOptionKind {
  const text = label.trim();
  if (text === CANDIDATE_GROUP_FALLBACK_OPTION) {
    return 'FREE';
  }
  if (narrowing && Array.isArray(narrowing.options)) {
    const index = narrowing.options.indexOf(text);
    const choice =
      index >= 0 && Array.isArray(narrowing.choices)
        ? narrowing.choices[index]
        : null;
    if (choice?.kind === 'GROUP') return 'GROUP';
    if (choice?.kind === 'STATE') return 'STATE';

    // 模型可能漏掉「（N 条）」后缀；仍按分组 / 状态识别。
    const matched = Array.isArray(narrowing.choices)
      ? narrowing.choices.find((entry) =>
          entry.kind === 'GROUP'
            ? text === entry.label || text.startsWith(`${entry.label}（`)
            : text === entry.label,
        )
      : null;
    if (matched?.kind === 'GROUP') return 'GROUP';
    if (matched?.kind === 'STATE') return 'STATE';
  }
  return aiVerdict !== null ? 'ENTRY' : 'PLAIN';
}

/** 收窄没收完就直接列词条时，回给模型的错误文本（含确定性问句）。 */
function buildNarrowingRequiredError(
  narrowing: CandidateNarrowingRecord,
  relevantCount: number,
): string {
  const options =
    narrowing.options.length > 0 ? narrowing.options.join('、') : '（无）';
  if (narrowing.kind === 'STATE') {
    return (
      `本次检索有 ${relevantCount} 条相关候选，但用户还没确定状态（生 / 熟 / 生 + 熟都要）：` +
      '必须先调用 askUser 确认状态，不能直接列词条。' +
      `question=「${narrowing.question}」 options=[${options}]，原样提问；` +
      '用户回答后再检索。'
    );
  }
  return (
    `本次检索有 ${relevantCount} 条相关候选，必须先按部位收窄，不能直接列词条。` +
    `请调用 askUser，question=「${narrowing.question}」 options=[${options}]，原样提问；` +
    '用户选组后再调用 searchLocalNutrition 并传 group。'
  );
}

/**
 * 问人工具：歧义时停下来，不自己挑一条凑合。
 *
 * 调用成功后本轮立即结束（stopReason=waiting_user）；问题写进草稿，
 * 下次带同一个 draftId 的 run 把问题和用户回答一起放进提示词。
 */
const ASK_USER_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'askUser',
    description:
      '向用户提一个必须由人决定的问题，并结束本轮等待回答。以下情况必须先问、不许自己猜：AI 复核判为相关的候选 ≥2 条；部位 / 加工态 / 种类有歧义（例如「牛肉」「猪肉」「土豆」「鱼」「山药」）；多个候选覆盖率接近且生熟状态不同；要新建多份档案但主次不明。候选太多时先问收窄：searchLocalNutrition 返回 narrowing.required=true 时，question / options 必须原样使用 narrowing 的确定性分组（组名 + 条数）或生/熟选项，不许直接列词条；收窄后只列该组 ≤5 条词条，选项文案写「词条名 · 来源库 · 覆盖率 · 相关/存疑/不相关：理由」，最后一条固定加「都不对，我直接说」；该组只剩 1 条时直接用它，不必再问。一次只问一个问题，普通问题给 2–5 个具体可点的选项；如果是在多个候选里选，选项文案必须写成「候选名 —— 相关/存疑/不相关：≤40 字理由」，把 AI 判断展示给用户。用户回答后会继续，不要重复问同一个问题。',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: `要问用户的一句话，最多 ${ASK_USER_QUESTION_MAX} 个字（超长会自动截断，不影响提问）。一次只问一个问题。`,
        },
        options: {
          type: 'array',
          minItems: ASK_USER_OPTION_MIN,
          maxItems: ASK_USER_OPTION_MAX_COUNT,
          items: {
            type: 'string',
            description: `一个具体答案（最多 ${ASK_USER_OPTION_MAX} 个字，超长会自动截断），不要写「其他」这种空选项。普通问题最多 ${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个；收窄后列词条时最多 5 条，最后一条固定写「都不对，我直接说」（共 6 个）。多个候选里选时用「候选名 —— 相关/存疑/不相关：≤40 字理由」。`,
          },
          description: `2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个可直接点选的具体答案；列词条时允许 5 条 + 最后一条「都不对，我直接说」。`,
        },
      },
      required: ['question', 'options'],
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

function uniqueText(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
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
    private readonly candidateReviewService: IngredientCandidateReviewService,
    private readonly nameClassifierService?: IngredientNameClassifierService,
  ) {}

  getDefinitions(): readonly AgentToolDefinition[] {
    return [
      LIST_NUTRITION_NAMES_TOOL,
      SEARCH_TOOL,
      GET_RECORD_TOOL,
      UPDATE_FIELD_TOOL,
      UPDATE_FIELDS_TOOL,
      UPDATE_INGREDIENT_FIELDS_TOOL,
      RUN_CHECK_TOOL,
      ASK_USER_TOOL,
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
      case 'listNutritionNames':
        return this.listNutritionNames(input.args);
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
      case 'askUser':
        return this.askUser(input.draftId, input.args);
      default:
        return this.error(
          `未知工具「${input.name}」。可用工具只有：${this.availableToolNames().join('、')}。`,
        );
    }
  }

  /**
   * 工具 0：只按名字摆事实（不分类、不返回营养值）。
   *
   * 模糊词先看「库里到底有多少条、都叫什么」，再由 searchLocalNutrition
   * 逐条读名字判断生熟 / 做法 / 部位；工具本身不替人做判断。
   */
  private async listNutritionNames(
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('listNutritionNames 需要非空的 keyword。');
    }

    const rawLimit = args.limit;
    const numericLimit =
      typeof rawLimit === 'number'
        ? rawLimit
        : typeof rawLimit === 'string' && rawLimit.trim()
          ? Number(rawLimit)
          : NaN;
    const limit = Number.isFinite(numericLimit)
      ? Math.min(300, Math.max(1, Math.floor(numericLimit)))
      : 300;

    const result = await this.candidateService.listNutritionNames({
      keyword,
      limit,
    });

    return {
      ok: true,
      content: okContent({
        keyword,
        keywords: result.keywords,
        total: result.total,
        returnedCount: result.names.length,
        found: result.names.length > 0,
        names: result.names,
        ...(result.notice ? { notice: result.notice } : {}),
        hint:
          result.names.length === 0
            ? '本地库没有按这个名字命中的词条：可以换中文名 / 英文名再试，或如实告诉用户库里缺数据；不要编造词条。'
            : `共 ${result.total} 条真实命中，先返回 ${result.names.length} 条名字。这只是名字清单，生熟 / 做法 / 部位还没判断；请调用 searchLocalNutrition 用 AI 分类后再按真实统计收窄。`,
      }),
      progress: {
        writtenFieldPaths: [],
        // 名单只是事实清单，不当作「已读来源」，避免起草循环误判有进展。
        sourceRecordIds: [],
      },
    };
  }

  /**
   * 工具 1：只读检索。
   *
   * 判断交给 AI：先用 `listNutritionNames` 拿到最多 300 条真实名字，再让
   * `IngredientNameClassifierService` 逐条判断生熟 / 做法 / 部位并落库，
   * 最后用**真实统计**生成收窄问句。旧的按关键词表分组不再参与。
   */
  private async searchLocalNutrition(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('searchLocalNutrition 需要非空的 keyword。');
    }
    const groupKey = normalizeText(args.group);

    let states: PreparationState[] = [];
    let stateSpecified = false;

    if (args.states !== undefined) {
      if (!Array.isArray(args.states) || args.states.length === 0) {
        return this.error(
          'states 必须是非空数组，值只能是 RAW / COOKED；「生 + 熟都要」传 ["RAW","COOKED"]。',
        );
      }
      for (const value of args.states) {
        const state = normalizeState(value);
        if (!state) {
          return this.error(
            'states 里只能出现 RAW / COOKED；「生 + 熟都要」传 ["RAW","COOKED"]。',
          );
        }
        if (!states.includes(state)) states.push(state);
      }
      stateSpecified = true;
    }

    const stateValue = args.state;
    if (stateValue !== undefined && stateValue !== null && stateValue !== '') {
      if (stateValue === 'ALL') {
        states = ['RAW', 'COOKED'];
        stateSpecified = true;
      } else {
        const state = normalizeState(stateValue);
        if (!state) {
          return this.error(
            'state 只能是 RAW / COOKED / ALL；不传按 RAW 查。',
          );
        }
        if (states.length > 0 && !states.includes(state)) {
          return this.error(
            `state=${state} 与 states=[${states.join(',')}] 冲突；只保留一套状态选择。`,
          );
        }
        if (states.length === 0) states = [state];
        stateSpecified = true;
      }
    }

    if (states.length === 0) states = ['RAW'];
    const primaryState = states[0]!;

    // 选组之前必须先让用户定生/熟：不能让默认 RAW 借「选组」绕过状态收窄。
    if (groupKey && !stateSpecified) {
      return this.error(
        '传 group 之前必须先让用户确认生/熟，并同时传 state（RAW / COOKED）或 states（如 ["RAW","COOKED"]）。不要拿默认 RAW 当成用户的选择。',
      );
    }

    const draft = await this.draftService.get(draftId);

    // 摆事实：真实命中名单（最多 300）+ 当前状态的候选元数据。
    const namesResult =
      typeof this.candidateService.listNutritionNames === 'function'
        ? await this.candidateService.listNutritionNames({
            keyword,
            limit: 300,
          })
        : { total: 0, names: [], keywords: [] };
    const candidateResults = await Promise.all(
      states.map((state) =>
        this.candidateService.findCandidates({ name: keyword, state }),
      ),
    );
    const baseResult = candidateResults[0]!;
    const keywords = uniqueText([
      ...namesResult.keywords,
      ...candidateResults.flatMap((result) => result.keywords),
    ]);
    const notice = namesResult.notice ?? baseResult.notice ?? null;

    const mergedById = new Map<
      string,
      (typeof baseResult)['candidates'][number]
    >();
    for (const result of candidateResults) {
      for (const candidate of result.candidates) {
        if (!mergedById.has(candidate.sourceRecordId)) {
          mergedById.set(candidate.sourceRecordId, candidate);
        }
      }
    }
    const mergedCandidates = [...mergedById.values()].slice(
      0,
      SEARCH_CANDIDATE_LIMIT,
    );

    let names: ClassificationName[] = namesResult.names.map((entry) => ({
      id: entry.id,
      name: entry.name,
      sourceType: entry.sourceType,
    }));
    // 极端情况下名字清单为空、候选却有值（旧检索口径差异）：退回用候选名，
    // 至少不把已经召回的数据丢掉。
    if (names.length === 0) {
      names = mergedCandidates.map((candidate) => ({
        id: candidate.sourceRecordId,
        name: candidate.foodName,
        sourceType: candidate.sourceType,
      }));
    }
    const totalNames = namesResult.total > 0 ? namesResult.total : names.length;

    if (names.length === 0) {
      return {
        ok: true,
        content: okContent({
          keyword,
          keywords,
          state: primaryState,
          states,
          stateSpecified,
          stateSpecifiedDefault: !stateSpecified,
          found: false,
          candidateCount: 0,
          totalCandidates: 0,
          returnedCount: 0,
          bestCoveragePercent: baseResult.coverage.bestCoveragePercent,
          groups: [],
          stats: null,
          candidates: [],
          narrowing: null,
          ...(notice ? { notice } : {}),
          hint: [
            notice ? `${notice}。` : '本地库没有找到匹配词条。',
            `已尝试关键词：${keywords.join('、')}（状态 ${states.join(' + ')}）。`,
            '可以换中文名/英文名再试；仍然没有就如实告诉用户库里缺数据，不要编造数值，也不要把这次工具调用说成“成功找到”。',
          ].join(''),
        }),
        progress: {
          writtenFieldPaths: [],
          sourceRecordIds: [],
        },
      };
    }

    // 判断交给 AI：最多 300 条逐条判断，结果落库复用 / 可人工纠正。
    // 服务没注入（旧测试 / 极端装配错误）时按全部 UNKNOWN 降级，不阻塞检索。
    const classification = this.nameClassifierService
      ? await this.nameClassifierService.classifyNames({
          targetName: keyword,
          items: names.map((entry) => ({ id: entry.id, name: entry.name })),
        })
      : (() => {
          const results: NameClassification[] = names.map((entry) => ({
            id: entry.id,
            state: 'UNKNOWN' as const,
            method: 'NONE' as const,
            cutLabel: null,
            cutGroup: null,
            evidence: null,
            confidence: null,
          }));
          return { results, counts: buildClassificationCounts(results) };
        })();
    const classificationById = new Map(
      classification.results.map((entry) => [entry.id, entry] as const),
    );

    const candidates = mergedCandidates.map((candidate) => ({
      ...candidate,
      score: candidate.matchScore,
      classification:
        classificationById.get(candidate.sourceRecordId) ?? null,
    }));

    const targetNameEn = readIntakeNameEn(draft);
    const reviews =
      candidates.length > 0
        ? await this.candidateReviewService.reviewCandidates({
            target: {
              zh: keyword,
              ...(targetNameEn ? { en: targetNameEn } : {}),
              state: primaryState,
            },
            candidates: candidates.map((candidate) => ({
              id: candidate.sourceRecordId,
              name: candidate.foodName,
              sourceType: candidate.sourceType,
              coverage: candidate.coveragePercent,
            })),
          })
        : [];
    const reviewById = new Map(
      reviews.map((review) => [review.id, review] as const),
    );
    const reviewedCandidates = candidates.map((candidate) => {
      const review = reviewById.get(candidate.sourceRecordId);
      return {
        ...candidate,
        review: {
          verdict: review?.verdict ?? ('UNCERTAIN' as const),
          reason: review?.reason ?? '',
        },
      };
    });

    // 收窄问题完全由 AI 分类的真实统计驱动。
    const built = buildClassificationNarrowing({
      keyword,
      names,
      classifications: classification.results,
      stateSpecified,
      states,
      groupKey,
    });
    const narrowing: ClassificationNarrowing = built.narrowing;
    const selectedStates = built.selectedStates;

    if (
      groupKey &&
      groupKey !== '__other__' &&
      !narrowing.groups.some((group) => group.key === groupKey)
    ) {
      const available = narrowing.groups
        .map((group) => `${group.key}（${group.label}，${group.count} 条）`)
        .join('、');
      return this.error(
        `未知分组「${groupKey}」。可用分组：${available || '（没有分组）'}。请用上一次返回的 groups.key / narrowing.choices.key，不要自己编。`,
      );
    }

    const scopeItems = resolveClassificationGroupScope({
      names,
      classifications: classification.results,
      groups: narrowing.groups,
      groupKey,
      states: selectedStates.length > 0 ? selectedStates : undefined,
    });

    let listing: ReturnType<typeof buildClassificationListing> | null = null;
    if (!narrowing.required) {
      let items: Array<{
        name: ClassificationName;
        classification: NameClassification;
      }> = scopeItems;

      // 全部 UNKNOWN 时 scopeItems 为空：仍然把名字摆出来，让人自己说，
      // 不因为模型没有判断就把整条链路卡死。
      if (items.length === 0 && selectedStates.length === 0) {
        items = names.map((name) => ({
          name,
          classification:
            classificationById.get(name.id) ?? {
              id: name.id,
              state: 'UNKNOWN' as const,
              method: 'NONE' as const,
              cutLabel: null,
              cutGroup: null,
              evidence: null,
              confidence: null,
            },
        }));
      }

      // 熟档案沿用既有策略：烤 / 煎不列进熟候选（用户明确两者都要时保留）。
      if (
        selectedStates.length === 1 &&
        selectedStates[0] === 'COOKED'
      ) {
        items = items.filter(
          (item) =>
            item.classification.method !== 'GRILLED' &&
            item.classification.method !== 'FRIED',
        );
      }

      const rank: Record<string, number> = {
        RELEVANT: 0,
        UNCERTAIN: 1,
        IRRELEVANT: 2,
      };
      const mappedItems = items.map((item) => {
        const reviewed = reviewById.get(item.name.id);
        const verdict = reviewed?.verdict ?? 'UNCERTAIN';
        return {
          ...item,
          coveragePercent:
            mergedById.get(item.name.id)?.coveragePercent ?? null,
          verdict,
          reason: reviewed?.reason ?? '',
        };
      });
      // 复核判出相关项时只列相关项：别把「存疑 / 不相关」混进来凑 5 条。
      const relevantItems = mappedItems.filter(
        (item) => item.verdict === 'RELEVANT',
      );
      const listingItems = (
        relevantItems.length > 0
          ? relevantItems
          : mappedItems.filter((item) => item.verdict !== 'IRRELEVANT')
      ).sort(
        (left, right) =>
          (rank[left.verdict] ?? 1) - (rank[right.verdict] ?? 1) ||
          (right.coveragePercent ?? -1) - (left.coveragePercent ?? -1) ||
          left.name.name.localeCompare(right.name.name),
      );

      const stateLabel = (selectedStates.length > 0
        ? selectedStates
        : []
      )
        .map((state) => (state === 'COOKED' ? '熟' : '生'))
        .join(' + ');
      const title = groupKey
        ? `${cutGroupLabel(groupKey)}这一组`
        : stateLabel
          ? `「${keyword}·${stateLabel}」`
          : `「${keyword}」`;
      listing = buildClassificationListing({ title, items: listingItems });
    }

    // 复核闸门只统计当前选组内的候选；选组后不把别组的相关数带进来。
    const scopeIds = groupKey
      ? new Set(scopeItems.map((item) => item.name.id))
      : null;
    const gateReviewed = scopeIds
      ? reviewedCandidates.filter((candidate) =>
          scopeIds.has(candidate.sourceRecordId),
        )
      : reviewedCandidates;
    const gateRelevantCount = gateReviewed.filter(
      (candidate) => candidate.review.verdict === 'RELEVANT',
    ).length;
    const gateUncertainCount = gateReviewed.filter(
      (candidate) => candidate.review.verdict === 'UNCERTAIN',
    ).length;
    const gateIrrelevantCount = gateReviewed.filter(
      (candidate) => candidate.review.verdict === 'IRRELEVANT',
    ).length;
    const reviewFailed =
      gateReviewed.length > 0 &&
      gateReviewed.every(
        (candidate) =>
          candidate.review.verdict === 'UNCERTAIN' &&
          candidate.review.reason === '',
      );

    let nextAction: string;
    if (narrowing.required) {
      nextAction =
        narrowing.kind === 'STATE' ? 'NARROW_STATE' : 'NARROW_GROUP';
    } else if (listing?.single) {
      nextAction = 'USE_SINGLE_RELEVANT';
    } else if (listing && listing.entries.length > 0) {
      nextAction = 'ASK_USER_ENTRIES';
    } else if (reviewFailed) {
      nextAction = 'REVIEW_UNAVAILABLE';
    } else {
      nextAction = 'ONLINE_OR_LEAVE_BLANK';
    }

    let hint: string;
    if (narrowing.required && narrowing.kind === 'STATE') {
      hint =
        `本次共 ${narrowing.stats.total} 条：` +
        `生 ${narrowing.stats.byState.RAW} 条、熟 ${narrowing.stats.byState.COOKED} 条` +
        `（${narrowing.question}）。` +
        '必须先调用 askUser，用 narrowing.question / narrowing.options 原样问状态；' +
        '用户选「生 + 熟都要」时下一轮传 states=["RAW","COOKED"]，不要直接列词条。';
    } else if (narrowing.required) {
      hint =
        `已选状态（${selectedStates.join(' + ')}），按 AI 判出的部位分 ${narrowing.groups.length} 组：` +
        `${narrowing.options.join('、')}。必须先调用 askUser 用 narrowing.question / narrowing.options 先按部位收窄，` +
        '用户选组后再调用 searchLocalNutrition 并传 group=<narrowing.choices[].key>；不要直接列词条，不要列其它组的词条。';
    } else if (listing?.single) {
      const only = listing.entries[0]!;
      hint =
        `只剩 1 条「${only.foodName}」（AI 分类：${only.classification.state} / ${only.classification.method}` +
        `${only.classification.cutLabel ? ` / ${only.classification.cutLabel}` : ''}，依据「${only.classification.evidence ?? ''}」）：` +
        '直接用它，不必再问；最终回复必须说明选它的理由（“我选了这条，因为…”），并把 AI 判断列在证据里。';
    } else if (listing && listing.entries.length > 0) {
      hint =
        `${listing.question} ` +
        '直接列 listing 里的 ≤5 条词条 + 最后一条「都不对，我直接说」，用 askUser 让用户选；' +
        '不要先问收窄；每条都有 AI 分类（状态 / 做法 / 部位 / 依据词），不要先写原料卡或营养档案。';
    } else if (reviewFailed) {
      hint =
        'AI 复核当前不可用（全部存疑、没有理由）：不要把它当成“都不相关”；可以按名字匹配继续，但拿不准就先 askUser，写入时说明复核未完成。';
    } else {
      hint =
        '没有可列出的词条：不许硬选。请转“去线上找 / 留空”分支，并告诉用户为什么；不要写原料卡或营养档案。';
    }

    const updatedAt = new Date().toISOString();
    const gate: CandidateReviewGate | null =
      gateReviewed.length > 0
        ? {
            reviewedAt: updatedAt,
            reviewFailed,
            relevantCount: gateRelevantCount,
            uncertainCount: gateUncertainCount,
            irrelevantCount: gateIrrelevantCount,
            candidates: gateReviewed.map((candidate) => ({
              id: candidate.sourceRecordId,
              foodName: candidate.foodName,
              verdict: candidate.review.verdict,
              reason: candidate.review.reason,
            })),
          }
        : null;
    const narrowingRecord: CandidateNarrowingRecord = {
      keyword,
      state: primaryState,
      stateSpecified,
      totalCandidates: totalNames,
      relevantCount: gateRelevantCount,
      required: narrowing.required,
      kind: narrowing.kind,
      reason: narrowing.reason,
      question: narrowing.question,
      options: narrowing.options,
      choices: narrowing.choices,
      groups: narrowing.groups,
      selectedGroupKey: built.selectedGroupKey,
      selectedStates,
      stats: narrowing.stats,
      ...(listing
        ? {
            classificationByName: Object.fromEntries(
              listing.entries.map((entry) => [
                entry.foodName,
                entry.classification,
              ]),
            ),
          }
        : {}),
      updatedAt,
    };
    await this.draftService.patch(draftId, draft.step, {
      candidateReviewGate: gate,
      candidateNarrowing: narrowingRecord,
    });

    const selectedStateSet = new Set(selectedStates);
    const scopedCandidateIds = groupKey
      ? new Set(scopeItems.map((item) => item.name.id))
      : null;
    const visibleCandidates = reviewedCandidates.filter((candidate) => {
      const classification = classificationById.get(candidate.sourceRecordId);
      const stateOk =
        selectedStateSet.size === 0 ||
        !classification ||
        classification.state === 'UNKNOWN' ||
        selectedStateSet.has(classification.state);
      const groupOk =
        !scopedCandidateIds || scopedCandidateIds.has(candidate.sourceRecordId);
      return stateOk && groupOk;
    });

    return {
      ok: true,
      content: okContent({
        keyword,
        keywords,
        state: primaryState,
        states: selectedStates.length > 0 ? selectedStates : states,
        stateSpecified,
        found: true,
        candidateCount: totalNames,
        totalCandidates: totalNames,
        returnedCount: visibleCandidates.length,
        bestCoveragePercent: baseResult.coverage.bestCoveragePercent,
        reviewSummary: {
          relevantCount: gateRelevantCount,
          uncertainCount: gateUncertainCount,
          irrelevantCount: gateIrrelevantCount,
          failed: reviewFailed,
        },
        classificationSummary: classification.counts,
        stats: narrowing.stats,
        nextAction,
        hint,
        groups: narrowing.groups,
        narrowing,
        ...(groupKey
          ? {
              group: {
                key: groupKey,
                label: cutGroupLabel(groupKey),
                count: scopeItems.length,
                states: selectedStates,
              },
            }
          : {}),
        ...(listing ? { listing } : {}),
        candidates: visibleCandidates,
        ...(notice ? { notice } : {}),
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: visibleCandidates.map(
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
    const gateError = reviewGateBlockReason(draft, validation.sourceRecordId);
    if (gateError) {
      return this.error(gateError);
    }
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

      const gateError = reviewGateBlockReason(
        draft,
        validation.sourceRecordId,
      );
      if (gateError) {
        failed.push({
          fieldPath: validation.fieldPath,
          error: gateError,
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

  /**
   * 用一个选项名查本地营养库，判断它是不是真能选。
   *
   * 复用候选检索（limit=1），不自己写一套名字匹配；查询失败 / 超时返回
   * `inLibrary: null`（未知），由调用方决定「不阻塞提问」。
   */
  private async checkAskOption(
    option: string,
    states: readonly PreparationState[],
  ): Promise<{ inLibrary: boolean | null; matchedName: string | null }> {
    // 「生 + 熟都要」时两个状态都查：任何一个命中就算库里收录，
    // 不能因为主状态是 RAW 就把熟词条误标成「未收录」。
    let hadUnknown = false;
    for (const state of states) {
      const result = await settleWithin(
        this.candidateService.findCandidates({ name: option, state }, 1),
        ASK_OPTION_VERIFY_TIMEOUT_MS,
      );
      if (result === null) {
        hadUnknown = true;
        continue;
      }
      const hit = result.candidates[0];
      if (hit) {
        return { inLibrary: true, matchedName: hit.foodName };
      }
    }
    return { inLibrary: hadUnknown ? null : false, matchedName: null };
  }

  /** 工具 6：问人。校验通过就把问题写进草稿，交给起草循环收尾。 */
  private async askUser(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const rawQuestion = normalizeText(args.question);
    if (!rawQuestion) {
      return this.error('askUser 需要非空的 question。');
    }
    // 超长截断而不是报错：让模型重写一遍文案只会多花一轮调用。
    const question = truncateAskCopy(rawQuestion, ASK_USER_QUESTION_MAX);

    if (!Array.isArray(args.options)) {
      return this.error('askUser 的 options 必须是 2–5 个字符串组成的数组。');
    }
    if (
      args.options.length < ASK_USER_OPTION_MIN ||
      args.options.length > ASK_USER_OPTION_MAX_COUNT
    ) {
      return this.error(
        `askUser 的 options 必须是 2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个选项（收窄后列词条时最多 5 条 + 最后一条「都不对，我直接说」，共 6 个），收到 ${args.options.length} 个。`,
      );
    }

    const rawOptions: string[] = [];
    for (const [index, raw] of args.options.entries()) {
      const option = normalizeText(raw);
      if (!option) {
        return this.error(
          `askUser 的 options 第 ${index + 1} 项必须是非空字符串。`,
        );
      }
      rawOptions.push(option);
    }
    // 第 6 个只认兜底文案：普通问题仍然最多 5 个选项。
    if (
      rawOptions.length === ASK_USER_OPTION_MAX_COUNT &&
      rawOptions[rawOptions.length - 1] !== CANDIDATE_GROUP_FALLBACK_OPTION
    ) {
      return this.error(
        `askUser 的 options 必须是 2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个选项；只有收窄后列词条时，第 6 个才允许是「${CANDIDATE_GROUP_FALLBACK_OPTION}」。收到 ${rawOptions.length} 个。`,
      );
    }

    // 草稿不存在时先报 404（与其它工具一致），也顺便拿到当前站点与目标状态。
    const draft = await this.draftService.get(draftId);
    const narrowing = readCandidateNarrowingRecord(draft);
    // 收窄记录里的 state 是这次检索实际查的状态：熟组词条不能再按默认 RAW 核实，
    // 否则会被误标成「未收录」。没有收窄记录时才回退到草稿口径。
    const targetState = narrowing?.state ?? resolveAskTargetState(draft);
    const targetStates =
      narrowing && Array.isArray(narrowing.selectedStates) &&
      narrowing.selectedStates.length > 0
        ? narrowing.selectedStates
        : [targetState];
    const classificationByName =
      narrowing && isRecord(narrowing.classificationByName)
        ? narrowing.classificationByName
        : {};

    // 先核实再问：每个选项并发查一次本地库（limit=1），单个最多 800ms。
    // 核实结果只用于本次提问与展示，不写词典、不改草稿里的检索口径。
    //
    // 选项可能带 AI 复核文案（`Yam, raw —— 相关：就是山药`）：查库要用拆出来
    // 的候选名，不能拿整句去匹配；AI 判断随 optionChecks 一起落库，页面不再
    // 从字符串里猜。
    //
    // 先按**完整原文**解析、查库，再截断点选文案：词条名 / AI 判断这些结构化
    // 字段保留全称，只有 `label`（回传给模型的答案）受长度上限约束。
    const parsedOptions = rawOptions.map((label) => {
      const parsed = parseAskOptionLabel(label);
      return {
        fullLabel: label,
        label: truncateAskCopy(label, ASK_USER_OPTION_MAX),
        ...parsed,
        kind: resolveAskOptionKind(label, parsed.aiVerdict, narrowing),
      };
    });
    const options = parsedOptions.map((option) => option.label);

    // 候选很多 / 跨组 / 没定生熟时，第一问必须是收窄：直接拿候选词条问人
    // 会让用户以为「只有这几个」，收窄记录就是这道闸门。
    if (narrowing?.required === true && !narrowing.selectedGroupKey) {
      const entryOption = parsedOptions.find(
        (option) => option.kind === 'ENTRY',
      );
      if (entryOption) {
        return this.error(
          buildNarrowingRequiredError(narrowing, narrowing.relevantCount),
        );
      }
    }

    const optionChecks: PendingQuestionOption[] = await Promise.all(
      parsedOptions.map(async (option) => {
        // 分组 / 生熟 / 自由输入不是库里的具体词条：不查库，也不能被标成
        // 「未收录」，否则一整个收窄问题会被误判成「全是编的」。
        if (
          option.kind === 'GROUP' ||
          option.kind === 'STATE' ||
          option.kind === 'FREE'
        ) {
          return {
            label: option.label,
            kind: option.kind,
            inLibrary: null,
            matchedName: null,
            displayLabel: option.fullLabel,
          };
        }

        const check = await this.checkAskOption(
          option.candidateLabel,
          targetStates,
        );
        const optionClassification = isRecord(
          classificationByName[option.candidateLabel],
        )
          ? (classificationByName[
              option.candidateLabel
            ] as unknown as NameClassification)
          : null;
        // 展示层：收窄后的词条保留来源库 / 覆盖率（去掉重复的 AI 判断后缀，
        // 判断与理由由页面 AI 小标单独展示）；旧版自由文案仍只显示候选名。
        // 省略交给页面单行省略 + title；`label` 仍按上限截断。
        const displayBase = option.entryFormat
          ? option.fullLabel.replace(
              /\s*·\s*(?:不相关|存疑|相关)(?:\s*[:：].*)?$/u,
              '',
            )
          : option.aiVerdict
            ? option.candidateLabel
            : option.fullLabel;
        return {
          label: option.label,
          ...(option.aiVerdict
            ? {
                candidateLabel: option.candidateLabel,
                aiVerdict: option.aiVerdict,
                aiReason: option.aiReason ?? '',
              }
            : {}),
          ...(optionClassification
            ? { classification: optionClassification }
            : {}),
          inLibrary: check.inLibrary,
          matchedName: check.matchedName,
          displayLabel:
            check.inLibrary === false
              ? `${displayBase}${ASK_OPTION_MISSING_SUFFIX}`
              : displayBase,
        };
      }),
    );

    // 一个都没命中：这几个选项大概率是模型编的，原样问出去用户会白跑。
    // 不回滚草稿，只把错误文本回给模型，让它换一个更宽的问题。
    // 有「都不对，我直接说」兜底时不拦：用户还有自由输入这条路。
    const hasFreeOption = optionChecks.some((option) => option.kind === 'FREE');
    if (
      !hasFreeOption &&
      optionChecks.length > 0 &&
      optionChecks.every((option) => option.inLibrary === false)
    ) {
      return this.error(
        buildAskOptionsMissingError(
          parsedOptions
            .filter(
              (option) =>
                option.kind !== 'GROUP' &&
                option.kind !== 'STATE' &&
                option.kind !== 'FREE',
            )
            .map((option) => option.candidateLabel),
          targetState,
        ),
      );
    }

    const pendingQuestion: PendingQuestion = {
      question,
      options,
      optionChecks,
      askedAt: new Date().toISOString(),
    };

    // 有 ≥2 条相关候选时，只有「真的把候选摆给用户选」才清闸门；
    // 先问生熟 / 部位这类普通问题不能替代候选选择，否则闸门会被绕过。
    const gate = isRecord(draft.payload)
      ? draft.payload.candidateReviewGate
      : null;
    const gateRelevantCount =
      isRecord(gate) &&
      typeof gate.relevantCount === 'number' &&
      Number.isFinite(gate.relevantCount)
        ? gate.relevantCount
        : 0;
    const selectingCandidates = parsedOptions.some(
      (option) => option.kind === 'ENTRY',
    );
    const clearReviewGate =
      !isRecord(gate) || gateRelevantCount < 2 || selectingCandidates;

    await this.draftService.patch(draftId, draft.step, {
      pendingQuestion,
      ...(clearReviewGate ? { candidateReviewGate: null } : {}),
    });

    return {
      ok: true,
      content: okContent({
        question: pendingQuestion.question,
        options: pendingQuestion.options,
        optionChecks: pendingQuestion.optionChecks,
        askedAt: pendingQuestion.askedAt,
        awaitingUser: true,
      }),
      pendingQuestion,
    };
  }

  private error(message: string): Omit<AgentToolExecution, 'durationMs'> {
    const error = truncate(message, ERROR_MESSAGE_MAX);
    return { ok: false, error, content: errorContent(error) };
  }
}
