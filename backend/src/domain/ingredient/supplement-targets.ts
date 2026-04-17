import {
  findNutritionField,
  getNutritionProfileFieldValue,
} from './nutrition-field-catalog';
import type { NutritionProfile, SupplementTarget } from './types';

export interface SupplementDoseTargetBreakdown {
  fieldPath: string;
  label: string;
  targetUnit: string;
  concentration: number;
  concentrationUnit: string;
  totalNutrientNeeded: number;
  requiredAmount: number;
}

export interface CalculateSupplementDoseInput {
  nutritionProfile: NutritionProfile | null | undefined;
  targets: SupplementTarget[];
  basisWeightG: number;
  displayUnit?: string | null;
  lossRate?: number;
}

export interface SupplementDoseResult {
  amount: number;
  unit: string;
  limitingTarget: SupplementDoseTargetBreakdown;
  targetBreakdown: SupplementDoseTargetBreakdown[];
}

export function validateSupplementTargets(targets: SupplementTarget[]): void {
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Supplement targets are required');
  }

  const seen = new Set<string>();
  for (const target of targets) {
    const field = findNutritionField(target.fieldPath);
    if (!field) {
      throw new Error(
        `Unsupported supplement target fieldPath: ${target.fieldPath}`,
      );
    }
    if (seen.has(target.fieldPath)) {
      throw new Error(
        `Duplicate supplement target fieldPath: ${target.fieldPath}`,
      );
    }
    if (!(target.targetValuePerKg > 0)) {
      throw new Error(
        `Supplement target must be greater than zero: ${target.fieldPath}`,
      );
    }
    seen.add(target.fieldPath);
  }
}

export function calculateSupplementDose(
  input: CalculateSupplementDoseInput,
): SupplementDoseResult {
  validateSupplementTargets(input.targets);

  const basisWeightKg = input.basisWeightG / 1000;
  const lossRate = input.lossRate ?? 1;
  const targetBreakdown = input.targets.map((target) => {
    const field = findNutritionField(target.fieldPath)!;
    const concentration = getNutritionProfileFieldValue(
      input.nutritionProfile,
      target.fieldPath,
    );

    if (!(concentration && concentration > 0)) {
      throw new Error(
        `Missing concentration for supplement target: ${target.fieldPath}`,
      );
    }

    if (target.unit !== field.unit) {
      throw new Error(
        `Unit mismatch for ${target.fieldPath}: expected ${field.unit}, got ${target.unit}`,
      );
    }

    const totalNutrientNeeded = basisWeightKg * target.targetValuePerKg;
    const requiredAmount = (totalNutrientNeeded / concentration) * lossRate;

    return {
      fieldPath: target.fieldPath,
      label: target.label || field.label,
      targetUnit: target.unit,
      concentration,
      concentrationUnit: field.unit,
      totalNutrientNeeded,
      requiredAmount,
    };
  });

  const limitingTarget = targetBreakdown.reduce((max, current) =>
    current.requiredAmount > max.requiredAmount ? current : max,
  );

  return {
    amount: limitingTarget.requiredAmount,
    unit: input.displayUnit || '份',
    limitingTarget,
    targetBreakdown,
  };
}
