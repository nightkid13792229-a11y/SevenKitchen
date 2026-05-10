import type { NutritionProfile } from './ingredient'

export type NutritionGovernanceSourceType =
  | 'USDA'
  | 'CFCT'
  | 'SUPPLEMENT_LABEL'
  | 'MANUAL'

export type NutritionGovernanceRecordStatus = 'ACTIVE' | 'DEPRECATED'

export type NutritionMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export type NutritionCandidateStatus =
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'SKIPPED'

export type SupplementNutritionDraftStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'REJECTED'

export type NutritionMatchReasonCode =
  | 'NAME_EXACT'
  | 'NAME_PARTIAL'
  | 'TYPE_MATCH'
  | 'STATE_MATCH'
  | 'SOURCE_PRIORITY'
  | 'MANUAL'

export interface NutritionGovernanceOverview {
  foodIngredientCount: number
  supplementIngredientCount: number
  confirmedNutritionProfileCount: number
  incompleteProfileCount: number
  candidateCount: number
  supplementDraftCount: number
}

export interface NutritionMatchReason {
  code: NutritionMatchReasonCode | string
  label: string
  scoreDelta: number
}

export interface NutritionSourceRecord {
  id: string
  sourceType: NutritionGovernanceSourceType
  sourceKey: string
  sourceTitle: string
  sourceDetail?: Record<string, unknown> | null
  foodName: string
  foodNameEn?: string | null
  dataType?: string | null
  category?: string | null
  rawData?: Record<string, unknown>
  normalizedNutrition?: NutritionProfile | null
  status?: NutritionGovernanceRecordStatus
  createdAt?: string
  updatedAt?: string
}

export interface NutritionGovernanceIngredientSummary {
  id: string
  name: string
  type: string
  nutritionProfile?: NutritionProfile | null
}

export interface IngredientNutritionCandidate {
  id: string
  ingredientId: string
  sourceRecordId: string
  sourcePriority: number
  confidence: NutritionMatchConfidence
  score: number
  matchReasons: NutritionMatchReason[]
  normalizedNutrition: NutritionProfile
  status: NutritionCandidateStatus
  confirmationSnapshot?: Record<string, unknown> | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  createdAt?: string
  updatedAt?: string
  ingredient?: NutritionGovernanceIngredientSummary
  sourceRecord?: NutritionSourceRecord
}

export interface IngredientNutritionCandidateListItem
  extends IngredientNutritionCandidate {
  ingredient: NutritionGovernanceIngredientSummary
  sourceRecord: NutritionSourceRecord
}

export interface LabelExtractionItem {
  fieldPath: string
  label: string
  value: number
  unit: string
  rawBasisType: string
}

export interface LabelExtractionResult {
  ocrText: string
  extractedItems: LabelExtractionItem[]
  missingFields: string[]
  normalizedNutrition: NutritionProfile | null
}

export interface SupplementNutritionDraft {
  id: string
  ingredientId: string
  sourceRecordId?: string | null
  imageUrl: string
  imageKey: string
  ocrText?: string | null
  aiExtraction: LabelExtractionResult | Record<string, unknown>
  normalizedNutrition?: NutritionProfile | null
  missingFields: string[]
  status: SupplementNutritionDraftStatus
  createdBy?: string | null
  confirmedBy?: string | null
  confirmedAt?: string | null
  createdAt: string
  updatedAt?: string
  ingredient?: NutritionGovernanceIngredientSummary
  sourceRecord?: NutritionSourceRecord | null
}

export interface ListNutritionCandidatesParams {
  status?: NutritionCandidateStatus
  confidence?: NutritionMatchConfidence
}
