import { FEDIAF_2025_DOG_NUTRIENTS } from '../nutrition-standard/fediaf-2025-dog.data';
import {
  buildVitaminASourceFormMetadata,
  calculateVitaminAActivityIu,
  type VitaminAForm,
} from '../../domain/ingredient/vitamin-a-conversion';
import {
  buildVitaminESourceFormMetadata,
  calculateVitaminEActivityIu,
  type VitaminEForm,
} from '../../domain/ingredient/vitamin-e-conversion';

const MICROGRAM_TO_IU_VITAMIN_D = 40;
const DEFAULT_ENERGY_RELATIVE_TOLERANCE_PERCENT = 25;
const DEFAULT_ENERGY_ABSOLUTE_TOLERANCE_KCAL = 30;
const EPSILON = 1e-9;

const ORDINARY_VITAMIN_D_FORMS = new Set([
  'vitamin_d2_ergocalciferol',
  'vitamin_d3_cholecalciferol',
  'total_vitamin_d_d2_d3',
]);

const SPECIAL_NUTRIENT_ALIASES: Record<string, string[]> = {
  crudeProtein: ['proteinG', 'protein', 'crudeProteinG'],
  crudeFat: ['fatG', 'fat', 'crudeFatG'],
  vitaminA: ['vitaminAIu', 'vitaminA'],
  vitaminD: ['vitaminDIu', 'vitaminD'],
  vitaminE: ['vitaminEIu', 'vitaminE'],
};

const AMINO_ACID_BASE_FIELDS = [
  'arginine',
  'histidine',
  'isoleucine',
  'leucine',
  'lysine',
  'methionine',
  'cystine',
  'methionineCystine',
  'phenylalanine',
  'tyrosine',
  'phenylalanineTyrosine',
  'threonine',
  'tryptophan',
  'valine',
  'taurine',
  'glutamicAcid',
  'glycine',
  'proline',
];

const MINERAL_BASE_FIELDS = [
  'calcium',
  'phosphorus',
  'potassium',
  'sodium',
  'chloride',
  'magnesium',
  'copper',
  'iodine',
  'iron',
  'manganese',
  'selenium',
  'zinc',
];

type SourceFormMetadataValue = string | number | boolean | null | undefined;

export interface NutritionImportNutrientValue {
  value: number | string | null;
  unit?: string | null;
  measuredZero?: boolean;
}

export type NutritionSourceFormMetadata = Record<
  string,
  SourceFormMetadataValue
>;

export interface NutritionImportAuditInput {
  profileName?: string;
  nutrients: Record<string, NutritionImportNutrientValue>;
  sourceForms?: Record<string, NutritionSourceFormMetadata>;
  energyTolerance?: NutritionEnergyTolerance;
}

export interface NutritionEnergyTolerance {
  relativePercent?: number;
  absoluteKcal?: number;
}

export type NutritionAuditIssueCode =
  | 'CHILD_NUTRIENT_EXCEEDS_PARENT'
  | 'MACRO_ENERGY_MISMATCH'
  | 'NEGATIVE_NUTRIENT_VALUE'
  | 'VITAMIN_A_FORM_REVIEW_REQUIRED'
  | 'VITAMIN_D_FORM_REVIEW_REQUIRED'
  | 'VITAMIN_E_FORM_REVIEW_REQUIRED';

export interface NutritionAuditIssue {
  code: NutritionAuditIssueCode;
  message: string;
  field?: string;
  fields?: string[];
  parentField?: string;
  path?: string;
  value?: number;
  parentValue?: number;
  estimatedValue?: number;
  differenceKcal?: number;
  differencePercent?: number;
}

export interface NormalizedNutrientValue {
  value: number;
  unit: string;
  sourceValue: number | string | null;
  sourceUnit: string | null;
  measuredZero: boolean;
  sourceForm?: NutritionSourceFormMetadata;
}

export interface NutritionImportAuditResult {
  essentialCoveragePercent: number;
  presentEssentialNutrients: string[];
  missingEssentialNutrients: string[];
  blockingIssues: NutritionAuditIssue[];
  reviewIssues: NutritionAuditIssue[];
  normalizedNutrients: Record<string, NormalizedNutrientValue>;
}

export interface SupplementalNutritionSource {
  sourceId?: string;
  sourceName?: string;
  nutrients: Record<string, NutritionImportNutrientValue>;
  sourceForms?: Record<string, NutritionSourceFormMetadata>;
}

export interface MergeSupplementalNutritionFieldsInput extends NutritionImportAuditInput {
  supplementalSources: SupplementalNutritionSource[];
}

export interface SupplementalNutritionFieldRefusal {
  field: string;
  sourceId?: string;
  sourceName?: string;
  code: NutritionAuditIssueCode;
  message: string;
  issues: NutritionAuditIssue[];
}

export interface MergeSupplementalNutritionFieldsResult {
  nutrients: Record<string, NutritionImportNutrientValue>;
  sourceForms: Record<string, NutritionSourceFormMetadata>;
  acceptedFields: string[];
  refusedFields: SupplementalNutritionFieldRefusal[];
  audit: NutritionImportAuditResult;
}

type FediafDogNutrient = (typeof FEDIAF_2025_DOG_NUTRIENTS)[number];

const ESSENTIAL_NUTRIENT_ALIASES = new Map(
  FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => [
    nutrient.code,
    buildEssentialAliases(nutrient),
  ]),
);

export function auditNutritionProfileForImport(
  input: NutritionImportAuditInput,
): NutritionImportAuditResult {
  const blockingIssues: NutritionAuditIssue[] = [];
  const reviewIssues: NutritionAuditIssue[] = [];
  const normalizedNutrients = buildNormalizedNutrients(input, reviewIssues);

  auditNegativeValues(input.nutrients, blockingIssues);
  auditFatChildren(input.nutrients, blockingIssues);
  auditAminoAcidChildren(input.nutrients, blockingIssues);
  auditAshMinerals(input.nutrients, blockingIssues);
  auditMacroEnergy(input, blockingIssues, reviewIssues);

  const presentEssentialNutrients: string[] = [];
  const missingEssentialNutrients: string[] = [];
  for (const nutrient of FEDIAF_2025_DOG_NUTRIENTS) {
    if (isEssentialNutrientPresent(input.nutrients, nutrient.code)) {
      presentEssentialNutrients.push(nutrient.code);
    } else {
      missingEssentialNutrients.push(nutrient.code);
    }
  }

  const totalEssentialNutrients =
    presentEssentialNutrients.length + missingEssentialNutrients.length;
  const essentialCoveragePercent =
    totalEssentialNutrients === 0
      ? 100
      : (presentEssentialNutrients.length / totalEssentialNutrients) * 100;

  return {
    essentialCoveragePercent,
    presentEssentialNutrients,
    missingEssentialNutrients,
    blockingIssues,
    reviewIssues,
    normalizedNutrients,
  };
}

export function mergeSupplementalNutritionFields(
  input: MergeSupplementalNutritionFieldsInput,
): MergeSupplementalNutritionFieldsResult {
  const nutrients = cloneNutrients(input.nutrients);
  const sourceForms = cloneSourceForms(input.sourceForms ?? {});
  const acceptedFields: string[] = [];
  const refusedFields: SupplementalNutritionFieldRefusal[] = [];

  for (const source of input.supplementalSources) {
    for (const [field, value] of Object.entries(source.nutrients)) {
      const candidateNutrients = {
        ...nutrients,
        [field]: cloneNutrientValue(value),
      };
      const candidateSourceForms = {
        ...sourceForms,
        ...(source.sourceForms ? cloneSourceForms(source.sourceForms) : {}),
      };
      const candidateAudit = auditNutritionProfileForImport({
        profileName: input.profileName,
        nutrients: candidateNutrients,
        sourceForms: candidateSourceForms,
        energyTolerance: input.energyTolerance,
      });
      const fieldIssues = candidateAudit.blockingIssues.filter((issue) =>
        issueReferencesField(issue, field),
      );

      if (fieldIssues.length > 0) {
        refusedFields.push({
          field,
          sourceId: source.sourceId,
          sourceName: source.sourceName,
          code: fieldIssues[0].code,
          message: fieldIssues[0].message,
          issues: fieldIssues,
        });
        continue;
      }

      nutrients[field] = cloneNutrientValue(value);
      if (source.sourceForms?.[field]) {
        sourceForms[field] = { ...source.sourceForms[field] };
      }
      acceptedFields.push(field);
    }
  }

  return {
    nutrients,
    sourceForms,
    acceptedFields,
    refusedFields,
    audit: auditNutritionProfileForImport({
      profileName: input.profileName,
      nutrients,
      sourceForms,
      energyTolerance: input.energyTolerance,
    }),
  };
}

function buildNormalizedNutrients(
  input: NutritionImportAuditInput,
  reviewIssues: NutritionAuditIssue[],
): Record<string, NormalizedNutrientValue> {
  const normalized: Record<string, NormalizedNutrientValue> = {};

  for (const [field, nutrientValue] of Object.entries(input.nutrients)) {
    const value = parseNumericValue(nutrientValue);
    if (value === null || isUnmeasuredZero(value, nutrientValue)) {
      continue;
    }

    if (isVitaminAField(field)) {
      const normalizedValue = normalizeVitaminA(
        field,
        nutrientValue,
        value,
        input,
      );
      if (normalizedValue) {
        normalized.vitaminAIu = normalizedValue;
      } else {
        reviewIssues.push(reviewIssue('VITAMIN_A_FORM_REVIEW_REQUIRED', field));
      }
      continue;
    }

    if (isVitaminDField(field)) {
      const normalizedValue = normalizeVitaminD(
        field,
        nutrientValue,
        value,
        input,
      );
      if (normalizedValue) {
        normalized.vitaminDIu = normalizedValue;
      } else {
        reviewIssues.push(reviewIssue('VITAMIN_D_FORM_REVIEW_REQUIRED', field));
      }
      continue;
    }

    if (isVitaminEField(field)) {
      const normalizedValue = normalizeVitaminE(
        field,
        nutrientValue,
        value,
        input,
      );
      if (normalizedValue) {
        normalized.vitaminEIu = normalizedValue;
      } else {
        reviewIssues.push(reviewIssue('VITAMIN_E_FORM_REVIEW_REQUIRED', field));
      }
      continue;
    }

    normalized[field] = makeNormalizedValue(
      nutrientValue,
      value,
      inferUnit(field, nutrientValue.unit),
      getSourceForm(input, field),
    );
  }

  return normalized;
}

function normalizeVitaminA(
  field: string,
  nutrientValue: NutritionImportNutrientValue,
  value: number,
  input: NutritionImportAuditInput,
): NormalizedNutrientValue | null {
  const unit = inferUnit(field, nutrientValue.unit);
  const sourceForm = getSourceForm(input, field, 'vitaminAIu');
  const form =
    stringMetadata(sourceForm?.vitaminAForm ?? sourceForm?.form) ??
    (normalizeUnit(unit) === 'iu' ? 'SOURCE_DECLARED_IU' : null);
  const calculation = calculateVitaminAActivityIu({
    amount: value,
    unit: unitForVitaminAHelper(unit),
    form: form as VitaminAForm | null,
    retinolUg: numberMetadata(sourceForm?.retinolUg),
    betaCaroteneUg: numberMetadata(sourceForm?.betaCaroteneUg),
  });

  if (!calculation) {
    return null;
  }

  return makeNormalizedValue(nutrientValue, calculation.valueIu, 'IU', {
    ...(sourceForm ?? {}),
    ...buildVitaminASourceFormMetadata(calculation),
  });
}

function normalizeVitaminE(
  field: string,
  nutrientValue: NutritionImportNutrientValue,
  value: number,
  input: NutritionImportAuditInput,
): NormalizedNutrientValue | null {
  const unit = inferUnit(field, nutrientValue.unit);
  const sourceForm = getSourceForm(input, field, 'vitaminEIu');
  const form =
    stringMetadata(sourceForm?.vitaminEForm ?? sourceForm?.form) ??
    (normalizeUnit(unit) === 'iu' ? 'UNKNOWN' : null);
  const calculation = calculateVitaminEActivityIu({
    amount: value,
    unit,
    form: form as VitaminEForm | null,
    alphaTocopherolEquivalentMg: numberMetadata(
      sourceForm?.alphaTocopherolEquivalentMg,
    ),
    alphaTocopherolMg: numberMetadata(sourceForm?.alphaTocopherolMg),
    betaTocopherolMg: numberMetadata(sourceForm?.betaTocopherolMg),
    gammaTocopherolMg: numberMetadata(sourceForm?.gammaTocopherolMg),
    betaGammaTocopherolMg: numberMetadata(sourceForm?.betaGammaTocopherolMg),
    deltaTocopherolMg: numberMetadata(sourceForm?.deltaTocopherolMg),
    totalVitaminEMg: numberMetadata(sourceForm?.totalVitaminEMg),
  });

  if (!calculation) {
    return null;
  }

  return makeNormalizedValue(nutrientValue, calculation.valueIu, 'IU', {
    ...(sourceForm ?? {}),
    ...buildVitaminESourceFormMetadata(calculation),
  });
}

function normalizeVitaminD(
  field: string,
  nutrientValue: NutritionImportNutrientValue,
  value: number,
  input: NutritionImportAuditInput,
): NormalizedNutrientValue | null {
  const unit = inferUnit(field, nutrientValue.unit);
  const sourceForm = getSourceForm(input, field, 'vitaminDIu');
  const form = stringMetadata(sourceForm?.vitaminDForm ?? sourceForm?.form);
  if (!form || !ORDINARY_VITAMIN_D_FORMS.has(form)) {
    return null;
  }

  const normalizedUnit = normalizeUnit(unit);
  const valueIu =
    normalizedUnit === 'iu'
      ? value
      : value * microgramsForUnit(unit) * MICROGRAM_TO_IU_VITAMIN_D;
  if (!Number.isFinite(valueIu)) {
    return null;
  }

  return makeNormalizedValue(nutrientValue, round(valueIu), 'IU', {
    ...(sourceForm ?? {}),
    vitaminDForm: form,
    conversionStatus:
      normalizedUnit === 'iu' ? 'DIRECT_IU' : 'DIRECT_FORM_ACTIVITY',
    conversionFactor: MICROGRAM_TO_IU_VITAMIN_D,
    conversionFactorUnit: 'IU_PER_UG',
  });
}

function auditNegativeValues(
  nutrients: Record<string, NutritionImportNutrientValue>,
  blockingIssues: NutritionAuditIssue[],
): void {
  for (const [field, nutrientValue] of Object.entries(nutrients)) {
    const value = parseNumericValue(nutrientValue);
    if (value !== null && value < 0) {
      blockingIssues.push({
        code: 'NEGATIVE_NUTRIENT_VALUE',
        field,
        path: `nutrients.${field}`,
        value,
        message: `${field} cannot be negative.`,
      });
    }
  }
}

function auditFatChildren(
  nutrients: Record<string, NutritionImportNutrientValue>,
  blockingIssues: NutritionAuditIssue[],
): void {
  const fat = readFirstGramValue(nutrients, [
    'fatG',
    'crudeFatG',
    'fat',
    'crudeFat',
  ]);
  if (!fat) {
    return;
  }

  for (const childField of [
    'linoleicAcid',
    'alphaLinolenicAcid',
    'arachidonicAcid',
  ]) {
    const child = readFirstGramValue(nutrients, gramAliases(childField));
    if (child && child.value > fat.value + EPSILON) {
      blockingIssues.push(
        childExceedsParentIssue(child.field, fat.field, child.value, fat.value),
      );
    }
  }

  const omega3Children = [
    readFirstGramValue(nutrients, gramAliases('epa')),
    readFirstGramValue(nutrients, gramAliases('dha')),
    readFirstGramValue(nutrients, gramAliases('dpa')),
  ].filter((value): value is FieldValue => value !== null);
  const omega3Total = omega3Children.reduce(
    (sum, child) => sum + child.value,
    0,
  );
  if (omega3Total > fat.value + EPSILON) {
    blockingIssues.push({
      code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
      field: 'epaG+dhaG+dpaG',
      fields: omega3Children.map((child) => child.field),
      parentField: fat.field,
      path: 'nutrients.epaG+dhaG+dpaG',
      value: omega3Total,
      parentValue: fat.value,
      message: 'EPA, DHA, and DPA cannot sum above total fat.',
    });
  }
}

function auditAminoAcidChildren(
  nutrients: Record<string, NutritionImportNutrientValue>,
  blockingIssues: NutritionAuditIssue[],
): void {
  const protein = readFirstGramValue(nutrients, [
    'proteinG',
    'crudeProteinG',
    'protein',
    'crudeProtein',
  ]);
  if (!protein) {
    return;
  }

  for (const aminoAcidField of AMINO_ACID_BASE_FIELDS) {
    const aminoAcid = readFirstGramValue(
      nutrients,
      gramAliases(aminoAcidField),
    );
    if (aminoAcid && aminoAcid.value > protein.value + EPSILON) {
      blockingIssues.push(
        childExceedsParentIssue(
          aminoAcid.field,
          protein.field,
          aminoAcid.value,
          protein.value,
        ),
      );
    }
  }
}

function auditAshMinerals(
  nutrients: Record<string, NutritionImportNutrientValue>,
  blockingIssues: NutritionAuditIssue[],
): void {
  const ash = readFirstGramValue(nutrients, ['ashG', 'ash']);
  if (!ash) {
    return;
  }

  const mineralValues = MINERAL_BASE_FIELDS.map((field) =>
    readFirstGramValue(nutrients, mineralAliases(field)),
  ).filter((value): value is FieldValue => value !== null);
  const mineralTotal = mineralValues.reduce(
    (sum, field) => sum + field.value,
    0,
  );
  if (mineralTotal > ash.value + EPSILON) {
    blockingIssues.push({
      code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
      field: 'ashMinerals',
      fields: mineralValues.map((field) => field.field),
      parentField: ash.field,
      path: 'nutrients.ashMinerals',
      value: mineralTotal,
      parentValue: ash.value,
      message: 'Ash minerals cannot sum above total ash.',
    });
  }
}

function auditMacroEnergy(
  input: NutritionImportAuditInput,
  blockingIssues: NutritionAuditIssue[],
  reviewIssues: NutritionAuditIssue[],
): void {
  const protein = readFirstGramValue(input.nutrients, [
    'proteinG',
    'crudeProteinG',
    'protein',
    'crudeProtein',
  ]);
  const carbohydrate = readFirstGramValue(input.nutrients, [
    'carbohydrateG',
    'carbohydratesG',
    'carbsG',
    'carbohydrate',
  ]);
  const fat = readFirstGramValue(input.nutrients, [
    'fatG',
    'crudeFatG',
    'fat',
    'crudeFat',
  ]);
  const energy = readFirstNumericValue(input.nutrients, [
    'energyKcal',
    'energy',
  ]);
  if (!protein || !carbohydrate || !fat || !energy) {
    return;
  }
  if (
    blockingIssues.some(
      (issue) =>
        issue.code === 'NEGATIVE_NUTRIENT_VALUE' &&
        [protein.field, carbohydrate.field, fat.field, energy.field].includes(
          issue.field ?? '',
        ),
    )
  ) {
    return;
  }

  const estimatedValue =
    protein.value * 4 + carbohydrate.value * 4 + fat.value * 9;
  const differenceKcal = Math.abs(energy.value - estimatedValue);
  const differencePercent =
    estimatedValue === 0
      ? differenceKcal === 0
        ? 0
        : Infinity
      : (differenceKcal / estimatedValue) * 100;
  const relativeTolerance =
    input.energyTolerance?.relativePercent ??
    DEFAULT_ENERGY_RELATIVE_TOLERANCE_PERCENT;
  const absoluteTolerance =
    input.energyTolerance?.absoluteKcal ??
    DEFAULT_ENERGY_ABSOLUTE_TOLERANCE_KCAL;

  if (
    differenceKcal > absoluteTolerance + EPSILON &&
    differencePercent > relativeTolerance + EPSILON
  ) {
    reviewIssues.push({
      code: 'MACRO_ENERGY_MISMATCH',
      field: energy.field,
      path: `nutrients.${energy.field}`,
      value: energy.value,
      estimatedValue,
      differenceKcal,
      differencePercent,
      message: 'Source energy differs from Atwater macro estimate.',
    });
  }
}

function isEssentialNutrientPresent(
  nutrients: Record<string, NutritionImportNutrientValue>,
  nutrientCode: string,
): boolean {
  if (nutrientCode === 'methionineCystine') {
    return (
      hasAnyPresentValue(
        nutrients,
        ESSENTIAL_NUTRIENT_ALIASES.get(nutrientCode) ?? [],
      ) ||
      (hasAnyPresentValue(nutrients, gramAliases('methionine')) &&
        hasAnyPresentValue(nutrients, gramAliases('cystine')))
    );
  }
  if (nutrientCode === 'phenylalanineTyrosine') {
    return (
      hasAnyPresentValue(
        nutrients,
        ESSENTIAL_NUTRIENT_ALIASES.get(nutrientCode) ?? [],
      ) ||
      (hasAnyPresentValue(nutrients, gramAliases('phenylalanine')) &&
        hasAnyPresentValue(nutrients, gramAliases('tyrosine')))
    );
  }
  if (nutrientCode === 'epaDha') {
    return (
      hasAnyPresentValue(
        nutrients,
        ESSENTIAL_NUTRIENT_ALIASES.get(nutrientCode) ?? [],
      ) ||
      (hasAnyPresentValue(nutrients, gramAliases('epa')) &&
        hasAnyPresentValue(nutrients, gramAliases('dha')))
    );
  }
  if (nutrientCode === 'calciumPhosphorusRatio') {
    return (
      hasAnyPresentValue(
        nutrients,
        ESSENTIAL_NUTRIENT_ALIASES.get(nutrientCode) ?? [],
      ) ||
      (hasAnyPresentValue(nutrients, mineralAliases('calcium')) &&
        hasAnyPresentValue(nutrients, mineralAliases('phosphorus')))
    );
  }

  return hasAnyPresentValue(
    nutrients,
    ESSENTIAL_NUTRIENT_ALIASES.get(nutrientCode) ?? [],
  );
}

function buildEssentialAliases(nutrient: FediafDogNutrient): string[] {
  const aliases = new Set<string>([
    nutrient.code,
    ...(SPECIAL_NUTRIENT_ALIASES[nutrient.code] ?? []),
  ]);
  const fieldKey = nutrient.fieldPath?.split('.').pop();
  if (fieldKey) {
    aliases.add(fieldKey);
    addUnitAliases(aliases, fieldKey, nutrient.defaultIngredientUnit);
    addUnitAliases(aliases, fieldKey, nutrient.defaultStandardUnit);
  }
  addUnitAliases(aliases, nutrient.code, nutrient.defaultIngredientUnit);
  addUnitAliases(aliases, nutrient.code, nutrient.defaultStandardUnit);

  if (
    nutrient.category === 'MINERAL' ||
    nutrient.category === 'TRACE_ELEMENT'
  ) {
    const mineralField = fieldKey ?? nutrient.code;
    aliases.add(`${mineralField}Mg`);
    aliases.add(`${nutrient.code}Mg`);
  }

  return [...aliases];
}

function addUnitAliases(
  aliases: Set<string>,
  baseField: string,
  unit: string | null,
): void {
  switch (normalizeUnit(unit)) {
    case 'g':
      aliases.add(`${baseField}G`);
      break;
    case 'mg':
      aliases.add(`${baseField}Mg`);
      break;
    case 'ug':
      aliases.add(`${baseField}Ug`);
      aliases.add(`${baseField}Mcg`);
      break;
    case 'iu':
      aliases.add(`${baseField}Iu`);
      aliases.add(`${baseField}IU`);
      break;
  }
}

function hasAnyPresentValue(
  nutrients: Record<string, NutritionImportNutrientValue>,
  aliases: string[],
): boolean {
  return aliases.some((field) => {
    const value = nutrients[field];
    if (!value) {
      return false;
    }
    const numericValue = parseNumericValue(value);
    return numericValue !== null && !isUnmeasuredZero(numericValue, value);
  });
}

interface FieldValue {
  field: string;
  value: number;
}

function readFirstNumericValue(
  nutrients: Record<string, NutritionImportNutrientValue>,
  aliases: string[],
): FieldValue | null {
  for (const field of aliases) {
    const nutrientValue = nutrients[field];
    if (!nutrientValue) {
      continue;
    }
    const value = parseNumericValue(nutrientValue);
    if (value !== null && !isUnmeasuredZero(value, nutrientValue)) {
      return { field, value };
    }
  }
  return null;
}

function readFirstGramValue(
  nutrients: Record<string, NutritionImportNutrientValue>,
  aliases: string[],
): FieldValue | null {
  for (const field of aliases) {
    const nutrientValue = nutrients[field];
    if (!nutrientValue) {
      continue;
    }
    const value = parseNumericValue(nutrientValue);
    if (value === null || isUnmeasuredZero(value, nutrientValue)) {
      continue;
    }
    const grams = gramsForUnit(value, inferUnit(field, nutrientValue.unit));
    if (grams !== null) {
      return { field, value: grams };
    }
  }
  return null;
}

function parseNumericValue(
  nutrientValue: NutritionImportNutrientValue,
): number | null {
  const value = nutrientValue.value;
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }
    const numericValue = Number(trimmedValue);
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  return Number.isFinite(value) ? value : null;
}

function isUnmeasuredZero(
  value: number,
  nutrientValue: NutritionImportNutrientValue,
): boolean {
  return value === 0 && nutrientValue.measuredZero !== true;
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = (unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/\u03bc/g, 'u')
    .replace(/\u00b5/g, 'u');
  if (normalized === 'mcg') {
    return 'ug';
  }
  return normalized;
}

function inferUnit(field: string, unit: string | null | undefined): string {
  if (unit?.trim()) {
    return unit.trim();
  }
  const normalizedField = field.toLowerCase();
  if (normalizedField.endsWith('kcal')) {
    return 'kcal';
  }
  if (normalizedField.endsWith('iu')) {
    return 'IU';
  }
  if (normalizedField.endsWith('mcg') || normalizedField.endsWith('ug')) {
    return 'ug';
  }
  if (normalizedField.endsWith('mg')) {
    return 'mg';
  }
  if (normalizedField.endsWith('g')) {
    return 'g';
  }
  return '';
}

function gramsForUnit(value: number, unit: string): number | null {
  switch (normalizeUnit(unit)) {
    case 'g':
      return value;
    case 'mg':
      return value / 1000;
    case 'ug':
      return value / 1_000_000;
    default:
      return null;
  }
}

function microgramsForUnit(unit: string): number {
  switch (normalizeUnit(unit)) {
    case 'ug':
      return 1;
    case 'mg':
      return 1000;
    default:
      return NaN;
  }
}

function gramAliases(baseField: string): string[] {
  return [baseField, `${baseField}G`, `${baseField}Mg`];
}

function mineralAliases(baseField: string): string[] {
  return [baseField, `${baseField}Mg`, `${baseField}Ug`, `${baseField}Mcg`];
}

function isVitaminAField(field: string): boolean {
  return field.toLowerCase().startsWith('vitamina');
}

function isVitaminDField(field: string): boolean {
  return field.toLowerCase().startsWith('vitamind');
}

function isVitaminEField(field: string): boolean {
  return field.toLowerCase().startsWith('vitamine');
}

function getSourceForm(
  input: NutritionImportAuditInput,
  field: string,
  canonicalField?: string,
): NutritionSourceFormMetadata | undefined {
  return (
    input.sourceForms?.[field] ??
    (canonicalField ? input.sourceForms?.[canonicalField] : undefined)
  );
}

function makeNormalizedValue(
  nutrientValue: NutritionImportNutrientValue,
  value: number,
  unit: string,
  sourceForm?: NutritionSourceFormMetadata,
): NormalizedNutrientValue {
  return {
    value,
    unit,
    sourceValue: nutrientValue.value,
    sourceUnit: nutrientValue.unit ?? null,
    measuredZero: nutrientValue.measuredZero === true,
    ...(sourceForm && Object.keys(sourceForm).length > 0 ? { sourceForm } : {}),
  };
}

function childExceedsParentIssue(
  field: string,
  parentField: string,
  value: number,
  parentValue: number,
): NutritionAuditIssue {
  return {
    code: 'CHILD_NUTRIENT_EXCEEDS_PARENT',
    field,
    fields: [field],
    parentField,
    path: `nutrients.${field}`,
    value,
    parentValue,
    message: `${field} cannot exceed ${parentField}.`,
  };
}

function reviewIssue(
  code:
    | 'VITAMIN_A_FORM_REVIEW_REQUIRED'
    | 'VITAMIN_D_FORM_REVIEW_REQUIRED'
    | 'VITAMIN_E_FORM_REVIEW_REQUIRED',
  field: string,
): NutritionAuditIssue {
  return {
    code,
    field,
    path: `nutrients.${field}`,
    message: `${field} requires source-form review before canonicalization.`,
  };
}

function unitForVitaminAHelper(unit: string): string {
  return normalizeUnit(unit) === 'ug' ? 'mcg' : unit;
}

function stringMetadata(value: SourceFormMetadataValue): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberMetadata(value: SourceFormMetadataValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numericValue = Number(value.trim());
    return Number.isFinite(numericValue) ? numericValue : null;
  }
  return null;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function issueReferencesField(
  issue: NutritionAuditIssue,
  field: string,
): boolean {
  return issue.field === field || issue.fields?.includes(field) === true;
}

function cloneNutrients(
  nutrients: Record<string, NutritionImportNutrientValue>,
): Record<string, NutritionImportNutrientValue> {
  return Object.fromEntries(
    Object.entries(nutrients).map(([field, value]) => [
      field,
      cloneNutrientValue(value),
    ]),
  );
}

function cloneNutrientValue(
  value: NutritionImportNutrientValue,
): NutritionImportNutrientValue {
  return { ...value };
}

function cloneSourceForms(
  sourceForms: Record<string, NutritionSourceFormMetadata>,
): Record<string, NutritionSourceFormMetadata> {
  return Object.fromEntries(
    Object.entries(sourceForms).map(([field, sourceForm]) => [
      field,
      { ...sourceForm },
    ]),
  );
}
