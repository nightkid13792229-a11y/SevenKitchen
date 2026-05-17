import type { NutritionStandardReviewStatus } from '@prisma/client';

export type MappingType = 'DIRECT' | 'COMBINATION' | 'RATIO' | 'UNSUPPORTED';

export type MappingStatus =
  | 'RESOLVED'
  | 'MISSING_MAPPING'
  | 'UNSUPPORTED_EXPRESSION';

export interface NutrientMappingAuditItem {
  nutrientCode: string;
  defaultStandardUnit: string;
  reviewStatus: NutritionStandardReviewStatus | 'UNREVIEWED';
  mappingType: MappingType;
  mappingStatus: MappingStatus;
  sourceFieldPaths: string[];
  missingFieldPaths: string[];
}

export interface NutrientMappingAuditSummary {
  totalNutrients: number;
  reviewedNutrients: number;
  resolvedMappings: number;
  missingMappings: number;
  unsupportedMappings: number;
}

export interface NutrientMappingAuditResult {
  versionCode: 'FEDIAF_2025_DOG';
  summary: NutrientMappingAuditSummary;
  items: NutrientMappingAuditItem[];
}

export type UnitNormalizationStatus =
  | 'RESOLVED'
  | 'MISSING_INPUT'
  | 'MISSING_BASIS'
  | 'UNSUPPORTED_UNIT'
  | 'UNSUPPORTED_EXPRESSION';

export interface NormalizedNutrientValue {
  nutrientCode: string;
  value: number | null;
  unit: string;
  status: UnitNormalizationStatus;
  sourceFieldPaths: string[];
}

export type IngredientReadinessLevel =
  | 'READY_FULL'
  | 'READY_BASIC'
  | 'PARTIAL'
  | 'NOT_READY';

export interface IngredientReadinessItem {
  nutrientCode: string;
  status: UnitNormalizationStatus;
  sourceFieldPaths: string[];
  value: number | null;
}

export interface IngredientReadinessSummary {
  totalNutrients: number;
  resolvedNutrients: number;
  missingNutrients: number;
  unsupportedNutrients: number;
  readinessLevel: IngredientReadinessLevel;
}

export interface IngredientReadinessResult {
  ingredientId: string;
  summary: IngredientReadinessSummary;
  items: IngredientReadinessItem[];
}

export type FediafTargetLifeStage =
  | 'EARLY_GROWTH_UNDER_14_WEEKS'
  | 'LATE_GROWTH_FROM_14_WEEKS'
  | 'REPRODUCTION'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export interface FediafTargetValue {
  nutrientCode: string;
  lifeStage: FediafTargetLifeStage;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  recommendedValue: number | null;
}

export interface FediafTargetResult {
  lifeStage: FediafTargetLifeStage;
  targets: FediafTargetValue[];
}
