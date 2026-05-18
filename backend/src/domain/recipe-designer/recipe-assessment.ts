import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { readProfileValuePer100g } from './nutrition-profile-reader';
import type {
  AssessmentEntry,
  AssessmentEntryStatus,
  AssessmentOverallStatus,
  DesignRecipeAssessmentItemInput,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from './types';

export interface DesignRecipeAssessmentInput {
  scenario: FediafDogScenarioCode;
  items: DesignRecipeAssessmentItemInput[];
  targets: FediafAssessmentTarget[];
}

export interface DesignRecipeAssessmentResultItem {
  id: string;
  name: string;
  weightG: number;
  ratioPercent: number;
}

export interface AssessedNutrientValue {
  total: number | null;
  per1000Kcal: number | null;
}

export interface DesignRecipeAssessmentSummary {
  compliant: number;
  deficient: number;
  excess: number;
  missingData: number;
}

export interface GroupedAssessmentEntry extends AssessmentEntry {
  details: AssessmentEntry[];
  detailCount: number;
}

export interface DesignRecipeAssessmentResult {
  scenario: FediafDogScenarioCode;
  totalWeightG: number;
  totalEnergyKcal: number | null;
  dryMatterG: number | null;
  energyDensityKcalPerKg: number | null;
  normalizedToKg: false;
  items: DesignRecipeAssessmentResultItem[];
  nutrients: Record<string, AssessedNutrientValue>;
  groupedEntries: GroupedAssessmentEntry[];
  entries: AssessmentEntry[];
  overallStatus: AssessmentOverallStatus;
  summary: DesignRecipeAssessmentSummary;
  rawSummary: DesignRecipeAssessmentSummary;
}

interface FieldTotal {
  total: number;
  missing: boolean;
}

const KCAL_TO_MJ = 0.004184;

export function assessRecipeDraft(
  input: DesignRecipeAssessmentInput,
): DesignRecipeAssessmentResult {
  validateItems(input.items);

  const totalWeightG = input.items.reduce((sum, item) => sum + item.weightG, 0);
  const energyTotal = getFieldTotal(input.items, 'macros.energyKcal');
  const moistureTotal = getFieldTotal(input.items, 'macros.moisture');
  const totalEnergyKcal = energyTotal.missing
    ? null
    : finiteOrNull(energyTotal.total);
  const moistureG = moistureTotal.total;
  const dryMatterG = moistureTotal.missing
    ? null
    : finiteOrNull(Math.max(totalWeightG - moistureG, 0));
  const energyDensityKcalPerKg =
    totalWeightG > 0 && totalEnergyKcal !== null
      ? finiteOrNull((totalEnergyKcal / totalWeightG) * 1000)
      : null;

  const entries = input.targets.map((target) =>
    assessTarget(target, input.items, energyTotal, moistureTotal, dryMatterG),
  );
  const groupedEntries = groupAssessmentEntries(entries);
  const summary = summarizeEntries(groupedEntries);
  const rawSummary = summarizeEntries(entries);

  return {
    scenario: input.scenario,
    totalWeightG,
    totalEnergyKcal,
    dryMatterG,
    energyDensityKcalPerKg,
    normalizedToKg: false,
    items: input.items.map((item) => ({
      id: item.id,
      name: item.name,
      weightG: item.weightG,
      ratioPercent: totalWeightG > 0 ? (item.weightG / totalWeightG) * 100 : 0,
    })),
    nutrients: buildNutrientTotals(input.targets, input.items, energyTotal),
    groupedEntries,
    entries,
    overallStatus: getOverallStatus(groupedEntries),
    summary,
    rawSummary,
  };
}

function assessTarget(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
  energyTotal: FieldTotal,
  moistureTotal: FieldTotal,
  dryMatterG: number | null,
): AssessmentEntry {
  if (!isRecord(target)) {
    return createMalformedEntry(target);
  }

  const bounds = sanitizeTargetBounds(target);
  const calculatedValue =
    bounds.malformed ||
    !isSupportedCategory(target.category) ||
    !isSupportedExpressionBasis(target.expressionBasis) ||
    hasMalformedCalculation(target) ||
    hasMalformedRatioSemantics(target)
      ? null
      : isRatioTarget(target)
        ? calculateRatioValue(target, items)
        : calculateExpressedValue(
            target,
            items,
            energyTotal,
            moistureTotal,
            dryMatterG,
          );
  const currentValue = finiteOrNull(calculatedValue);

  return {
    nutrientKey: target.nutrientKey,
    label: target.label,
    category: target.category,
    expressionBasis: target.expressionBasis,
    unit: target.unit,
    minValue: bounds.minValue,
    maxValue: bounds.maxValue,
    currentValue,
    status: getEntryStatus(currentValue, bounds),
  };
}

function calculateRatioValue(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
): number | null {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  if (
    !fieldPaths ||
    fieldPaths.length !== 2 ||
    hasDuplicateFieldPaths(fieldPaths)
  ) {
    return null;
  }

  if (!haveMatchingFieldUnits(fieldPaths)) {
    return null;
  }

  const [numeratorPath, denominatorPath] = fieldPaths;

  if (!numeratorPath || !denominatorPath) {
    return null;
  }

  const numerator = getFieldTotal(items, numeratorPath);
  const denominator = getFieldTotal(items, denominatorPath);

  if (
    numerator.missing ||
    denominator.missing ||
    !Number.isFinite(numerator.total) ||
    !isPositiveFiniteNumber(denominator.total)
  ) {
    return null;
  }

  return finiteOrNull(numerator.total / denominator.total);
}

function calculateExpressedValue(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
  energyTotal: FieldTotal,
  moistureTotal: FieldTotal,
  dryMatterG: number | null,
): number | null {
  const combinedTotal = getTargetFieldTotal(items, target);

  if (combinedTotal.missing) {
    return null;
  }

  switch (target.expressionBasis) {
    case 'PER_1000_KCAL_ME':
      return !energyTotal.missing && isPositiveFiniteNumber(energyTotal.total)
        ? finiteOrNull((combinedTotal.total / energyTotal.total) * 1000)
        : null;
    case 'PER_MJ_ME':
      return !energyTotal.missing && isPositiveFiniteNumber(energyTotal.total)
        ? finiteOrNull(combinedTotal.total / (energyTotal.total * KCAL_TO_MJ))
        : null;
    case 'PER_100G_DRY_MATTER':
      return !moistureTotal.missing && dryMatterG !== null && dryMatterG > 0
        ? finiteOrNull((combinedTotal.total / dryMatterG) * 100)
        : null;
    case 'RATIO':
      return null;
    default:
      return null;
  }
}

function validateItems(items: DesignRecipeAssessmentItemInput[]): void {
  for (const item of items) {
    if (!Number.isFinite(item.weightG) || item.weightG < 0) {
      throw new Error(
        'Recipe assessment item weightG must be a finite non-negative number',
      );
    }
  }
}

function getFieldTotal(
  items: DesignRecipeAssessmentItemInput[],
  fieldPath: string,
): FieldTotal {
  let total = 0;
  let hasPositiveWeightItem = false;
  let missing = false;

  for (const item of items) {
    if (item.weightG === 0) {
      continue;
    }

    hasPositiveWeightItem = true;
    const read = readProfileValuePer100g(item.nutritionProfile, fieldPath);

    if (read.missing || read.valuePer100g === null) {
      missing = true;
      continue;
    }

    total += (read.valuePer100g * item.weightG) / 100;
  }

  return { total, missing: !hasPositiveWeightItem || missing };
}

function getCombinedFieldTotal(
  items: DesignRecipeAssessmentItemInput[],
  fieldPaths: unknown,
  targetUnit: string,
): FieldTotal {
  const runtimeFieldPaths = getRuntimeFieldPaths(fieldPaths);

  if (
    !runtimeFieldPaths ||
    runtimeFieldPaths.length === 0 ||
    !haveCompatibleFieldUnits(runtimeFieldPaths, targetUnit)
  ) {
    return { total: 0, missing: true };
  }

  return runtimeFieldPaths.reduce<FieldTotal>(
    (sum, fieldPath) => {
      const fieldTotal = getFieldTotal(items, fieldPath);
      return {
        total: sum.total + fieldTotal.total,
        missing: sum.missing || fieldTotal.missing,
      };
    },
    { total: 0, missing: false },
  );
}

function getTargetFieldTotal(
  items: DesignRecipeAssessmentItemInput[],
  target: FediafAssessmentTarget,
): FieldTotal {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  if (!fieldPaths || !hasValidNonRatioFieldPaths(target, fieldPaths)) {
    return { total: 0, missing: true };
  }

  return getCombinedFieldTotal(items, fieldPaths, target.unit);
}

function hasValidNonRatioFieldPaths(
  target: FediafAssessmentTarget,
  fieldPaths: string[],
): boolean {
  if (fieldPaths.length === 0) {
    return false;
  }

  if (new Set(fieldPaths).size !== fieldPaths.length) {
    return false;
  }

  return (
    fieldPaths.length === 1 ||
    target.category === 'COMBINATION' ||
    target.calculation === 'SUM'
  );
}

function buildNutrientTotals(
  targets: FediafAssessmentTarget[],
  items: DesignRecipeAssessmentItemInput[],
  energyTotal: FieldTotal,
): Record<string, AssessedNutrientValue> {
  const nutrients: Record<string, AssessedNutrientValue> = {};

  for (const target of targets) {
    if (!isRecord(target)) continue;

    if (
      isRatioShaped(target) ||
      !isSupportedCategory(target.category) ||
      hasMalformedCalculation(target) ||
      !isSupportedExpressionBasis(target.expressionBasis)
    ) {
      continue;
    }

    const total = getTargetFieldTotal(items, target);
    const finiteTotal = total.missing ? null : finiteOrNull(total.total);

    nutrients[target.nutrientKey] = {
      total: finiteTotal,
      per1000Kcal:
        finiteTotal === null ||
        energyTotal.missing ||
        !isPositiveFiniteNumber(energyTotal.total)
          ? null
          : finiteOrNull((finiteTotal / energyTotal.total) * 1000),
    };
  }

  return nutrients;
}

function getEntryStatus(
  currentValue: number | null,
  target: { minValue: number | null; maxValue: number | null },
): AssessmentEntryStatus {
  if (currentValue === null) {
    return 'MISSING_DATA';
  }

  if (target.minValue !== null && currentValue < target.minValue) {
    return 'DEFICIENT';
  }

  if (target.maxValue !== null && currentValue > target.maxValue) {
    return 'EXCESS';
  }

  return 'COMPLIANT';
}

function isRatioTarget(target: FediafAssessmentTarget): boolean {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  return (
    isRatioShaped(target) &&
    target.expressionBasis === 'RATIO' &&
    target.category === 'RATIO' &&
    fieldPaths?.length === 2 &&
    !hasDuplicateFieldPaths(fieldPaths) &&
    (target.calculation === undefined || target.calculation === 'RATIO')
  );
}

function isRatioShaped(target: FediafAssessmentTarget): boolean {
  return (
    target.category === 'RATIO' ||
    target.expressionBasis === 'RATIO' ||
    target.calculation === 'RATIO'
  );
}

function isSupportedCategory(value: unknown): boolean {
  return (
    value === 'MACRO' ||
    value === 'MINERAL' ||
    value === 'VITAMIN' ||
    value === 'FATTY_ACID' ||
    value === 'AMINO_ACID' ||
    value === 'COMBINATION' ||
    value === 'RATIO'
  );
}

function hasMalformedRatioSemantics(target: FediafAssessmentTarget): boolean {
  return isRatioShaped(target) && !isRatioTarget(target);
}

function hasMalformedCalculation(target: FediafAssessmentTarget): boolean {
  return (
    target.calculation !== undefined &&
    target.calculation !== 'SUM' &&
    target.calculation !== 'RATIO'
  );
}

function getRuntimeFieldPaths(fieldPaths: unknown): string[] | null {
  if (!Array.isArray(fieldPaths)) {
    return null;
  }

  return fieldPaths.every((fieldPath) => typeof fieldPath === 'string')
    ? fieldPaths
    : null;
}

function hasDuplicateFieldPaths(fieldPaths: string[]): boolean {
  return new Set(fieldPaths).size !== fieldPaths.length;
}

function isSupportedExpressionBasis(value: unknown): boolean {
  return (
    value === 'PER_1000_KCAL_ME' ||
    value === 'PER_MJ_ME' ||
    value === 'PER_100G_DRY_MATTER' ||
    value === 'RATIO'
  );
}

function haveCompatibleFieldUnits(
  fieldPaths: string[],
  targetUnit: string,
): boolean {
  const fieldUnits = getFieldUnits(fieldPaths);

  return fieldUnits.every(
    (fieldUnit) => fieldUnit !== null && fieldUnit === targetUnit,
  );
}

function haveMatchingFieldUnits(fieldPaths: string[]): boolean {
  const fieldUnits = getFieldUnits(fieldPaths);
  const firstUnit = fieldUnits[0];

  return (
    firstUnit !== null &&
    fieldUnits.every((fieldUnit) => fieldUnit === firstUnit)
  );
}

function getFieldUnits(fieldPaths: string[]): Array<string | null> {
  return fieldPaths.map((fieldPath) => {
    const field = findNutritionField(fieldPath);
    return field?.unit ?? null;
  });
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function createMalformedEntry(target: unknown): AssessmentEntry {
  const record = isRecord(target) ? target : {};

  return {
    nutrientKey:
      typeof record.nutrientKey === 'string'
        ? record.nutrientKey
        : 'malformed_target',
    label: typeof record.label === 'string' ? record.label : 'Malformed target',
    category: 'COMBINATION',
    expressionBasis: 'PER_1000_KCAL_ME',
    unit: typeof record.unit === 'string' ? record.unit : '',
    minValue: null,
    maxValue: null,
    currentValue: null,
    status: 'MISSING_DATA',
  };
}

function sanitizeTargetBounds(target: FediafAssessmentTarget): {
  minValue: number | null;
  maxValue: number | null;
  malformed: boolean;
} {
  const minValue = sanitizeBound(target.minValue);
  const maxValue = sanitizeBound(target.maxValue);

  return {
    minValue,
    maxValue,
    malformed:
      (minValue === null && maxValue === null) ||
      (minValue !== null && maxValue !== null && minValue > maxValue) ||
      (target.minValue !== null && minValue === null) ||
      (target.maxValue !== null && maxValue === null),
  };
}

function sanitizeBound(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function groupAssessmentEntries(entries: AssessmentEntry[]): GroupedAssessmentEntry[] {
  const groups = new Map<string, AssessmentEntry[]>();

  for (const entry of entries) {
    const groupKey = entry.nutrientKey || entry.label;
    const group = groups.get(groupKey);

    if (group) {
      group.push(entry);
    } else {
      groups.set(groupKey, [entry]);
    }
  }

  return Array.from(groups.values()).map((details) => {
    const representative = chooseRepresentativeEntry(details);

    return {
      ...representative,
      details,
      detailCount: details.length,
    };
  });
}

function chooseRepresentativeEntry(entries: AssessmentEntry[]): AssessmentEntry {
  return entries.reduce((selected, candidate) => {
    const selectedPriority = getStatusPriority(selected.status);
    const candidatePriority = getStatusPriority(candidate.status);

    if (candidatePriority > selectedPriority) {
      return candidate;
    }

    return selected;
  });
}

function getStatusPriority(status: AssessmentEntryStatus): number {
  switch (status) {
    case 'MISSING_DATA':
      return 4;
    case 'EXCESS':
      return 3;
    case 'DEFICIENT':
      return 2;
    case 'COMPLIANT':
      return 1;
  }
}

function summarizeEntries(
  entries: Array<{ status: AssessmentEntryStatus }>,
): DesignRecipeAssessmentSummary {
  return entries.reduce<DesignRecipeAssessmentSummary>(
    (summary, entry) => {
      switch (entry.status) {
        case 'COMPLIANT':
          summary.compliant += 1;
          break;
        case 'DEFICIENT':
          summary.deficient += 1;
          break;
        case 'EXCESS':
          summary.excess += 1;
          break;
        case 'MISSING_DATA':
          summary.missingData += 1;
          break;
      }

      return summary;
    },
    { compliant: 0, deficient: 0, excess: 0, missingData: 0 },
  );
}

function getOverallStatus(
  entries: Array<{ status: AssessmentEntryStatus }>,
): AssessmentOverallStatus {
  if (entries.length === 0) {
    return 'INCOMPLETE';
  }

  if (entries.some((entry) => entry.status === 'MISSING_DATA')) {
    return 'INCOMPLETE';
  }

  if (
    entries.some(
      (entry) => entry.status === 'DEFICIENT' || entry.status === 'EXCESS',
    )
  ) {
    return 'NON_COMPLIANT';
  }

  return 'COMPLIANT';
}
