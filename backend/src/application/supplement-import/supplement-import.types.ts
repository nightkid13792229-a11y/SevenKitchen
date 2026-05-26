import type {
  NutritionProfileV2,
  NutritionRawBasisType,
} from '../../domain/ingredient/types';

export type SupplementImportRiskLevel = 'INFO' | 'WARNING' | 'BLOCKING';
export type SupplementDuplicateMatchType = 'EXACT' | 'LIKELY' | 'POSSIBLE';
export type SupplementDuplicateResolutionAction =
  | 'CREATE_NEW'
  | 'UPDATE_EXISTING';
export type SupplementAddTiming = 'BEFORE_MIXING' | 'BEFORE_MEAL';
export type SupplementCategoryType =
  | 'MINERAL'
  | 'VITAMIN'
  | 'AMINO_ACID'
  | 'FATTY_ACID'
  | 'PROBIOTIC'
  | 'FUNCTIONAL'
  | 'OTHER';

export interface ExtractedSupplementIngredientPayload {
  name?: string | null;
  brand?: string | null;
  productSpec?: string | null;
  baseUnit?: string | null;
  unitDisplayLabel?: string | null;
  weightG?: number | null;
  addTiming?: string | null;
  productionLossRate?: number | null;
  categoryType?: string | null;
}

export interface ExtractedSupplementNutritionItem {
  name?: string | null;
  value?: number | null;
  unit?: string | null;
  confidence?: number | null;
}

export interface ExtractedSupplementNutritionPayload {
  rawBasisType?: NutritionRawBasisType | null;
  servingWeightG?: number | null;
  items?: ExtractedSupplementNutritionItem[] | null;
}

export interface ExtractedSupplementImportPayload {
  ingredient?: ExtractedSupplementIngredientPayload | null;
  nutrition?: ExtractedSupplementNutritionPayload | null;
}

export interface SupplementDuplicateCandidate {
  ingredientId: string;
  matchType: SupplementDuplicateMatchType;
  name?: string | null;
  brand?: string | null;
  productSpec?: string | null;
}

export interface SupplementImportRiskFlag {
  code: string;
  level: SupplementImportRiskLevel;
  message: string;
}

export interface SupplementImportValidationIssue {
  code: string;
  message: string;
  level: SupplementImportRiskLevel;
}

export interface SupplementImportValidationResult {
  canConfirm: boolean;
  errors: SupplementImportValidationIssue[];
  warnings: SupplementImportValidationIssue[];
}

export interface SupplementDuplicateResolution {
  action: SupplementDuplicateResolutionAction;
  ingredientId?: string | null;
}

export interface NormalizedSupplementImportDraft {
  ingredient: {
    name: string;
    type: 'SUPPLEMENT';
    brand: string | null;
    productSpec: string | null;
    baseUnit: string | null;
    unitDisplayLabel: string | null;
    weightG: number | null;
    addTiming: SupplementAddTiming | null;
    productionLossRate: number | null;
    categoryType: SupplementCategoryType | null;
  };
  nutritionProfile: NutritionProfileV2;
  rejectedNutritionItems: Array<{
    name: string;
    value: number | null;
    unit: string | null;
    reason: string;
  }>;
  duplicateCandidates: SupplementDuplicateCandidate[];
  duplicateResolution: SupplementDuplicateResolution | null;
  riskFlags: SupplementImportRiskFlag[];
}
