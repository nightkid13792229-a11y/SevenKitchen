import { AiRecipeResultStatus, EvidenceLevel, MissingInfoCode } from './enums';

export type EvidenceSummary = {
  level: EvidenceLevel;
  sourceType: string;
  title: string;
  isConfirmed: boolean;
  confirmedData: Record<string, unknown>;
};

export type NutritionManagementPlan = {
  inputSummary: Record<string, unknown>;
  evidence: EvidenceSummary[];
  missingInfo: MissingInfoCode[];
  enabledRulePackages: string[];
  disabledRulePackages: Array<{ code: string; reason: string }>;
  nutritionTargets: Record<string, unknown>;
  ingredientPolicy: Record<string, unknown>;
  conflictReport: Array<{
    code: string;
    message: string;
    severity: 'HARD' | 'SOFT';
  }>;
  feedingPrinciples: string[];
  monitoringPlan: string[];
  citations: Array<{ sourceCode: string; title: string; url?: string }>;
  resultStatus: AiRecipeResultStatus;
};

export type RecipeConstraintSet = {
  dogId: string;
  assessmentId: string;
  rulePackages: string[];
  hardConstraints: Record<string, unknown>;
  softConstraints: Record<string, unknown>;
  reviewRequired: boolean;
  resultStatus: AiRecipeResultStatus;
};
