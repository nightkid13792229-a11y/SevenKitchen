import { getNutritionProfileFieldValue } from './nutrition-field-catalog';
import type { NutritionProfile, SupplementTarget } from './types';

export interface SupplementIngredientCandidateAuditItem {
  ingredientId?: string | null;
  ingredientName: string;
  nutritionProfile?: NutritionProfile | null;
}

export interface SupplementConcentrationAuditItem {
  recipeId: string;
  recipeName: string;
  recipeItemId: string;
  ingredientId?: string | null;
  ingredientName: string;
  supplementTargets?: SupplementTarget[] | null;
  nutritionProfile?: NutritionProfile | null;
  alternativeIngredients?: SupplementIngredientCandidateAuditItem[];
}

export interface MissingSupplementConcentrationFinding {
  recipeId: string;
  recipeName: string;
  recipeItemId: string;
  ingredientId?: string | null;
  ingredientName: string;
  candidateType: 'PRIMARY' | 'ALTERNATIVE';
  fieldPath: string;
  label: string;
  unit: string;
}

function hasValidConcentration(
  nutritionProfile: NutritionProfile | null | undefined,
  fieldPath: string,
): boolean {
  const value = getNutritionProfileFieldValue(nutritionProfile, fieldPath);
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function auditMissingSupplementConcentrations(
  items: SupplementConcentrationAuditItem[],
): MissingSupplementConcentrationFinding[] {
  const findings: MissingSupplementConcentrationFinding[] = [];

  for (const item of items) {
    const targets = item.supplementTargets || [];
    if (!targets.length) {
      continue;
    }

    for (const target of targets) {
      if (!hasValidConcentration(item.nutritionProfile, target.fieldPath)) {
        findings.push({
          recipeId: item.recipeId,
          recipeName: item.recipeName,
          recipeItemId: item.recipeItemId,
          ingredientId: item.ingredientId,
          ingredientName: item.ingredientName,
          candidateType: 'PRIMARY',
          fieldPath: target.fieldPath,
          label: target.label,
          unit: target.unit,
        });
      }

      for (const alternative of item.alternativeIngredients || []) {
        if (
          !hasValidConcentration(
            alternative.nutritionProfile,
            target.fieldPath,
          )
        ) {
          findings.push({
            recipeId: item.recipeId,
            recipeName: item.recipeName,
            recipeItemId: item.recipeItemId,
            ingredientId: alternative.ingredientId,
            ingredientName: alternative.ingredientName,
            candidateType: 'ALTERNATIVE',
            fieldPath: target.fieldPath,
            label: target.label,
            unit: target.unit,
          });
        }
      }
    }
  }

  return findings;
}
