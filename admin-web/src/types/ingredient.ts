/**
 * 原料相关类型定义
 */

// 原料类型枚举
export enum IngredientType {
  FOOD = "FOOD", // 食材
  SUPPLEMENT = "SUPPLEMENT", // 补剂
  PACKAGING = "PACKAGING", // 包装材料
}

export enum IngredientProcurementStrategy {
  DAILY_PURCHASE = "DAILY_PURCHASE",
  STOCK_REPLENISHMENT = "STOCK_REPLENISHMENT",
  HYBRID = "HYBRID",
}

// 基准单位枚举
export enum BaseUnit {
  G = "G", // 克
  ML = "ML", // 毫升
  PCS = "PCS", // 个/件
}

// 补剂分类枚举
export enum SupplementCategoryType {
  MINERAL = "MINERAL", // 矿物质
  VITAMIN = "VITAMIN", // 维生素
  AMINO_ACID = "AMINO_ACID", // 氨基酸
  FATTY_ACID = "FATTY_ACID", // 脂肪酸
  PROBIOTIC = "PROBIOTIC", // 益生菌
  FUNCTIONAL = "FUNCTIONAL", // 功能性成分
  OTHER = "OTHER", // 其他
}

// 补剂添加时机枚举
export enum SupplementAddTiming {
  BEFORE_MIXING = "BEFORE_MIXING", // 制作中
  BEFORE_MEAL = "BEFORE_MEAL", // 随餐
}

// 类型标签映射
export const IngredientTypeLabels: Record<string, string> = {
  [IngredientType.FOOD]: "食材",
  [IngredientType.SUPPLEMENT]: "补剂",
  [IngredientType.PACKAGING]: "包材",
};

export const IngredientProcurementStrategyLabels: Record<string, string> = {
  [IngredientProcurementStrategy.DAILY_PURCHASE]: "日采",
  [IngredientProcurementStrategy.STOCK_REPLENISHMENT]: "库存补货",
  [IngredientProcurementStrategy.HYBRID]: "混合",
};

export type StockLevelStatus =
  | "NO_POLICY"
  | "SUFFICIENT"
  | "LOW_STOCK"
  | "NEEDS_REPLENISHMENT";

export enum InventorySourceType {
  KITCHEN_TASK = "KITCHEN_TASK",
  PURCHASE_RECORD = "PURCHASE_RECORD",
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
  STOCKTAKE = "STOCKTAKE",
}

export enum InventoryAdjustmentMode {
  DELTA = "DELTA",
  SET = "SET",
}

export enum InventoryStocktakeStatus {
  DRAFT = "DRAFT",
  APPLIED = "APPLIED",
}

export const StockLevelStatusLabels: Record<StockLevelStatus, string> = {
  NO_POLICY: "未设置阈值",
  SUFFICIENT: "库存充足",
  LOW_STOCK: "低于安全库存",
  NEEDS_REPLENISHMENT: "需要补货",
};

export const InventorySourceTypeLabels: Record<string, string> = {
  [InventorySourceType.KITCHEN_TASK]: "厨房领用",
  [InventorySourceType.PURCHASE_RECORD]: "采购入库",
  [InventorySourceType.MANUAL_ADJUSTMENT]: "手工调整",
  [InventorySourceType.STOCKTAKE]: "盘点差异",
};

export const InventoryAdjustmentModeLabels: Record<string, string> = {
  [InventoryAdjustmentMode.DELTA]: "按差异调整",
  [InventoryAdjustmentMode.SET]: "设置为盘点值",
};

export const InventoryStocktakeStatusLabels: Record<string, string> = {
  [InventoryStocktakeStatus.DRAFT]: "草稿",
  [InventoryStocktakeStatus.APPLIED]: "已入账",
};

export const BaseUnitLabels: Record<string, string> = {
  [BaseUnit.G]: "克",
  [BaseUnit.ML]: "毫升",
  [BaseUnit.PCS]: "个/件",
};

export type NutritionBasisType =
  | "PER_100_G"
  | "PER_100_ML"
  | "PER_1_G"
  | "PER_1_ML"
  | "PER_1_PCS";

export type NutritionRawBasisType =
  | "PER_100_G"
  | "PER_100_ML"
  | "PER_1_G"
  | "PER_1_ML"
  | "PER_SERVING";

export type NutritionSourceKind =
  | "FOOD_DATABASE"
  | "PRODUCT_LABEL"
  | "LAB_REPORT"
  | "SUPPLIER_SPEC"
  | "LITERATURE"
  | "MANUAL_ESTIMATE";

export type NutritionSourceCode =
  | "USDA_FDC"
  | "NZFCD_FOODFILES"
  | "CFCT"
  | "CNF"
  | "AUSNUT"
  | "NEVO"
  | "JP_FOOD_TABLE"
  | "SUPPLEMENT_LABEL"
  | "LAB_REPORT"
  | "SUPPLIER_SPEC"
  | "LITERATURE"
  | "MANUAL_ESTIMATE";

export interface NutritionSourceForm {
  sourceNutrientId?: string | number | null;
  sourceNutrientName?: string | null;
  originalValue?: number | string | null;
  originalUnit?: string | null;
  canonicalValue?: number | null;
  canonicalUnit?: string | null;
  basisType?: NutritionBasisType | NutritionRawBasisType | string | null;
  notes?: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

export type NutritionFieldSourceCompatibility =
  | "EXACT_FOOD"
  | "SAME_SPECIES"
  | "APPROXIMATE_SPECIES"
  | "PRODUCT_OR_EXTRACT"
  | "REFERENCE_ONLY"
  | "LABEL"
  | "LAB_REPORT"
  | "MANUAL";

export interface NutritionFieldSource extends NutritionSourceForm {
  sourceRole?: "PROFILE_PRIMARY" | "FIELD_SUPPLEMENT" | string | null;
  sourceType?: string | null;
  sourceKind?: NutritionSourceKind | string | null;
  sourceCode?: NutritionSourceCode | string | null;
  sourceVersion?: string | null;
  sourceKey?: string | null;
  externalId?: string | null;
  sourceTitle?: string | null;
  sourceProvider?: string | null;
  compatibility?: NutritionFieldSourceCompatibility | string | null;
  confidenceLevel?: NutritionConfidenceLevel | string | null;
  noteZh?: string | null;
}

export type NutritionSourceType =
  | "MANUAL"
  | "CFCT"
  | "LABEL"
  | "THIRD_PARTY"
  | "OTHER";

export type NutritionConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type NutritionProfileSourceType =
  | "LAB_REPORT"
  | "LABEL"
  | "CFCT"
  | "USDA"
  | "NZFCD"
  | "LITERATURE"
  | "SUPPLIER"
  | "SUPPLEMENT_LABEL"
  | "MANUAL"
  | "MANUAL_ESTIMATE";

export type NutritionSampleState =
  | "RAW"
  | "COOKED"
  | "FREEZE_DRIED"
  | "AIR_DRIED"
  | "POWDER"
  | "OIL"
  | "CONCENTRATE";

export interface NutritionItem {
  nutrientCode?: string | null;
  nutrientName: string;
  value: number;
  unit: string;
  basisType: NutritionBasisType;
  basisQuantity?: number;
  sourceType?: NutritionSourceType | string | null;
  sourceName?: string | null;
  confidenceLevel?: NutritionConfidenceLevel | string | null;
  isKeyNutrient?: boolean;
  notes?: string | null;
}

export interface NutritionMeta {
  rawBasisType: NutritionRawBasisType;
  sampleState?: NutritionSampleState;
  isEdiblePortionBasis?: boolean;
  ediblePortionRate?: number | null;
  densityGPerMl?: number | null;
  servingWeightG?: number | null;
  sourceType?: NutritionProfileSourceType | null;
  sourceKind?: NutritionSourceKind | string | null;
  sourceCode?: NutritionSourceCode | string | null;
  sourceVersion?: string | null;
  externalId?: string | null;
  sourceRecordId?: string | null;
  sourceForms?: Record<string, NutritionSourceForm>;
  fieldSources?: Record<string, NutritionFieldSource>;
  conversionNotes?: Record<string, string>;
  sourceTitle?: string | null;
  sourceProvider?: string | null;
  attachments?: string[];
  confidenceLevel?: NutritionConfidenceLevel | null;
  fieldDisplayUnits?: Record<string, string>;
  versionNote?: string | null;
}

type NutritionTabValue = number | null;

export type NutritionTabRecord<TKey extends string = string> = Record<
  TKey,
  NutritionTabValue
>;

export interface MacroNutritionProfileTab extends NutritionTabRecord<
  | "energyKcal"
  | "moisture"
  | "crudeProtein"
  | "crudeFat"
  | "ash"
  | "carbohydrate"
  | "fiber"
  | "solubleFiber"
  | "insolubleFiber"
> {}

export interface MineralNutritionProfileTab extends NutritionTabRecord<
  | "calcium"
  | "phosphorus"
  | "potassium"
  | "sodium"
  | "magnesium"
  | "chloride"
  | "iron"
  | "zinc"
  | "copper"
  | "manganese"
  | "selenium"
  | "iodine"
> {}

export interface VitaminNutritionProfileTab extends NutritionTabRecord<
  | "vitaminA"
  | "vitaminD"
  | "vitaminE"
  | "vitaminK"
  | "vitaminB1"
  | "vitaminB2"
  | "vitaminB3"
  | "vitaminB5"
  | "vitaminB6"
  | "vitaminB7"
  | "vitaminB9"
  | "vitaminB12"
  | "choline"
  | "vitaminC"
> {}

export interface FattyAcidNutritionProfileTab extends NutritionTabRecord<
  | "saturatedFattyAcids"
  | "monounsaturatedFattyAcids"
  | "polyunsaturatedFattyAcids"
  | "linoleicAcid"
  | "alphaLinolenicAcid"
  | "arachidonicAcid"
  | "epa"
  | "dpa"
  | "dha"
> {}

export interface AminoAcidNutritionProfileTab extends NutritionTabRecord<
  | "arginine"
  | "lysine"
  | "methionine"
  | "cystine"
  | "taurine"
  | "tryptophan"
  | "threonine"
  | "leucine"
  | "isoleucine"
  | "valine"
  | "phenylalanine"
  | "tyrosine"
  | "histidine"
  | "glutamicAcid"
  | "glycine"
  | "proline"
> {}

export interface NutritionCustomItem {
  name: string;
  value: number;
  unit: string;
  rawBasisType?: NutritionRawBasisType;
  note?: string | null;
  sourceNutrientId?: string | number | null;
  sourceNutrientName?: string | null;
  canonicalFieldPath?: string | null;
  reviewCategory?: string | null;
  reviewStatus?: string | null;
}

export interface NutritionProfileV2 {
  meta: NutritionMeta;
  macros: MacroNutritionProfileTab;
  minerals: MineralNutritionProfileTab;
  vitamins: VitaminNutritionProfileTab;
  fattyAcids: FattyAcidNutritionProfileTab;
  aminoAcids: AminoAcidNutritionProfileTab;
  customItems: NutritionCustomItem[];
}

export type NutritionProfile = NutritionProfileV2;

export const SupplementCategoryLabels: Record<string, string> = {
  [SupplementCategoryType.MINERAL]: "矿物质",
  [SupplementCategoryType.VITAMIN]: "维生素",
  [SupplementCategoryType.AMINO_ACID]: "氨基酸",
  [SupplementCategoryType.FATTY_ACID]: "脂肪酸",
  [SupplementCategoryType.PROBIOTIC]: "益生菌",
  [SupplementCategoryType.FUNCTIONAL]: "功能性成分",
  [SupplementCategoryType.OTHER]: "其他",
};

export const SupplementAddTimingLabels: Record<string, string> = {
  [SupplementAddTiming.BEFORE_MIXING]: "制作中",
  [SupplementAddTiming.BEFORE_MEAL]: "随餐",
};

// 食材属性
export interface FoodProperties {
  cfct_class: string; // CFCT分类 (e.g. "畜肉类", "蔬菜类")
  edible_yield_rate: number; // 可食部/出肉率 (0.1-1.0)
  main_nutrients_desc: string; // 主要营养价值
  density_g_per_ml?: number; // 密度- 仅当 base_unit == 'ML' 时必需
}

// 有效成分含量值（包含数值和单位）
export interface ActiveNutrientValue {
  value: number; // 显示的数值（原始输入值）
  unit: string; // 单位 (mg, g, μg, IU, %)
}

// 购买链接配置
export interface PurchaseLinkConfig {
  url: string; // 购买链接URL
  platform: "TAOBAO" | "JD" | "PINDUODUO" | "IHERB" | "OTHER" | "WEBVIEW"; // 平台类型
  mini_program_appid?: string; // 小程序appid（跳转小程序时必需）
  mini_program_path?: string; // 小程序路径（跳转小程序时必需）
}

// 补剂属性
export interface SupplementProperties {
  category_type: string; // 营养分类
  add_timing?: string; // 添加时机
  active_nutrients?: Record<string, ActiveNutrientValue>; // 兼容旧数据
  display_unit?: string; // 单层补剂默认展示单位
  supplier_name?: string | null;
  purchase_link?: PurchaseLinkConfig; // 直连购买信息
  image_url?: string | null;
  marketing_highlights?: Record<string, ActiveNutrientValue>;
  production_loss_rate?: number; // 个性化损耗率
}

// 包材属性
export interface PackagingProperties {
  is_consumable: boolean; // true=消耗品(随单扣减), false=固定资产
  linked_item_id?: string; // 关联配件
  supplier_name?: string | null;
}

export interface NutritionFoodReference {
  id: string;
  name: string;
  nameEn?: string;
  dataSource?: string;
  externalId?: string;
  preparationState?: string;
  preparationStateLabel?: string;
  ediblePortionLabel?: string;
  processingLabel?: string;
  nutritionData?: NutritionProfile;
}

export interface NutritionFoodMapping {
  id: string;
  nutritionFoodId: string;
  ingredientId: string;
  yieldRate: number;
  isPrimary: boolean;
  notes?: string;
  nutritionFood?: NutritionFoodReference;
}

// 原料实体
export interface Ingredient {
  id: string;
  name: string;
  type: IngredientType;
  procurementStrategy: IngredientProcurementStrategy;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  notes: string | null;
  baseUnit: BaseUnit;
  baseUnitDisplayName: string | null;
  unitDisplayLabel?: string | null;
  nutritionProfile: NutritionProfile | null;
  nutritionFoodMappings?: NutritionFoodMapping[];
  weightG: number | null;
  maxCapacityG: number | null;
  properties: FoodProperties | SupplementProperties | PackagingProperties;
  tagIds: string[]; // 标签ID数组
  tags?: Array<{
    id: string;
    name: string;
    color?: string | null;
  }>;
  activeRecommendedProductCount?: number;
  recommendedProductCount?: number;
  hasActiveRecommendedProduct?: boolean;
  stock?: number; // 库存占位符（MVP阶段）
  activeProcurementSkuCount?: number;
  procurementSkuCount?: number;
  hasActiveProcurementSku?: boolean;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPricePerPurchaseUnit?: number;
  effectivePricePerPurchaseUnit?: number | null;
  unitCost?: number;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  createdAt: string;
  updatedAt: string;
}

// 表单数据类型
export interface IngredientForm {
  id?: string;
  name: string;
  type: IngredientType;
  procurementStrategy: IngredientProcurementStrategy;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  notes?: string;
  baseUnit: BaseUnit;
  baseUnitDisplayName?: string;
  unitDisplayLabel?: string;
  weightG?: number;
  maxCapacityG?: number;
  properties: FoodProperties | SupplementProperties | PackagingProperties;
  nutritionProfile?: NutritionProfile | null;
  tagIds?: string[]; // 标签ID数组
  tags?: any[]; // 标签完整信息（用于显示）
  purchaseUnit?: string;
  purchaseToBaseRatio?: number;
  currentPricePerPurchaseUnit?: number;
  effectivePricePerPurchaseUnit?: number;
  safetyStock?: number;
  reorderPoint?: number;
  targetStock?: number;
}

export interface InventoryOverviewItem extends Ingredient {
  stock: number;
  currentStock: number;
  currentPricePerPurchaseUnit: number;
  unitCost: number;
  purchaseUnit: string;
  stockUnitLabel: string;
  stockStatus: StockLevelStatus;
  suggestedBaseQuantity: number;
  suggestedPurchaseQuantity: number;
  suggestedEstimatedCost: number;
  suggestedProductId?: string;
  suggestedProductName?: string;
}

export interface InventoryLedgerItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  deltaG: number;
  stockUnitLabel: string;
  sourceType: InventorySourceType;
  sourceId: string;
  sourceLabel: string;
  sourceDescription: string | null;
  quantityBeforeG: number | null;
  quantityAfterG: number | null;
  expectedQuantityG: number | null;
  countedQuantityG: number | null;
  createdAt: string;
}

export interface InventoryStocktakeLineItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  stockUnitLabel: string;
  expectedQuantityG: number;
  countedQuantityG: number;
  deltaG: number;
}

export interface InventoryStocktakeItem {
  id: string;
  status: InventoryStocktakeStatus;
  note: string | null;
  createdAt: string;
  appliedAt: string | null;
  lineCount: number;
  varianceCount: number;
  totalAbsDeltaG: number;
  lines: InventoryStocktakeLineItem[];
}

// CFCT分类选项（基于 WS/T 464-2015《食物成分数据表达规范》）
export const CFCT_CLASS_OPTIONS = [
  "谷类及制品",
  "薯类及制品",
  "干豆类及制品",
  "蔬菜类及制品",
  "菌藻类",
  "水果类及制品",
  "坚果种子类",
  "畜肉类及制品",
  "禽肉类及制品",
  "乳类及制品",
  "蛋类及制品",
  "水产类",
  "油脂类",
  "调味品类",
  "其他",
];

// 家庭 DIY 推荐商品
export interface RecommendedProduct {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseLink: PurchaseLinkConfig | null;
  imageUrl: string | null;
  activeNutrients?: Record<string, ActiveNutrientValue> | null;
  marketingNutritionHighlights: Record<string, ActiveNutrientValue> | null;
  displayUnit: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendedProductForm {
  name: string;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  purchaseLink?: PurchaseLinkConfig;
  imageUrl?: string | null;
  activeNutrients?: Record<string, ActiveNutrientValue>;
  marketingNutritionHighlights?: Record<string, ActiveNutrientValue>;
  displayUnit?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export type ProcurementSkuSourceTier =
  | "ORGANIC"
  | "MARKET_PREMIUM"
  | "WHOLESALE";

export type ProcurementSkuPriceHistorySource =
  | "MANUAL"
  | "REIMBURSEMENT"
  | "ROLLBACK";

// 生产采购 SKU
export interface ProcurementSku {
  id: string;
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  referencePurchasePrice: number | null;
  referencePricePerPurchaseUnit: number | null;
  sourceTier: ProcurementSkuSourceTier | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProcurementSkuForm {
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  supplierName?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPurchasePrice?: number | null;
  sourceTier?: ProcurementSkuSourceTier | null;
  notes?: string | null;
  isActive?: boolean;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
}

export interface ProcurementSkuPriceHistory {
  id: string;
  procurementSkuId: string;
  ingredientId: string;
  oldPrice: number | null;
  newPrice: number;
  source: ProcurementSkuPriceHistorySource;
  reimbursementId: string | null;
  purchaseRecordId: string | null;
  rollbackFromHistoryId: string | null;
  operatorId: string | null;
  note: string | null;
  createdAt: string;
}
