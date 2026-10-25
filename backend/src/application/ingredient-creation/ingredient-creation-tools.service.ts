import { createHash } from 'crypto';
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
import { IngredientCreationCandidateService } from './ingredient-creation-candidate.service';
import { IngredientCreationCheckService } from './ingredient-creation-check.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import { IngredientNameClassifierService } from './ingredient-name-classifier.service';
import {
  buildKeywordNameSummary,
  detectCutGroup,
  type NameSummaryItem,
  type SummarizeNamesResult,
} from './ingredient-name-summary';
import type {
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
  /**
   * 只有 `finish` 成功时会填：模型主动结束本轮。
   * `reply` 是模型随 finish 一起给出的结论（可为 null）。
   */
  finished?: { reply: string | null };
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

/** 名字清单一次最多返回多少条（与候选服务的上限一致）。 */
const SEARCH_NAME_LIST_LIMIT = 3000;
/** 单次最多回灌多少条营养值，避免把提示词撑爆。 */
const MAX_NUTRITION_RECORD_VALUES = 80;
/** 批量写入单次上限：60 个目录字段一次能装下，且给模型留余量。 */
export const MAX_BATCH_NUTRITION_FIELDS = 70;
const FINISH_REPLY_MAX = 500;
const ARGS_LOG_MAX = 300;
const ERROR_MESSAGE_MAX = 300;

/**
 * 汇总缓存 24 小时。
 *
 * 缓存键 = keyword + 名字集合哈希（见 `nameSummaryCacheKey`）；命中时不
 * 重复调模型，但**仍然重新检索名字**（库变了哈希就变，自然 miss）。
 */
const NAME_SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 进程内最多留 200 条汇总，避免长跑进程内存无界增长。 */
const NAME_SUMMARY_CACHE_MAX_ENTRIES = 200;

/**
 * 原子工具 1：按关键词列出本地营养库真实命中的词条名。
 *
 * **只摆事实**：id / name / sourceType + 真实命中总数。不判断生熟、做法、
 * 部位，不返回营养值，也不替模型收窄。发现 3000 条还是 3 条，由模型看
 * `total` 后自己决定下一步（summarizeByKeyword / askUser）。
 */
const SEARCH_NAMES_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'searchNames',
    description:
      '按关键词列出本地营养库真实命中的词条名（只读，最多 3000 条）。只返回 id / name / sourceType 与真实命中总数 total，**不判断生熟 / 做法 / 部位，不返回营养值，也不做收窄**。模糊词（如「牛肉」「山药」）先看 total：命中多就先 summarizeByKeyword(keyword) 看分布（服务端取全量名字、只回汇总），再按 skills/ingredient-agent/SKILL.md 的指引用 askUser 收窄。中文词会自动走词典 / AI 翻译展开成外文词。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '要检索的中文名或英文名，例如「牛肉」「Beef」。',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 3000,
          description: '最多返回多少条，默认与上限都是 3000。',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
};

/**
 * 原子工具 2：按关键词在服务端汇总全量词条名（只读）。
 *
 * 为什么不再让模型传 names：线上「羊肉」那一轮，模型把 1,600 条名字抄进
 * 工具参数，JSON 被截断（「工具参数不是合法 JSON」），重试只抄了几十条，
 * 结果输入 79,893 token、耗时 75 秒，统计只覆盖几十条。
 *
 * 现在：服务端自己检索（上限 3000 条）、自己把名字拼进模型请求；名字只走
 * 模型输入，模型只回汇总数字。缓存 24 小时，命中不重复调模型；模型失败
 * 按名字关键词粗算并标 degraded，不抛错。
 */
const SUMMARIZE_BY_KEYWORD_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'summarizeByKeyword',
    description:
      '按关键词让服务端取全量词条名（最多 3000 条）并做一次 AI 汇总（只读）。你只需要给 keyword，**不要把名字列表抄进参数**：服务端自己检索、自己拼请求，模型只回汇总数字。返回 total / byState（生熟未知）/ byMethod（做法）/ byCutGroup（部位条数）/ examples（每组 2–3 个代表名）/ irrelevantExamples 与 keywords，**不返回名字清单**。模糊词命中多时先用它看分布，再 askUser 收窄。可选 groupHint 只统计某个部位组，避免拿几条名字凑子集。汇总失败时 degraded=true 并带 notice（按名字关键词粗略计数），不要把降级数字当成精确分类。',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '要汇总的关键词（中文或英文），例如「牛肉」「Beef」。',
        },
        groupHint: {
          type: 'string',
          description:
            '可选。只统计某个部位组，用稳定英文 key：ground / tenderloin / loin / round / brisket / shank / chuck / rib / breast / thigh / wing / liver / heart / kidney / other。',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
};

/** 原子工具 3：读某条来源记录里真实存在的营养素值（只读）。 */
const GET_RECORD_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'getRecord',
    description:
      '读取某条来源记录里真实存在的全部营养素值（只读）。返回按营养字段目录输出的 fieldPath / value / unit、目录里缺的字段与生熟状态；coverage 是目录字段中有值的比例（%）。拿到值之后用 writeNutrition 把要写的字段一次性批量写入草稿（fieldPath 与 unit 原样照抄；单次最多 70 条）。没有值的字段不要编造、不要推算。',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '来源记录 id，来自 searchNames 返回的 names[].id。',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
};

/** 原子工具 4：批量写草稿里的营养档案；每条都必须带来源。 */
const WRITE_NUTRITION_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'writeNutrition',
    description:
      '把营养数值写进草稿里某份营养档案（只写草稿）。entries 每条都必须带 sourceRecordId：**没有来源的营养值不能写入**。字段必须在营养字段目录里、单位必须与目录单位一致；非法输入会返回错误文本，按错误改正后重试。一次最多 70 条。profileIndex 可省略：草稿没有档案时按来源自动新建；只有一份档案时默认写这份；有多份档案时必须指定（或用来源 id 能唯一匹配到其中一份）。',
    parameters: {
      type: 'object',
      properties: {
        profileIndex: {
          type: 'integer',
          minimum: 0,
          description:
            '营养档案下标，从 0 开始。省略时按草稿已有档案与来源自动判断；等于当前档案数时按来源新建一份。',
        },
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BATCH_NUTRITION_FIELDS,
          description: `一次最多 ${MAX_BATCH_NUTRITION_FIELDS} 条字段写入；每条都必须带 sourceRecordId。`,
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
                  '来源记录 id（getRecord 的 id / searchNames 的 names[].id）。无来源的数值不允许写入。',
              },
            },
            required: ['fieldPath', 'value', 'unit', 'sourceRecordId'],
            additionalProperties: false,
          },
        },
      },
      required: ['entries'],
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

/** 原子工具 5：写草稿里的原料卡字段。 */
const WRITE_INGREDIENT_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'writeIngredient',
    description:
      '修改草稿里「原料卡」的字段（名称 / 英文名 / 类别 / 基准单位 / 展示名 / CFCT 分类 / 可食部），只写草稿，不碰正式原料。类别只接受 MEAT_ORGAN / STARCHY_VEGETABLE / OTHER，基准单位只接受 G / ML / PCS，可食部按 0–100 的百分数传。人工审核时改过的字段不会被覆盖，会在 skipped 里逐条说明；校验失败返回错误文本，按提示改正后重试。',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: '要写的原料卡字段；至少一个。',
          properties: {
            name: {
              type: 'string',
              description: `原料中文名（1–${INGREDIENT_NAME_MAX} 字）。`,
            },
            nameEn: {
              type: 'string',
              description:
                '英文名；传空字符串表示清空。没有把握就留空，不要编造。',
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
      required: ['fields'],
      additionalProperties: false,
    },
  },
};

/** 原子工具 6：跑现有终检，只读。 */
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
/** 普通问题最多 5 个选项；列词条时允许 5 条 + 最后一条自由输入。 */
const ASK_USER_OPTION_MAX_COUNT = 6;
const ASK_USER_PLAIN_OPTION_MAX_COUNT = 5;
/** 「都不对，我直接说」：列候选时最后一条固定兜底。 */
const CANDIDATE_GROUP_FALLBACK_OPTION = '都不对，我直接说';
/** 单个选项核实的最长等待；多个选项并发，整体不会超过这个值太多。 */
const ASK_OPTION_VERIFY_TIMEOUT_MS = 800;
/** 未收录选项在页面上的后缀：让用户点之前就知道会去线上找。 */
const ASK_OPTION_MISSING_SUFFIX = '（库里未收录，选了会去线上找）';

/**
 * 原子工具 7：问人。
 *
 * **没有流程闸门**：收窄 / 复核 / 候选选择顺序全部交给提示词 + skills。
 * 工具只校验问题与选项的格式（非空、2–6 个、超长截断），然后结束本轮。
 */
const ASK_USER_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'askUser',
    description:
      '向用户提一个必须由人决定的问题，并结束本轮等待回答。一次只问一个问题，给 2–5 个具体可点的选项；列候选词条时最多 5 条 + 最后一条「都不对，我直接说」（共 6 个）。工具**不检查你是否先收窄**：什么时候该先问状态、部位，由 skills/ingredient-agent/SKILL.md 的作业指引决定。拿不准就问，不要自己猜。',
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
            description: `一个具体答案（最多 ${ASK_USER_OPTION_MAX} 个字，超长会自动截断），不要写「其他」这种空选项。普通问题最多 ${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个；列候选时最多 5 条，最后一条固定写「${CANDIDATE_GROUP_FALLBACK_OPTION}」（共 6 个）。`,
          },
          description: `2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个可直接点选的具体答案；列候选时允许 5 条 + 最后一条「${CANDIDATE_GROUP_FALLBACK_OPTION}」。`,
        },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
  },
};

/**
 * 原子工具 8：结束本轮。
 *
 * 模型可以随时调用；循环看到 `finished` 就停止，不再请求下一次模型。
 * 最终结论可以写在 `summary`，也可以写在同一条 assistant 回复里。
 */
const FINISH_TOOL: AgentToolDefinition = {
  type: 'function',
  function: {
    name: 'finish',
    description:
      '结束本轮，不再调用其它工具。把给用户的最终结论写进 summary（一两句中文：做了什么、还缺什么、下一步建议），也可以同时写在回复正文里。不要在还有工具要调用时提前 finish。',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '给用户的最终结论；最多 500 字，超长会截断。',
        },
      },
      additionalProperties: false,
    },
  },
};

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

/**
 * 从选项文案里拆出候选名。兼容 `候选名 —— 相关：理由` 这种旧文案，
 * 查库只拿候选名去匹配；没有这种后缀时整句就是候选名。
 */
function parseAskOptionLabel(label: string): {
  candidateLabel: string;
  displayLabel: string;
} {
  const match = label.match(
    /^(.*?)\s*(?:——|—{1,2}|--)\s*(?:不相关|存疑|相关)\s*[:：]\s*(.*)$/u,
  );
  if (!match) {
    return { candidateLabel: label.trim(), displayLabel: label.trim() };
  }
  return {
    candidateLabel: match[1]?.trim() || label.trim(),
    displayLabel: label.trim(),
  };
}

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
  sourceRecordId: string;
}

type FieldValidation =
  | ({ ok: true } & ValidatedFieldArgs)
  | { ok: false; fieldPath: string; error: string };

/**
 * 单条字段的纯校验：字段目录 → 单位 → 数值 → 来源。
 *
 * 批量工具逐条调用它，错误文本统一，模型照着改就能重试。
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

  const sourceRecordId = normalizeText(raw.sourceRecordId);
  if (!sourceRecordId) {
    return {
      ok: false,
      fieldPath,
      error:
        '缺少 sourceRecordId：没有来源的营养值不能写入草稿。请先用 searchNames 找词条、getRecord 读来源，再把来源 id 一并传入。',
    };
  }

  return {
    ok: true,
    field,
    fieldPath,
    value,
    sourceRecordId,
  };
}

/**
 * AI 起草可调用的**全部原子工具**。
 *
 * 边界（架构文档第四节、第七节）：
 * - 只碰草稿：不写正式原料 / 营养档案，不提交、不确认可用；
 * - 工具内部不做流程判断：先查名字、再汇总、再问人、再写入、再校验，
 *   顺序由提示词 + `skills/ingredient-agent/SKILL.md` 决定；
 * - 四条硬约束写死在实现里：只写草稿、写入必须带来源、字段 / 单位必须
 *   合法（非法就地返回错误文本）、没有提交 / 确认可用的工具；
 * - 每次调用都记一条日志（工具名、参数摘要、耗时、成功/失败）。
 */
@Injectable()
export class IngredientCreationToolsService {
  private readonly logger = new Logger(IngredientCreationToolsService.name);

  /**
   * 汇总缓存（进程内，24 小时）。
   *
   * 键 = keyword + 名字集合哈希；只缓存成功结果，降级结果不缓存
   * （模型恢复后还能重新汇总）。`Map` 的插入顺序就是淘汰顺序。
   */
  private readonly nameSummaryCache = new Map<
    string,
    { expiresAt: number; summary: SummarizeNamesResult }
  >();

  constructor(
    private readonly candidateService: IngredientCreationCandidateService,
    private readonly draftService: IngredientCreationDraftService,
    private readonly checkService: IngredientCreationCheckService,
    private readonly prisma: PrismaService,
    private readonly nameClassifierService?: IngredientNameClassifierService,
  ) {}

  getDefinitions(): readonly AgentToolDefinition[] {
    return [
      SEARCH_NAMES_TOOL,
      SUMMARIZE_BY_KEYWORD_TOOL,
      GET_RECORD_TOOL,
      WRITE_NUTRITION_TOOL,
      WRITE_INGREDIENT_TOOL,
      RUN_CHECK_TOOL,
      ASK_USER_TOOL,
      FINISH_TOOL,
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
      case 'searchNames':
        return this.searchNames(input.args);
      case 'summarizeByKeyword':
        return this.summarizeByKeyword(input.args);
      case 'getRecord':
        return this.getRecord(input.args);
      case 'writeNutrition':
        return this.writeNutrition(input.draftId, input.args);
      case 'writeIngredient':
        return this.writeIngredient(input.draftId, input.args);
      case 'runCheck':
        return this.runCheck(input.draftId);
      case 'askUser':
        return this.askUser(input.draftId, input.args);
      case 'finish':
        return this.finish(input.args);
      default:
        return this.error(
          `未知工具「${input.name}」。可用工具只有：${this.availableToolNames().join('、')}。`,
        );
    }
  }

  /**
   * 工具 1：只按名字摆事实（不分类、不返回营养值、不写入）。
   *
   * 命中多少条、都叫什么由模型自己看；后续是汇总、收窄还是换关键词，
   * 都不在工具里做判断。
   */
  private async searchNames(
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('searchNames 需要非空的 keyword。');
    }

    const rawLimit = args.limit;
    const numericLimit =
      typeof rawLimit === 'number'
        ? rawLimit
        : typeof rawLimit === 'string' && rawLimit.trim()
          ? Number(rawLimit)
          : NaN;
    const limit = Number.isFinite(numericLimit)
      ? Math.min(
          SEARCH_NAME_LIST_LIMIT,
          Math.max(1, Math.floor(numericLimit)),
        )
      : SEARCH_NAME_LIST_LIMIT;

    const result = await this.candidateService.listNutritionNames({
      keyword,
      limit,
    });
    const names = result.names.map((entry) => ({
      id: entry.id,
      name: entry.name,
      sourceType: entry.sourceType,
    }));

    return {
      ok: true,
      content: okContent({
        keyword,
        keywords: result.keywords,
        total: result.total,
        returnedCount: names.length,
        found: names.length > 0,
        names,
        ...(result.notice ? { notice: result.notice } : {}),
        hint:
          names.length === 0
            ? '本地库没有按这个名字命中的词条：可以换中文名 / 英文名再试，或如实告诉用户库里缺数据；不要编造词条。'
            : `共 ${result.total} 条真实命中，返回 ${names.length} 条名字。这只是名字清单；命中多时先 summarizeByKeyword(keyword) 看分布（服务端取全量名字、只回汇总），再决定是否 askUser 收窄。`,
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: names.map((entry) => entry.id),
      },
    };
  }

  /**
   * 工具 2：按关键词汇总全量名字（只读）。
   *
   * 服务端自己做三步：
   * 1. 调 `listNutritionNames` 取全量名字（上限 3000）；
   * 2. 把名字拼进**自己发起**的模型请求（名字走输入，不走模型输出）；
   * 3. 缓存汇总（keyword + 名字集合哈希，24 小时），命中不重复调模型。
   *
   * `groupHint` 只统计指定部位组：先按本地部位词表从全量名字里过滤，
   * 再让模型汇总这一组 —— 模型不需要、也不可能拿到「别人的」子集。
   */
  private async summarizeByKeyword(
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const keyword = normalizeText(args.keyword);
    if (!keyword) {
      return this.error('summarizeByKeyword 需要非空的 keyword。');
    }
    const groupHint = normalizeText(args.groupHint).toLowerCase() || null;

    const result = await this.candidateService.listNutritionNames({
      keyword,
      limit: SEARCH_NAME_LIST_LIMIT,
    });
    const allItems: NameSummaryItem[] = result.names.map((entry) => ({
      id: entry.id,
      name: entry.name,
    }));
    const items = groupHint
      ? allItems.filter((item) => detectCutGroup(item.name) === groupHint)
      : allItems;

    const summary =
      groupHint && items.length === 0
        ? {
            ...buildKeywordNameSummary([]),
            degraded: false,
            notice: `关键词「${keyword}」下没有识别到部位组「${groupHint}」的名字；可以不带 groupHint 再汇总一次，或先 searchNames 看全部名字。`,
          }
        : await this.loadOrBuildKeywordSummary(keyword, items);

    return {
      ok: true,
      content: okContent({
        keyword,
        keywords: result.keywords,
        ...(groupHint ? { groupHint } : {}),
        ...summary,
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: [],
      },
    };
  }

  /** 先查缓存（24 小时），miss 才调模型；只缓存成功结果。 */
  private async loadOrBuildKeywordSummary(
    keyword: string,
    items: readonly NameSummaryItem[],
  ): Promise<SummarizeNamesResult> {
    const cacheKey = this.nameSummaryCacheKey(keyword, items);
    const cached = this.readNameSummaryCache(cacheKey);
    if (cached) {
      this.logger.log(
        `[agent-tool] 汇总命中缓存 target=${keyword} count=${items.length}`,
      );
      return cached;
    }

    const summary = await this.summarizeKeywordItems(keyword, items);
    if (!summary.degraded) {
      this.writeNameSummaryCache(cacheKey, summary);
    }
    return summary;
  }

  /**
   * 缓存键 = keyword + 名字集合哈希。
   *
   * 名字排序后仍保留重复项：同名记录条数变了（`total` 变）也要算 miss。
   * 名字集合来自每次实时检索，所以库更新后不会继续用旧分布。
   */
  private nameSummaryCacheKey(
    keyword: string,
    items: readonly NameSummaryItem[],
  ): string {
    const namesHash = createHash('sha256')
      .update(
        items
          .map((item) => item.name)
          .sort()
          .join('\u0000'),
      )
      .digest('hex');
    return `${keyword}\u0000${namesHash}`;
  }

  private readNameSummaryCache(key: string): SummarizeNamesResult | null {
    const entry = this.nameSummaryCache.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.nameSummaryCache.delete(key);
      return null;
    }
    return entry.summary;
  }

  private writeNameSummaryCache(
    key: string,
    summary: SummarizeNamesResult,
  ): void {
    while (this.nameSummaryCache.size >= NAME_SUMMARY_CACHE_MAX_ENTRIES) {
      const oldest = this.nameSummaryCache.keys().next().value;
      if (!oldest) break;
      this.nameSummaryCache.delete(oldest);
    }
    this.nameSummaryCache.set(key, {
      expiresAt: Date.now() + NAME_SUMMARY_CACHE_TTL_MS,
      summary,
    });
  }

  /**
   * 全部名字只发一次汇总请求；装配缺失 / 模型失败时退化为关键词粗略计数。
   */
  private async summarizeKeywordItems(
    targetName: string,
    names: readonly NameSummaryItem[],
  ): Promise<SummarizeNamesResult> {
    if (
      !this.nameClassifierService ||
      typeof this.nameClassifierService.summarizeNames !== 'function'
    ) {
      const keywordSummary = buildKeywordNameSummary(names);
      return {
        ...keywordSummary,
        degraded: true,
        notice:
          'AI 汇总不可用（服务未装配），已按名字关键词粗略计数；生 / 熟 / 部位数字仅供参考，分类不可用。',
      };
    }

    try {
      return await this.nameClassifierService.summarizeNames({
        targetName,
        items: [...names],
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[agent-tool] 关键词汇总失败，按关键词降级 target=${targetName}: ${reason}`,
      );
      const keywordSummary = buildKeywordNameSummary(names);
      return {
        ...keywordSummary,
        degraded: true,
        notice:
          'AI 汇总失败，已按名字关键词粗略计数；生 / 熟 / 部位数字仅供参考，分类不可用。',
      };
    }
  }

  /**
   * 工具 3：读某条来源记录里的全部真实营养值（只读）。
   *
   * 只从 `normalizedNutrition` 搬值，不做换算、不推算、不补 0；
   * id 不存在 / 记录非 ACTIVE 都返回错误文本，不抛 500。
   */
  private async getRecord(
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const sourceRecordId =
      normalizeText(args.id) || normalizeText(args.sourceRecordId);
    if (!sourceRecordId) {
      return this.error(
        'getRecord 需要非空的 id。请先用 searchNames 找到词条，再把 names[].id 传进来。',
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
        `来源记录 ${sourceRecordId} 不存在。请先用 searchNames 找到词条，再把 names[].id 传进来。`,
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
   * 工具 4：批量写草稿里的营养档案。
   *
   * 硬约束：
   * - 每条都必须有 `sourceRecordId`，没有来源直接拒绝（不是警告）；
   * - 字段 / 单位 / 数值逐条校验，失败项进 `failed`，成功项照常写入；
   * - 只 patch 草稿，不碰正式表；没有提交 / 确认工具。
   */
  private async writeNutrition(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const rawProfileIndex = args.profileIndex;
    let explicitProfileIndex: number | null = null;
    if (
      rawProfileIndex !== undefined &&
      rawProfileIndex !== null &&
      rawProfileIndex !== ''
    ) {
      explicitProfileIndex = readNonNegativeInteger(rawProfileIndex);
      if (explicitProfileIndex === null) {
        return this.error(
          'profileIndex 必须是从 0 开始的整数；不确定写哪份档案就省略它。',
        );
      }
    }

    if (!Array.isArray(args.entries)) {
      return this.error(
        `writeNutrition 需要 entries 数组（一次最多 ${MAX_BATCH_NUTRITION_FIELDS} 条）。`,
      );
    }
    if (args.entries.length > MAX_BATCH_NUTRITION_FIELDS) {
      return this.error(
        `writeNutrition 一次最多写入 ${MAX_BATCH_NUTRITION_FIELDS} 条，收到 ${args.entries.length} 条；请拆成多批。`,
      );
    }
    if (args.entries.length === 0) {
      return this.error('entries 不能为空：至少提供 1 条营养字段。');
    }

    const draft = await this.draftService.get(draftId);
    let profiles = readProfiles(draft);

    let profileIndex = explicitProfileIndex;
    if (profileIndex === null) {
      const firstRaw = args.entries[0];
      const firstSourceId = isRecord(firstRaw)
        ? normalizeText(firstRaw.sourceRecordId)
        : '';
      profileIndex = this.resolveProfileIndex(profiles, firstSourceId);
      if (profileIndex === null) {
        return this.error(
          `草稿有 ${profiles.length} 份营养档案，无法自动判断写哪一份；请传 profileIndex（0..${profiles.length - 1}），或让 entries 里的 sourceRecordId 与其中一份档案一致。`,
        );
      }
    }

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

    // 一条都没写进去：把逐条错误当成本次工具失败返回，模型必须按错误改；
    // 只要写进去一部分，就按批量工具的语义返回 ok=true + failed 明细。
    if (applied === 0 && failed.length > 0) {
      const error = failed[0]?.error ?? '没有写入任何营养字段。';
      return {
        ok: false,
        error,
        content: JSON.stringify({
          ok: false,
          error,
          profileIndex,
          applied,
          failed,
        }),
        progress: {
          writtenFieldPaths,
          sourceRecordIds: [],
        },
      };
    }

    return {
      ok: true,
      content: okContent({
        profileIndex,
        applied,
        failed,
        ...(writtenFieldPaths.length > 0
          ? { writtenFieldPaths }
          : {}),
        ...(failed.length > 0
          ? {
              hint: 'failed 里的条目没有写入；按每条的 error 改正后，只重试失败项即可。',
            }
          : {}),
      }),
      progress: {
        writtenFieldPaths,
        sourceRecordIds: [],
      },
    };
  }

  /**
   * 省略 profileIndex 时的档案定位：零份 / 一份直接落，几份按来源 id 唯一匹配。
   * 匹配不上就让模型显式传下标，避免把生数据写进熟档案。
   */
  private resolveProfileIndex(
    profiles: readonly ProfileDraft[],
    sourceRecordId: string,
  ): number | null {
    if (profiles.length === 0) {
      return 0;
    }
    if (profiles.length === 1) {
      return 0;
    }
    if (!sourceRecordId) {
      return null;
    }
    const index = profiles.findIndex(
      (profile) => profile.sourceRecordId === sourceRecordId,
    );
    return index >= 0 ? index : null;
  }

  /**
   * 工具 5：写草稿里的原料卡（名称 / 英文名 / 类别 / 基准单位 / 展示名 /
   * CFCT 分类 / 可食部）。
   *
   * 三道校验都在这里：
   * - 字段白名单：未知字段直接拒绝，不让 `brand` 之类混进草稿；
   * - 枚举 / 长度 / 范围：非法值返回错误文本，模型可以照着改；
   * - 人工保护：`ingredient.manualFields` 里的字段一律跳过并说明。
   */
  private async writeIngredient(
    draftId: string,
    args: Record<string, unknown>,
  ): Promise<Omit<AgentToolExecution, 'durationMs'>> {
    const rawFields = args.fields;
    if (!isRecord(rawFields)) {
      return this.error(
        `writeIngredient 需要 fields 对象，至少包含一个字段（${INGREDIENT_CARD_FIELDS.join('、')}）。`,
      );
    }

    const unsupported = Object.keys(rawFields).filter(
      (key) => !INGREDIENT_CARD_FIELD_SET.has(key),
    );
    if (unsupported.length > 0) {
      return this.error(
        `writeIngredient 不支持字段「${unsupported.join('、')}」。可写字段只有：${INGREDIENT_CARD_FIELDS.join('、')}。`,
      );
    }

    const provided = INGREDIENT_CARD_FIELDS.filter((field) => field in rawFields);
    if (provided.length === 0) {
      return this.error(
        `writeIngredient 的 fields 至少需要一个字段（${INGREDIENT_CARD_FIELDS.join('、')}）。`,
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

      const validation = validateIngredientField(field, rawFields[field]);
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
   * 来源是必填的：这里没有「无来源也写」的分支。
   */
  private async applyFieldWrite(input: {
    profiles: ProfileDraft[];
    profileIndex: number;
    field: NutritionFieldDefinition;
    fieldPath: string;
    value: number;
    sourceRecordId: string;
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

    const sourceRecord = await this.lookupSourceRecord(
      input.sourceRecordId,
      input.sourceCache,
    );
    if (!sourceRecord) {
      return {
        ok: false,
        error: `来源记录 ${input.sourceRecordId} 不存在。请先用 searchNames 找到词条、getRecord 读取真实数值，再把来源 id 传进来。`,
      };
    }
    if (sourceRecord.status !== 'ACTIVE') {
      return {
        ok: false,
        error: `来源记录 ${input.sourceRecordId} 已停用（${sourceRecord.status}），不能作为营养来源。`,
      };
    }

    const entry: NutritionEvidenceEntry = {
      fieldPath,
      finalValue: value,
      unit: field.unit,
      status: 'DIRECT',
      sourceRecordId: input.sourceRecordId,
      // 工具只收到目录单位下的值，不伪造来源原文值 / 原文单位。
      sourceValue: null,
      sourceUnit: null,
      formula: null,
      // 人没有参与这一步：标记 AI 起草，人工审核时再覆盖。
      confirmedBy: null,
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

    if (profileIndex === profiles.length) {
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
      error: `profileIndex ${profileIndex} 超出范围：${range}。`,
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

  /** 工具 6：跑现有终检服务，只返回三档摘要；服务报错也变成错误文本。 */
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

  /**
   * 工具 7：问人。
   *
   * 校验通过就把问题写进草稿，交给起草循环收尾。
   * 不再检查「有没有先收窄 / 有没有先列候选」：这是提示词与 skill 的事。
   */
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
        `askUser 的 options 必须是 2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个选项（列候选时最多 5 条 + 最后一条「${CANDIDATE_GROUP_FALLBACK_OPTION}」，共 6 个），收到 ${args.options.length} 个。`,
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
        `askUser 的 options 必须是 2–${ASK_USER_PLAIN_OPTION_MAX_COUNT} 个选项；只有列候选时，第 6 个才允许是「${CANDIDATE_GROUP_FALLBACK_OPTION}」。收到 ${rawOptions.length} 个。`,
      );
    }

    const draft = await this.draftService.get(draftId);
    const targetState = resolveAskTargetState(draft);

    // 选项可能带 AI 判断文案（`Yam, raw —— 相关：就是山药`）：查库要用拆出来
    // 的候选名，不能拿整句去匹配。
    const parsedOptions = rawOptions.map((label) => {
      const parsed = parseAskOptionLabel(label);
      return {
        fullLabel: label,
        label: truncateAskCopy(label, ASK_USER_OPTION_MAX),
        candidateLabel: parsed.candidateLabel,
      };
    });

    const optionChecks: PendingQuestionOption[] = await Promise.all(
      parsedOptions.map(async (option) => {
        // 自由输入兜底不是库里的具体词条：不查库，也不能被标成「未收录」。
        if (option.fullLabel === CANDIDATE_GROUP_FALLBACK_OPTION) {
          return {
            label: option.label,
            kind: 'FREE' as const,
            inLibrary: null,
            matchedName: null,
            displayLabel: option.fullLabel,
          };
        }

        const check = await this.checkAskOption(option.candidateLabel, [
          targetState,
        ]);
        return {
          label: option.label,
          ...(option.candidateLabel !== option.fullLabel
            ? { candidateLabel: option.candidateLabel }
            : {}),
          inLibrary: check.inLibrary,
          matchedName: check.matchedName,
          displayLabel:
            check.inLibrary === false
              ? `${option.fullLabel}${ASK_OPTION_MISSING_SUFFIX}`
              : option.fullLabel,
        };
      }),
    );

    const pendingQuestion: PendingQuestion = {
      question,
      options: parsedOptions.map((option) => option.label),
      optionChecks,
      askedAt: new Date().toISOString(),
    };

    await this.draftService.patch(draftId, draft.step, { pendingQuestion });

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

  /**
   * 工具 8：结束本轮。
   *
   * 不写草稿、不提交；只给循环一个明确的停止信号和可选结论。
   */
  private finish(
    args: Record<string, unknown>,
  ): Omit<AgentToolExecution, 'durationMs'> {
    const rawSummary = normalizeText(args.summary);
    const reply = rawSummary ? truncate(rawSummary, FINISH_REPLY_MAX) : null;

    return {
      ok: true,
      content: okContent({
        finished: true,
        ...(reply ? { reply } : {}),
        hint: '本轮已结束；不要在同一轮里继续调用其它工具。',
      }),
      progress: {
        writtenFieldPaths: [],
        sourceRecordIds: [],
      },
      finished: { reply },
    };
  }

  private error(message: string): Omit<AgentToolExecution, 'durationMs'> {
    const error = truncate(message, ERROR_MESSAGE_MAX);
    return { ok: false, error, content: errorContent(error) };
  }
}
