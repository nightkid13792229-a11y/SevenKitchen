/**
 * 原料相关类型定义
 */

// 原料类型枚举
export enum IngredientType {
  FOOD = 'FOOD',           // 食材
  SUPPLEMENT = 'SUPPLEMENT', // 补剂
  PACKAGING = 'PACKAGING'   // 包装材料
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

// 类型标签映射
export const IngredientTypeLabels: Record<IngredientType, string> = {
  [IngredientType.FOOD]: '食材',
  [IngredientType.SUPPLEMENT]: '补剂',
  [IngredientType.PACKAGING]: '包材'
}

export const BaseUnitLabels: Record<BaseUnit, string> = {
  [BaseUnit.G]: '克',
  [BaseUnit.ML]: '毫升',
  [BaseUnit.PCS]: '个/件'
}

export const SupplementCategoryLabels: Record<SupplementCategoryType, string> = {
  [SupplementCategoryType.MINERAL]: '矿物质',
  [SupplementCategoryType.VITAMIN]: '维生素',
  [SupplementCategoryType.AMINO_ACID]: '氨基酸',
  [SupplementCategoryType.FATTY_ACID]: '脂肪酸',
  [SupplementCategoryType.PROBIOTIC]: '益生菌',
  [SupplementCategoryType.FUNCTIONAL]: '功能性成分',
  [SupplementCategoryType.OTHER]: '其他'
}

// 食材属性
export interface FoodProperties {
  cfct_class: string              // CFCT分类 (e.g. "畜肉类", "蔬菜类")
  edible_yield_rate: number       // 可食部/出肉率 (0.1-1.0)
  main_nutrients_desc: string     // 主要营养价值
  density_g_per_ml?: number       // 密度- 仅当 base_unit == 'ML' 时必需
}

// 补剂属性
export interface SupplementProperties {
  category_type: string                    // 营养分类
  active_nutrients: Record<string, number> // 有效成分浓度表
  production_loss_rate?: number            // 个性化损耗率
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
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  notes: string | null
  baseUnit: BaseUnit
  unitDisplayLabel: string | null
  purchaseUnit: string
  purchaseToBaseRatio: number
  currentPricePerPurchaseUnit: number
  unitCost: number  // 计算字段: price / ratio
  weightG: number | null
  maxCapacityG: number | null
  properties: FoodProperties | SupplementProperties | PackagingProperties
  stock?: number  // 库存占位符（MVP阶段）
  createdAt: string
  updatedAt: string
}

// 表单数据类型
export interface IngredientForm {
  id?: string
  name: string
  type: IngredientType
  brand?: string
  productModel?: string
  purchaseChannel?: string
  notes?: string
  baseUnit: BaseUnit
  unitDisplayLabel?: string
  purchaseUnit: string
  purchaseToBaseRatio: number
  currentPricePerPurchaseUnit: number
  weightG?: number
  maxCapacityG?: number
  properties: FoodProperties | SupplementProperties | PackagingProperties
}

// CFCT分类选项
export const CFCT_CLASS_OPTIONS = [
  '畜肉类',
  '禽肉类',
  '鱼虾类',
  '蛋类',
  '奶及奶制品',
  '大豆及其制品',
  '谷薯类',
  '蔬菜类',
  '水果类',
  '坚果种子类',
  '油脂类',
  '糖类',
  '其他'
]
