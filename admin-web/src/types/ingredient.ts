/**
 * 原料相关类型定义
 */

export const IngredientType = {
  FOOD: 'FOOD',
  SUPPLEMENT: 'SUPPLEMENT',
  PACKAGING: 'PACKAGING'
} as const

export type IngredientType = (typeof IngredientType)[keyof typeof IngredientType]

export const BaseUnit = {
  G: 'G',
  ML: 'ML',
  PCS: 'PCS'
} as const

export type BaseUnit = (typeof BaseUnit)[keyof typeof BaseUnit]

export const SupplementCategoryType = {
  MINERAL: 'MINERAL',
  VITAMIN: 'VITAMIN',
  AMINO_ACID: 'AMINO_ACID',
  FATTY_ACID: 'FATTY_ACID',
  PROBIOTIC: 'PROBIOTIC',
  FUNCTIONAL: 'FUNCTIONAL',
  OTHER: 'OTHER'
} as const

export type SupplementCategoryType =
  (typeof SupplementCategoryType)[keyof typeof SupplementCategoryType]

export const SupplementAddTiming = {
  BEFORE_MIXING: 'BEFORE_MIXING',
  BEFORE_MEAL: 'BEFORE_MEAL'
} as const

export type SupplementAddTiming =
  (typeof SupplementAddTiming)[keyof typeof SupplementAddTiming]

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

export const SupplementAddTimingLabels: Record<SupplementAddTiming, string> = {
  [SupplementAddTiming.BEFORE_MIXING]: '制作中（须拌匀）',
  [SupplementAddTiming.BEFORE_MEAL]: '饭前（冷却后）'
}

export interface FoodProperties {
  cfct_class: string
  edible_yield_rate: number
  main_nutrients_desc: string
  density_g_per_ml?: number
}

export interface ActiveNutrientValue {
  value: number
  unit: string
}

export interface PurchaseLinkConfig {
  url: string
  platform: 'TAOBAO' | 'JD' | 'PINDUODUO' | 'OTHER' | 'WEBVIEW'
  mini_program_appid?: string
  mini_program_path?: string
}

export interface SupplementProperties {
  category_type: string
  add_timing?: string
  active_nutrients: Record<string, ActiveNutrientValue>
  production_loss_rate?: number
  purchase_link?: PurchaseLinkConfig
}

export interface PackagingProperties {
  is_consumable: boolean
  linked_item_id?: string
}

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
  unitCost: number
  weightG: number | null
  maxCapacityG: number | null
  properties: FoodProperties | SupplementProperties | PackagingProperties
  tagIds: string[]
  stock?: number
  createdAt: string
  updatedAt: string
}

export interface IngredientForm {
  id?: string
  name: string
  type: IngredientType
  brand?: string | null
  productModel?: string | null
  purchaseChannel?: string | null
  notes?: string | null
  baseUnit: BaseUnit
  unitDisplayLabel?: string | null
  purchaseUnit: string
  purchaseToBaseRatio: number
  currentPricePerPurchaseUnit: number
  weightG?: number | null
  maxCapacityG?: number | null
  properties: FoodProperties | SupplementProperties | PackagingProperties
  tagIds?: string[]
  tags?: any[]
}

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
