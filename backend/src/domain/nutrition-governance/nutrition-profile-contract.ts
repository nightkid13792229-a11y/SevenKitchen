import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from '../ingredient/nutrition-profile.constants';
import { isLegacyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionRawBasisType } from '../ingredient/types';
import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { NUTRITION_FIELD_CATALOG } from '../ingredient/nutrition-field-catalog';

export type NutritionProfileContractIssueSeverity = 'ERROR' | 'WARNING';

export type NutritionProfileContractIssueCode =
  | 'MISSING_PROFILE'
  | 'LEGACY_PROFILE'
  | 'INVALID_SHAPE'
  | 'UNKNOWN_TOP_LEVEL_FIELD'
  | 'UNKNOWN_PROFILE_FIELD'
  | 'RAW_SOURCE_FIELD_LEAK'
  | 'NON_NUMERIC_FIELD'
  | 'INVALID_RAW_BASIS'
  | 'MISSING_REQUIRED_FIELD'
  | 'MISSING_SOURCE_META'
  | 'MISSING_CONVERSION_EVIDENCE'
  | 'VITAMIN_A_FORM_REQUIRED'
  | 'VITAMIN_D_FORM_REQUIRED'
  | 'VITAMIN_E_FORM_REQUIRED'
  | 'MINERAL_ELEMENTAL_FRACTION_REQUIRED'
  | 'INVALID_CUSTOM_ITEMS';

export interface NutritionProfileContractIssue {
  severity: NutritionProfileContractIssueSeverity;
  code: NutritionProfileContractIssueCode;
  fieldPath: string;
  message: string;
}

export interface NutritionProfileContractOptions {
  requiredFieldPaths?: readonly string[];
  allowedRawBasisTypes?: readonly NutritionRawBasisType[];
  requireSourceMeta?: boolean;
}

export interface NutritionProfileFieldContract {
  fieldPath: string;
  label: string;
  unit: string;
  basis: 'PER_100_G_AS_FED';
}

export const FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS = [
  'macros.energyKcal',
  'macros.moisture',
  'macros.crudeProtein',
  'macros.crudeFat',
  'minerals.calcium',
  'minerals.phosphorus',
] as const;

export const NUTRITION_PROFILE_FIELD_CONTRACT: readonly NutritionProfileFieldContract[] =
  NUTRITION_FIELD_CATALOG.map((field) => ({
    fieldPath: field.fieldPath,
    label: field.label,
    unit: field.unit,
    basis: 'PER_100_G_AS_FED',
  }));

const TOP_LEVEL_KEYS = [
  'meta',
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
  'customItems',
] as const;

const META_KEYS = [
  'rawBasisType',
  'sampleState',
  'isEdiblePortionBasis',
  'ediblePortionRate',
  'densityGPerMl',
  'servingWeightG',
  'sourceType',
  'sourceKind',
  'sourceCode',
  'sourceVersion',
  'externalId',
  'sourceRecordId',
  'sourceForms',
  'fieldSources',
  'conversionNotes',
  'sourceTitle',
  'sourceProvider',
  'sourceDetail',
  'attachments',
  'confidenceLevel',
  'fieldDisplayUnits',
  'versionNote',
  'reviewNotes',
] as const;

const TAB_KEY_SETS: Record<NutritionFieldTab, ReadonlySet<string>> = {
  macros: new Set(MACRO_NUTRIENT_KEYS),
  minerals: new Set(MINERAL_NUTRIENT_KEYS),
  vitamins: new Set(VITAMIN_NUTRIENT_KEYS),
  fattyAcids: new Set(FATTY_ACID_NUTRIENT_KEYS),
  aminoAcids: new Set(AMINO_ACID_NUTRIENT_KEYS),
};

const RAW_SOURCE_FIELD_NAMES = new Set(
  [
    'Energy',
    'Water',
    'Protein',
    'Total lipid (fat)',
    'Ash',
    'Carbohydrate, by difference',
    'Fiber, total dietary',
    'Calcium, Ca',
    'Phosphorus, P',
    'Potassium, K',
    'Sodium, Na',
    'Magnesium, Mg',
    'Iron, Fe',
    'Zinc, Zn',
    'Copper, Cu',
    'Manganese, Mn',
    'Selenium, Se',
    'Vitamin A, IU',
    'Vitamin D (D2 + D3), International Units',
    'Vitamin E (alpha-tocopherol)',
    'Thiamin',
    'Riboflavin',
    'Niacin',
    'Pantothenic acid',
    'Vitamin B-6',
    'Vitamin B-12',
    'Choline, total',
    'Folate, total',
    'Leucine',
    'Fatty acids, total monounsaturated',
    'Fatty acids, total polyunsaturated',
    'Fatty acids, total saturated',
    '能量',
    '水分',
    '蛋白质',
    '脂肪',
    '钙',
    '磷',
  ].map(normalizeRawSourceFieldName),
);

const VALID_RAW_BASIS_TYPES: ReadonlySet<NutritionRawBasisType> = new Set([
  'PER_100_G',
  'PER_100_ML',
  'PER_1_G',
  'PER_1_ML',
  'PER_SERVING',
]);

export function validateNutritionProfileContract(
  input: unknown,
  options: NutritionProfileContractOptions = {},
): NutritionProfileContractIssue[] {
  const issues: NutritionProfileContractIssue[] = [];
  if (input === null || input === undefined) {
    return [
      issue('ERROR', 'MISSING_PROFILE', '', 'Nutrition profile is missing.'),
    ];
  }

  if (!isRecord(input)) {
    return [
      issue(
        'ERROR',
        'INVALID_SHAPE',
        '',
        'Nutrition profile must be a JSON object.',
      ),
    ];
  }

  if (isLegacyNutritionProfile(input)) {
    return [
      issue(
        'ERROR',
        'LEGACY_PROFILE',
        'items',
        'Legacy items[] nutrition profiles must be upgraded before confirmation.',
      ),
    ];
  }

  validateTopLevelKeys(input, issues);
  validateMeta(input.meta, options, issues);
  validateTabs(input, issues);
  validateActiveVitaminConversionEvidence(input, issues);
  validateCustomItems(input.customItems, issues);
  validateRequiredFields(input, options.requiredFieldPaths ?? [], issues);

  return issues;
}

export function hasNutritionProfileContractErrors(
  issues: readonly NutritionProfileContractIssue[],
): boolean {
  return issues.some((item) => item.severity === 'ERROR');
}

function validateTopLevelKeys(
  profile: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  const allowed = new Set(TOP_LEVEL_KEYS);
  for (const key of Object.keys(profile)) {
    if (!allowed.has(key as (typeof TOP_LEVEL_KEYS)[number])) {
      issues.push(
        issue(
          'WARNING',
          'UNKNOWN_TOP_LEVEL_FIELD',
          key,
          `Unknown top-level nutrition profile field: ${key}.`,
        ),
      );
    }
  }
}

function validateMeta(
  meta: unknown,
  options: NutritionProfileContractOptions,
  issues: NutritionProfileContractIssue[],
) {
  if (!isRecord(meta)) {
    issues.push(
      issue('ERROR', 'INVALID_SHAPE', 'meta', 'meta must be an object.'),
    );
    return;
  }

  const allowedMetaKeys = new Set(META_KEYS);
  for (const key of Object.keys(meta)) {
    if (!allowedMetaKeys.has(key as (typeof META_KEYS)[number])) {
      issues.push(
        issue(
          'WARNING',
          'UNKNOWN_PROFILE_FIELD',
          `meta.${key}`,
          `Unknown meta field: ${key}.`,
        ),
      );
    }
  }

  const rawBasisType = meta.rawBasisType;
  if (
    typeof rawBasisType !== 'string' ||
    !VALID_RAW_BASIS_TYPES.has(rawBasisType as NutritionRawBasisType)
  ) {
    issues.push(
      issue(
        'ERROR',
        'INVALID_RAW_BASIS',
        'meta.rawBasisType',
        'rawBasisType must be a supported nutrition basis.',
      ),
    );
  } else if (
    options.allowedRawBasisTypes &&
    !options.allowedRawBasisTypes.includes(
      rawBasisType as NutritionRawBasisType,
    )
  ) {
    issues.push(
      issue(
        'ERROR',
        'INVALID_RAW_BASIS',
        'meta.rawBasisType',
        `rawBasisType must be one of: ${options.allowedRawBasisTypes.join(
          '; ',
        )}.`,
      ),
    );
  }

  if (options.requireSourceMeta) {
    for (const fieldPath of [
      'meta.sourceKind',
      'meta.sourceCode',
      'meta.sourceProvider',
      'meta.sourceVersion',
      'meta.externalId',
      'meta.confidenceLevel',
    ]) {
      const value = readField(meta, fieldPath.replace(/^meta\./u, ''));
      if (typeof value !== 'string' || !value.trim()) {
        issues.push(
          issue(
            'ERROR',
            'MISSING_SOURCE_META',
            fieldPath,
            `${fieldPath} is required before confirmation.`,
          ),
        );
      }
    }
  }
}

function validateActiveVitaminConversionEvidence(
  profile: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  const meta = profile.meta;
  if (!isRecord(meta)) {
    return;
  }

  const sourceKind = meta.sourceKind;
  if (sourceKind !== 'PRODUCT_LABEL' && sourceKind !== 'FOOD_DATABASE') {
    return;
  }

  const severity: NutritionProfileContractIssueSeverity =
    sourceKind === 'PRODUCT_LABEL' ? 'ERROR' : 'WARNING';

  for (const fieldPath of [
    'vitamins.vitaminA',
    'vitamins.vitaminD',
    'vitamins.vitaminE',
  ]) {
    if (!hasFiniteNumber(readField(profile, fieldPath))) {
      continue;
    }

    if (hasConversionEvidence(meta, fieldPath)) {
      continue;
    }

    issues.push(
      issue(
        severity,
        'MISSING_CONVERSION_EVIDENCE',
        fieldPath,
        `${fieldPath} requires source form or conversion note evidence.`,
      ),
    );
  }

  validateProductLabelVitaminAForm(profile, meta, issues);
  validateProductLabelVitaminDForm(profile, meta, issues);
  validateProductLabelVitaminEForm(profile, meta, issues);
  validateProductLabelMineralCompoundEvidence(profile, meta, issues);
}

function validateProductLabelVitaminAForm(
  profile: Record<string, unknown>,
  meta: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  if (meta.sourceKind !== 'PRODUCT_LABEL') {
    return;
  }
  if (!hasFiniteNumber(readField(profile, 'vitamins.vitaminA'))) {
    return;
  }

  const sourceForm = getSourceForm(meta, 'vitamins.vitaminA');
  if (!isRecord(sourceForm)) {
    return;
  }

  const originalUnit = normalizeUnit(sourceForm.originalUnit);
  if (originalUnit === 'iu' || !isMassUnit(originalUnit)) {
    return;
  }

  const vitaminAForm = sourceForm.vitaminAForm;
  const conversionFactor = sourceForm.conversionFactor;
  const conversionFactorUnit = sourceForm.conversionFactorUnit;
  if (
    typeof vitaminAForm === 'string' &&
    vitaminAForm.trim() &&
    hasFiniteNumber(conversionFactor) &&
    typeof conversionFactorUnit === 'string' &&
    conversionFactorUnit.startsWith('IU_PER_')
  ) {
    return;
  }

  issues.push(
    issue(
      'ERROR',
      'VITAMIN_A_FORM_REQUIRED',
      'vitamins.vitaminA',
      'Product-label vitamin A mass values require a specific source form and IU conversion factor.',
    ),
  );
}

function validateProductLabelVitaminDForm(
  profile: Record<string, unknown>,
  meta: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  if (meta.sourceKind !== 'PRODUCT_LABEL') {
    return;
  }
  if (!hasFiniteNumber(readField(profile, 'vitamins.vitaminD'))) {
    return;
  }

  const sourceForm = getSourceForm(meta, 'vitamins.vitaminD');
  if (!isRecord(sourceForm)) {
    return;
  }

  const originalUnit = normalizeUnit(sourceForm.originalUnit);
  if (originalUnit === 'iu' || !isMassUnit(originalUnit)) {
    return;
  }

  const vitaminDForm = sourceForm.vitaminDForm;
  const conversionFactor = sourceForm.conversionFactor;
  const conversionFactorUnit = sourceForm.conversionFactorUnit;
  if (
    typeof vitaminDForm === 'string' &&
    vitaminDForm.trim() &&
    hasFiniteNumber(conversionFactor) &&
    (conversionFactorUnit === 'IU_PER_UG' ||
      conversionFactorUnit === 'IU_PER_MG')
  ) {
    return;
  }

  issues.push(
    issue(
      'ERROR',
      'VITAMIN_D_FORM_REQUIRED',
      'vitamins.vitaminD',
      'Product-label vitamin D mass values require D2/D3 source form and IU conversion factor.',
    ),
  );
}

function validateProductLabelVitaminEForm(
  profile: Record<string, unknown>,
  meta: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  if (meta.sourceKind !== 'PRODUCT_LABEL') {
    return;
  }
  if (!hasFiniteNumber(readField(profile, 'vitamins.vitaminE'))) {
    return;
  }

  const sourceForm = getSourceForm(meta, 'vitamins.vitaminE');
  if (!isRecord(sourceForm)) {
    return;
  }

  const originalUnit = normalizeUnit(sourceForm.originalUnit);
  if (originalUnit === 'iu') {
    return;
  }
  if (originalUnit !== 'mg') {
    return;
  }

  const vitaminEForm = sourceForm.vitaminEForm;
  const conversionFactor = sourceForm.conversionFactor;
  const conversionFactorUnit = sourceForm.conversionFactorUnit;
  if (
    typeof vitaminEForm === 'string' &&
    vitaminEForm.trim() &&
    hasFiniteNumber(conversionFactor) &&
    conversionFactorUnit === 'IU_PER_MG'
  ) {
    return;
  }

  issues.push(
    issue(
      'ERROR',
      'VITAMIN_E_FORM_REQUIRED',
      'vitamins.vitaminE',
      'Product-label vitamin E mg values require a specific source form and IU_PER_MG conversion factor.',
    ),
  );
}

function validateProductLabelMineralCompoundEvidence(
  profile: Record<string, unknown>,
  meta: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  if (meta.sourceKind !== 'PRODUCT_LABEL') {
    return;
  }

  for (const fieldKey of MINERAL_NUTRIENT_KEYS) {
    const fieldPath = `minerals.${fieldKey}`;
    if (!hasFiniteNumber(readField(profile, fieldPath))) {
      continue;
    }

    const sourceForm = getSourceForm(meta, fieldPath);
    if (!isRecord(sourceForm)) {
      continue;
    }

    const sourceCompound = sourceForm.sourceCompound;
    if (typeof sourceCompound !== 'string' || !sourceCompound.trim()) {
      continue;
    }

    const elementalFraction = sourceForm.elementalFraction;
    if (
      hasFiniteNumber(elementalFraction) &&
      elementalFraction > 0 &&
      elementalFraction <= 1
    ) {
      continue;
    }

    issues.push(
      issue(
        'ERROR',
        'MINERAL_ELEMENTAL_FRACTION_REQUIRED',
        fieldPath,
        'Product-label mineral compounds require elementalFraction evidence before storing elemental mineral amounts.',
      ),
    );
  }
}

function getSourceForm(
  meta: Record<string, unknown>,
  fieldPath: string,
): unknown {
  const sourceForms = meta.sourceForms;
  return isRecord(sourceForms) ? sourceForms[fieldPath] : undefined;
}

function normalizeUnit(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[μµ]/g, 'u')
    : '';
}

function isMassUnit(value: string): boolean {
  return (
    value === 'mg' ||
    value === 'ug' ||
    value === 'g' ||
    value.startsWith('mg') ||
    value.startsWith('ug')
  );
}

function hasConversionEvidence(
  meta: Record<string, unknown>,
  fieldPath: string,
): boolean {
  const sourceForms = meta.sourceForms;
  const sourceForm = isRecord(sourceForms) ? sourceForms[fieldPath] : undefined;
  if (isRecord(sourceForm) && Object.keys(sourceForm).length > 0) {
    return true;
  }

  const conversionNotes = meta.conversionNotes;
  const conversionNote = isRecord(conversionNotes)
    ? conversionNotes[fieldPath]
    : undefined;
  return typeof conversionNote === 'string' && conversionNote.trim().length > 0;
}

function validateTabs(
  profile: Record<string, unknown>,
  issues: NutritionProfileContractIssue[],
) {
  for (const tabKey of Object.keys(TAB_KEY_SETS) as NutritionFieldTab[]) {
    const tab = profile[tabKey];
    if (!isRecord(tab)) {
      issues.push(
        issue('ERROR', 'INVALID_SHAPE', tabKey, `${tabKey} must be an object.`),
      );
      continue;
    }

    const allowedKeys = TAB_KEY_SETS[tabKey];
    for (const [fieldKey, value] of Object.entries(tab)) {
      const fieldPath = `${tabKey}.${fieldKey}`;
      if (!allowedKeys.has(fieldKey)) {
        issues.push(
          issue(
            rawSourceFieldNameLooksLeaked(fieldKey) ? 'ERROR' : 'WARNING',
            rawSourceFieldNameLooksLeaked(fieldKey)
              ? 'RAW_SOURCE_FIELD_LEAK'
              : 'UNKNOWN_PROFILE_FIELD',
            fieldPath,
            rawSourceFieldNameLooksLeaked(fieldKey)
              ? `Raw source nutrient name leaked into internal profile: ${fieldKey}.`
              : `Unknown nutrition profile field: ${fieldKey}.`,
          ),
        );
        continue;
      }

      if (value !== null && !hasFiniteNumber(value)) {
        issues.push(
          issue(
            'ERROR',
            'NON_NUMERIC_FIELD',
            fieldPath,
            `${fieldPath} must be null or a finite number.`,
          ),
        );
      }
    }
  }
}

function validateCustomItems(
  customItems: unknown,
  issues: NutritionProfileContractIssue[],
) {
  if (!Array.isArray(customItems)) {
    issues.push(
      issue(
        'ERROR',
        'INVALID_CUSTOM_ITEMS',
        'customItems',
        'customItems must be an array.',
      ),
    );
    return;
  }

  customItems.forEach((item, index) => {
    if (!isRecord(item)) {
      issues.push(
        issue(
          'ERROR',
          'INVALID_CUSTOM_ITEMS',
          `customItems.${index}`,
          'customItems entries must be objects.',
        ),
      );
      return;
    }

    if (typeof item.name !== 'string' || !item.name.trim()) {
      issues.push(
        issue(
          'ERROR',
          'INVALID_CUSTOM_ITEMS',
          `customItems.${index}.name`,
          'custom item name is required.',
        ),
      );
    }
    if (!hasFiniteNumber(item.value)) {
      issues.push(
        issue(
          'ERROR',
          'INVALID_CUSTOM_ITEMS',
          `customItems.${index}.value`,
          'custom item value must be a finite number.',
        ),
      );
    }
    if (typeof item.unit !== 'string' || !item.unit.trim()) {
      issues.push(
        issue(
          'ERROR',
          'INVALID_CUSTOM_ITEMS',
          `customItems.${index}.unit`,
          'custom item unit is required.',
        ),
      );
    }
  });
}

function validateRequiredFields(
  profile: Record<string, unknown>,
  requiredFieldPaths: readonly string[],
  issues: NutritionProfileContractIssue[],
) {
  for (const fieldPath of requiredFieldPaths) {
    if (!hasFiniteNumber(readField(profile, fieldPath))) {
      issues.push(
        issue(
          'ERROR',
          'MISSING_REQUIRED_FIELD',
          fieldPath,
          `${fieldPath} is required before confirmation.`,
        ),
      );
    }
  }
}

function issue(
  severity: NutritionProfileContractIssueSeverity,
  code: NutritionProfileContractIssueCode,
  fieldPath: string,
  message: string,
): NutritionProfileContractIssue {
  return { severity, code, fieldPath, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readField(value: unknown, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[key];
  }, value);
}

function rawSourceFieldNameLooksLeaked(value: string): boolean {
  return RAW_SOURCE_FIELD_NAMES.has(normalizeRawSourceFieldName(value));
}

function normalizeRawSourceFieldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '');
}
