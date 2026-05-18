import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../ingredient/types';
import { mapUsdaNutrientsToNutritionProfile } from './nutrition-governance.utils';

export type NutritionCandidateDataValidationStatus = 'PASS' | 'WARNING' | 'FAIL';

export interface NutritionCandidateDataValidationFieldIssue {
  fieldPath: string;
  sourceNutrientId?: string | number | null;
  sourceNutrientName?: string | null;
  expectedValue?: number | null;
  actualValue?: number | null;
  canonicalUnit?: string | null;
}

export interface NutritionCandidateDataValidationResult {
  status: NutritionCandidateDataValidationStatus;
  checkedFieldCount: number;
  expectedFieldCount: number;
  missingExpectedFields: NutritionCandidateDataValidationFieldIssue[];
  mismatchedFields: NutritionCandidateDataValidationFieldIssue[];
  missingSourceFormFields: NutritionCandidateDataValidationFieldIssue[];
  warnings: string[];
}

export interface ValidateNutritionCandidateDataInput {
  sourceType?: string | null;
  rawData?: unknown;
  normalizedNutrition?: unknown;
}

const PROFILE_TABS = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
] as const;

const VALUE_TOLERANCE = 0.0005;

export function validateNutritionCandidateData(
  input: ValidateNutritionCandidateDataInput,
): NutritionCandidateDataValidationResult {
  const warnings: string[] = [];
  const actualProfile = normalizeNutritionProfile(
    input.normalizedNutrition as any,
  );

  if (!actualProfile) {
    return emptyValidationResult('FAIL', [
      '候选缺少标准化营养档案，无法校验。',
    ]);
  }

  if (input.sourceType !== 'USDA') {
    return emptyValidationResult('WARNING', [
      '当前自动校验第一版仅支持 USDA 原始营养项逐项重算；该来源会保留为人工复核。',
    ]);
  }

  const rawNutrients = extractUsdaFoodNutrients(input.rawData);
  if (!rawNutrients.length) {
    return emptyValidationResult('WARNING', [
      'USDA 原始数据中未找到 foodNutrients，无法与来源值逐项比对。',
    ]);
  }

  const expectedProfile = mapUsdaNutrientsToNutritionProfile(rawNutrients);
  const expectedFields = collectNumericProfileFields(expectedProfile);
  const missingExpectedFields: NutritionCandidateDataValidationFieldIssue[] = [];
  const mismatchedFields: NutritionCandidateDataValidationFieldIssue[] = [];
  const missingSourceFormFields: NutritionCandidateDataValidationFieldIssue[] = [];
  let checkedFieldCount = 0;

  for (const expected of expectedFields) {
    const actualValue = getProfileFieldValue(actualProfile, expected.fieldPath);
    if (typeof actualValue !== 'number' || !Number.isFinite(actualValue)) {
      missingExpectedFields.push({
        ...expected,
        actualValue: null,
      });
      continue;
    }

    checkedFieldCount += 1;
    if (!isCloseEnough(actualValue, expected.expectedValue ?? 0)) {
      mismatchedFields.push({
        ...expected,
        actualValue,
      });
    }

    if (!actualProfile.meta?.sourceForms?.[expected.fieldPath]) {
      missingSourceFormFields.push({
        ...expected,
        actualValue,
      });
    }
  }

  if (missingSourceFormFields.length) {
    warnings.push('部分营养字段缺少来源项追溯信息。');
  }

  const status =
    missingExpectedFields.length || mismatchedFields.length
      ? 'FAIL'
      : warnings.length
        ? 'WARNING'
        : 'PASS';

  return {
    status,
    checkedFieldCount,
    expectedFieldCount: expectedFields.length,
    missingExpectedFields,
    mismatchedFields,
    missingSourceFormFields,
    warnings,
  };
}

function emptyValidationResult(
  status: NutritionCandidateDataValidationStatus,
  warnings: string[],
): NutritionCandidateDataValidationResult {
  return {
    status,
    checkedFieldCount: 0,
    expectedFieldCount: 0,
    missingExpectedFields: [],
    mismatchedFields: [],
    missingSourceFormFields: [],
    warnings,
  };
}

function extractUsdaFoodNutrients(rawData: unknown): Array<{
  nutrient?: { id?: number; name?: string; unitName?: string };
  amount?: number;
}> {
  if (!rawData || typeof rawData !== 'object') return [];

  const nutrients = (rawData as Record<string, any>).foodNutrients;
  return Array.isArray(nutrients) ? nutrients : [];
}

function collectNumericProfileFields(
  profile: NutritionProfileV2,
): NutritionCandidateDataValidationFieldIssue[] {
  const fields: NutritionCandidateDataValidationFieldIssue[] = [];

  for (const tabKey of PROFILE_TABS) {
    const tab = profile[tabKey] as Record<string, number | null>;
    for (const [fieldKey, value] of Object.entries(tab)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;

      const fieldPath = `${tabKey}.${fieldKey}`;
      const sourceForm = profile.meta.sourceForms?.[fieldPath];
      fields.push({
        fieldPath,
        sourceNutrientId: sourceForm?.sourceNutrientId,
        sourceNutrientName: sourceForm?.sourceNutrientName,
        expectedValue: value,
        canonicalUnit: sourceForm?.canonicalUnit ?? null,
      });
    }
  }

  return fields;
}

function getProfileFieldValue(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const [tabKey, fieldKey] = fieldPath.split('.');
  if (!tabKey || !fieldKey || !PROFILE_TABS.includes(tabKey as any)) {
    return null;
  }

  const tab = profile[tabKey as (typeof PROFILE_TABS)[number]] as Record<
    string,
    number | null
  >;
  const value = tab[fieldKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isCloseEnough(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= VALUE_TOLERANCE;
}
