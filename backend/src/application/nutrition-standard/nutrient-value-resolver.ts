import {
  createEmptyNutritionProfile,
  normalizeNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import {
  findNutritionField,
  type NutritionFieldDefinition,
} from '../../domain/ingredient/nutrition-field-catalog';
import type {
  NutritionProfile,
  NutritionProfileV2,
} from '../../domain/ingredient/types';

interface NutrientDefinitionForResolution {
  code: string;
  fieldPath: string | null;
  defaultStandardUnit: string;
  expression: Record<string, unknown> | null;
}

export type NutrientResolutionStatus =
  | 'RESOLVED'
  | 'MISSING_INPUT'
  | 'UNSUPPORTED_EXPRESSION'
  | 'UNSUPPORTED_UNIT';

export interface ResolvedStandardNutrientValue {
  nutrientCode: string;
  status: NutrientResolutionStatus;
  value: number | null;
  unit: string;
  sourceFieldPaths: string[];
  missingFieldPaths: string[];
  expression: Record<string, unknown> | null;
}

interface NutritionDataAlias {
  fieldPath: string;
  unit?: string;
}

const nutritionDataAliases: Record<string, NutritionDataAlias> = {
  energykcal: { fieldPath: 'macros.energyKcal', unit: 'kcal' },
  energy_kcal: { fieldPath: 'macros.energyKcal', unit: 'kcal' },
  moisture_g: { fieldPath: 'macros.moisture', unit: 'g' },
  water_g: { fieldPath: 'macros.moisture', unit: 'g' },
  protein_g: { fieldPath: 'macros.crudeProtein', unit: 'g' },
  crude_protein_g: { fieldPath: 'macros.crudeProtein', unit: 'g' },
  fat_g: { fieldPath: 'macros.crudeFat', unit: 'g' },
  crude_fat_g: { fieldPath: 'macros.crudeFat', unit: 'g' },
  carbs_g: { fieldPath: 'macros.carbohydrate', unit: 'g' },
  carbohydrate_g: { fieldPath: 'macros.carbohydrate', unit: 'g' },
  fiber_g: { fieldPath: 'macros.fiber', unit: 'g' },
  ash_g: { fieldPath: 'macros.ash', unit: 'g' },

  calcium_mg: { fieldPath: 'minerals.calcium', unit: 'mg' },
  phosphorus_mg: { fieldPath: 'minerals.phosphorus', unit: 'mg' },
  potassium_mg: { fieldPath: 'minerals.potassium', unit: 'mg' },
  sodium_mg: { fieldPath: 'minerals.sodium', unit: 'mg' },
  magnesium_mg: { fieldPath: 'minerals.magnesium', unit: 'mg' },
  chloride_mg: { fieldPath: 'minerals.chloride', unit: 'mg' },
  iron_mg: { fieldPath: 'minerals.iron', unit: 'mg' },
  zinc_mg: { fieldPath: 'minerals.zinc', unit: 'mg' },
  copper_mg: { fieldPath: 'minerals.copper', unit: 'mg' },
  manganese_mg: { fieldPath: 'minerals.manganese', unit: 'mg' },
  selenium_mcg: { fieldPath: 'minerals.selenium', unit: 'μg' },
  selenium_ug: { fieldPath: 'minerals.selenium', unit: 'μg' },
  iodine_mcg: { fieldPath: 'minerals.iodine', unit: 'μg' },
  iodine_ug: { fieldPath: 'minerals.iodine', unit: 'μg' },

  vitamin_a_iu: { fieldPath: 'vitamins.vitaminA', unit: 'IU' },
  vitamin_d_iu: { fieldPath: 'vitamins.vitaminD', unit: 'IU' },
  vitamin_d3_iu: { fieldPath: 'vitamins.vitaminD', unit: 'IU' },
  vitamin_e_iu: { fieldPath: 'vitamins.vitaminE', unit: 'IU' },
  vitamin_k_mcg: { fieldPath: 'vitamins.vitaminK', unit: 'μg' },
  vitamin_k_ug: { fieldPath: 'vitamins.vitaminK', unit: 'μg' },
  vitamin_b1_mg: { fieldPath: 'vitamins.vitaminB1', unit: 'mg' },
  vitamin_b2_mg: { fieldPath: 'vitamins.vitaminB2', unit: 'mg' },
  vitamin_b3_mg: { fieldPath: 'vitamins.vitaminB3', unit: 'mg' },
  vitamin_b5_mg: { fieldPath: 'vitamins.vitaminB5', unit: 'mg' },
  vitamin_b6_mg: { fieldPath: 'vitamins.vitaminB6', unit: 'mg' },
  vitamin_b7_mcg: { fieldPath: 'vitamins.vitaminB7', unit: 'μg' },
  vitamin_b7_ug: { fieldPath: 'vitamins.vitaminB7', unit: 'μg' },
  vitamin_b9_mcg: { fieldPath: 'vitamins.vitaminB9', unit: 'μg' },
  vitamin_b9_ug: { fieldPath: 'vitamins.vitaminB9', unit: 'μg' },
  folate_mcg: { fieldPath: 'vitamins.vitaminB9', unit: 'μg' },
  folate_ug: { fieldPath: 'vitamins.vitaminB9', unit: 'μg' },
  vitamin_b12_mcg: { fieldPath: 'vitamins.vitaminB12', unit: 'μg' },
  vitamin_b12_ug: { fieldPath: 'vitamins.vitaminB12', unit: 'μg' },
  choline_mg: { fieldPath: 'vitamins.choline', unit: 'mg' },

  linoleic_acid_g: { fieldPath: 'fattyAcids.linoleicAcid', unit: 'g' },
  alpha_linolenic_acid_g: {
    fieldPath: 'fattyAcids.alphaLinolenicAcid',
    unit: 'g',
  },
  arachidonic_acid_g: {
    fieldPath: 'fattyAcids.arachidonicAcid',
    unit: 'g',
  },
  arachidonic_acid_mg: {
    fieldPath: 'fattyAcids.arachidonicAcid',
    unit: 'mg',
  },
  epa_mg: { fieldPath: 'fattyAcids.epa', unit: 'mg' },
  dha_mg: { fieldPath: 'fattyAcids.dha', unit: 'mg' },
  dpa_mg: { fieldPath: 'fattyAcids.dpa', unit: 'mg' },

  arginine_g: { fieldPath: 'aminoAcids.arginine', unit: 'g' },
  histidine_g: { fieldPath: 'aminoAcids.histidine', unit: 'g' },
  isoleucine_g: { fieldPath: 'aminoAcids.isoleucine', unit: 'g' },
  leucine_g: { fieldPath: 'aminoAcids.leucine', unit: 'g' },
  lysine_g: { fieldPath: 'aminoAcids.lysine', unit: 'g' },
  methionine_g: { fieldPath: 'aminoAcids.methionine', unit: 'g' },
  cystine_g: { fieldPath: 'aminoAcids.cystine', unit: 'g' },
  phenylalanine_g: { fieldPath: 'aminoAcids.phenylalanine', unit: 'g' },
  tyrosine_g: { fieldPath: 'aminoAcids.tyrosine', unit: 'g' },
  threonine_g: { fieldPath: 'aminoAcids.threonine', unit: 'g' },
  tryptophan_g: { fieldPath: 'aminoAcids.tryptophan', unit: 'g' },
  valine_g: { fieldPath: 'aminoAcids.valine', unit: 'g' },
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (normalized === 'mcg' || normalized === 'ug' || normalized === 'μg') {
    return 'ug';
  }
  if (normalized === 'iu') return 'iu';
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

function convertUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (normalizeUnit(fromUnit) === normalizeUnit(toUnit)) {
    return value;
  }

  const fromMassFactor = massUnitFactor(fromUnit);
  const toMassFactor = massUnitFactor(toUnit);
  if (fromMassFactor !== null && toMassFactor !== null) {
    return (value * fromMassFactor) / toMassFactor;
  }

  return null;
}

function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getFieldValue(
  profile: NutritionProfileV2,
  field: NutritionFieldDefinition,
): number | null {
  const tabValues = profile[field.tabKey] as Record<string, number | null>;
  const value = tabValues[field.fieldKey];
  return isNumeric(value) ? value : null;
}

function setFieldValue(
  profile: NutritionProfileV2,
  field: NutritionFieldDefinition,
  value: number,
): void {
  const tabValues = profile[field.tabKey] as Record<string, number | null>;
  tabValues[field.fieldKey] = value;
}

function missingResult(
  definition: NutrientDefinitionForResolution,
  sourceFieldPaths: string[],
  missingFieldPaths: string[],
): ResolvedStandardNutrientValue {
  return {
    nutrientCode: definition.code,
    status: 'MISSING_INPUT',
    value: null,
    unit: definition.defaultStandardUnit || 'ratio',
    sourceFieldPaths,
    missingFieldPaths,
    expression: definition.expression,
  };
}

function resolveFieldValue(
  profile: NutritionProfileV2,
  fieldPath: string,
  targetUnit: string,
): { value: number | null; status: NutrientResolutionStatus } {
  const field = findNutritionField(fieldPath);
  if (!field) {
    return { value: null, status: 'MISSING_INPUT' };
  }

  const rawValue = getFieldValue(profile, field);
  if (rawValue === null) {
    return { value: null, status: 'MISSING_INPUT' };
  }

  if (!targetUnit || targetUnit === 'ratio') {
    return { value: rawValue, status: 'RESOLVED' };
  }

  const convertedValue = convertUnit(rawValue, field.unit, targetUnit);
  if (convertedValue === null) {
    return { value: null, status: 'UNSUPPORTED_UNIT' };
  }

  return { value: convertedValue, status: 'RESOLVED' };
}

function getExpressionFields(
  expression: Record<string, unknown> | null,
): string[] {
  if (!expression) return [];
  if (Array.isArray(expression.fields)) {
    return expression.fields.filter(
      (field): field is string => typeof field === 'string',
    );
  }

  return [expression.numerator, expression.denominator].filter(
    (field): field is string => typeof field === 'string',
  );
}

export function nutritionDataToNutritionProfile(
  nutritionData: Record<string, unknown> | null | undefined,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  if (!nutritionData) {
    return profile;
  }

  for (const [rawKey, rawValue] of Object.entries(nutritionData)) {
    if (!isNumeric(rawValue)) {
      continue;
    }

    const directField = rawKey.includes('.') ? findNutritionField(rawKey) : null;
    const alias = nutritionDataAliases[normalizeKey(rawKey)];
    const fieldPath = directField?.fieldPath ?? alias?.fieldPath;
    if (!fieldPath) {
      continue;
    }

    const field = findNutritionField(fieldPath);
    if (!field) {
      continue;
    }

    const sourceUnit = alias?.unit ?? field.unit;
    const convertedValue = convertUnit(rawValue, sourceUnit, field.unit);
    if (convertedValue === null) {
      continue;
    }

    setFieldValue(profile, field, convertedValue);
  }

  return profile;
}

export function resolveStandardNutrientValue(
  nutritionProfile: NutritionProfile | null | undefined,
  definition: NutrientDefinitionForResolution,
): ResolvedStandardNutrientValue {
  const profile = normalizeNutritionProfile(nutritionProfile);
  const sourceFieldPaths =
    definition.fieldPath !== null
      ? [definition.fieldPath]
      : getExpressionFields(definition.expression);

  if (!profile) {
    return missingResult(definition, sourceFieldPaths, sourceFieldPaths);
  }

  if (definition.fieldPath) {
    const resolved = resolveFieldValue(
      profile,
      definition.fieldPath,
      definition.defaultStandardUnit,
    );

    if (resolved.status !== 'RESOLVED') {
      return {
        nutrientCode: definition.code,
        status: resolved.status,
        value: null,
        unit: definition.defaultStandardUnit,
        sourceFieldPaths,
        missingFieldPaths:
          resolved.status === 'MISSING_INPUT' ? [definition.fieldPath] : [],
        expression: definition.expression,
      };
    }

    return {
      nutrientCode: definition.code,
      status: 'RESOLVED',
      value: resolved.value,
      unit: definition.defaultStandardUnit,
      sourceFieldPaths,
      missingFieldPaths: [],
      expression: definition.expression,
    };
  }

  const expression = definition.expression;
  if (expression?.op === 'sum') {
    const fields = getExpressionFields(expression);
    const missingFieldPaths: string[] = [];
    let total = 0;

    for (const fieldPath of fields) {
      const resolved = resolveFieldValue(
        profile,
        fieldPath,
        definition.defaultStandardUnit,
      );
      if (resolved.status !== 'RESOLVED' || resolved.value === null) {
        missingFieldPaths.push(fieldPath);
        continue;
      }
      total += resolved.value;
    }

    if (missingFieldPaths.length > 0) {
      return missingResult(definition, fields, missingFieldPaths);
    }

    return {
      nutrientCode: definition.code,
      status: 'RESOLVED',
      value: total,
      unit: definition.defaultStandardUnit,
      sourceFieldPaths: fields,
      missingFieldPaths: [],
      expression,
    };
  }

  if (
    expression?.op === 'divide' &&
    typeof expression.numerator === 'string' &&
    typeof expression.denominator === 'string'
  ) {
    const numeratorField = findNutritionField(expression.numerator);
    const denominatorField = findNutritionField(expression.denominator);
    const sourceFields = [expression.numerator, expression.denominator];
    const missingFieldPaths: string[] = [];

    if (!numeratorField) missingFieldPaths.push(expression.numerator);
    if (!denominatorField) missingFieldPaths.push(expression.denominator);

    const numerator =
      numeratorField !== undefined ? getFieldValue(profile, numeratorField) : null;
    const denominator =
      denominatorField !== undefined
        ? getFieldValue(profile, denominatorField)
        : null;

    if (numerator === null) missingFieldPaths.push(expression.numerator);
    if (denominator === null || denominator === 0) {
      missingFieldPaths.push(expression.denominator);
    }

    if (missingFieldPaths.length > 0) {
      return missingResult(
        definition,
        sourceFields,
        [...new Set(missingFieldPaths)],
      );
    }

    const denominatorInNumeratorUnit = convertUnit(
      denominator as number,
      denominatorField!.unit,
      numeratorField!.unit,
    );
    if (denominatorInNumeratorUnit === null || denominatorInNumeratorUnit === 0) {
      return {
        nutrientCode: definition.code,
        status: 'UNSUPPORTED_UNIT',
        value: null,
        unit: definition.defaultStandardUnit || 'ratio',
        sourceFieldPaths: sourceFields,
        missingFieldPaths: [],
        expression,
      };
    }

    return {
      nutrientCode: definition.code,
      status: 'RESOLVED',
      value: (numerator as number) / denominatorInNumeratorUnit,
      unit: definition.defaultStandardUnit || 'ratio',
      sourceFieldPaths: sourceFields,
      missingFieldPaths: [],
      expression,
    };
  }

  return {
    nutrientCode: definition.code,
    status: 'UNSUPPORTED_EXPRESSION',
    value: null,
    unit: definition.defaultStandardUnit || 'ratio',
    sourceFieldPaths,
    missingFieldPaths: [],
    expression,
  };
}
