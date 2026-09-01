/**
 * AI 设计建议四步向导的结果类型定义。
 * 四步：营养方案 → 食材推荐 → 食谱审核 → 制作 SOP。
 */

// ---------- 步骤一：营养方案 ----------

export interface NutritionPlanCitation {
  /** 知识条目 ID（如 renal-001），来自结构化知识库 */
  id: string;
  source: string;
  chapter?: string;
}

export interface NutritionFocusPoint {
  point: string;
  reason: string;
  /** 引用的知识条目 ID */
  citationIds?: string[];
}

export interface MacroRatioPlan {
  protein: string;
  fat: string;
  carbohydrate: string;
  note?: string;
}

export interface NutritionPlanResult {
  summary: string;
  /** 每日目标热量 kcal（可能为 null，当数据不足时） */
  caloriesPerDayKcal: number | null;
  /** 热量计算依据说明 */
  caloriesBasis: string;
  mealsPerDay: number | null;
  macroRatio: MacroRatioPlan | null;
  nutritionFocus: NutritionFocusPoint[];
  precautions: NutritionFocusPoint[];
  citations: NutritionPlanCitation[];
  warnings: string[];
}

// ---------- 步骤二：食材推荐 ----------

export interface IngredientRecommendationItem {
  name: string;
  /** 食材大类：MEAT / ORGAN / SEAFOOD / VEGETABLE / FRUIT / GRAIN / DAIRY / EGG / OIL / SUPPLEMENT / OTHER */
  category: string;
  categoryLabel: string;
  /** 原料库中是否已有该食材 */
  inLibrary: boolean;
  ingredientId?: string;
  nutritionFoodId?: string;
  /** AI 建议用量 g（可为 null） */
  suggestedWeightG: number | null;
  reason: string;
  /** 是否因近期吃过而建议间隔使用 */
  avoidRecent?: boolean;
}

export interface IngredientRecommendationResult {
  framework: {
    templateName: string;
    covered: string[];
    missing: string[];
    note?: string;
  };
  recommendations: IngredientRecommendationItem[];
  avoidIngredients: Array<{ name: string; reason: string }>;
  diversityNotes: string[];
  warnings: string[];
}

// ---------- 步骤三：食谱审核 ----------

export type ReviewIssueLevel = 'error' | 'warning' | 'info';
export type ReviewIssueCategory =
  | 'structure'
  | 'ratio'
  | 'diversity'
  | 'plan'
  | 'nutrition';

export interface ReviewIssue {
  level: ReviewIssueLevel;
  category: ReviewIssueCategory;
  message: string;
  suggestion?: string;
  suggestedIngredient?: {
    name: string;
    category?: string;
    weightG?: number;
  };
}

export interface RecipeReviewResult {
  overall: 'pass' | 'attention' | 'risk';
  summary: string;
  issues: ReviewIssue[];
  planDeviations: Array<{
    item: string;
    expected: string;
    actual: string;
  }>;
  warnings: string[];
}

// ---------- 步骤四：制作 SOP ----------

export interface SopStep {
  title: string;
  description: string;
  ingredients?: string[];
  temperature?: string;
  duration?: string;
  equipment?: string;
  qualityCheck?: string;
}

export interface SopStage {
  stage: string;
  steps: SopStep[];
}

export interface SopResult {
  production: SopStage[];
  customer: SopStage[];
  warnings: string[];
}

// ---------- 向导持久化（配方草稿上的 AI 设计数据） ----------

export interface RecipeAiDesignData {
  /** 当前营养方案（认可后保存） */
  nutritionPlan?: {
    result: NutritionPlanResult;
    accepted: boolean;
    acceptedAt?: string;
    note?: string;
  } | null;
  /** 营养方案历史版本（留痕） */
  nutritionPlanHistory: Array<{
    result: NutritionPlanResult;
    note?: string;
    createdAt: string;
  }>;
  /** 食材推荐结果（可多轮） */
  ingredientRecommendations: Array<{
    result: IngredientRecommendationResult;
    createdAt: string;
  }>;
  /** 审核记录 */
  reviewResults: Array<{
    result: RecipeReviewResult;
    createdAt: string;
  }>;
  /** 制作 SOP */
  sop?: {
    result: SopResult;
    accepted: boolean;
    acceptedAt?: string;
  } | null;
  updatedAt: string;
}
