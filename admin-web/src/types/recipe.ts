/**
 * Recipe types for recipe management.
 */

export const RecipeStatus = {
  DRAFT: 'DRAFT',
  PUBLIC: 'PUBLIC',
  PRIVATE_CUSTOM: 'PRIVATE_CUSTOM'
} as const

export type RecipeStatus = (typeof RecipeStatus)[keyof typeof RecipeStatus]

export const LifeStage = {
  PUPPY: 'PUPPY',
  ADULT: 'ADULT',
  SENIOR: 'SENIOR',
  PREGNANCY: 'PREGNANCY',
  LACTATION: 'LACTATION'
} as const

export type LifeStage = (typeof LifeStage)[keyof typeof LifeStage]

export const RecipeHealthTag = {
  HEALTHY: 'HEALTHY',
  PICKY_EATER: 'PICKY_EATER',
  SENSITIVE_STOMACH: 'SENSITIVE_STOMACH',
  PANCREATITIS_SUPPORT: 'PANCREATITIS_SUPPORT',
  LOW_FAT: 'LOW_FAT',
  SKIN_COAT_CARE: 'SKIN_COAT_CARE'
} as const

export type RecipeHealthTag =
  (typeof RecipeHealthTag)[keyof typeof RecipeHealthTag]

export const NutritionStandard = {
  NRC_2006: 'NRC_2006',
  FEDIAF_2021: 'FEDIAF_2021',
  FEDIAF_2024: 'FEDIAF_2024',
  AAFCO_2022: 'AAFCO_2022'
} as const

export type NutritionStandard =
  (typeof NutritionStandard)[keyof typeof NutritionStandard]

export interface NutritionDetailedData {
  moisture_pct: number
  protein_dm_pct: number
  fat_dm_pct: number
  fiber_dm_pct: number
  ash_dm_pct: number
  carbs_dm_pct: number
  ca_p_ratio: number
  energy_density_kcal_per_kg: number
}

export interface RecipeItem {
  id: string
  ingredientId: string
  ingredientName?: string
  ingredientType?: string
  preparationMethod?: string
  exampleWeight?: number
  ratioPercent?: number
  nutrientTargetKey?: string
  nutrientTargetValue?: number
  ingredient?: {
    id: string
    name: string
    type: string
    properties?: any
  }
}

export interface RecipeSummary {
  id: string
  name: string
  version: number
  status: RecipeStatus
  coverImageUrl?: string
  coverTitle?: string
  energyDensityKcalPerKg: number
  applicableLifeStages: LifeStage[]
  targetHealthTags: string[]
  salesCount: number
  diyGenCount: number
  likeCount: number
  favoriteCount: number
  designSource?: string
  createdAt: string
  updatedAt: string
}

export interface RecipeDetail extends RecipeSummary {
  detailImages?: string[]
  videoUrl?: string
  description?: string
  designSource?: string
  nutritionStandard: NutritionStandard
  nutritionDetailedData?: NutritionDetailedData
  productionSteps?: string
  productionLossRate: number
  batchLaborHours?: number
  items: RecipeItem[]
}

export interface RecipeForm {
  name: string
  coverImageUrl?: string
  coverTitle?: string
  detailImages?: string[]
  videoUrl?: string
  description?: string
  designSource?: string
  nutritionStandard: NutritionStandard
  energyDensityKcalPerKg: number
  items?: RecipeItem[]
  nutritionDetailedData?: NutritionDetailedData
  targetHealthTags?: string[]
  applicableLifeStages?: LifeStage[]
  productionSteps?: string
  productionLossRate?: number
  batchLaborHours?: number
  status?: RecipeStatus
}

export interface RecipeQuery {
  status?: RecipeStatus
  lifeStage?: LifeStage
  healthTag?: string
  search?: string
  page?: number
  pageSize?: number
}

export interface RecipeListResponse {
  data: RecipeSummary[]
  total: number
  page: number
  pageSize: number
}
