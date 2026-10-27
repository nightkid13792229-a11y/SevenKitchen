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
  /** 营养档案展示名（如「鸭腿肉（生）」）；搜索/详情复用同一口径。 */
  nutritionProfileName?: string;
  /** 原料库类型；缺省按 FOOD 处理，旧调用方不受影响。 */
  ingredientType?: 'FOOD' | 'SUPPLEMENT';
  cfctClass: string | null;
  nutritionCategory: string | null;
  category: FoodCategory;
  weightG: number;
  ratioPercent: number | null;
  preparationMethod: string | null;
}

/** 评估报告里的一条指标。 */
export interface AgentAssessmentEntry {
  key: string;
  label: string;
  status: 'COMPLIANT' | 'DEFICIENT' | 'EXCESS' | 'MISSING_DATA' | 'INFO';
  /** 按 `basis` 口径的当前值；当前引擎是“每 1000 千卡”。 */
  value: number | null;
  min: number | null;
  max: number | null;
  marginPercent: number | null;
  /** 余量更近的一边：LOWER=距下限，UPPER=距上限；无法判断时为 null。 */
  marginSide?: 'LOWER' | 'UPPER' | null;
  /** 单位：g / mg / IU / μg 等。 */
  unit?: string | null;
  /** 数值口径，如 PER_1000_KCAL；不填时按 view.basis 理解。 */
  basis?: string | null;
}

/** 配方命中狗狗过敏原的一条提示。 */
export interface AgentAllergenWarning {
  itemId: string;
  itemName: string;
  allergen: string;
  /** CONFIRMED = 确诊，WARNING = 可疑/待排查 */
  level: 'CONFIRMED' | 'WARNING';
  message: string;
}

/** 某一份草稿在某一个内容版本上的评估结果。 */
export interface AgentAssessmentView {
  contentRevision: number;
  compliant: number;
  deficient: number;
  excess: number;
  missingData: number;
  entries: AgentAssessmentEntry[];
  /** 当前评估引擎的口径：条目里的 value/min/max 是“每 1000 千卡”。 */
  basis?: 'PER_1000_KCAL';
  /** 整份配方的总能量（千卡）；补剂剂量换算用。 */
  totalEnergyKcal?: number | null;
  /** 每公斤配方的能量密度；没有总能量时用它 × 总重 / 1000。 */
  energyDensityKcalPerKg?: number | null;
  totalWeightG?: number;
  /** 配方命中的狗狗过敏原（2026-10-27）；空数组 = 没命中。 */
  allergenWarnings?: AgentAllergenWarning[];
}

/** 订单里给设计用的必需信息；不含主人、支付、附件。 */
export interface AgentOrderContext {
  /** 对外订单号（CR…），不是内部 uuid。 */
  orderNo: string;
  status: string;
  quantity: number;
  targetGoal: string;
  needsHealthManagement: boolean;
  notes: string | null;
  allergies: string[];
  allergyText: string | null;
  medicalConditions: string[];
  preferredIngredients: string[];
  dislikedIngredients: string[];
  currentFoodMain: string | null;
  currentFoodOther: string | null;
  changeReasons: string[];
  changeReasonOther: string | null;
  stomachConditions: string[];
  stomachOther: string | null;
  allergyStatus: string;
  requestedProteinCodes: string[];
}

/** 订单绑定狗狗的设计必需资料；不含主人信息。 */
export interface AgentOrderDogContext {
  name: string;
  breedName: string | null;
  /** ISO 日期（yyyy-mm-dd）；未知为 null。 */
  birthday: string | null;
  gender: string | null;
  neutered: boolean | null;
  currentWeightKg: number | null;
  allergyRecords: Array<{
    allergen: string;
    certainty: string;
    source: string | null;
  }>;
  allergyFoods: string | null;
  pickyFoods: string | null;
  preferredFoods: string | null;
  medicalHistory: string | null;
}

/**
 * `get_draft` 的设计上下文。
 *
 * - PRODUCT：产品线（不绑订单、不绑顾客狗狗）；
 * - ORDER：订单定制（订单 + 狗狗档案）；
 * - OUT_OF_SCOPE：顾客自助食谱（绑狗但没订单，不在 AI 设计范围）。
 */
export type AgentDesignContext =
  | { kind: 'PRODUCT' }
  | { kind: 'OUT_OF_SCOPE'; reason: string }
  | {
      kind: 'ORDER';
      order: AgentOrderContext | null;
      dog: AgentOrderDogContext | null;
      /** 订单/狗读不到时给出原因，模型必须停下来问人。 */
      unavailableReason: string | null;
    };

/** `get_draft` 返回的完整草稿快照。 */
export interface AgentDraftSnapshot {
  draftId: string;
  seriesId: string | null;
  /**
   * 设计上下文：CATALOG=产品线设计，ORDER=订单定制。
   * 没有系列或历史数据没写时是 null，模型按产品线处理。
   */
  designMode: 'CATALOG' | 'ORDER' | null;
  /** ORDER 模式绑定的订单号；产品线设计为 null。 */
  orderId?: string | null;
  /** ORDER 模式本单要做几份；产品线设计为 null。 */
  orderQuantity?: number | null;
  /** 设计上下文：产品线为空、订单定制带订单/狗狗、顾客自助标记为不在范围。 */
  context: AgentDesignContext;
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
  /**
   * 产品展示与目录检索用的只读元数据（Phase 2 追加）。
   *
   * 这些字段只用于 `search_recipes` / `get_recipe` 的当前草稿摘要与详情，
   * 不参与草稿写入；历史服务返回缺字段时适配器按 null / [] 处理。
   */
  status: string;
  applicableLifeStages: string[];
  coverImageUrl: string | null;
  detailImages: string[];
  videoUrl: string | null;
  energyDensityKcalPerKg: number | null;
  nutritionStandard: string | null;
  /** 当前草稿最近一次持久化的营养报告（没有时为 null）。 */
  nutritionDetailedData: unknown;
  seriesLifeStage: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  /** 湿基脂肪 / 水分百分比；只给健康标签策略用，读工具不展示。 */
  nutritionSummary?: {
    fatWetPercent: number | null;
    moisturePercent: number | null;
  };
  /** 菜品里出现的动物物种（去重）；只给健康标签策略用，读工具不展示。 */
  animalSpecies?: string[];
  /**
   * 是否有 PROTEIN / ORGAN / AQUATIC 项识别不出物种；只给健康标签策略用。
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
export interface AgentIngredientNutrientMatch {
  nutrientKey: string;
  label: string;
  amount: number;
  unit: string;
  basis: string;
  basisLabel: string;
  displayText: string;
  score: number;
}

/**
 * 搜索候选里的一个营养档案摘要（生/熟/蒸等）。
 *
 * 候选顶层只代表默认/主档案；要比较其它做法，必须看 `nutritionProfiles`。
 */
export interface AgentIngredientProfileSummary {
  nutritionFoodId: string;
  /** 面向人的档案名（优先 displayNameZh，其次按原料名生成）。 */
  name: string;
  displayNameZh: string | null;
  status: string;
  category: string | null;
  dataSource: string | null;
  isPrimary: boolean;
  preparationState: string | null;
  preparationStateLabel: string | null;
  verified: boolean;
}

export interface AgentIngredientCandidate {
  ingredientId: string;
  /** 默认/主档案 ID；完整档案列表在 `nutritionProfiles`。 */
  nutritionFoodId: string;
  name: string;
  nutritionProfileName: string;
  type: 'FOOD' | 'SUPPLEMENT';
  cfctClass: string | null;
  nutritionCategory: string | null;
  verified: boolean;
  /** 该原料的全部营养档案（不只默认档案），只读。 */
  nutritionProfiles: AgentIngredientProfileSummary[];
  keyNutrients?: AgentIngredientKeyNutrients;
  /** 按营养素搜索时的匹配量；没传 nutrientKey 时为 null。 */
  nutrientMatch?: AgentIngredientNutrientMatch | null;
}

/**
 * `get_ingredient` 返回的完整营养档案（只读）。
 *
 * 包含映射关系（mappingId / isPrimary / yieldRate / mappingNotes）与
 * 营养档案本身；`verified` 是 `status === 'VERIFIED'` 的便捷布尔值。
 */
export interface AgentIngredientNutritionProfile extends AgentIngredientProfileSummary {
  mappingId: string;
  category: string;
  dataSource: string;
  externalId: string | null;
  version: number;
  ediblePortionLabel: string | null;
  processingLabel: string | null;
  nutritionData: unknown;
  defaultSupplementTargets: unknown;
  notes: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  yieldRate: number;
  mappingNotes: string | null;
}

/** 原料标签（只读）。 */
export interface AgentIngredientTag {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sort: number;
  color: string | null;
}

/** 原料关联的推荐产品（只读）。 */
export interface AgentIngredientRecommendedProduct {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseLink: unknown;
  imageUrl: string | null;
  activeNutrients: unknown;
  displayUnit: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
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

/** `get_ingredient` 的原料详情：全部只读字段 + 全部营养档案。 */
export interface AgentIngredientDetail extends AgentIngredientCandidate {
  /** 基准单位：G=克，ML=毫升，PCS=个/件（粒、片）。数量必须按它填。 */
  baseUnit: 'G' | 'ML' | 'PCS';
  /** 分类判定结果；搜索时用来过滤，详情里直接给模型看。 */
  category: FoodCategory;
  /**
   * 营养摘要（选中档案）。食物 = 宏量（`moisture`/`crudeProtein`/...）；
   * 补剂 = 宏量 + `minerals.*` / `vitamins.*` / `aminoAcids.*` / `fattyAcids.*`。
   */
  nutritionSummary: Record<string, number | null>;
  /** 仅补剂返回：这些数值是每 100g、每 1g 还是每粒/每份。 */
  nutritionBasis?: AgentIngredientNutritionBasis;
  allergenNames: string[];
  preparationMethods: string[];
  pricePerPurchaseUnit: number | null;
  purchaseUnit: string | null;
  /** 补剂/商品展示单位；数量单位优先级高于采购单位。 */
  unitDisplayLabel: string | null;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  notes: string | null;
  procurementStrategy: string;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  /** 旧版内嵌营养 JSON（历史字段，保留只读）。 */
  nutritionProfile: unknown;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number | null;
  effectivePricePerPurchaseUnit: number | null;
  weightG: number | null;
  maxCapacityG: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  physicalForm: string | null;
  isOilBased: boolean;
  supplementRetailEnabled: boolean;
  shelfLifeMonths: number | null;
  storageCondition: string | null;
  openedShelfLifeDays: number | null;
  properties: unknown;
  tags: AgentIngredientTag[];
  recommendedProducts: AgentIngredientRecommendedProduct[];
  createdAt: Date;
  updatedAt: Date;
  /** 同原料的全部营养档案；选中档案见顶层 `nutritionFoodId`。 */
  nutritionProfiles: AgentIngredientNutritionProfile[];
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

/**
 * 只读食谱来源：
 * - PUBLISHED：已发布的标准产品线食谱；
 * - CUSTOM：顾客定制 / 私密食谱（只读配方，不含客户信息）；
 * - RECIPE_DRAFT：已生成正式食谱版本、但尚未公开的食谱；
 * - DESIGN_DRAFT：其他设计师的设计草稿；
 * - CURRENT_DRAFT：当前正在设计的草稿。
 */
export type AgentRecipeSource =
  | 'PUBLISHED'
  | 'CUSTOM'
  | 'RECIPE_DRAFT'
  | 'DESIGN_DRAFT'
  | 'CURRENT_DRAFT';

/** 只读食谱搜索结果里的一行；不含客户 / 订单 / 狗狗 / 主人信息。 */
export interface AgentRecipeSummary {
  source: AgentRecipeSource;
  /** Recipe.id 或 DesignRecipe.id。 */
  id: string;
  /** 逻辑 recipeId；设计草稿 / 当前草稿为 null。 */
  recipeId: string | null;
  /** 版本号；设计草稿返回草稿 version，当前草稿为 null。 */
  version: number | null;
  name: string;
  status: string;
  applicableLifeStages: string[];
  coverTitle: string | null;
  sellingPoint: string | null;
  /** targetHealthTags + healthTagAssignments 的标签名（去重，保持稳定顺序）。 */
  targetHealthTags: string[];
  ingredientNames: string[];
  mainProteinName: string | null;
  updatedAt: Date;
}

/** 只读食谱明细里的一条原料。 */
export interface AgentRecipeItemRead {
  ingredientId: string | null;
  nutritionFoodId: string | null;
  name: string;
  nutritionProfileName: string;
  ingredientType: 'FOOD' | 'SUPPLEMENT';
  weightG: number;
  preparationMethod: string | null;
  category: FoodCategory;
}

/** `get_recipe` 的完整只读详情（任意来源，不含客户/订单/狗信息）。 */
export interface AgentRecipeDetail extends AgentRecipeSummary {
  description: string | null;
  coverImageUrl: string | null;
  detailImages: string[];
  videoUrl: string | null;
  /** 每公斤配方的能量密度；草稿可能没有，按 null 返回。 */
  energyDensityKcalPerKg: number | null;
  nutritionStandard: string | null;
  nutritionDetailedData: unknown;
  productionSteps: AgentProductionStep[];
  items: AgentRecipeItemRead[];
  seriesId: string | null;
  seriesLifeStage: string | null;
  designSource: string | null;
  createdAt: Date;
}

/** `search_recipes` 的分页结果。 */
export interface AgentRecipeSearchPage {
  data: AgentRecipeSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

/**
 * 这只狗**真实吃过 / 交付过**的一道食谱（2026-10-28）。
 *
 * 数据来自当前订单绑定狗狗的鲜食订单快照 + 已完成定制单的交付快照，
 * 与「爱犬设计洞察」的历史食谱同源；只给身份、日期、来源和原料名，
 * 不含客户、订单、附件。
 */
export interface AgentDogRecipeHistoryItem {
  id: string;
  name: string;
  /** FINISHED = 鲜食订单快照；CUSTOM = 已完成定制单的交付快照；ORDER = 本单其他份 */
  kind: 'FINISHED' | 'CUSTOM' | 'ORDER';
  /** 使用 / 交付时间（ISO）；订单没有可用日期时为 null */
  date: string | null;
  status: string;
  /** 原料名（快照顺序，去重） */
  ingredients: string[];
}

/** `get_dog_recipe_history` 的结果。 */
export interface AgentDogRecipeHistory {
  /** 当前设计绑定的狗狗名；产品线 / 未绑定订单的草稿为 null */
  dogName: string | null;
  /** 过滤后的总条数，可能大于 `recipes.length`（已按 limit 截断） */
  total: number;
  recipes: AgentDogRecipeHistoryItem[];
}


/** 所有工具统一使用的错误码；英文大写，给人看的话用中文。 */
export type AgentToolErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_WEIGHT'
  | 'INGREDIENT_NOT_FOUND'
  | 'RECIPE_NOT_FOUND'
  | 'DRAFT_EMPTY'
  | 'COPY_FORBIDDEN_CLAIM'
  | 'TAG_NOT_ALLOWED'
  | 'ASSESSMENT_STALE'
  | 'READY_BLOCKED'
  | 'CONTROL_NOT_AVAILABLE'
  | 'WEB_SEARCH_FAILED'
  | 'WEB_FETCH_FAILED';

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
