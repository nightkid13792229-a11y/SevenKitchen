import { findNutritionField } from './nutrition-field-catalog';
import { resolveSupplementConcentration } from './supplement-concentration-resolver';
import type { NutritionProfile, SupplementTarget } from './types';

export interface SupplementDoseTargetBreakdown {
  fieldPath: string;
  label: string;
  targetUnit: string;
  concentration: number;
  concentrationUnit: string;
  doseUnit: 'g' | 'ml' | 'serving';
  concentrationPerG?: number;
  servingWeightG?: number;
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
    if (!canUseTargetUnit(field.unit, target.unit)) {
      throw new Error(
        `Unit mismatch for ${target.fieldPath}: expected ${field.unit}, got ${target.unit}`,
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
    const resolution = resolveSupplementConcentration(
      input.nutritionProfile,
      target.fieldPath,
    );

    if (!resolution) {
      throw new Error(
        `Missing concentration for supplement target: ${target.fieldPath}`,
      );
    }

    const concentrationPerUnit = convertFieldUnitValue(
      resolution.concentrationPerUnit,
      field.unit,
      target.unit,
    );
    const concentrationPerG =
      resolution.concentrationPerG === undefined
        ? undefined
        : convertFieldUnitValue(
            resolution.concentrationPerG,
            field.unit,
            target.unit,
          );

    const totalNutrientNeeded = basisWeightKg * target.targetValuePerKg;
    const requiredAmount =
      (totalNutrientNeeded / concentrationPerUnit) * lossRate;

    return {
      fieldPath: target.fieldPath,
      label: target.label || field.label,
      targetUnit: target.unit,
      concentration: concentrationPerUnit,
      concentrationUnit: target.unit,
      doseUnit: resolution.doseUnit,
      concentrationPerG,
      servingWeightG: resolution.servingWeightG,
      totalNutrientNeeded,
      requiredAmount,
    };
  });

  const limitingTarget = targetBreakdown.reduce((max, current) =>
    current.requiredAmount > max.requiredAmount ? current : max,
  );

  return {
    amount: limitingTarget.requiredAmount,
    unit: input.displayUnit || limitingTarget.doseUnit,
    limitingTarget,
    targetBreakdown,
  };
}

function canUseTargetUnit(fieldUnit: string, targetUnit: string): boolean {
  return (
    normalizeUnit(fieldUnit) === normalizeUnit(targetUnit) ||
    convertMassUnit(1, fieldUnit, targetUnit) !== null
  );
}

function convertFieldUnitValue(
  value: number,
  fieldUnit: string,
  targetUnit: string,
) {
  if (normalizeUnit(fieldUnit) === normalizeUnit(targetUnit)) {
    return value;
  }

  const convertedValue = convertMassUnit(value, fieldUnit, targetUnit);
  if (convertedValue === null) {
    throw new Error(
      `Unit mismatch: cannot convert ${fieldUnit} to ${targetUnit}`,
    );
  }
  return convertedValue;
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (normalized === 'μg' || normalized === 'ug' || normalized === 'mcg') {
    return 'ug';
  }
  return normalized;
}

function massUnitFactor(unit: string): number | null {
  switch (normalizeUnit(unit)) {
    case 'g':
      return 1;
    case 'mg':
      return 1 / 1000;
    case 'ug':
      return 1 / 1_000_000;
    default:
      return null;
  }
}

function convertMassUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const fromFactor = massUnitFactor(fromUnit);
  const toFactor = massUnitFactor(toUnit);

  if (fromFactor === null || toFactor === null) {
    return null;
  }

  const convertedValue = (value * fromFactor) / toFactor;
  return Number.isFinite(convertedValue) ? convertedValue : null;
}
