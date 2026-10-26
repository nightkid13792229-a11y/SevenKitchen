/**
 * AI 辅助新建标准原料（阶段一：食材）的前端类型。
 *
 * 字段名与后端 `ingredient-creation.types.ts` / 控制器返回值保持一致（camelCase）；
 * 后端接口外面包的 `{ code, message, data }` 由 `api/index.ts` 的拦截器拆掉，
 * 这里的类型只描述 `data` 本身。
 */
import type { IngredientCardFieldKey } from '@/constants/ingredientCardFields'

/** 草稿阶段。后端 `CreationStep` 契约：新建草稿从 INTAKE 开始。 */
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
  /** 起手页的备注（可选）；随草稿保存，供提交审计与后续核查。 */
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

/**
 * 原料卡上人可改、AI 也能写的字段（公共字段名）。
 *
 * 直接复用字段目录的 30 个公共键，不再手写一份字面量清单：少一项就等于
 * 草稿收不下这个字段，多一项则与页面、AI 工具对不上。
 *
 * 用**公共字段名**（而不是入库键名）标记人工改动：可食部在库里存成比例
 * `edibleYieldRate`，但工具与页面都以百分数 `edibleYieldPercent` 交流，
 * 标记也统一用后者，避免同一件事两套名字。
 */
export type IngredientCardField = IngredientCardFieldKey

/**
 * ⑤ 标准原料档案的预填值；拿不准的保持 null，标「待补」，不阻断保存。
 *
 * 字段与 `INGREDIENT_CARD_FIELDS` 一一对应：除 4 个必填项外全部可选 ——
 * 向导按分组逐步填，没走到的分组就是 `undefined`（不是「人清空了」），
 * 人明确清空的才是 `null`。旧调用方（AI 字段工具、提交服务）只构造其中
 * 一部分字段，也照样成立。
 *
 * 可食部的公共名是 `edibleYieldPercent`（0–100），**草稿里存的是比例**
 * `edibleYieldRate`（0–1）；换算只在 `toIngredientDraft` / `toIngredientCard`
 * 两处发生，这里不重复换算。
 */
export interface IngredientDraft {
  // BASIC
  name: string
  nameEn?: string | null
  type: 'FOOD'
  /** 与 ① 起手卡同一套类别词表；终检的「必需生熟」按它判断 */
  category?: CoverageCategory | null
  notes?: string | null
  // MEASURE
  baseUnit: 'G' | 'ML' | 'PCS'
  unitDisplayLabel: string
  weightG?: number | null
  maxCapacityG?: number | null
  // NUTRITION
  cfctClass?: string | null
  edibleYieldRate?: number | null
  mainNutrientsDesc?: string | null
  // PURCHASE
  procurementStrategy?: string | null
  purchaseUnit?: string | null
  purchaseToBaseRatio?: number | null
  currentPricePerPurchaseUnit?: number | null
  brand?: string | null
  productModel?: string | null
  purchaseChannel?: string | null
  // STOCK（原料建完、有了库存记录才谈得上；本阶段只读回传）
  safetyStock?: number | null
  reorderPoint?: number | null
  targetStock?: number | null
  // USAGE
  diyEnabled?: boolean | null
  addTiming?: string | null
  productionLossRate?: number | null
  tags?: string[]
  // STORAGE
  shelfLifeMonths?: number | null
  storageCondition?: string | null
  openedShelfLifeDays?: number | null
  isOilBased?: boolean | null
  /**
   * 人工审核时改过的字段（只存在草稿里）。
   * AI 的 updateIngredientFields 遇到这些字段会跳过，不覆盖人的判断。
   */
  manualFields?: IngredientCardField[]
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
  /** 可选的补救建议；核验弹窗里跟在问题后面展示（阶段一先留字段） */
  suggestion?: string
}

/** ④ 终检结果：拦死 / 可例外 / 提醒。 */
export interface FinalCheckResult {
  blocking: CheckItem[]
  exceptionable: CheckItem[]
  warnings: CheckItem[]
}

// ==================== 按域核验与授权闸门 ====================

/** 核验的两个域：原料档案 / 营养档案。 */
export type CheckDomain = 'INGREDIENT' | 'NUTRITION'

/** 报告由谁触发：AI 自检不算授权依据，人点「核验此页」才算。 */
export type CheckTrigger = 'AGENT' | 'USER'

/** 一次核验的计数（三档固定）。 */
export interface CheckRunCounts {
  blocking: number
  exceptionable: number
  warning: number
}

/**
 * 一份落库的核验报告。
 *
 * `payloadHash` 记录「检查的是哪一份草稿内容」，`rulesVersion` 记录规则版本；
 * 授权闸门会同时比这两个值，改过草稿或规则升级后旧报告都不能再用。
 */
export interface CheckRunView {
  id: string
  draftId: string
  domain: CheckDomain
  trigger: CheckTrigger
  rulesVersion: string
  payloadHash: string
  result: FinalCheckResult
  counts: CheckRunCounts
  createdBy: string
  createdAt: string
}

/** `GET drafts/:id/checks`：两域各自最新一份报告 + 是否仍对应当前草稿。 */
export interface IngredientDraftChecksView {
  ingredient: CheckRunView | null
  nutrition: CheckRunView | null
  fresh: {
    ingredient: boolean
    nutrition: boolean
  }
}

/** 授权被拒的机器可读原因码（后端 `AuthorizeBlockedReasonCode`）。 */
export type AuthorizeBlockedReasonCode =
  | 'CHECK_MISSING'
  | 'CHECK_STALE'
  | 'CHECK_VERSION'
  | 'CHECK_BLOCKING'
  | 'CHECK_EXCEPTIONABLE'
  | 'SOURCE_PENDING'

/** 授权被拒的一条原因；`domain` 只在能归到某一页时出现。 */
export interface AuthorizeBlockedReason {
  code: AuthorizeBlockedReasonCode
  domain?: CheckDomain
  detail: string
}

/** `POST drafts/:id/authorize` 的返回值：提交结果 + 授权时间。 */
export interface AuthorizeResult extends CommitIngredientCreationResult {
  /** 授权时间（ISO）；与提交时间分开，方便审计对账。 */
  authorizedAt: string
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

/**
 * `askUser` 的一个选项，以及它在本地营养库里的核实结果。
 *
 * `label` 是点选后回传给模型的答案；`displayLabel` 只用于页面展示
 * （未收录时带「会去线上找」的后缀）。
 */
export type CandidateReviewVerdict =
  | 'RELEVANT'
  | 'UNCERTAIN'
  | 'IRRELEVANT'

export interface PendingQuestionOption {
  label: string
  /** true=库里已收录；false=未收录；null=核实失败 / 超时，状态未知 */
  inLibrary: boolean | null
  /** 命中时的库内词条名；未命中 / 未知时为 null */
  matchedName: string | null
  displayLabel: string
  /** 候选名（从「候选名 —— 相关：理由」里拆出）；普通问题没有 */
  candidateLabel?: string
  /** AI 复核对这条选项的判断；普通问题没有 */
  aiVerdict?: CandidateReviewVerdict | null
  /** AI 复核的一句理由（≤40 字） */
  aiReason?: string | null
}

/** AI 停下来问人的问题；`options` 是可直接点选的答案。 */
export interface PendingQuestion {
  question: string
  options: string[]
  /** 与 options 同序的库内核实结果；旧草稿可能没有。 */
  optionChecks?: PendingQuestionOption[]
  askedAt: string
}

/** 草稿里累积的数据；patch 时只传本次需要更新的键（浅合并）。 */
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
  /**
   * AI 正在等用户回答的问题；有值时页面顶部显示「等你回答」。
   * 下一次带同一 draftId 的 run 会消费它并置 null。
   */
  pendingQuestion?: PendingQuestion | null
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

// ==================== 第一步：判断食材还是补剂 ====================

/**
 * `POST /admin/ingredient-creation/intake/classify` 的判定结果。
 *
 * `UNKNOWN` 表示模型判不准（或输入太泛），此时 `reply` 是追问；
 * 前端只负责展示，不自己猜类型。
 */
export type IntakeKind = 'FOOD' | 'SUPPLEMENT' | 'UNKNOWN'

/** 这一轮用户输入的性质，用于区分「新原料」与「纠正当前原料」。 */
export type IntakeIntent = 'NEW' | 'CORRECTION' | 'CLARIFY' | 'OFF_TOPIC'

/** 发给后端的对话历史：只保留说话人和文本，不需要页面气泡的 id / 建议项。 */
export interface IntakeHistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

/** 当前已经判定的原料，纠正时让后端知道「在原话指哪条原料」。 */
export interface IntakeCurrentIngredient {
  text: string
  kind: Exclude<IntakeKind, 'UNKNOWN'>
}

/** 判断接口的返回值；`suggestions` 只在需要补充输入时非空。 */
export interface IntakeClassification {
  kind: IntakeKind
  reply: string
  suggestions: string[]
  /** 这一轮是新建、纠正、追问还是跑题 */
  intent: IntakeIntent
  /** 归一化后的原料文本；`kind=UNKNOWN` 或没有可识别原料时为 null */
  resolvedText: string | null
}

// ==================== Agent 起草循环 ====================

/**
 * 本次实际使用的模型协议：
 * - `FUNCTION_CALLING`：OpenAI 兼容的 tools / tool_calls（首选）；
 * - `JSON_ACTION`：模型不支持 tools 时的退化协议。
 */
export type IngredientAgentMode = 'FUNCTION_CALLING' | 'JSON_ACTION'

/** 一次工具调用：名字、入参、成败；失败时 `error` 是后端原文。 */
export interface AgentToolCallRecord {
  name: string
  args: Record<string, unknown>
  ok: boolean
  error?: string
  /**
   * 工具返回的结构化结果（后端已解析成 JSON）。
   *
   * 查本地库时用它展开关键词、命中词条与匹配方式；`ok=true` 不代表
   * `found=true`，零命中时页面要写「没有找到匹配词条」。
   */
  result?: unknown
}

/** 服务端留痕的一步（工具调用 / 工具结果 / 最终回复 / 步数上限）。 */
export interface AgentTranscriptEntry {
  step: number
  type: 'tool_call' | 'tool_result' | 'reply' | 'limit'
  atMs: number
  tool?: string
  args?: Record<string, unknown>
  ok?: boolean
  error?: string
  summary?: string
}

/**
 * 本轮为什么停下：`waiting_user` 表示 AI 问了一个问题、等你回答，
 * 不属于失败；其余是保险丝。
 */
export type IngredientAgentStopReason =
  | 'TOOL_CALL_LIMIT'
  | 'TIMEOUT'
  | 'TOKEN_BUDGET'
  | 'NO_PROGRESS'
  | 'waiting_user'

/** 运行报告里的一条失败工具记录。 */
export interface AgentRunReportFailedTool {
  name: string
  error: string
}

/** 每轮 AI 起草结束时返回的运行报告。 */
export interface AgentRunReport {
  runId: string
  draftId: string
  text: string
  steps: number
  toolCalls: number
  tokensIn: number
  tokensOut: number
  durationMs: number
  stopReason: string | null
  tools: string[]
  failedTools: AgentRunReportFailedTool[]
  result: 'FINISHED' | 'TIMEOUT' | 'NO_PROGRESS' | 'ERROR'
}

/** `POST /admin/ingredient-creation/agent/run` 的返回值。 */
export interface IngredientAgentRunResult {
  draftId: string
  reply: string
  toolCalls: AgentToolCallRecord[]
  steps: number
  transcript: AgentTranscriptEntry[]
  mode: IngredientAgentMode
  stopReason?: IngredientAgentStopReason | null
  /** 本轮运行报告：接口返回值里也带。 */
  report: AgentRunReport
  /** 非流式路径同样带问题：页面据此渲染提问气泡 + 选项。 */
  pendingQuestion?: PendingQuestion | null
}

/** `POST agent/run` 的入参；第一轮不传 `draftId`，之后带上上一轮的。 */
export interface RunIngredientAgentInput {
  draftId?: string
  text: string
}
