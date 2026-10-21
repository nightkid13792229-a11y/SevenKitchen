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
    displayNameZh?: string | null
    preparationState?: string | null
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
  nutrientTargetKey?: string | null
  nutrientTargetValue?: number | null
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
  createdBy?: string
  isCompliant?: boolean
  assessmentSummary?: any
  seriesId?: string
  seriesLifeStage?: string
  series?: {
    id: string
    name: string
    referenceDogId?: string | null
  } | null
  items: DesignerItem[]
  /** 可选烹饪方式（后端真实列表） */
  preparationMethodOptions?: Array<{ id: string; name: string }>
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
    kind: 'FINISHED' | 'CUSTOM'
    date: string | null
    status: string
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
  aiEnabled: boolean
}

export interface UpdateDogDesignNotesPayload {
  allergyFoods?: string | null
  pickyFoods?: string | null
  preferredFoods?: string | null
  medicalHistory?: string | null
}

/**
 * AI 设计建议（POST /recipe-designer/dogs/:dogId/design-insight/ai-suggest）
 */
export interface AiDesignSuggestion {
  summary: string
  ingredientSuggestions: Array<{ name: string; reason: string }>
  avoidIngredients: Array<{ name: string; reason: string }>
  nutritionFocus: Array<{ point: string; reason: string }>
  supplementSuggestions: Array<{ name: string; reason: string }>
  reuseSuggestions: Array<{ name: string; reason: string }>
  warnings: string[]
  provider: string
}

/**
 * AI 设计建议四步向导类型（对应 backend recipe-ai-wizard）
 */

// 步骤一：营养方案
export interface NutritionPlanCitation {
  id: string
  source: string
  chapter?: string
}

export interface NutritionFocusPoint {
  point: string
  reason: string
  citationIds?: string[]
}

export interface MacroRatioPlan {
  protein: string
  fat: string
  carbohydrate: string
  note?: string
}

export interface NutritionPlanResult {
  summary: string
  caloriesPerDayKcal: number | null
  caloriesBasis: string
  mealsPerDay: number | null
  macroRatio: MacroRatioPlan | null
  nutritionFocus: NutritionFocusPoint[]
  precautions: NutritionFocusPoint[]
  citations: NutritionPlanCitation[]
  warnings: string[]
}

// 步骤二：食材推荐
export interface IngredientRecommendationItem {
  name: string
  category: string
  categoryLabel: string
  inLibrary: boolean
  ingredientId?: string
  nutritionFoodId?: string
  suggestedWeightG: number | null
  reason: string
  avoidRecent?: boolean
}

export interface IngredientRecommendationResult {
  framework: {
    templateName: string
    covered: string[]
    missing: string[]
    note?: string
  }
  recommendations: IngredientRecommendationItem[]
  avoidIngredients: Array<{ name: string; reason: string }>
  diversityNotes: string[]
  warnings: string[]
}

// 步骤三：食谱审核
export type ReviewIssueLevel = 'error' | 'warning' | 'info'
export type ReviewIssueCategory =
  | 'structure'
  | 'ratio'
  | 'diversity'
  | 'plan'
  | 'nutrition'

export interface ReviewIssue {
  level: ReviewIssueLevel
  category: ReviewIssueCategory
  message: string
  suggestion?: string
  suggestedIngredient?: {
    name: string
    category?: string
    weightG?: number
  }
}

export interface RecipeReviewResult {
  overall: 'pass' | 'attention' | 'risk'
  summary: string
  issues: ReviewIssue[]
  planDeviations: Array<{ item: string; expected: string; actual: string }>
  warnings: string[]
}

// 步骤四：制作 SOP
export interface SopStep {
  title: string
  description: string
  ingredients?: string[]
  temperature?: string
  duration?: string
  equipment?: string
  qualityCheck?: string
}

export interface SopStage {
  stage: string
  steps: SopStep[]
}

export interface SopResult {
  production: SopStage[]
  customer: SopStage[]
  warnings: string[]
}

// 向导持久化数据（GET /recipe-designer/drafts/:id/ai-design-data）
export interface RecipeAiDesignData {
  nutritionPlan?: {
    result: NutritionPlanResult
    accepted: boolean
    acceptedAt?: string
    note?: string
  } | null
  nutritionPlanHistory: Array<{
    result: NutritionPlanResult
    note?: string
    createdAt: string
  }>
  ingredientRecommendations: Array<{
    result: IngredientRecommendationResult
    createdAt: string
  }>
  reviewResults: Array<{
    result: RecipeReviewResult
    createdAt: string
  }>
  sop?: {
    result: SopResult
    accepted: boolean
    acceptedAt?: string
  } | null
  updatedAt: string
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
