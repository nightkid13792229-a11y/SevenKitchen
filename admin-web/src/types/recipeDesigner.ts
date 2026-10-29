/**
 * 食谱设计器（Web 端）类型定义
 * 与 backend /api/v1/recipe-designer/* 接口对齐
 */

export type FediafDogScenario =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'

export const FEDIAF_DOG_SCENARIO_LABELS: Record<FediafDogScenario, string> = {
  EARLY_GROWTH_REPRODUCTION: '小于14周龄幼犬',
  REPRODUCTION: '繁殖期母犬',
  LATE_GROWTH: '大于等于14周龄幼犬',
  ADULT_MER_95: '低能量需求成年犬（95ME）',
  ADULT_MER_110: '普通成年犬（110ME）'
}

export type RecipeDesignerSeriesStatusFilter = 'DRAFT' | 'PUBLIC' | 'PRIVATE_CUSTOM'

export type RecipeSeriesStageStatus =
  | 'NOT_DESIGNED'
  | 'MODIFIED'
  | 'SUBMITTED'
  | 'PUBLISHED'
  | 'PRIVATE_CUSTOM'

export interface RecipeDesignerSeriesStage {
  lifeStage: string
  label: string
  scenario: FediafDogScenario
  status: RecipeSeriesStageStatus
  recipeStatusCategory?: 'NOT_DESIGNED' | RecipeDesignerSeriesStatusFilter
  draftId?: string | null
  recipeId?: string | null
  updatedAt?: string | null
}

export interface RecipeDesignerSeriesCard {
  id: string
  name: string
  businessStatus?: RecipeDesignerSeriesStatusFilter
  businessStatusLabel?: string
  /**
   * 工作台卡片可选的发布状态扩展字段（2026-10-22 重新发布）。
   *
   * 列表接口目前**不返回**这些字段；卡片只在后端补上时展示待更新数量，
   * 前端不为了显示这个数字额外给每张卡片拉一次 readiness。
   */
  releaseState?: SeriesReleaseState
  hasPendingUpdates?: boolean
  pendingStageCodes?: string[]
  pendingStageCount?: number
  referenceDogId?: string | null
  /** 参考爱犬名称（后端工作台卡片附带，用于搜索定位展示） */
  referenceDogName?: string | null
  /** 参考爱犬名称列表：第一位为当前参考犬，其后为历史上发布时记录过的参考犬 */
  referenceDogNames?: string[] | null
  updatedAt?: string
  publishedStageCount: number
  stages: RecipeDesignerSeriesStage[]
  /** 默认阶段（第一个有草稿的阶段）的草稿 ID，用于创建后进入编辑器 */
  initialDraftId?: string | null
  /** 列表上下文：CATALOG = 产品线；ORDER = 订单定制 */
  designMode?: 'CATALOG' | 'ORDER'
  /** 订单定制列表附加信息 */
  orderNo?: string | null
  orderStatus?: string | null
  orderQuantity?: number | null
  orderDogName?: string | null
}

export interface CreateRecipeSeriesPayload {
  name: string
  scenario?: FediafDogScenario
  referenceDogId?: string
}

export interface RecipeDesignerNutritionWarning {
  hasWarning: true
  overallStatus: string
  counts: {
    deficient: number
    excess: number
    missingData: number
  }
  message: string
}

/**
 * 设计稿补剂项上保存的目标营养素（2026-10-22）。
 *
 * `targetValuePerKg` 是服务端按当前配方计算的添加浓度缓存；
 * 编辑器显示时按当前评估总重量重新计算，不能把它当成人工维护的目标值。
 */
export interface DesignerSupplementTarget {
  nutrientTargetKey?: string | null
  fieldPath: string
  label?: string
  unit?: string
  targetValue?: number | null
  /** 每 kg 配方实际添加浓度（后端计算缓存） */
  targetValuePerKg?: number | null
  expressionBasis?: string | null
}

/**
 * 结构化制作步骤（2026-10-22 · Task 7）。
 *
 * `sortOrder` 由编辑器自动维护为 1..n，是数组顺序的持久化形式；
 * `instruction` 必填，时长 / 温度 / 设备可缺省（后端存 null）。
 */
export interface DesignerProductionStep {
  sortOrder: number
  instruction: string
  durationMinutes?: number | null
  temperatureC?: number | null
  equipment?: string | null
}

/** GET /recipe-designer/drafts/:id/production-steps */
export interface DesignRecipeProductionStepsResult {
  draftId: string
  productionSteps: DesignerProductionStep[]
}

/** PATCH /recipe-designer/drafts/:id/production-steps（整组覆盖，空数组 = 清空） */
export interface UpdateDesignRecipeProductionStepsPayload {
  steps: DesignerProductionStep[]
}

/** 设计草稿模式：CATALOG = 产品线；ORDER = 订单绑定（本单设计） */
export type DesignRecipeDesignMode = 'CATALOG' | 'ORDER'

/**
 * PATCH `/recipe-designer/drafts/:id/presentation`
 *
 * patch semantics：只传需要修改的字段；显式 null 表示清空。
 * `detailImages` / `videoUrl` 也在接口里，但当前后台 UI 暂不编辑，
 * 保存时不会主动覆盖已存在的值。
 */
export interface UpdateDraftPresentationPayload {
  coverImageUrl?: string | null
  coverTitle?: string | null
  description?: string | null
  sellingPoint?: string | null
  detailImages?: string[] | null
  videoUrl?: string | null
}

/** 产品展示 PATCH 的响应：只有展示字段 + 新的内容版本 */
export interface DraftPresentationSnapshot {
  draftId: string
  contentRevision: number
  coverImageUrl: string | null
  coverTitle: string | null
  description: string | null
  sellingPoint: string | null
  detailImages: string[] | null
  videoUrl: string | null
}

/**
 * PATCH `/recipe-designer/drafts/:id`
 *
 * 适用生命阶段 / 目标健康标签沿用既有草稿更新接口；
 * 它们不在产品展示 PATCH 的字段范围内。
 */
export interface UpdateDesignRecipeDraftPayload {
  name?: string
  scenario?: FediafDogScenario
  targetHealthTags?: string[]
  applicableLifeStages?: string[]
  notes?: string | null
}

/**
 * 上线检查问题归属，与后端 `LaunchReadinessScope` 对齐。
 *
 * COMMON = 公共门槛；PRESENTATION = 产品展示；CATALOG = 产品线分支；
 * ORDER = 订单分支。旧响应没有 scope 时按 COMMON 处理。
 */
export type LaunchReadinessScope =
  | 'COMMON'
  | 'PRESENTATION'
  | 'CATALOG'
  | 'ORDER'

/**
 * 上线检查（共享发布门槛）阻断项，与后端
 * `backend/src/domain/recipe-designer/launch-readiness.ts` 对齐。
 */
export type LaunchReadinessBlockerCode =
  | 'NAME_REQUIRED'
  | 'NO_INCLUDED_ITEMS'
  | 'TOTAL_WEIGHT_INVALID'
  | 'ENERGY_DENSITY_INVALID'
  | 'ASSESSMENT_UNAVAILABLE'
  | 'NUTRITION_REPORT_UNAVAILABLE'
  | 'SUPPLEMENT_TARGETS_REQUIRED'
  | 'PREPARATION_METHOD_REQUIRED'
  | 'PRODUCTION_STEPS_REQUIRED'
  | 'COVER_IMAGE_REQUIRED'
  | 'COVER_TITLE_REQUIRED'
  | 'DESCRIPTION_REQUIRED'
  | 'SELLING_POINT_REQUIRED'
  | 'APPLICABLE_LIFE_STAGES_REQUIRED'
  | 'ORDER_ID_REQUIRED'
  | 'ORDER_QUANTITY_INVALID'
  | 'CUSTOMER_DOG_REQUIRED'

/** 上线检查提醒项（只提示，不阻断） */
export type LaunchReadinessWarningCode =
  | 'REVIEW_REQUIRED'
  | 'MISSING_NUTRITION_DATA'
  | 'NUTRIENT_OUT_OF_RANGE'
  | 'TARGET_HEALTH_TAGS_MISSING'
  | 'AI_DELIVERY_WARNING'

export interface LaunchReadinessIssue<TCode extends string = string> {
  code: TCode
  message: string
  /** 问题归属；旧响应没有这个字段时按 COMMON 处理 */
  scope?: LaunchReadinessScope
  /** 相关原料项 id（整份草稿级别的问题没有这个字段） */
  itemId?: string
  /** 相关字段路径 / 字段名（便于后台定位） */
  field?: string
}

export type LaunchReadinessBlocker =
  LaunchReadinessIssue<LaunchReadinessBlockerCode>
export type LaunchReadinessWarning =
  LaunchReadinessIssue<LaunchReadinessWarningCode>

/** 上线检查概要：与发布 / 加入待提交使用同一份数字 */
export interface DraftLaunchReadinessSummary {
  /** 参与评估的原料项总数（含食材与补剂） */
  itemCount: number
  /** 参与评估的食材种类数（不含补剂） */
  foodItemCount: number
  totalWeightG: number
  energyDensityKcalPerKg: number | null
  /** 干物质基础能量密度；概要优先展示 */
  dryMatterEnergyDensityKcalPerKg: number | null
  /** 参与评估的补剂数 */
  supplementCount: number
  /** 有效制作步骤数 */
  stepCount: number
  /** 完整营养报告是否可生成（本次实时构建，不落库） */
  reportAvailable: boolean
  /** 草稿上是否已保存过营养报告（不自动生成） */
  reportGenerated: boolean
  /** 已保存报告是否基于旧内容版本（没有报告时为 false） */
  reportStale: boolean
}

/**
 * 草稿持久化营养报告（2026-10-22）。
 *
 * 报告内容与发布口径完全一致：原料清单 / 宏量营养分析 / 能量密度 /
 * 四类营养素分区。与后端 `buildPublishedNutritionReport` 对齐，
 * 前端只负责展示，不重新计算。
 */
export interface DraftNutritionReportIngredientRow {
  ingredientName: string
  /** 用量：食材为克数，补剂为粒 / 片等实际计量单位 */
  amountLabel: string
  weightPercentLabel: string
}

export interface DraftNutritionReportMacroRow {
  key: string
  name: string
  weightPercentLabel: string
  dryMatterLabel: string
  energyPercentLabel: string
}

export interface DraftNutritionReportEnergyDensityRow {
  label: string
  value: string
}

export interface DraftNutritionReportNutrientRow {
  key: string
  name: string
  unit: string
  minLabel: string
  maxLabel: string
  currentLabel: string
  dryMatterLabel: string
  /** COMPLIANT / DEFICIENT / EXCESS / MISSING_DATA 等 */
  status?: string
}

export interface DraftNutritionReportNutrientSection {
  key: string
  title: string
  dryMatterHeader: string
  rows: DraftNutritionReportNutrientRow[]
}

export interface DraftNutritionReport {
  ingredientRows: DraftNutritionReportIngredientRow[]
  macroRows: DraftNutritionReportMacroRow[]
  energyDensityRows: DraftNutritionReportEnergyDensityRow[]
  nutrientSections: Record<string, DraftNutritionReportNutrientSection>
}

/**
 * GET / POST `/recipe-designer/drafts/:id/nutrition-report` 共用响应。
 *
 * 从没生成过报告时 GET 返回 200 + `report: null`；
 * `stale` 表示报告生成后草稿又被修改过，需要重新生成。
 */
export interface DraftNutritionReportEnvelope {
  draftId: string
  /** ISO 时间；从未生成过为 null */
  generatedAt: string | null
  /** 报告对应的内容版本；从未生成过为 null */
  revision: number | null
  stale: boolean
  report: DraftNutritionReport | null
}

/** GET /recipe-designer/drafts/:id/launch-readiness */
export interface DraftLaunchReadiness {
  draftId: string
  /** 草稿所属系列；历史独立草稿为 null（抽屉据此决定能否改名/归类） */
  seriesId: string | null
  designMode: DesignRecipeDesignMode
  ready: boolean
  blockers: LaunchReadinessBlocker[]
  warnings: LaunchReadinessWarning[]
  summary: DraftLaunchReadinessSummary
}

/**
 * 产品线整系列分阶段发布（2026-10-22）。
 *
 * 与后端 `backend/src/domain/recipe-designer/series-release-readiness.ts` 对齐：
 *  · EMPTY  该阶段既没有设计稿，也没有阶段食谱；
 *  · DRAFT  有设计稿，但还没保存进系列仓库；
 *  · READY  系列仓库里已有该阶段 DRAFT，可随系列一起发布；
 *  · PUBLIC 系列仓库里已有该阶段 PUBLIC，已经发布。
 */
export type SeriesReleaseStageStatus = 'EMPTY' | 'DRAFT' | 'READY' | 'PUBLIC'

/**
 * 整条产品线的展示状态（2026-10-22 重新发布）。
 *
 * 由后端按系列 businessStatus + 各阶段待更新情况推导，只影响**按钮文案与提示**，
 * 不参与能不能发布的判断：NEEDS_UPDATE 的系列只要没有阻断项就可以直接重新发布。
 */
export type SeriesReleaseState =
  | 'UNPUBLISHED'
  | 'PUBLISHED'
  | 'NEEDS_UPDATE'

/** 发布问题归属：系列级设置 / 产品展示 / 单个生命阶段 */
export type SeriesReleaseIssueScope = 'SERIES' | 'PRESENTATION' | 'STAGE'

/** 阻断发布的问题（2026-10-26 起只剩封面图 / 一句话卖点两个门槛） */
export type SeriesReleaseBlockerCode =
  | 'COVER_IMAGE_REQUIRED'
  | 'SELLING_POINT_REQUIRED'
  | 'TAXONOMY_REQUIRED'

/** 只提醒、不阻断的问题（未设置封面角标时封面左下角为空） */
export type SeriesReleaseWarningCode = 'COVER_BADGE_MISSING'

export interface SeriesReleaseIssue<TCode extends string = string> {
  code: TCode
  message: string
  scope: SeriesReleaseIssueScope
  /** 相关字段名，便于后台定位到具体输入框 */
  field?: string
  /** 相关生命阶段（SERIES / PRESENTATION 级问题没有这个字段） */
  stageCode?: string
}

export type SeriesReleaseBlocker = SeriesReleaseIssue<SeriesReleaseBlockerCode>
export type SeriesReleaseWarning = SeriesReleaseIssue<SeriesReleaseWarningCode>

/** 一个生命阶段在系列仓库里的现状 */
export interface SeriesReleaseStageReadiness {
  stageCode: string
  label: string
  status: SeriesReleaseStageStatus
  /** 该阶段最新一条系列仓库食谱（优先 PUBLIC，其次 DRAFT）的业务 id */
  latestRecipeId?: string | null
  /** 该阶段最新一版食谱行的版本号（不区分 DRAFT / PUBLIC） */
  latestRecipeVersion?: number | null
  /** 该阶段最近一次 PUBLIC 的版本号（从未发布过为 null） */
  publishedRecipeVersion?: number | null
  /** 是否有比已发布版本更新的 DRAFT 等待发布 */
  hasPendingUpdate?: boolean
  /** 该阶段当前可编辑的设计草稿 id（没有草稿时为 null） */
  designDraftId?: string | null
  /**
   * 本次发布 / 更新是否可以操作：
   *  · READY（已入库、待发布）；
   *  · PUBLIC 且 hasPendingUpdate（已上线、有更新草稿）。
   */
  actionable: boolean
}

/** 系列级产品展示资料（发布时复制到每条阶段食谱） */
export interface SeriesReleasePresentation {
  coverImageUrl: string | null
  coverTitle: string | null
  sellingPoint: string | null
  targetHealthTags: string[]
  /** 系列封面角标（合规词表名称，只读回传，便于预览） */
  coverBadges: string[]
}

/** GET /recipe-designer/series/:seriesId/release-readiness */
export interface SeriesReleaseReadiness {
  seriesId: string
  designMode: string
  /** 系列业务状态 DRAFT | PUBLIC | PRIVATE_CUSTOM */
  businessStatus: string
  /** 整条系列的展示状态：未上线 / 已上线（最新）/ 待重新发布 */
  releaseState: SeriesReleaseState
  /** 展示资料是否齐全（封面图 + 一句话卖点） */
  ready: boolean
  /** 是否可点「发布 / 更新」：展示资料齐全，且至少有一个可操作阶段 */
  canRelease: boolean
  /** 全量阶段（便于后台展示「其它已设计阶段」） */
  stages: SeriesReleaseStageReadiness[]
  presentation: SeriesReleasePresentation
  blockers: SeriesReleaseBlocker[]
  warnings: SeriesReleaseWarning[]
  /** 是否存在「已发布过、但又有更新草稿」的阶段 */
  hasPendingUpdates: boolean
  /** 有待更新草稿的阶段代码（按阶段顺序） */
  pendingStageCodes: string[]
  summary: {
    totalStageCount: number
    /** READY 阶段数（待发布） */
    publishableStageCount: number
    /** 有待更新草稿的阶段数 */
    pendingStageCount: number
    publishedStageCount: number
    /** 已上线且没有待更新草稿的阶段数 */
    upToDateStageCount: number
    /** 有设计稿或已有阶段食谱的阶段数（不含 EMPTY） */
    designedStageCount: number
    /** 可操作阶段数（READY + PUBLIC 待更新） */
    actionableStageCount: number
  }
}

/**
 * PATCH `/recipe-designer/series/:seriesId/release-settings`
 *
 * patch semantics：只传需要修改的字段；显式 null 表示清空。
 */
export interface UpdateRecipeSeriesReleaseSettingsPayload {
  coverImageUrl?: string | null
  coverTitle?: string | null
  sellingPoint?: string | null
}

/** 发布设置保存后的响应（只返回系列发布相关字段） */
export interface SeriesReleaseSettingsSnapshot {
  seriesId: string
  name: string
  designMode: string
  businessStatus: string
  requiredLifeStages: string[]
  coverImageUrl: string | null
  coverTitle: string | null
  sellingPoint: string | null
  targetHealthTags: string[]
  updatedAt: string
}

/** POST /recipe-designer/series/:seriesId/release */
export interface SeriesReleaseResult {
  seriesId: string
  name: string
  businessStatus: string
  /** 本次实际发布 / 更新的阶段代码（首次发布=当前全部 READY） */
  releasedStageCodes: string[]
  /** 本次从 DRAFT 变成 PUBLIC 的食谱行数 */
  publishedRecipeCount: number
  /** 本次实际写入（含已公开行刷新展示资料）的食谱行数 */
  updatedRecipeCount: number
  releasedAt: string
}

/**
 * POST `/recipe-designer/series/:seriesId/unpublish`（仅管理员）
 *
 * 只把该系列所有 PUBLIC 食谱行改回 DRAFT，并把系列 businessStatus 设为 DRAFT；
 * 设计稿、版本历史、发布记录全部保留，之后仍可重新发布。
 */
export interface SeriesUnpublishResult {
  seriesId: string
  name: string
  businessStatus: string
  releaseState: SeriesReleaseState
  /** 本次从 PUBLIC 变成 DRAFT 的食谱行数 */
  unpublishedRecipeCount: number
  /** 下架后仍为 PUBLIC 的食谱行数（事务内应恒为 0） */
  remainingPublicRecipeCount: number
  unpublishedAt: string
}

/** AI 生成系列封面的结果（2026-10-27，POST /admin/recipe-series/:id/ai-cover） */
export interface SeriesAiCoverResult {
  /** 一定是 COS 地址（已转存），不是智谱临时链接 */
  url: string
  provider: string
  model: string
  /** 实际喂给提示词的食材（最多 5 个） */
  foodNames: string[]
}

/** 原料预处理来源：AUTO = 系统带出；MANUAL = 人工修改 */

export interface DesignerItem {
  id: string
  name?: string
  ingredientId?: string
  ingredientName?: string
  ingredientType?: string
  ingredient?: {
    id?: string
    name?: string
    type?: string
    unitDisplayLabel?: string | null
    purchaseUnit?: string | null
    properties?: Record<string, unknown> | null
  } | null
  nutritionFoodId?: string
  nutritionFoodName?: string
  nutritionProfileDisplayName?: string
  nutritionFood?: {
    id?: string
    name?: string
    nameEn?: string | null
    displayNameZh?: string | null
    preparationState?: string | null
    category?: string | null
    /** 档案营养数据（getDraft 内嵌，用于计算补剂实际添加浓度） */
    nutritionData?: unknown
    /** 补剂默认目标营养素（getDraft 内嵌） */
    defaultSupplementTargets?: Array<{
      fieldPath: string
      label?: string | null
      unit?: string | null
    }> | null
    mappings?: Array<{
      ingredientId?: string | null
      isPrimary?: boolean
      ingredient?: {
        id?: string
        name?: string
        type?: string
        unitDisplayLabel?: string | null
        purchaseUnit?: string | null
      } | null
    }>
  } | null
  weightG?: number
  includeInAssessment?: boolean
  ratioPercent?: number
  preparationMethod?: string
  /** 后端解析后的烹饪方式文字名（UUID 已解析为名称，旧文本原样保留） */
  preparationMethodLabel?: string | null
  /** 原料预处理补充说明（2026-10-22） */
  /** 原料预处理来源：AUTO = 系统带出；MANUAL = 人工修改 */
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
  /** 补剂目标营养素定义与计算值 */
  supplementTargets?: DesignerSupplementTarget[] | null
  sortOrder?: number
}

export interface DesignRecipeDraftDetail {
  id: string
  name: string
  version: number
  status: string
  reviewStatus: string
  reviewNote?: string | null
  fediafDogScenario: FediafDogScenario
  totalWeightG: number
  energyDensityKcalPerKg?: number | null
  targetHealthTags: string[]
  applicableLifeStages: string[]
  notes?: string | null
  /**
   * 产品展示（2026-10-22）：公布到产品线 / 加入本单待提交前统一要求。
   * 旧草稿这些字段可能不存在，统一按 null 处理。
   */
  coverImageUrl?: string | null
  coverTitle?: string | null
  description?: string | null
  sellingPoint?: string | null
  /** 详情图 URL 数组（后端存 JSON，读取时做数组归一化） */
  detailImages?: string[] | null
  videoUrl?: string | null
  /** 订单设计绑定的顾客爱犬（产品线设计为 null） */
  customerDogId?: string | null
  createdBy?: string
  isCompliant?: boolean
  assessmentSummary?: any
  seriesId?: string
  seriesLifeStage?: string
  series?: {
    id: string
    name: string
    referenceDogId?: string | null
    /** 系列设计模式；历史系列缺省按产品线处理 */
    designMode?: DesignRecipeDesignMode | null
    /** 订单设计上下文（产品线系列为 null） */
    orderId?: string | null
    orderQuantity?: number | null
  } | null
  items: DesignerItem[]
  /** 可选烹饪方式（后端真实列表） */
}

/**
 * 本地评估输入（GET /recipe-designer/drafts/:id/assessment-inputs）
 */
export interface AssessmentTarget {
  nutrientKey: string
  label: string
  category: 'MACRO' | 'AMINO_ACID' | 'FATTY_ACID' | 'MINERAL' | 'VITAMIN' | 'COMBINATION' | 'RATIO'
  expressionBasis: 'PER_1000_KCAL_ME' | 'PER_MJ_ME' | 'PER_100G_DRY_MATTER' | 'RATIO'
  unit: string
  minValue: number | null
  maxValue: number | null
  minValueNote?: string | null
  maxValueNote?: string | null
  maxValueLabel?: string | null
  excludeFromAttention?: boolean
  fieldPaths: readonly string[]
  calculation?: 'SUM' | 'RATIO'
}

export interface AssessmentInputItem {
  id: string
  name: string
  ingredientType?: string | null
  weightG: number
  nutritionProfile: unknown
}

export interface DraftAssessmentInputs {
  draftId: string
  name: string
  scenario: FediafDogScenario
  nutritionStandard: string
  targets: AssessmentTarget[]
  items: AssessmentInputItem[]
}

/**
 * 最近一次就诊（GET /recipe-designer/dogs/:dogId/design-insight）。
 *
 * 2026-10-21 后端只返回**结论字段**：原始化验数值（`labValues` / `vitals`）
 * 既不查询也不返回，设计面板也不应展示。
 */
export interface DogLatestMedicalRecord {
  /** ISO 时间字符串 */
  visitDate: string
  diagnosis: string
  status: string
  chiefComplaint?: string
  exams?: string
  attachments: string[]
}

/**
 * 最近一次体检（GET /recipe-designer/dogs/:dogId/design-insight）。
 * 同样只有结论字段，不包含原始化验数值。
 */
export interface DogLatestCheckupRecord {
  /** ISO 时间字符串 */
  checkupDate: string
  checkupType: string
  findings?: string
  attachments: string[]
}

/**
 * 结构化过敏明细（2026-10-04）。
 *
 * 设计面板只把它当作「档案里记了哪些过敏原」，不展示可信度、
 * 也不据此推断风险 —— 判断留给营养师。
 */
export interface DogStructuredAllergy {
  allergen: string
  certainty: string
  source: string
}

/**
 * 爱犬设计洞察（GET /recipe-designer/dogs/:dogId/design-insight）
 */
export interface DogDesignInsight {
  dog: {
    id: string
    name: string
    avatarUrl: string | null
    ownerId: string
    currentWeightKg: number
    breedName: string | null
    lifeStageLabel: string | null
    /** 性别：MALE / FEMALE */
    gender: string | null
    /** 由生日推算的月龄 */
    ageMonths: number | null
    /** 是否绝育 */
    isNeutered: boolean | null
    /** 体况评分 1-9 */
    bcsScore: number | null
    /** 活动量：RESTING / LOW / NORMAL / HIGH / WORKING */
    activityLevel: string | null
    /** 每日餐数 */
    mealsPerDay: number | null
    /** 零食输入模式：ESTIMATE_LEVEL / EXACT_KCAL */
    treatInputMode: string | null
    /** 零食等级：NONE / LOW / MODERATE / HIGH */
    treatLevel: string | null
    /** 精确模式下每日零食热量 kcal */
    manualTreatKcal: number | null
    /** 每日目标能量 kcal */
    targetFoodKcal: number | null
    allergyFoods: string | null
    /**
     * 顾客在健康档案 / 定制单里填写的结构化过敏记录（只读）。
     *
     * 与 allergyFoods 的区别：allergyFoods 是员工在设计备注里维护的旧文本字段，
     * 顾客端没有任何入口；这一份才是顾客自己填的。
     * 2026-09-27 之前设计面板只看 allergyFoods，导致顾客声明的过敏对营养师不可见。
     */
    structuredAllergies: string[]
    /**
     * 带来源与可信度的过敏明细（2026-10-04 第四期）。
     *
     * 设计面板只读取 `allergen`（事实），不再展示 certainty，
     * 也不再把记录分成确诊 / 可疑 / 已排除几档。
     */
    allergyDetail?: DogStructuredAllergy[]
    pickyFoods: string | null
    preferredFoods: string | null
    medicalHistory: string | null
  }
  /**
   * 最近一次就诊（2026-10-21）：只有日期与诊断等结论字段。
   * 没有记录时后端返回 null。
   */
  latestMedicalRecord: DogLatestMedicalRecord | null
  /**
   * 最近一次体检（2026-10-21）：只有日期、类型与结论。
   * 没有记录时后端返回 null。
   */
  latestCheckupRecord: DogLatestCheckupRecord | null
  /** 这只狗实际使用过的食谱：成品鲜食订单 + 已关联食谱的定制订单 */
  historyRecipes: Array<{
    id: string
    name: string
    kind: 'FINISHED' | 'CUSTOM' | 'ORDER'
    date: string | null
    status: string
    ingredients: Array<{ name: string; amount: string }>
    macros: Array<{
      name: string
      dryMatter: string
      energyPercent: string
      weightPercent: string
    }>
  }>
  /** 当前订单内、除当前草稿外的其他食谱（2026-10-22） */
  sameOrderRecipes: Array<{
    id: string
    name: string
    kind: 'FINISHED' | 'CUSTOM' | 'ORDER'
    date: string | null
    status: string
    ingredients: Array<{ name: string; amount: string }>
    macros: Array<{
      name: string
      dryMatter: string
      energyPercent: string
      weightPercent: string
    }>
  }>
  designHistory: {
    designCount: number
    seriesNames: string[]
    ingredients: Array<{
      name: string
      count: number
      lastUsedAt: string | null
      ingredientType: string | null
      isSupplement: boolean
    }>
    /** 最近 90 天订单中实际吃过（至少进入冷冻）的食材，按标准原料聚合，仅食材类 */
    recentEatenIngredients: Array<{
      ingredientId: string
      name: string
      count: number
      lastUsedAt: string | null
    }>
  }
  orderSummary: {
    orderCount: number
    recipeNames: string[]
    customRecipeCount: number
  }
  /**
   * 顾客最近一笔「食谱定制」订单里填的内容（2026-09-28 新增）。
   *
   * 设计面板只呈现事实：主蛋白、肠胃情况、当前饲喂、定制原因、
   * 过敏原文与额外备注；目标/健康管理/疾病/喜好等字段仍由后端返回，
   * 但面板不再据此做判断或给建议。
   */
  customRecipeOrder: {
    orderId: string
    status: string
    targetGoal: string
    needsHealthManagement: boolean
    additionalNotes: string | null
    allergies: string[]
    /** 过敏自由文本（2026-10-19）：订单快照，设计器原文展示 */
    allergyText?: string | null
    medicalConditions: string[]
    preferredIngredients: string[]
    dislikedIngredients: string[]
    /** 饲喂历史（2026-10-19 P0） */
    currentFoodMain?: string | null
    currentFoodOther?: string | null
    changeReasons?: string[]
    changeReasonOther?: string | null
    stomachConditions?: string[]
    stomachOther?: string | null
    /** HAS_ALLERGY / NO_ALLERGY / UNKNOWN */
    allergyStatus?: string | null
    /** 顾客随单上传的附件（后端签名 URL） */
    attachments: string[]
    /** 本单份数（1–5，老订单为 1；2026-10-21） */
    recipeQuantity: number
    /** 顾客选择的主蛋白 code（空数组 = 由营养师搭配；2026-10-21） */
    requestedProteinCodes: string[]
    createdAt: string | null
  } | null
}

export interface UpdateDogDesignNotesPayload {
  allergyFoods?: string | null
  pickyFoods?: string | null
  preferredFoods?: string | null
  medicalHistory?: string | null
}

export interface IngredientNutrientMatch {
  nutrientKey: string
  label: string
  amount: number
  unit: string
  basis: string
  basisLabel: string
  displayText: string
  score?: number
}

export interface IngredientNutritionProfileOption {
  mappingId: string
  nutritionFoodId: string
  name: string
  nameEn?: string | null
  category?: string
  dataSource?: string
  status?: string
  yieldRate?: number
  isPrimary?: boolean
  notes?: string | null
  nutrientMatch?: IngredientNutrientMatch
}

export interface RecipeDesignerIngredientOption {
  id: string
  name: string
  type?: string
  unitDisplayLabel?: string | null
  purchaseUnit?: string
  properties?: Record<string, unknown> | null
  brand?: string | null
  productModel?: string | null
  defaultNutritionFoodId?: string | null
  nutrientMatch?: IngredientNutrientMatch
  nutritionProfiles: IngredientNutritionProfileOption[]
}

export interface IngredientOptionListResponse {
  data: RecipeDesignerIngredientOption[]
  supplementData?: RecipeDesignerIngredientOption[]
  foodData?: RecipeDesignerIngredientOption[]
  supplementTotal?: number
  foodTotal?: number
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  /** 食材 CFCT 分类列表（properties.cfct_class） */
  foodCategories?: string[]
  /** 补剂分类列表（properties.category_type） */
  supplementCategories?: string[]
}

export type SupplementNutritionBasisType =
  | 'PER_1_G'
  | 'PER_100_G'
  | 'PER_1_ML'
  | 'PER_100_ML'
  | 'PER_SERVING'

export type SupplementUsageUnit = 'g' | 'ml' | '粒' | '片' | '胶囊' | '平勺' | '份'

export interface SupplementLabelExtractionDraft {
  ingredientName?: string
  name?: string
  profileName?: string
  basisType?: SupplementNutritionBasisType
  usageUnit?: SupplementUsageUnit
  servingWeightG?: number
  densityGPerMl?: number
  nutrients: Record<string, number | string | null | undefined>
  rawIngredientsText?: string
  ocrText?: string
  ocrConfidence?: number
  warnings?: string[]
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW'
  imageUrl?: string
  imageKey?: string
}

// ---------------------------------------------------------------------------
// 食谱设计 Agent（P2 抽屉）
// ---------------------------------------------------------------------------

export type RecipeAgentSessionStatus =
  | 'RUNNING'
  | 'WAITING_USER'
  | 'COMPLETED'
  | 'STOPPED'
  | 'FAILED'
  | 'INTERRUPTED'

export type RecipeAgentMessageRole = 'USER' | 'ASSISTANT' | 'TOOL'

export type RecipeAgentApprovalType =
  | 'COMPLIANCE_EXCEPTION'
  | 'CATEGORY_OMISSION'

export type RecipeAgentApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface RecipeAgentApproval {
  id: string
  sessionId: string
  type: RecipeAgentApprovalType
  status: RecipeAgentApprovalStatus
  reason: string
  detail?: unknown
  decidedBy?: string | null
  decidedAt?: string | null
  createdAt: string
}

export interface RecipeAgentSession {
  id: string
  designRecipeId: string
  status: RecipeAgentSessionStatus
  skillName: string
  skillVersion: string
  stepCount: number
  promptTokens: number
  completionTokens: number
  /** 本轮开始时的累计快照：本次 = 当前累计 - 本轮起点（老响应可能没有） */
  runStartStepCount?: number | null
  runStartPromptTokens?: number | null
  runStartCompletionTokens?: number | null
  startedAt: string
  endedAt: string | null
  lastError: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface RecipeAgentMessage {
  id: string
  sessionId: string
  seq: number
  role: RecipeAgentMessageRole
  content: string | null
  toolName?: string | null
  toolArgs?: unknown
  toolResult?: unknown
  createdAt: string
}

/**
 * Agent 交付确认卡。
 *
 * 后端在 Agent 产出交付内容时生成；`summary` 是给人工复核的交付说明，
 * `warnings` 是必须让人看见但不能自动阻断的提醒。
 */
export interface RecipeAgentDelivery {
  summary: string
  warnings: string[]
  /** 交付内容对应的草稿内容版本 */
  contentRevision: number
  /** ISO 时间 */
  createdAt: string
}

/** 会话所属的设计模式：CATALOG = 产品线；ORDER = 本单定制 */
export type RecipeAgentSessionMode = {
  designMode: 'CATALOG' | 'ORDER'
  /** ORDER 模式绑定的订单号；产品线设计缺省 / null */
  orderId?: string | null
}

export interface RecipeAgentSessionView {
  session: RecipeAgentSession
  messages: RecipeAgentMessage[]
  approvals?: RecipeAgentApproval[]
  /** 会话所属的设计模式；旧响应没有这个字段时按产品线处理 */
  mode?: RecipeAgentSessionMode | null
  /** 最近一次交付确认卡；没有交付过时为 null / 缺省 */
  delivery?: RecipeAgentDelivery | null
}

// ===== 需求分类（2026-10-26 第一阶段）=====

export interface TaxonomyNodeView {
  id: string
  kindId: string
  parentId: string | null
  name: string
  definition: string
  sort: number
  status: 'ACTIVE' | 'DISABLED'
  /** 直接归到本节点的系列数 */
  seriesCount: number
  /** 含子孙系列的合计，父节点用 */
  rollupSeriesCount: number
  children: TaxonomyNodeView[]
}

export interface TaxonomyKindView {
  id: string
  code: string
  name: string
  sort: number
  nodes: TaxonomyNodeView[]
  rollupSeriesCount: number
}

export interface TaxonomySeriesLink {
  kindId: string
  kindCode: string
  kindName: string
  nodeId: string
  nodeName: string
}

export interface TaxonomySeriesItem {
  id: string
  name: string
  businessStatus: string
  referenceDogName: string | null
  updatedAt: string
  links: TaxonomySeriesLink[]
  /** 还没归的分类 code，顺序与分类 sort 一致 */
  missingKindCodes: string[]
}
