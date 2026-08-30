import type { NutritionProfile } from './nutritionProfileTypes';

export type FediafDogScenarioCode =
  | 'EARLY_GROWTH_REPRODUCTION'
  | 'REPRODUCTION'
  | 'LATE_GROWTH'
  | 'ADULT_MER_95'
  | 'ADULT_MER_110';

export type AssessmentExpressionBasis =
  | 'PER_1000_KCAL_ME'
  | 'PER_MJ_ME'
  | 'PER_100G_DRY_MATTER'
  | 'RATIO';

export type AssessmentCategory =
  | 'MACRO'
  | 'MINERAL'
  | 'VITAMIN'
  | 'FATTY_ACID'
  | 'AMINO_ACID'
  | 'COMBINATION'
  | 'RATIO';

export type AssessmentNutrientCategory = AssessmentCategory;

export type NutrientCalculation = 'SUM' | 'RATIO';

export interface FediafAssessmentTarget {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  minValueNote?: string | null;
  maxValueNote?: string | null;
  maxValueLabel?: string | null;
  excludeFromAttention?: boolean;
  fieldPaths: readonly string[];
  calculation?: NutrientCalculation;
}

export interface DesignRecipeAssessmentItemInput {
  id: string;
  name: string;
  ingredientType?: string | null;
  weightG: number;
  nutritionProfile: NutritionProfile | null;
}

export type AssessmentEntryStatus =
  | 'COMPLIANT'
  | 'DEFICIENT'
  | 'EXCESS'
  | 'MISSING_DATA'
  | 'INFO';

export type AssessmentOverallStatus =
  | 'COMPLIANT'
  | 'NON_COMPLIANT'
  | 'INCOMPLETE';

export interface AssessmentNutrientContributor {
  itemId: string;
  itemName: string;
  weightG: number;
  amountUnit?: string;
  amount: number | null;
  unit: string;
  contributionPercent: number | null;
  missing: boolean;
  missingAsZero?: boolean;
}

export interface AssessmentEntry {
  nutrientKey: string;
  label: string;
  category: AssessmentCategory;
  expressionBasis: AssessmentExpressionBasis;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  minValueNote?: string | null;
  maxValueNote?: string | null;
  maxValueLabel?: string | null;
  rangeConflict?: boolean;
  rangeConflictNote?: string | null;
  excludeFromAttention?: boolean;
  currentValue: number | null;
  status: AssessmentEntryStatus;
  missingAsZero?: boolean;
  contributors?: AssessmentNutrientContributor[];
}
