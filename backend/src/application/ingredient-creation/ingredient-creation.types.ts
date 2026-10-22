import type { IngredientCreationDraft as PrismaIngredientCreationDraft } from '@prisma/client';
import type {
  CookingMethod,
  PreparationState,
} from '../../domain/ingredient-creation/preparation-state';

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

/** ⑤ 标准原料档案的预填值；拿不准的保持 null，标「待补」，不阻断保存。 */
export interface IngredientDraft {
  name: string;
  type: 'FOOD';
  baseUnit: 'G' | 'ML' | 'PCS';
  unitDisplayLabel: string;
  cfctClass: string | null;
  edibleYieldRate: number | null;
}

/** ③ 一份营养档案草稿（生 / 熟各一份）。 */
export interface ProfileDraft {
  preparationState: PreparationState;
  sourceRecordId: string;
  entries: NutritionEvidenceEntry[];
  notes: string | null;
}

/**
 * ② 营养依据站的候选行（Task 4 的候选检索产出）。
 *
 * `cookingMethod` 只取 Task 2 的 `CookingMethod`；认不出的做法存 `null`，
 * 不猜成 `OTHER`。
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
}

/**
 * 缝合方案的一行：只补缺，不覆盖主来源。
 *
 * `status` 只描述「这个字段的值是怎么来的」：
 * - `DIRECT`：主来源直接给的（主来源的行）
 * - `FILLED`：主来源缺、由补位来源补上的
 * - `CONFLICT`：多个来源给了值但互不相等，**没有写出最终值**；
 *   `value` / `sourceValue` / `sourceRecordId` / `sourceUnit` 全为 `null`，
 *   候选值放在 `MergePlan.conflicts` 里等人裁决。
 */
export interface MergeRow {
  fieldPath: string;
  value: number | null;
  unit: string;
  status: 'DIRECT' | 'FILLED' | 'CONFLICT';
  sourceRecordId: string | null;
  sourceValue: number | null;
  sourceUnit: string | null;
}

/** 同一字段多源冲突：不自动裁决，标红等人选。 */
export interface MergeConflict {
  fieldPath: string;
  candidates: Array<{
    sourceRecordId: string;
    value: number;
    unit: string;
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
 * 草稿里累积的六站数据。`patch` 只做浅合并，每次只传本站需要更新的键。
 */
export interface IngredientCreationDraftPayload {
  intake?: IntakeCard;
  candidates?: CandidateRow[];
  mergePlan?: MergePlan;
  evidence?: NutritionEvidenceEntry[];
  checks?: FinalCheckResult;
  ingredient?: IngredientDraft;
  verify?: { exceptions: ExceptionRecord[] };
  /** AI 提案历史：只追加、不覆盖（appendProposal） */
  proposalHistory?: ProposalSnapshot[];
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
