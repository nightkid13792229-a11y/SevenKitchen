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
    pickyFoods: string | null
    preferredFoods: string | null
    medicalHistory: string | null
  }
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
