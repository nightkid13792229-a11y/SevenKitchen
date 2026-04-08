/**
 * 原料相关类型定义
 */

// 原料类型枚举
export enum IngredientType {
  FOOD = 'FOOD',           // 食材
  SUPPLEMENT = 'SUPPLEMENT', // 补剂
  PACKAGING = 'PACKAGING'   // 包装材料
}

export enum IngredientProcurementStrategy {
  DAILY_PURCHASE = 'DAILY_PURCHASE',
  STOCK_REPLENISHMENT = 'STOCK_REPLENISHMENT',
  HYBRID = 'HYBRID'
}

// 基准单位枚举
export enum BaseUnit {
  G = 'G',     // 克
  ML = 'ML',   // 毫升
  PCS = 'PCS'  // 个/件
}

// 补剂分类枚举
export enum SupplementCategoryType {
  MINERAL = 'MINERAL',           // 矿物质
  VITAMIN = 'VITAMIN',           // 维生素
  AMINO_ACID = 'AMINO_ACID',     // 氨基酸
  FATTY_ACID = 'FATTY_ACID',     // 脂肪酸
  PROBIOTIC = 'PROBIOTIC',       // 益生菌
  FUNCTIONAL = 'FUNCTIONAL',     // 功能性成分
  OTHER = 'OTHER'                // 其他
}

// 补剂添加时机枚举
export enum SupplementAddTiming {
  BEFORE_MIXING = 'BEFORE_MIXING',     // 制作中（须拌匀）
  BEFORE_MEAL = 'BEFORE_MEAL'          // 饭前（冷却后）
}

// 类型标签映射
export const IngredientTypeLabels: Record<string, string> = {
  [IngredientType.FOOD]: '食材',
  [IngredientType.SUPPLEMENT]: '补剂',
  [IngredientType.PACKAGING]: '包材'
}

export const IngredientProcurementStrategyLabels: Record<string, string> = {
  [IngredientProcurementStrategy.DAILY_PURCHASE]: '日采',
  [IngredientProcurementStrategy.STOCK_REPLENISHMENT]: '库存补货',
  [IngredientProcurementStrategy.HYBRID]: '混合'
}

export type StockLevelStatus =
  | 'NO_POLICY'
  | 'SUFFICIENT'
  | 'LOW_STOCK'
  | 'NEEDS_REPLENISHMENT'

export enum InventorySourceType {
  KITCHEN_TASK = 'KITCHEN_TASK',
  PURCHASE_RECORD = 'PURCHASE_RECORD',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  STOCKTAKE = 'STOCKTAKE'
}

export enum InventoryAdjustmentMode {
  DELTA = 'DELTA',
  SET = 'SET'
}

export enum InventoryStocktakeStatus {
  DRAFT = 'DRAFT',
  APPLIED = 'APPLIED'
}

export const StockLevelStatusLabels: Record<StockLevelStatus, string> = {
  NO_POLICY: '未设置阈值',
  SUFFICIENT: '库存充足',
  LOW_STOCK: '低于安全库存',
  NEEDS_REPLENISHMENT: '需要补货'
}

export const InventorySourceTypeLabels: Record<string, string> = {
  [InventorySourceType.KITCHEN_TASK]: '厨房领用',
  [InventorySourceType.PURCHASE_RECORD]: '采购入库',
  [InventorySourceType.MANUAL_ADJUSTMENT]: '手工调整',
  [InventorySourceType.STOCKTAKE]: '盘点差异'
}

export const InventoryAdjustmentModeLabels: Record<string, string> = {
  [InventoryAdjustmentMode.DELTA]: '按差异调整',
  [InventoryAdjustmentMode.SET]: '设置为盘点值'
}

export const InventoryStocktakeStatusLabels: Record<string, string> = {
  [InventoryStocktakeStatus.DRAFT]: '草稿',
  [InventoryStocktakeStatus.APPLIED]: '已入账'
}

export const BaseUnitLabels: Record<string, string> = {
  [BaseUnit.G]: '克',
  [BaseUnit.ML]: '毫升',
  [BaseUnit.PCS]: '个/件'
}

export const SupplementCategoryLabels: Record<string, string> = {
  [SupplementCategoryType.MINERAL]: '矿物质',
  [SupplementCategoryType.VITAMIN]: '维生素',
  [SupplementCategoryType.AMINO_ACID]: '氨基酸',
  [SupplementCategoryType.FATTY_ACID]: '脂肪酸',
  [SupplementCategoryType.PROBIOTIC]: '益生菌',
  [SupplementCategoryType.FUNCTIONAL]: '功能性成分',
  [SupplementCategoryType.OTHER]: '其他'
}

export const SupplementAddTimingLabels: Record<string, string> = {
  [SupplementAddTiming.BEFORE_MIXING]: '制作中（须拌匀）',
  [SupplementAddTiming.BEFORE_MEAL]: '饭前（冷却后）'
}

// 食材属性
export interface FoodProperties {
  cfct_class: string              // CFCT分类 (e.g. "畜肉类", "蔬菜类")
  edible_yield_rate: number       // 可食部/出肉率 (0.1-1.0)
  main_nutrients_desc: string     // 主要营养价值
  density_g_per_ml?: number       // 密度- 仅当 base_unit == 'ML' 时必需
}

// 有效成分含量值（包含数值和单位）
export interface ActiveNutrientValue {
  value: number  // 显示的数值（原始输入值）
  unit: string   // 单位 (mg, g, μg, IU, %)
}

// 购买链接配置
export interface PurchaseLinkConfig {
  url: string                  // 购买链接URL
  platform: 'TAOBAO' | 'JD' | 'PINDUODUO' | 'OTHER' | 'WEBVIEW'  // 平台类型
  mini_program_appid?: string  // 小程序appid（跳转小程序时必需）
  mini_program_path?: string   // 小程序路径（跳转小程序时必需）
}

// 补剂属性
export interface SupplementProperties {
  category_type: string                                    // 营养分类
  add_timing?: string                                      // 添加时机
  active_nutrients: Record<string, ActiveNutrientValue>   // 有效成分浓度表（保存原始值和单位）
  production_loss_rate?: number                            // 个性化损耗率
  purchase_link?: PurchaseLinkConfig                       // 购买链接配置
}

// 包材属性
export interface PackagingProperties {
  is_consumable: boolean      // true=消耗品(随单扣减), false=固定资产
  linked_item_id?: string     // 关联配件
}

// 原料实体
export interface Ingredient {
  id: string
  name: string
  type: IngredientType
  procurementStrategy: IngredientProcurementStrategy
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  notes: string | null
  baseUnit: BaseUnit
  unitDisplayLabel: string | null
  purchaseUnit: string
  purchaseToBaseRatio: number
  currentPricePerPurchaseUnit: number
  effectivePricePerPurchaseUnit: number
  unitCost: number  // 计算字段: price / ratio
  weightG: number | null
  maxCapacityG: number | null
  safetyStock: number | null
  reorderPoint: number | null
  targetStock: number | null
  properties: FoodProperties | SupplementProperties | PackagingProperties
  tagIds: string[]  // 标签ID数组
  tags?: Array<{
    id: string
    name: string
    color?: string | null
  }>
  activeRecommendedProductCount?: number
  recommendedProductCount?: number
  hasActiveRecommendedProduct?: boolean
  stock?: number  // 库存占位符（MVP阶段）
  activeProcurementSkuCount?: number
  procurementSkuCount?: number
  hasActiveProcurementSku?: boolean
  createdAt: string
  updatedAt: string
}

// 表单数据类型
export interface IngredientForm {
  id?: string
  name: string
  type: IngredientType
  procurementStrategy: IngredientProcurementStrategy
  brand?: string
  productModel?: string
  purchaseChannel?: string
  notes?: string
  baseUnit: BaseUnit
  unitDisplayLabel?: string
  purchaseUnit: string
  purchaseToBaseRatio: number
  currentPricePerPurchaseUnit: number
  effectivePricePerPurchaseUnit?: number
  weightG?: number
  maxCapacityG?: number
  safetyStock?: number
  reorderPoint?: number
  targetStock?: number
  properties: FoodProperties | SupplementProperties | PackagingProperties
  tagIds?: string[]  // 标签ID数组
  tags?: any[]  // 标签完整信息（用于显示）
}

export interface InventoryOverviewItem extends Ingredient {
  stock: number
  currentStock: number
  stockUnitLabel: string
  stockStatus: StockLevelStatus
  suggestedBaseQuantity: number
  suggestedPurchaseQuantity: number
  suggestedEstimatedCost: number
  suggestedProductId?: string
  suggestedProductName?: string
}

export interface InventoryLedgerItem {
  id: string
  ingredientId: string
  ingredientName: string
  deltaG: number
  stockUnitLabel: string
  sourceType: InventorySourceType
  sourceId: string
  sourceLabel: string
  sourceDescription: string | null
  quantityBeforeG: number | null
  quantityAfterG: number | null
  expectedQuantityG: number | null
  countedQuantityG: number | null
  createdAt: string
}

export interface InventoryStocktakeLineItem {
  id: string
  ingredientId: string
  ingredientName: string
  stockUnitLabel: string
  expectedQuantityG: number
  countedQuantityG: number
  deltaG: number
}

export interface InventoryStocktakeItem {
  id: string
  status: InventoryStocktakeStatus
  note: string | null
  createdAt: string
  appliedAt: string | null
  lineCount: number
  varianceCount: number
  totalAbsDeltaG: number
  lines: InventoryStocktakeLineItem[]
}

// CFCT分类选项（基于 WS/T 464-2015《食物成分数据表达规范》）
export const CFCT_CLASS_OPTIONS = [
  '谷类及制品',
  '薯类及制品',
  '干豆类及制品',
  '蔬菜类及制品',
  '菌藻类',
  '水果类及制品',
  '坚果种子类',
  '畜肉类及制品',
  '禽肉类及制品',
  '乳类及制品',
  '蛋类及制品',
  '水产类',
  '油脂类',
  '调味品类',
  '其他'
]

// 家庭 DIY 推荐商品
export interface RecommendedProduct {
  id: string
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  purchaseLink: PurchaseLinkConfig | null
  imageUrl: string | null
  activeNutrients: Record<string, ActiveNutrientValue> | null
  displayUnit: string | null
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface RecommendedProductForm {
  name: string
  brand?: string
  productModel?: string
  purchaseChannel?: string
  purchaseLink?: PurchaseLinkConfig
  imageUrl?: string
  activeNutrients?: Record<string, ActiveNutrientValue>
  displayUnit?: string
  isActive?: boolean
  sortOrder?: number
}

// 生产采购 SKU
export interface ProcurementSku {
  id: string
  ingredientId: string
  name: string
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  referencePricePerPurchaseUnit: number | null
  displayUnit: string | null
  notes: string | null
  isActive: boolean
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface ProcurementSkuForm {
  name: string
  brand?: string
  productModel?: string
  purchaseChannel?: string
  referencePricePerPurchaseUnit?: number | null
  displayUnit?: string
  notes?: string
  isActive?: boolean
  sortOrder?: number
}
