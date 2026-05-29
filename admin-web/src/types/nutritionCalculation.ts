import type { NutritionStandardReviewStatus } from '@/types/nutritionStandard'

export type NutritionCalculationVersionCode = 'FEDIAF_2025_DOG'

export type MappingType = 'DIRECT' | 'COMBINATION' | 'RATIO' | 'UNSUPPORTED'

export type MappingStatus =
  | 'RESOLVED'
  | 'MISSING_MAPPING'
  | 'UNSUPPORTED_EXPRESSION'

export interface NutrientMappingAuditItem {
  nutrientCode: string
  defaultStandardUnit: string
  reviewStatus: NutritionStandardReviewStatus | 'UNREVIEWED'
  mappingType: MappingType
  mappingStatus: MappingStatus
  sourceFieldPaths: string[]
  missingFieldPaths: string[]
}

export interface NutrientMappingAuditSummary {
  totalNutrients: number
  reviewedNutrients: number
  resolvedMappings: number
  missingMappings: number
  unsupportedMappings: number
}

export interface NutrientMappingAuditResult {
  versionCode: NutritionCalculationVersionCode
  summary: NutrientMappingAuditSummary
  items: NutrientMappingAuditItem[]
}

export type UnitNormalizationStatus =
  | 'RESOLVED'
  | 'MISSING_INPUT'
  | 'MISSING_BASIS'
  | 'UNSUPPORTED_UNIT'
  | 'UNSUPPORTED_EXPRESSION'

export interface NormalizedNutrientValue {
  nutrientCode: string
  value: number | null
  unit: string
  status: UnitNormalizationStatus
  sourceFieldPaths: string[]
}

export type IngredientReadinessLevel =
  | 'READY_FULL'
  | 'READY_BASIC'
  | 'PARTIAL'
  | 'NOT_READY'

export interface IngredientReadinessSummary {
  totalIngredients: number
  readyFull: number
  readyBasic: number
  partial: number
  notReady: number
}

export interface IngredientReadinessItem {
  ingredientId: string
  ingredientName: string
  ingredientType: string
  readinessLevel: IngredientReadinessLevel
  coverageRatio: number
  hasEnergy: boolean
  hasMoisture: boolean
  hasNutritionFoodMapping: boolean
  resolvedNutrients: string[]
  missingNutrients: string[]
}

export interface MissingNutrientRankingItem {
  nutrientCode: string
  count: number
}

export interface IngredientReadinessResult {
  versionCode: NutritionCalculationVersionCode
  summary: IngredientReadinessSummary
  items: IngredientReadinessItem[]
  missingNutrientRanking: MissingNutrientRankingItem[]
}

export type FediafTargetLifeStage =
  | 'EARLY_GROWTH_UNDER_14_WEEKS'
  | 'LATE_GROWTH_FROM_14_WEEKS'
  | 'REPRODUCTION'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110'

export interface FediafTargetValue {
  nutrientCode: string
  lifeStage: FediafTargetLifeStage
  unit: string
  minValue: number | null
  maxValue: number | null
  recommendedValue: number | null
}

export interface FediafTargetResult {
  lifeStage: FediafTargetLifeStage
  targets: FediafTargetValue[]
}

export interface FediafTargetEntry {
  entryId: string
  nutrientCode: string
  nutrientName: string
  sourceTable: string
  pdfPage: number
  lifeStage: FediafTargetLifeStage
  basis: string
  unit: string
  minValue: number | null
  maxValue: number | null
  recommendedValue: number | null
  reviewStatus: NutritionStandardReviewStatus | 'UNREVIEWED'
}

export interface FediafTargetSelectionResult {
  versionCode: NutritionCalculationVersionCode
  lifeStage: FediafTargetLifeStage
  sourceType: 'ANNEX_7_8'
  entries: FediafTargetEntry[]
}
