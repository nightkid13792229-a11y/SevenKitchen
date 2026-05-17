export type NutritionStandardReviewStatus =
  | 'UNREVIEWED'
  | 'REVIEWED'
  | 'QUESTION'
  | 'NEEDS_FIX'

export type NutritionStandardSourceTable =
  | 'III-3a'
  | 'III-3b'
  | 'III-3c'
  | 'VII-17a'
  | 'VII-17b'
  | 'VII-17c'
  | 'VII-17d'

export type NutritionStandardSourceType =
  | 'CORE_RECOMMENDATION'
  | 'ANNEX_7_8'

export interface NutritionStandardVersionSummary {
  id: string
  code: string
  standardCode: string
  name: string
  species: 'DOG' | 'CAT'
  publicationMonth: string
  sourceTitle: string
  sourceUrl: string
  pdfUrl: string
  importBatch: string
  importStatus: string
  isActive: boolean
  importedAt: string
}

export interface NutritionStandardOverview {
  version: NutritionStandardVersionSummary
  totalEntries: number
  tableCounts: Record<string, number>
  reviewCounts: Record<NutritionStandardReviewStatus, number>
}

export interface NutritionStandardEntry {
  id: string
  nutrientCode: string
  nutrientName: string
  nutrientNameEn: string
  fieldPath: string | null
  fediafName: string
  category: string
  sourceTable: NutritionStandardSourceTable
  sourceType: NutritionStandardSourceType
  pdfPage: number
  species: 'DOG' | 'CAT'
  lifeStage: string
  basis: string
  unit: string
  minValue: number | null
  maxValue: number | null
  recommendedValue: number | null
  maxType: string
  footnoteRefs: string[]
  notes: string | null
  sortOrder: number
  reviewStatus: NutritionStandardReviewStatus
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
}

export interface NutritionStandardReviewEvent {
  id: string
  entryId: string
  status: NutritionStandardReviewStatus
  note: string | null
  reviewedBy: string | null
  reviewedAt: string
}

export interface NutritionStandardEntryDetail extends NutritionStandardEntry {
  reviewEvents: NutritionStandardReviewEvent[]
}

export interface NutritionStandardEntryQuery {
  sourceTable?: string
  sourceType?: string
  lifeStage?: string
  category?: string
  reviewStatus?: NutritionStandardReviewStatus
  search?: string
}
