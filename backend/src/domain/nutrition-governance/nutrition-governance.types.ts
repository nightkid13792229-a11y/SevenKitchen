import type {
  NutritionProfileV2,
  NutritionRawBasisType,
} from '../ingredient/types';

export type NutritionGovernanceSourceType =
  | 'USDA'
  | 'CFCT'
  | 'SUPPLEMENT_LABEL'
  | 'MANUAL';

export type NutritionMatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type NutritionCandidateStatus =
  | 'CANDIDATE'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'SKIPPED';

export type SupplementNutritionDraftStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'REJECTED';

export type NutritionMatchReasonCode =
  | 'NAME_EXACT'
  | 'NAME_PARTIAL'
  | 'TYPE_MATCH'
  | 'STATE_MATCH'
  | 'SOURCE_PRIORITY'
  | 'MANUAL';

export interface NutritionMatchReason {
  code: NutritionMatchReasonCode;
  label: string;
  scoreDelta: number;
}

export interface NutritionSourceInput {
  sourceType: NutritionGovernanceSourceType;
  externalId: string;
  sourceTitle: string;
  foodName: string;
  foodNameEn?: string | null;
  dataType?: string | null;
  category?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  rawData: Record<string, unknown>;
  normalizedNutrition?: NutritionProfileV2 | null;
}

export interface LabelExtractionResult {
  ocrText: string;
  extractedItems: Array<{
    fieldPath: string;
    label: string;
    value: number;
    unit: string;
    rawBasisType: NutritionRawBasisType;
  }>;
  missingFields: string[];
  normalizedNutrition: NutritionProfileV2 | null;
}
