/**
 * AI 辅助新建标准原料（阶段一：食材）的前端类型。
 *
 * 字段名与后端 `ingredient-creation.types.ts` / 控制器返回值保持一致（camelCase）；
 * 后端接口外面包的 `{ code, message, data }` 由 `api/index.ts` 的拦截器拆掉，
 * 这里的类型只描述 `data` 本身。
 */

/** 向导六站。顺序即 `stepList` 的顺序，不能随意调换。 */
export type CreationStep =
  | 'INTAKE'
  | 'SOURCES'
  | 'PROFILE'
  | 'CHECK'
  | 'INGREDIENT'
  | 'COMMIT'

/** 营养档案只有生、熟两档；做法不进入状态字段。 */
export type PreparationState = 'RAW' | 'COOKED'

/** 来源给的做法，只在「找数据」时用于筛选候选。 */
export type CookingMethod =
  | 'BOILED'
  | 'STEAMED'
  | 'GRILLED'
  | 'FRIED'
  | 'OTHER'

/** 生熟清单的原料类别。 */
export type CoverageCategory =
  | 'MEAT_ORGAN'
  | 'STARCHY_VEGETABLE'
  | 'OTHER'

/** ① 起手站的「检索口径卡」。 */
export interface IntakeCard {
  name: string
  nameEn: string | null
  aliases: string[]
  /** 易混词（如兔肝 vs 兔肉）：命中时只提醒，不静默采用 */
  confusables: string[]
  category: CoverageCategory
  requiredStates: PreparationState[]
  suggestedStates: PreparationState[]
  /** ① 起手页的备注（可选）；随草稿保存，供创建记录与后续核查。 */
  notes?: string | null
}

/**
 * 字段账本的一行：每个进入营养档案的数字都要能追到
 * 哪份来源、原始值、原始单位、换算公式、谁确认的。
 */
export interface NutritionEvidenceEntry {
  fieldPath: string
  finalValue: number | null
  unit: string
  status: 'DIRECT' | 'CONVERTED' | 'FILLED' | 'MANUAL'
  sourceRecordId: string | null
  sourceValue: number | null
  sourceUnit: string | null
  formula: string | null
  confirmedBy: string | null
  confirmedAt: string | null
}

/** 人登记的例外：理由必填、记录操作人，事后可查。 */
export interface ExceptionRecord {
  code: string
  reason: string
  approvedBy: string
  approvedAt: string
}

/** ⑤ 标准原料档案的预填值；拿不准的保持 null，标「待补」。 */
export interface IngredientDraft {
  name: string
  type: 'FOOD'
  baseUnit: 'G' | 'ML' | 'PCS'
  unitDisplayLabel: string
  cfctClass: string | null
  edibleYieldRate: number | null
}

/** ③ 一份营养档案草稿（生 / 熟各一份）。 */
export interface ProfileDraft {
  preparationState: PreparationState
  sourceRecordId: string
  entries: NutritionEvidenceEntry[]
  notes: string | null
}

/** ② 营养依据站的候选行。 */
export interface CandidateRow {
  sourceRecordId: string
  sourceType: string
  foodName: string
  foodNameEn: string | null
  preparationState: PreparationState | null
  cookingMethod: CookingMethod | null
  coveragePercent: number
  missingFields: string[]
  matchScore: number
  notes: string[]
  /** 线上兜底抓取的原始网址；本地候选没有 */
  sourceUrl?: string
  /** 线上抓取时间（ISO）；本地候选没有 */
  fetchedAt?: string
  /** 这一条来自「到线上找一轮」的白名单抓取 */
  isOnline?: boolean
}

/**
 * ② 线上白名单兜底检索结果。
 *
 * 线上候选永远追加在本地候选之后；`attemptedHosts` / `rejectedHosts`
 * 用于页面说明「找了几个来源」「哪些网址不在白名单」。
 */
export interface OnlineCandidateSearchResult {
  candidates: CandidateRow[]
  attemptedHosts: string[]
  rejectedHosts: string[]
}

/**
 * 候选检索的覆盖概况。
 *
 * 零候选时 `bestCoveragePercent` / `bestMissingFieldCount` 都是 null，
 * 页面必须把「没有候选」与「候选覆盖率为 0」分开显示。
 */
export interface CandidateSearchCoverage {
  state: PreparationState
  candidateCount: number
  bestCoveragePercent: number | null
  bestMissingFieldCount: number | null
}

/** ② 营养依据站的候选检索结果。 */
export interface CandidateSearchResult {
  candidates: CandidateRow[]
  /** 名字对得上、但因烤/煎被排除的条数 */
  excludedCount: number
  coverage: CandidateSearchCoverage
}

/** 缝合方案的一行：只补缺，不覆盖主来源。 */
export interface MergeRow {
  fieldPath: string
  value: number | null
  unit: string
  /**
   * CONFLICT 行没有最终值，候选值在 `MergePlan.conflicts` 里等人裁决。
   * 裁决选主来源时后端仍写 DIRECT（采纳 AI 方案），只有改判到非主来源才写 MANUAL。
   */
  status: 'DIRECT' | 'FILLED' | 'MANUAL' | 'CONFLICT'
  sourceRecordId: string | null
  sourceValue: number | null
  sourceUnit: string | null
}

/** 同一字段多源冲突：不自动裁决，标红等人选。 */
export interface MergeConflict {
  fieldPath: string
  candidates: Array<{
    sourceRecordId: string
    /** 目录单位下的值，用于比较与写入档案 */
    value: number
    unit: string
    /** 来源原文值与单位，只作证据展示 */
    sourceValue: number | null
    sourceUnit: string | null
  }>
}

/** ② 营养依据站的缝合方案。 */
export interface MergePlan {
  primarySourceRecordId: string
  rows: MergeRow[]
  conflicts: MergeConflict[]
  /** 所有来源都没给的字段；缺失绝不写成 0 */
  missingFields: string[]
}

/** 终检的一项。 */
export interface CheckItem {
  code: string
  message: string
  fieldPath?: string
}

/** ④ 终检结果：拦死 / 可例外 / 提醒。 */
export interface FinalCheckResult {
  blocking: CheckItem[]
  exceptionable: CheckItem[]
  warnings: CheckItem[]
}

/** AI 提案快照的站点。 */
export type ProposalSnapshotKind = 'INTAKE' | 'CANDIDATES' | 'MERGE' | 'CHECK'

/**
 * AI 提案快照：每次 AI 出方案存一份。
 *
 * 只由后端 `appendProposal` 追加；前端 patch 草稿时不得回传覆盖。
 */
export interface ProposalSnapshot {
  kind: ProposalSnapshotKind
  createdAt: string
  [key: string]: unknown
}

/** 草稿里累积的六站数据；patch 时只传本站需要更新的键（浅合并）。 */
export interface IngredientCreationDraftPayload {
  intake?: IntakeCard
  candidates?: CandidateRow[]
  mergePlan?: MergePlan
  evidence?: NutritionEvidenceEntry[]
  /**
   * 已建好的营养档案。后端 `UpdateDraftPayloadDto` 接受该键，
   * 终检的「生熟覆盖」也按它统计。
   */
  profiles?: ProfileDraft[]
  checks?: FinalCheckResult
  ingredient?: IngredientDraft
  verify?: { exceptions: ExceptionRecord[] }
  /** AI 提案历史：只追加、不覆盖，前端不得回传 */
  proposalHistory?: ProposalSnapshot[]
}

/** 草稿记录。 */
export interface IngredientCreationDraft {
  id: string
  name: string
  type: string
  step: CreationStep
  payload: IngredientCreationDraftPayload
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * 「我的未完成草稿」列表项。
 *
 * 后端为避免 payload 过大，只返回这几个摘要字段；
 * `intake.nameEn` 在 payload 里没有时整个为 null。
 */
export interface IngredientCreationDraftSummary {
  draftId: string
  name: string
  step: CreationStep
  updatedAt: string
  intake: { nameEn: string } | null
}

/** `POST drafts` 的返回值。 */
export interface CreateDraftResult {
  draftId: string
  step: CreationStep
}

/** `POST drafts/:id/candidates` 的入参。 */
export interface FindCandidatesInput {
  name: string
  nameEn?: string
  state: PreparationState
}

/** `POST drafts/:id/merge` 的入参。 */
export interface CreateMergePlanInput {
  primarySourceRecordId: string
  supplementalSourceRecordIds: string[]
}

/** `POST drafts/:id/merge/resolve` 的入参。 */
export interface ResolveMergeConflictInput {
  fieldPath: string
  sourceRecordId: string
}

/** `POST drafts/:id/commit` 的入参。 */
export interface CommitIngredientCreationInput {
  ingredient: IngredientDraft
  /** 同一 preparationState 最多一份 */
  profiles: ProfileDraft[]
  primaryProfileIndex: number
}

/** `POST drafts/:id/commit` 的返回值。 */
export interface CommitIngredientCreationResult {
  ingredientId: string
  /** 与请求里的 `profiles` 顺序一一对应 */
  nutritionFoodIds: string[]
  auditId: string
}

// ==================== 创建记录（审计） ====================

/** 人工改动的类型（与后端 `buildAuditChanges` 的 FieldChangeKind 一致）。 */
export type AuditChangeKind =
  | 'VALUE_CHANGED'
  | 'CONFLICT_RESOLVED'
  | 'MANUALLY_ADDED'
  | 'REMOVED_FROM_FINAL'

/** AI 当时给出的一个冲突候选（目录单位值 + 来源原文）。 */
export interface AuditAiConflictCandidate {
  sourceRecordId: string
  value: number
  unit: string
  sourceValue: number | null
  sourceUnit: string | null
}

/** 「AI 提案 vs 最终档案」的一处差异。 */
export interface IngredientCreationAuditFieldChange {
  profileIndex: number
  preparationState: PreparationState
  sourceRecordId: string
  fieldPath: string
  change: AuditChangeKind
  aiValue: number | null
  aiUnit: string | null
  aiSourceRecordId: string | null
  aiCandidates: AuditAiConflictCandidate[] | null
  finalValue: number | null
  finalUnit: string | null
  finalStatus: NutritionEvidenceEntry['status'] | null
  finalSourceRecordId: string | null
  finalConfirmedBy: string | null
}

/** 提交时落库的人工改动 + 人登记的例外。 */
export interface IngredientCreationAuditChanges {
  fields: IngredientCreationAuditFieldChange[]
  exceptions: ExceptionRecord[]
}

/**
 * `GET /admin/ingredient-creation/audits/:ingredientId` 的返回值。
 *
 * `proposals` 是 AI 每次出方案的原始快照数组（未做类型收窄，展示层自行容错）；
 * `changes` 是字段级人工改动。
 */
export interface IngredientCreationAudit {
  id: string
  draftId: string
  ingredientId: string
  nutritionFoodIds: string[]
  proposals: unknown
  changes: IngredientCreationAuditChanges | null
  committedBy: string
  committedAt: string
}

// ==================== 第一步：判断食材还是补剂 ====================

/**
 * `POST /admin/ingredient-creation/intake/classify` 的判定结果。
 *
 * `UNKNOWN` 表示模型判不准（或输入太泛），此时 `reply` 是追问；
 * 前端只负责展示，不自己猜类型。
 */
export type IntakeKind = 'FOOD' | 'SUPPLEMENT' | 'UNKNOWN'

/** 判断接口的返回值；`suggestions` 只在需要补充输入时非空。 */
export interface IntakeClassification {
  kind: IntakeKind
  reply: string
  suggestions: string[]
}
