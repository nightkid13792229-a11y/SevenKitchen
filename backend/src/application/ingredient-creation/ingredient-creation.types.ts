import type { IngredientCreationDraft as PrismaIngredientCreationDraft } from '@prisma/client';
import type {
  CookingMethod,
  PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import type { CoverageCategory } from '../../domain/ingredient-creation/state-coverage';

/**
 * 向导站点。草稿的 `step` 只取这些值，其它字符串一律视为脏数据。
 */
export type CreationStep =
  | 'INTAKE'
  | 'SOURCES'
  | 'PROFILE'
  | 'CHECK'
  | 'INGREDIENT'
  | 'COMMIT';

/**
 * ① 起手站的「检索口径卡」：这一份原料按什么名字、什么状态去找数据。
 */
export interface IntakeCard {
  name: string;
  nameEn: string | null;
  aliases: string[];
  /** 易混词（如兔肝 vs 兔肉）：命中时只提醒，不静默采用 */
  confusables: string[];
  category: 'MEAT_ORGAN' | 'STARCHY_VEGETABLE' | 'OTHER';
  requiredStates: PreparationState[];
  suggestedStates: PreparationState[];
  /** ① 起手页的备注（可选）；随草稿保存，供创建记录与后续核查。 */
  notes?: string | null;
}

/**
 * 字段账本的一行。每个进入营养档案的数字，都要能追到：
 * 哪份来源、原始值、原始单位、换算公式、谁确认的。
 */
export interface NutritionEvidenceEntry {
  fieldPath: string;
  finalValue: number | null;
  unit: string;
  status: 'DIRECT' | 'CONVERTED' | 'FILLED' | 'MANUAL';
  sourceRecordId: string | null;
  sourceValue: number | null;
  sourceUnit: string | null;
  formula: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
}

/** 人登记的例外：理由必填、记录操作人，事后可查。 */
export interface ExceptionRecord {
  code: string;
  reason: string;
  approvedBy: string;
  approvedAt: string;
}

/**
 * 原料卡上允许人改、AI 也能写的字段。
 *
 * 用**公共字段名**（而不是入库键名）标记人工改动：可食部在库里存成比例
 * `edibleYieldRate`，但工具与页面都以百分数 `edibleYieldPercent` 交流，
 * 标记也统一用后者，避免同一件事两套名字。
 */
export type IngredientCardField =
  | 'name'
  | 'nameEn'
  | 'category'
  | 'baseUnit'
  | 'unitDisplayLabel'
  | 'cfctClass'
  | 'edibleYieldPercent';

/** ⑤ 标准原料档案的预填值；拿不准的保持 null，标「待补」，不阻断保存。 */
export interface IngredientDraft {
  name: string;
  nameEn?: string | null;
  type: 'FOOD';
  /** 与 ① 起手卡同一套类别词表；终检的「必需生熟」按它判断。 */
  category?: CoverageCategory | null;
  baseUnit: 'G' | 'ML' | 'PCS';
  unitDisplayLabel: string;
  cfctClass: string | null;
  edibleYieldRate: number | null;
  /**
   * 人工审核时改过的字段（只存在草稿里，不写正式表）。
   *
   * AI 的 `updateIngredientFields` 遇到这些字段会跳过并说明原因，
   * 不允许把人的判断悄悄改回去；提交时随审计一起留痕。
   */
  manualFields?: IngredientCardField[];
}

/** ③ 一份营养档案草稿（生 / 熟各一份）。 */
export interface ProfileDraft {
  preparationState: PreparationState;
  sourceRecordId: string;
  entries: NutritionEvidenceEntry[];
  notes: string | null;
}

/**
 * 候选为什么被判定为命中。
 *
 * - `EN_EXACT` / `EN_PARTIAL`：英文名完全 / 部分匹配；
 * - `ZH_EXACT` / `ZH_PARTIAL`：中文名完全 / 部分匹配；
 * - `ZH_ALIAS`：旧版中文关键词通过代码内手写别名命中英文词条（保留给旧数据；
 *   新检索改由 `DICTIONARY` / `AI_TRANSLATION` 标记）；
 * - `DICTIONARY`：中文词通过数据库词典展开的外文词命中；
 * - `AI_TRANSLATION`：词典没有，模型翻译出的外文词命中；
 * - `FUZZY`：打过准入线、但说不出更具体依据的匹配。
 */
export type CandidateMatchMethod =
  | 'EN_EXACT'
  | 'EN_PARTIAL'
  | 'ZH_EXACT'
  | 'ZH_PARTIAL'
  | 'ZH_ALIAS'
  | 'DICTIONARY'
  | 'AI_TRANSLATION'
  | 'FUZZY';

/**
 * ② 营养依据站的候选行（Task 4 的候选检索产出）。
 *
 * `cookingMethod` 只取 Task 2 的 `CookingMethod`；认不出的做法存 `null`，
 * 不猜成 `OTHER`。
 *
 * 匹配依据（`matchedBy` / `matchedKeyword` / `matchedSourceName`）只描述
 * **名字怎么对上的**；`matchScore` 才是最终排序分（熟查询里可能叠加温和做法权重）。
 */
export interface CandidateRow {
  sourceRecordId: string;
  sourceType: string;
  foodName: string;
  foodNameEn: string | null;
  preparationState: PreparationState | null;
  cookingMethod: CookingMethod | null;
  coveragePercent: number;
  missingFields: string[];
  matchScore: number;
  /**
   * 本地候选检索会填这三项；线上兜底检索（OnlineCandidateRow）不参与本地
   * 名字匹配，可以没有。Agent 的 searchLocalNutrition 只读本地结果，
   * 返回前会把缺失值补成 `FUZZY` / 本次关键词。
   */
  matchedBy?: CandidateMatchMethod;
  matchedKeyword?: string;
  matchedSourceName?: string;
  notes: string[];
}

/**
 * 候选检索的覆盖概况：页面顶部「本状态下最全的一份覆盖率 xx%，缺 xx」用。
 *
 * 零候选时两个 best* 都是 `null` 而不是 `0`——「没有候选」与「候选覆盖率为 0」
 * 是两件事，页面要能分开显示。
 */
export interface CandidateSearchCoverage {
  /** 本次检索的状态。 */
  state: PreparationState;
  /** 返回的候选条数（已过滤烤/煎，等于 `candidates.length`）。 */
  candidateCount: number;
  /** 覆盖率最高的候选的必需营养素覆盖率；零候选时为 null。 */
  bestCoveragePercent: number | null;
  /** 覆盖率最高的候选缺多少项必需营养素；零候选时为 null。 */
  bestMissingFieldCount: number | null;
}

/**
 * ② 营养依据站的候选检索结果（Task 4 产出）。
 *
 * `excludedCount` 只统计**名字对得上、但因做法不符合熟食策略（烤/煎等）被排除**
 * 的词条；生熟不符属于状态筛选，不计入——页面上的「另有 N 条因烤/煎被排除」
 * 直接用它。
 */
export interface CandidateSearchResult {
  candidates: CandidateRow[];
  excludedCount: number;
  coverage: CandidateSearchCoverage;
  /**
   * 本次实际用于检索的关键词（中文 + 词典展开词 + AI 翻译候选词）。
   *
   * 零候选时也回传：页面要能列出「查过哪些词」，而不是只显示一句「没结果」。
   */
  keywords: string[];
  /**
   * 降级提示。目前只有一种：中文词不在词典里、AI 翻译又不可用。
   * 零候选时页面/模型据此说清「为什么没查到」，而不是让人以为库里真的没有。
   */
  notice?: string | null;
}

/**
 * 缝合方案的一行：只补缺，不覆盖主来源。
 *
 * `status` 只描述「这个字段的值是怎么来的」：
 * - `DIRECT`：主来源直接给的，或人确认「采纳主来源」的冲突值（不算人工改动）
 * - `FILLED`：主来源缺、由补位来源自动补上的
 * - `MANUAL`：人明确改判到**非主来源**的候选（才算人工改动）
 * - `CONFLICT`：多个来源给了值但互不相等，**没有写出最终值**；
 *   `value` / `sourceValue` / `sourceRecordId` / `sourceUnit` 全为 `null`，
 *   候选值放在 `MergePlan.conflicts` 里等人裁决。
 *
 * `value`/`unit` 是目录单位下的最终值；`sourceValue`/`sourceUnit` 是来源原文，
 * 两者不能混用（详见 `MergeConflict.candidates`）。
 */
export interface MergeRow {
  fieldPath: string;
  value: number | null;
  unit: string;
  status: 'DIRECT' | 'FILLED' | 'MANUAL' | 'CONFLICT';
  sourceRecordId: string | null;
  sourceValue: number | null;
  sourceUnit: string | null;
}

/**
 * 同一字段多源冲突：不自动裁决，标红等人选。
 *
 * 每个候选同时给两套数，展示时必须区分：
 * - `value`/`unit`：**目录单位**下的值，用于比较与写入档案；
 * - `sourceValue`/`sourceUnit`：**来源原文**值与单位，只作证据展示。
 *
 * 例：来源写 `0.55 mg`、该字段目录单位是 `μg` 时，
 * `value` 是 `550`、`unit` 是 `μg`，而 `sourceValue` 是 `0.55`、`sourceUnit` 是 `mg`。
 * 来源没有单独给原文值时，`sourceValue`/`sourceUnit` 回退为目录单位下的值与单位
 * （已换算过的值就是唯一已知的值，不假装知道原文）。
 */
export interface MergeConflict {
  fieldPath: string;
  candidates: Array<{
    sourceRecordId: string;
    value: number;
    unit: string;
    sourceValue: number | null;
    sourceUnit: string | null;
  }>;
}

/** ② 营养依据站的缝合方案（Task 5 产出）。 */
export interface MergePlan {
  primarySourceRecordId: string;
  rows: MergeRow[];
  conflicts: MergeConflict[];
  /**
   * 所有来源都没给的字段（按营养字段目录顺序）。
   *
   * 「缺失」与「冲突」是两件事：缺失 = 谁都没给（不产生 `rows` 行、绝不写成 0），
   * 冲突 = 有值但不一致。冲突字段不会出现在这里，缺失字段也不会进 `conflicts`。
   */
  missingFields: string[];
}

/** 终检的一项（Task 6 产出）。 */
export interface CheckItem {
  code: string;
  message: string;
  fieldPath?: string;
}

/** ④ 终检结果：拦死 / 可例外 / 提醒。 */
export interface FinalCheckResult {
  blocking: CheckItem[];
  exceptionable: CheckItem[];
  warnings: CheckItem[];
}

/** AI 提案快照的站点。 */
export type ProposalSnapshotKind = 'INTAKE' | 'CANDIDATES' | 'MERGE' | 'CHECK';

/**
 * AI 提案快照：每次 AI 出方案存一份（设计文档第六节）。
 *
 * 与「最新 payload」并存，用于事后审查，以及将来统计每站的提案采纳率 / 改动率。
 */
export interface ProposalSnapshot {
  kind: ProposalSnapshotKind;
  createdAt: string;
  [key: string]: unknown;
}

/**
 * `askUser` 的一个选项，以及它在本地营养库里的核实结果。
 *
 * `label` 是点选后真正回传给模型的答案；`displayLabel` 只用于页面展示
 * （未收录时带「会去线上找」的后缀），两者不要混用。
 */
export interface PendingQuestionOption {
  label: string;
  /**
   * `true`：本地库有候选；`false`：查了但没有；`null`：核实失败 / 超时，
   * 状态未知。未知不能当成「没有」，否则一次超时就会挡住正常的提问。
   */
  inLibrary: boolean | null;
  /** 命中时库里的词条名，用于页面提示；未命中 / 未知时为 null。 */
  matchedName: string | null;
  /** 页面展示文案；未收录时是 `label + 后缀`。 */
  displayLabel: string;
}

/**
 * AI 停下来问人的问题（`askUser` 工具写下）。
 *
 * 只存「问到了什么」，不存「用户答了什么」：答案由下一次 run 的 `text`
 * 带进来，用完即清（置 null），避免同一份问题被反复消费。
 */
export interface PendingQuestion {
  question: string;
  /**
   * 纯文本选项，保持与旧草稿 / 旧页面兼容；点选时回传的就是这里的原文。
   * 核实结果放在 `optionChecks`，与下标一一对应。
   */
  options: string[];
  /**
   * 每个选项的库内核实结果（与 `options` 同序）。
   *
   * 旧草稿里没有这个字段，读取方必须容忍缺失；核实失败时选项仍会问，
   * 只是对应项标 `inLibrary: null`。
   */
  optionChecks?: PendingQuestionOption[];
  /** ISO 时间戳；页面按它排序 / 排查用。 */
  askedAt: string;
}

/**
 * 草稿里累积的六站数据。`patch` 只做浅合并，每次只传本站需要更新的键。
 */
export interface IngredientCreationDraftPayload {
  intake?: IntakeCard;
  candidates?: CandidateRow[];
  mergePlan?: MergePlan;
  evidence?: NutritionEvidenceEntry[];
  /** ③ 已建好的营养档案；终检的「生熟覆盖」要用它判断哪些状态已经有了。 */
  profiles?: ProfileDraft[];
  checks?: FinalCheckResult;
  ingredient?: IngredientDraft;
  verify?: { exceptions: ExceptionRecord[] };
  /** AI 提案历史：只追加、不覆盖（appendProposal） */
  proposalHistory?: ProposalSnapshot[];
  /**
   * AI 正在等用户回答的问题；下一次带同一 draftId 的 run 会把它塞进提示词，
   * 然后置为 null。null / 缺失都表示「现在没有待回答的问题」。
   */
  pendingQuestion?: PendingQuestion | null;
}

/**
 * 草稿记录（数据库行 + 收窄后的 step / payload）。
 *
 * 与 Prisma 模型同名，但把 `payload` 从 `JsonValue` 收窄成结构化类型，
 * 服务与后续任务读草稿时不用到处做类型断言。
 */
export type IngredientCreationDraft = Omit<
  PrismaIngredientCreationDraft,
  'step' | 'payload'
> & {
  step: CreationStep;
  payload: IngredientCreationDraftPayload;
};

/**
 * 「我的未完成草稿」列表项。
 *
 * 只带列表要显示的小字段——**绝不返回整份 payload**（里面可能有候选、
 * 缝合方案与提案历史，动辄上百 KB）。
 */
export interface IngredientCreationDraftSummary {
  draftId: string;
  name: string;
  step: CreationStep;
  updatedAt: Date;
  /** ① 站的英文名；payload 里没有时整个为 null。 */
  intake: { nameEn: string } | null;
}
