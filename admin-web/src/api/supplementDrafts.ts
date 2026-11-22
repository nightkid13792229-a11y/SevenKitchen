/**
 * 补剂草稿式建档 API（spec §11）。
 *
 * 后端前缀 `/api/v1/admin/ingredient-creation/supplement-drafts`；`api` 实例的
 * baseURL 已经是 `/api/v1`，所以这里只写 `/admin/ingredient-creation/...`。
 * 响应外层 `{ code, message, data }` 由 axios 拦截器统一拆掉，类型只描述 `data`。
 *
 * 类型与后端 `backend/src/application/ingredient-creation/supplement-draft.types.ts`
 * / `supplement-draft.service.ts` / `supplement-draft-validation.ts` /
 * `supplement-verification.ts` 同名同形；日期在 HTTP 上是 ISO 字符串。
 */
import api from './index'

const BASE = '/admin/ingredient-creation/supplement-drafts'

/* ------------------------------------------------------------------ */
/* 草稿载荷（spec §5.2）                                               */
/* ------------------------------------------------------------------ */

/** 库存基准单位；与后端 `SupplementBaseUnit` 一致。 */
export type SupplementBaseUnit = 'PCS' | 'G' | 'ML'

/** 物理形态；不再强制决定基准单位，展示单位与基准单位 1:1 即可。 */
export type SupplementPhysicalForm = 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID'

/** 标签分类；合规字段，二选一。 */
export type SupplementLabelCategory = 'FEED_MATERIAL' | 'FEED_ADDITIVE'

/** 草稿状态；只有 DRAFT 能编辑/写入。 */
export type SupplementDraftStatus = 'DRAFT' | 'FINALIZED' | 'DISCARDED'

/**
 * 人已确认的提醒项：只记 code + 关键参数哈希。
 *
 * 参数（等价组 id、DIY 平台等）变了哈希就变，旧确认自动失效。
 */
export interface SupplementDraftAcknowledgedWarning {
  code: string
  paramsHash: string
}

/** ① 商品与基本信息。 */
export interface SupplementDraftBasic {
  name: string
  brand: string
  productModel: string
  purchaseChannel: string
  baseUnit: SupplementBaseUnit
  unitDisplayLabel: string
  physicalForm: SupplementPhysicalForm | null
  servingUnitsPerDose: number | null
  purchaseUnit: string
  purchaseToBaseRatio: number | null
  currentPricePerPurchaseUnit: number | null
  productionLossRate: number
  addTiming: string
}

/** ② 营养档案；每份含量以目录字段路径为键。 */
export interface SupplementDraftNutrition {
  servingNutrients: Record<string, number>
  defaultTargetFields: string[]
  labelText: string
}

/** ③ 标签与合规。 */
export interface SupplementDraftLabel {
  labelCategory: SupplementLabelCategory | null
  labelNames: string[]
  tagNames: string[]
  labelNameSource: string
}

/** ④ 上架与商城；上架开关是草稿意向，写入时才落到原料档案。 */
export interface SupplementDraftRetail {
  enabled: boolean
  shelfLifeMonths: number | null
  /** 开盖后保质期（天）；标签写了才填 */
  openedShelfLifeDays: number | null
  storageCondition: string
  isOilBased: boolean
  noSaleReason: string | null
}

/** ⑤ DIY 推荐。 */
export interface SupplementDraftDiy {
  enabled: boolean
  platform: string
  linkUrl: string
  imageUrl: string
}

/** ⑥ 生产采购；采购口径本身复用 basic 里的单位/倍数/价格。 */
export interface SupplementDraftProcurement {
  enabled: boolean
}

/** ⑦ 等价组。 */
export interface SupplementDraftEquivalence {
  /** groupId / `__SKIP__`（暂不归组）/ null（还没选） */
  groupId: string | null
  priority: number | null
  /** 加入已审核组时，是否在本次最终写入里一并重新审核通过 */
  reapproveGroup: boolean
}

/** ⑧ 证据与来源。 */
export interface SupplementDraftEvidence {
  frontImageUrl: string
  labelImageUrl: string
  productUrl: string
  selectionNote: string
}

/** ⑨ 审核确认。 */
export interface SupplementDraftReviewState {
  acknowledgedWarnings: SupplementDraftAcknowledgedWarning[]
}

export interface SupplementDraftPayload {
  basic: SupplementDraftBasic
  nutrition: SupplementDraftNutrition
  label: SupplementDraftLabel
  retail: SupplementDraftRetail
  diy: SupplementDraftDiy
  procurement: SupplementDraftProcurement
  equivalence: SupplementDraftEquivalence
  evidence: SupplementDraftEvidence
  review: SupplementDraftReviewState
}

/* ------------------------------------------------------------------ */
/* 草稿视图 / 列表                                                     */
/* ------------------------------------------------------------------ */

/** 完成度：列表页和编辑页顶部显示「已填必填项 / 总必填项」。 */
export interface SupplementDraftCompleteness {
  totalRequired: number
  filledRequired: number
  missing: string[]
}

/** AI 起草原始结果（结构由 AI 合同定义，前端只读展示/取来源徽标）。 */
export type SupplementDraftAiSnapshot = Record<string, unknown>

/** 草稿详情（后端 `SupplementDraftView`）。 */
export interface SupplementDraftView {
  id: string
  createdBy: string
  status: SupplementDraftStatus
  schemaVersion: number
  name: string
  payload: SupplementDraftPayload
  aiSnapshot: SupplementDraftAiSnapshot | null
  manualFields: string[]
  verification: SupplementWriteVerification | null
  finalizedIngredientId: string | null
  finalizedNutritionFoodId: string | null
  finalizedEvidenceId: string | null
  finalizedAt: string | null
  createdAt: string
  updatedAt: string
  completeness: SupplementDraftCompleteness
}

/** 列表摘要（后端 `SupplementDraftSummary`）：不带 payload。 */
export interface SupplementDraftSummary {
  id: string
  name: string
  updatedAt: string
  completeness: SupplementDraftCompleteness
}

/* ------------------------------------------------------------------ */
/* 校验 / 提醒                                                         */
/* ------------------------------------------------------------------ */

export type SupplementDraftIssueLevel = 'BLOCKER' | 'WARNING'

/** 与后端 `SupplementDraftIssueCode` 同一份固定表；code 是确认记录的稳定键。 */
export type SupplementDraftIssueCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NAME_FORM_WORD'
  | 'BRAND_TOO_LONG'
  | 'PRODUCT_MODEL_TOO_LONG'
  | 'PURCHASE_CHANNEL_TOO_LONG'
  | 'UNIT_PHYSICAL_FORM_MISMATCH'
  | 'PHYSICAL_FORM_REQUIRED'
  | 'UNIT_DISPLAY_MISMATCH'
  | 'SERVING_SIZE_REQUIRED'
  | 'SERVING_SIZE_NOT_INTEGER'
  | 'NUTRIENT_EMPTY'
  | 'NUTRIENT_FIELD_UNKNOWN'
  | 'NUTRIENT_VALUE_INVALID'
  | 'DEFAULT_TARGET_REQUIRED'
  | 'DEFAULT_TARGET_INVALID'
  | 'PURCHASE_UNIT_REQUIRED'
  | 'PURCHASE_RATIO_INVALID'
  | 'PURCHASE_PRICE_INVALID'
  | 'PRODUCTION_LOSS_RATE_INVALID'
  | 'LABEL_CATEGORY_REQUIRED'
  | 'LABEL_NAMES_REQUIRED'
  | 'TAG_NAMES_REQUIRED'
  | 'ADD_TIMING_INVALID'
  | 'OPENED_SHELF_LIFE_DAYS_INVALID'
  | 'DUPLICATE_INGREDIENT'
  | 'LABEL_NAME_UNVERIFIED'
  | 'RETAIL_BLOCKED_BY_ISSUES'
  | 'CATALOG_WARNING'
  | 'NO_SALE_REASON_REQUIRED'
  | 'NO_SALE_REASON_INVALID'
  | 'SHELF_LIFE_INVALID'
  | 'DIY_LINK_REQUIRED'
  | 'DIY_PLATFORM_REQUIRED'
  | 'DIY_PLATFORM_INVALID'
  | 'STORAGE_CONDITION_TOO_LONG'
  | 'PURCHASE_UNIT_TOO_LONG'
  | 'GROUP_INACTIVE'
  | 'GROUP_NOT_CHOSEN'
  | 'GROUP_NOT_APPROVED'
  | 'GROUP_SINGLETON'
  | 'GROUP_SKIPPED'
  | 'GROUP_NUTRIENT_MISSING'
  | 'GROUP_UNIT_MISMATCH'
  | 'SHOP_DISABLED'
  | 'EQUIVALENCE_DISABLED'
  | 'EVIDENCE_MISSING'

/** 一条阻断项 / 提醒项（后端 `SupplementDraftIssue`）。 */
export interface SupplementDraftValidationIssue {
  code: SupplementDraftIssueCode
  level: SupplementDraftIssueLevel
  message: string
  /** 供前端定位到具体输入框；不要求展示给用户。 */
  fieldPath?: string
  /** 需要人确认的提醒项：稳定 `${code}:${paramsHash}`；缺省时回退 code。 */
  ackKey?: string
}

/** 最终校验结果（后端 `SupplementDraftReview`）。 */
export interface SupplementDraftReview {
  draft: SupplementDraftView
  blockers: SupplementDraftValidationIssue[]
  warnings: SupplementDraftValidationIssue[]
  completeness: SupplementDraftCompleteness
}

/* ------------------------------------------------------------------ */
/* 写入后核验（spec §9.3）                                             */
/* ------------------------------------------------------------------ */

/** 一行直接字段对比；`target` 是生产落点，如 ingredient.shelf_life_months。 */
export interface SupplementVerificationField {
  key: string
  label: string
  target: string
  expected: unknown
  actual: unknown
  ok: boolean
}

/**
 * 功能核验项 code。
 *
 * `DIRECT_FIELDS_MISSING` 不是某种功能，而是「缺少写入时直接字段报告」的补位项；
 * 出现时页面不能显示「全部成功」。
 */
export type SupplementVerificationFeatureCode =
  | 'RETAIL'
  | 'RECIPE'
  | 'DIY'
  | 'PROCUREMENT'
  | 'EQUIVALENCE'
  | 'PACKAGING'
  | 'DUPLICATE'
  | 'DIRECT_FIELDS_MISSING'

export type SupplementVerificationFeatureSeverity = 'INFO' | 'WARN' | 'ERROR'

export interface SupplementVerificationFeatureAction {
  label: string
  path: string
}

export interface SupplementVerificationFeature {
  code: SupplementVerificationFeatureCode
  label: string
  ok: boolean
  severity: SupplementVerificationFeatureSeverity
  detail: string
  action?: SupplementVerificationFeatureAction
}

/** 写入后核验报告；`ok=false` 时页面不能显示「全部成功」。 */
export interface SupplementWriteVerification {
  ok: boolean
  checkedAt: string
  fields: SupplementVerificationField[]
  features: SupplementVerificationFeature[]
}

/** 最终写入结果（后端 `FinalizeResult`）。 */
export interface SupplementDraftFinalizeResult {
  ingredientId: string
  nutritionFoodId: string
  evidenceId: string
  verification: SupplementWriteVerification
}

/* ------------------------------------------------------------------ */
/* 草稿态等价组推荐                                                     */
/* ------------------------------------------------------------------ */

/** 组推荐候选；与现有推荐服务同形，`reason` 是一句给人看的结论。 */
export interface SupplementGroupRecommendation {
  groupId: string
  code: string
  name: string
  status: string
  memberCount: number
  sameUnit: boolean
  nutrientLabel: string
  nutrientUnit: string
  actualUnit?: string | null
  mismatchReason?:
    | 'UNIT_LABEL'
    | 'BASIS_BASE_MISMATCH'
    | 'MISSING_SERVING_WEIGHT'
    | null
  reason: string
}

export interface SupplementDraftGroupRecommendations {
  /** 等价组总开关；关着时候选也不会真正参与替换 */
  equivalenceEnabled: boolean
  candidates: SupplementGroupRecommendation[]
}

/* ------------------------------------------------------------------ */
/* 入参                                                                */
/* ------------------------------------------------------------------ */

export interface CreateSupplementDraftInput {
  name?: string
}

export interface UpdateSupplementDraftInput {
  name?: string
  /** 整份载荷；后端 `PATCH` 是替换而不是合并。 */
  payload: SupplementDraftPayload
  /** 人工改过的字段路径（点路径，AI 重跑时不覆盖） */
  manualFields?: string[]
  /** 乐观锁：上次读到的草稿 updatedAt（ISO 字符串） */
  expectedUpdatedAt?: string
}

export interface SupplementDraftAiFillInput {
  frontImageUrl: string
  labelImageUrl: string
  productUrl?: string
  selectionNote?: string
}

export interface FinalizeSupplementDraftInput {
  expectedUpdatedAt?: string
}

/**
 * 补剂草稿接口。
 *
 * 所有按 id 的接口都只能操作当前登录人自己的草稿（后端按 createdBy 过滤，
 * 别人的 id 一律 404），前端不需要额外传用户。
 */
export const supplementDraftsApi = {
  /** 我的未完成草稿，按最近编辑倒序。 */
  list: (): Promise<SupplementDraftSummary[]> => api.get(BASE),

  /** 新建一张空草稿（名称可后补）。 */
  create: (
    input: CreateSupplementDraftInput = {}
  ): Promise<SupplementDraftView> => api.post(BASE, input),

  /** 读草稿。 */
  get: (id: string): Promise<SupplementDraftView> => api.get(`${BASE}/${id}`),

  /**
   * 自动保存：整份 payload + name + manualFields + 乐观锁。
   *
   * 草稿已被别的页面/AI 改过时后端返回 409，调用方不要拿本地值覆盖。
   */
  update: (
    id: string,
    input: UpdateSupplementDraftInput
  ): Promise<SupplementDraftView> => api.patch(`${BASE}/${id}`, input),

  /** 放弃草稿（软删除）。 */
  discard: (id: string): Promise<SupplementDraftView> =>
    api.delete(`${BASE}/${id}`),

  /** AI 起草/重填；读两张图 + 可选商品链接，通常要几十秒。 */
  aiFill: (
    id: string,
    input: SupplementDraftAiFillInput
  ): Promise<SupplementDraftView> =>
    api.post(`${BASE}/${id}/ai-fill`, input, { timeout: 200000 }),

  /** 最终校验预览：阻断项 / 提醒项 / 完成度。 */
  validate: (id: string): Promise<SupplementDraftReview> =>
    api.post(`${BASE}/${id}/validate`),

  /** 一次性写入正式数据并做写入后核验。 */
  finalize: (
    id: string,
    input: FinalizeSupplementDraftInput = {}
  ): Promise<SupplementDraftFinalizeResult> =>
    api.post(`${BASE}/${id}/finalize`, input),

  /** 重新读核验报告（未写入时后端返回 null）。 */
  getVerification: (id: string): Promise<SupplementWriteVerification | null> =>
    api.get(`${BASE}/${id}/verification`),

  /** 只重跑功能核验，不写数据。 */
  reverify: (id: string): Promise<SupplementWriteVerification> =>
    api.post(`${BASE}/${id}/reverify`),

  /** 草稿态等价组推荐（没有 ingredientId，按草稿营养/单位/形态算）。 */
  recommendGroups: (id: string): Promise<SupplementDraftGroupRecommendations> =>
    api.post(`${BASE}/${id}/recommend-groups`)
}
