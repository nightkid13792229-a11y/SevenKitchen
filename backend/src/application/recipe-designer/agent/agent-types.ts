/**
 * 食谱 AI Agent 的共享类型（P0a Task 2）。
 *
 * 依据 `docs/superpowers/specs/2026-10-24-ai-recipe-design-agent-design.md`
 * 第 5 节「工具与边界」：工具只读写当前这一份草稿，读目录/原料库只拿证据。
 *
 * 这里只有类型，没有逻辑；后续 Task 3–6 直接复用。
 */
import type { FoodCategory } from '../../../domain/recipe-designer/food-category-map';

/** 草稿里的一条原料。 */
export interface AgentDraftItem {
  id: string;
  ingredientId: string | null;
  nutritionFoodId: string;
  name: string;
  cfctClass: string | null;
  nutritionCategory: string | null;
  category: FoodCategory;
  weightG: number;
  ratioPercent: number | null;
  preparationMethod: string | null;
  preparationNote: string | null;
}

/** 评估报告里的一条指标。 */
export interface AgentAssessmentEntry {
  key: string;
  label: string;
  status: 'COMPLIANT' | 'DEFICIENT' | 'EXCESS' | 'MISSING_DATA' | 'INFO';
  value: number | null;
  min: number | null;
  max: number | null;
  marginPercent: number | null;
}

/** 某一份草稿在某一个内容版本上的评估结果。 */
export interface AgentAssessmentView {
  contentRevision: number;
  compliant: number;
  deficient: number;
  excess: number;
  missingData: number;
  entries: AgentAssessmentEntry[];
}

/** `get_draft` 返回的完整草稿快照。 */
export interface AgentDraftSnapshot {
  draftId: string;
  seriesId: string | null;
  name: string;
  scenario: string;
  contentRevision: number;
  totalWeightG: number;
  items: AgentDraftItem[];
  copy: {
    coverTitle: string | null;
    sellingPoint: string | null;
    description: string | null;
    targetHealthTags: string[];
  };
  productionSteps: AgentProductionStep[];
  lastAssessment: AgentAssessmentView | null;
  /** 湿基脂肪 / 水分百分比；只给健康标签策略用，读工具不展示。 */
  nutritionSummary?: {
    fatWetPercent: number | null;
    moisturePercent: number | null;
  };
  /** 菜品里出现的动物物种（去重）；只给健康标签策略用，读工具不展示。 */
  animalSpecies?: string[];
  /**
   * 是否有 PROTEIN / ORGAN 项识别不出物种；只给健康标签策略用。
   * true 时「单一动物蛋白」必须 fail closed。
   */
  unknownAnimalProtein?: boolean;
}

/** `set_copy` 的字段白名单；只传要改的字段。 */
export interface AgentCopyPatch {
  name?: string;
  coverTitle?: string;
  sellingPoint?: string;
  description?: string;
  targetHealthTags?: string[];
}

/** 结构化制作步骤。 */
export interface AgentProductionStep {
  sortOrder: number;
  instruction: string;
  duration?: string | null;
  temperature?: string | null;
  equipment?: string | null;
}

/**
 * 候选原料的关键营养摘要（每 100g）。
 *
 * 有它，模型在 `search_ingredients` 阶段就能比较蛋白/脂肪/钙/磷，
 * 不用为每个候选再调一次 `get_ingredient`；详情留给真正要下锅的原料。
 */
export interface AgentIngredientKeyNutrients {
  proteinPer100g: number | null;
  fatPer100g: number | null;
  calciumMgPer100g: number | null;
  phosphorusMgPer100g: number | null;
}

/** `search_ingredients` 的候选原料（只含真实、启用、营养档案已验证的原料）。 */
export interface AgentIngredientCandidate {
  ingredientId: string;
  nutritionFoodId: string;
  name: string;
  nutritionProfileName: string;
  type: 'FOOD' | 'SUPPLEMENT';
  cfctClass: string | null;
  nutritionCategory: string | null;
  verified: boolean;
  keyNutrients?: AgentIngredientKeyNutrients;
}

/**
 * 营养值的计量基准。
 *
 * 补剂的浓度必须结合基准看：`PER_SERVING` + `usageUnit='粒'` 表示
 * `nutritionSummary` 里是“每粒”的量；`PER_100_G` 表示每 100g。
 */
export interface AgentIngredientNutritionBasis {
  basisType: string | null;
  servingWeightG: number | null;
  usageUnit: string | null;
}

/** `get_ingredient` 的原料详情。 */
export interface AgentIngredientDetail extends AgentIngredientCandidate {
  /** 七类判定结果；搜索时用来过滤，详情里直接给模型看。 */
  category: FoodCategory;
  /**
   * 营养摘要。食物 = 宏量（`moisture`/`crudeProtein`/...）；
   * 补剂 = 宏量 + `minerals.*` / `vitamins.*` / `aminoAcids.*` / `fattyAcids.*`。
   */
  nutritionSummary: Record<string, number | null>;
  /** 仅补剂返回：这些数值是每 100g、每 1g 还是每粒/每份。 */
  nutritionBasis?: AgentIngredientNutritionBasis;
  allergenNames: string[];
  preparationMethods: string[];
  pricePerPurchaseUnit: number | null;
  purchaseUnit: string | null;
}

/** 目录里与当前草稿有重合的一道菜。 */
export interface AgentCatalogUsageRecipe {
  recipeId: string;
  name: string;
  mainProteinName: string | null;
  overlappingCategories: FoodCategory[];
  overlappingIngredientNames: string[];
}

/** `get_catalog_usage` 的目录证据，只给事实，不下结论。 */
export interface AgentCatalogUsage {
  totalPublishedRecipes: number;
  mainProteinCount: number;
  recipes: AgentCatalogUsageRecipe[];
}

/** 所有工具统一使用的错误码；英文大写，给人看的话用中文。 */
export type AgentToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_WEIGHT'
  | 'INGREDIENT_NOT_FOUND'
  | 'DRAFT_EMPTY'
  | 'COPY_FORBIDDEN_CLAIM'
  | 'TAG_NOT_ALLOWED'
  | 'ASSESSMENT_STALE'
  | 'READY_BLOCKED'
  | 'CONTROL_NOT_AVAILABLE';

/**
 * 端口层带错误码的异常。
 *
 * 适配器只抛这个异常表达“业务校验失败”；工具边界据此保留 `code`
 * （P0b-2b Task 4 接线），不会被统一吞成 `CONTROL_NOT_AVAILABLE`。
 */
export class RecipeAgentPortError extends Error {
  constructor(
    public readonly code: AgentToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecipeAgentPortError';
  }
}

/**
 * 工具结果：成功时带数据和人话摘要；失败时把原因原样还给模型。
 *
 * `stale` 由写工具填写（如 `['ASSESSMENT', 'READY']`），读工具不填。
 */
export type AgentToolResult<T> =
  | { ok: true; data: T; summary: string; stale?: string[] }
  | {
      ok: false;
      error: { code: AgentToolErrorCode; message: string };
    };

/** 健康标签白名单；v1 只允许「低脂 / 易消化 / 单一动物蛋白」。 */
export interface HealthTagPolicy {
  isAllowedTag(name: string): boolean;
}
