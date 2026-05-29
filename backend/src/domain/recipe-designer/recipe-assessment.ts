import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import {
  getProfileEffectiveWeightG,
  readProfileFieldAmount,
} from './nutrition-profile-reader';
import { calculateDogAtwaterEnergyPer100g } from './dog-atwater-energy';
import type {
  AssessmentEntry,
  AssessmentEntryStatus,
  AssessmentNutrientContributor,
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
  missingAsZero?: boolean;
}

export interface AssessedMacroMetric extends AssessedNutrientValue {
  dryMatterPercent: number | null;
}

export type AssessedMacroMetricKey =
  | 'crudeProtein'
  | 'crudeFat'
  | 'carbohydrate'
  | 'fiber'
  | 'ash'
  | 'moisture'
  | 'energyDensity';

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
  dryMatterEnergyKcalPer100g: number | null;
  energyDensityKcalPerKg: number | null;
  normalizedToKg: false;
  items: DesignRecipeAssessmentResultItem[];
  nutrients: Record<string, AssessedNutrientValue>;
  macroMetrics: Record<AssessedMacroMetricKey, AssessedMacroMetric>;
  groupedEntries: GroupedAssessmentEntry[];
  entries: AssessmentEntry[];
  overallStatus: AssessmentOverallStatus;
  summary: DesignRecipeAssessmentSummary;
  rawSummary: DesignRecipeAssessmentSummary;
}

interface FieldTotal {
  total: number;
  missing: boolean;
  missingAsZero?: boolean;
}

interface CalculatedAssessmentValue {
  value: number | null;
  missingAsZero?: boolean;
}

const KCAL_TO_MJ = 0.004184;
const SELENIUM_WET_DIET_NUTRIENT_KEY = 'seleniumWetDiet';
const SELENIUM_DRY_DIET_NUTRIENT_KEY = 'seleniumDryDiet';
const DRY_DOG_FOOD_MAX_MOISTURE_PERCENT = 14;
const DRY_MATTER_LEGAL_MAX_NUTRIENT_KEYS = new Set([
  'copper',
  'iodine',
  'iron',
  'manganese',
  'zinc',
]);
const SELENIUM_NUTRIENT_KEYS = new Set([
  'selenium',
  SELENIUM_WET_DIET_NUTRIENT_KEY,
  SELENIUM_DRY_DIET_NUTRIENT_KEY,
]);
const SELENIUM_FIELD_PATH = 'minerals.selenium';
const SUPPLEMENT_INGREDIENT_TYPE = 'SUPPLEMENT';
const SELENIUM_LEGAL_MAX_NOTE =
  'FEDIAF 的硒欧盟法定上限按干物质给出；仅在含硒补剂或营养添加剂参与配方时启用，并按成品总硒（食材来源 + 添加来源）判定。该上限对应欧盟法律规定的宠物食品上限，不代表中国法规要求。这里已按当前配方能量密度折算为 /1000kcal ME；有机硒另有最大补充量限制，需要能识别有机硒来源后单独评估。';
const SELENIUM_RANGE_CONFLICT_NOTE =
  '当前配方能量密度下，硒的推荐下限高于折算欧盟法定上限，无可行区间；该上限仅在含硒补剂或营养添加剂时启用。';
const ARGININE_NUTRIENT_KEY = 'arginine';
const CRUDE_PROTEIN_NUTRIENT_KEYS = new Set([
  'crudeProtein',
  'crude_protein',
  'protein',
]);
const FEDIAF_STANDARD_DRY_MATTER_ENERGY_KCAL_PER_100G = 400;
const ARGININE_EXTRA_PER_PROTEIN_DM_PERCENT = 0.01;
const MACRO_METRIC_FIELD_PATHS = {
  crudeProtein: 'macros.crudeProtein',
  crudeFat: 'macros.crudeFat',
  carbohydrate: 'macros.carbohydrate',
  fiber: 'macros.fiber',
  ash: 'macros.ash',
  moisture: 'macros.moisture',
} as const satisfies Record<
  Exclude<AssessedMacroMetricKey, 'energyDensity'>,
  string
>;

export function assessRecipeDraft(
  input: DesignRecipeAssessmentInput,
): DesignRecipeAssessmentResult {
  validateItems(input.items);

  const totalWeightG = input.items.reduce(
    (sum, item) => sum + getItemEffectiveWeightG(item),
    0,
  );
  const energyTotal = getDogAtwaterEnergyTotal(input.items);
  const moistureTotal = getFieldTotal(input.items, 'macros.moisture', {
    missingValueAsZeroForSupplements: true,
  });
  const totalEnergyKcal = energyTotal.missing
    ? null
    : finiteOrNull(energyTotal.total);
  const moistureG = moistureTotal.total;
  const dryMatterG = moistureTotal.missing
    ? null
    : finiteOrNull(Math.max(totalWeightG - moistureG, 0));
  const dryMatterEnergyKcalPer100g =
    totalEnergyKcal !== null &&
    dryMatterG !== null &&
    isPositiveFiniteNumber(dryMatterG)
      ? finiteOrNull((totalEnergyKcal / dryMatterG) * 100)
      : null;
  const energyDensityKcalPerKg =
    totalWeightG > 0 && totalEnergyKcal !== null
      ? finiteOrNull((totalEnergyKcal / totalWeightG) * 1000)
      : null;
  const crudeProteinDryMatterPercent = calculateFieldDryMatterPercent(
    input.items,
    MACRO_METRIC_FIELD_PATHS.crudeProtein,
    dryMatterG,
  );

  const assessedEntries = input.targets.map((target) =>
    assessTarget(target, input.items, energyTotal, moistureTotal, dryMatterG),
  );
  const arginineAdjustedEntries = applyArginineProteinMinimumAdjustment(
    assessedEntries,
    crudeProteinDryMatterPercent,
    dryMatterEnergyKcalPer100g,
  );
  const seleniumScopedEntries = applySeleniumLegalMaxApplicability(
    arginineAdjustedEntries,
    input.items,
  );
  const legalMaxConvertedEntries = applyDryMatterLegalMaxConversion(
    seleniumScopedEntries,
    dryMatterEnergyKcalPer100g,
  );
  const entries = selectAdultSeleniumDietTargets(
    legalMaxConvertedEntries,
    input.scenario,
    totalWeightG,
    moistureTotal,
  );
  const groupedEntries = groupAssessmentEntries(entries);
  const summary = summarizeEntries(groupedEntries);
  const rawSummary = summarizeEntries(entries);

  return {
    scenario: input.scenario,
    totalWeightG,
    totalEnergyKcal,
    dryMatterG,
    dryMatterEnergyKcalPer100g,
    energyDensityKcalPerKg,
    normalizedToKg: false,
    items: input.items.map((item) => ({
      id: item.id,
      name: item.name,
      weightG: item.weightG,
      ratioPercent:
        totalWeightG > 0 ? (getItemEffectiveWeightG(item) / totalWeightG) * 100 : 0,
    })),
    nutrients: buildNutrientTotals(input.targets, input.items, energyTotal),
    macroMetrics: buildMacroMetrics(
      input.items,
      energyTotal,
      dryMatterG,
      energyDensityKcalPerKg,
    ),
    groupedEntries,
    entries,
    overallStatus: getOverallStatus(groupedEntries),
    summary,
    rawSummary,
  };
}

function applyArginineProteinMinimumAdjustment(
  entries: AssessmentEntry[],
  crudeProteinDryMatterPercent: number | null,
  dryMatterEnergyKcalPer100g: number | null,
): AssessmentEntry[] {
  if (
    crudeProteinDryMatterPercent === null ||
    !isPositiveFiniteNumber(crudeProteinDryMatterPercent) ||
    dryMatterEnergyKcalPer100g === null ||
    !isPositiveFiniteNumber(dryMatterEnergyKcalPer100g)
  ) {
    return entries;
  }

  const baseProteinDryMatter = entries.find(
    (entry) =>
      CRUDE_PROTEIN_NUTRIENT_KEYS.has(entry.nutrientKey) &&
      entry.expressionBasis === 'PER_100G_DRY_MATTER' &&
      entry.minValue !== null,
  )?.minValue;
  const baseArginineDryMatter = entries.find(
    (entry) =>
      entry.nutrientKey === ARGININE_NUTRIENT_KEY &&
      entry.expressionBasis === 'PER_100G_DRY_MATTER' &&
      entry.minValue !== null,
  )?.minValue;

  if (
    baseProteinDryMatter === null ||
    baseProteinDryMatter === undefined ||
    baseArginineDryMatter === null ||
    baseArginineDryMatter === undefined
  ) {
    return entries;
  }

  const extraProteinDryMatter = Math.max(
    0,
    crudeProteinDryMatterPercent - baseProteinDryMatter,
  );
  const extraArginineDryMatter =
    extraProteinDryMatter * ARGININE_EXTRA_PER_PROTEIN_DM_PERCENT;
  const adjustedArginineDryMatter = finiteOrNull(
    baseArginineDryMatter + extraArginineDryMatter,
  );

  if (adjustedArginineDryMatter === null) {
    return entries;
  }

  const minValueNote = formatArginineProteinMinimumNote({
    crudeProteinDryMatterPercent,
    baseProteinDryMatter,
    baseArginineDryMatter,
    adjustedArginineDryMatter,
  });

  return entries.map((entry) => {
    if (entry.nutrientKey !== ARGININE_NUTRIENT_KEY) {
      return entry;
    }

    const adjustedMinValue = convertArginineDryMatterMinimum({
      entry,
      adjustedArginineDryMatter,
      extraArginineDryMatter,
    });

    if (adjustedMinValue === null) {
      return entry;
    }

    return {
      ...entry,
      minValue: adjustedMinValue,
      minValueNote: appendAssessmentNote(entry.minValueNote, minValueNote),
      status: getEntryStatus(entry.currentValue, {
        minValue: adjustedMinValue,
        maxValue: entry.maxValue,
      }),
    };
  });
}

function convertArginineDryMatterMinimum({
  entry,
  adjustedArginineDryMatter,
  extraArginineDryMatter,
}: {
  entry: AssessmentEntry;
  adjustedArginineDryMatter: number;
  extraArginineDryMatter: number;
}): number | null {
  switch (entry.expressionBasis) {
    case 'PER_100G_DRY_MATTER':
      return adjustedArginineDryMatter;
    case 'PER_1000_KCAL_ME':
      return finiteOrNull(
        (entry.minValue ?? 0) +
          (extraArginineDryMatter * 1000) /
            FEDIAF_STANDARD_DRY_MATTER_ENERGY_KCAL_PER_100G,
      );
    case 'PER_MJ_ME':
      return finiteOrNull(
        (entry.minValue ?? 0) +
          extraArginineDryMatter /
            (FEDIAF_STANDARD_DRY_MATTER_ENERGY_KCAL_PER_100G * KCAL_TO_MJ),
      );
    default:
      return null;
  }
}

function formatArginineProteinMinimumNote({
  crudeProteinDryMatterPercent,
  baseProteinDryMatter,
  baseArginineDryMatter,
  adjustedArginineDryMatter,
}: {
  crudeProteinDryMatterPercent: number;
  baseProteinDryMatter: number;
  baseArginineDryMatter: number;
  adjustedArginineDryMatter: number;
}): string {
  const base = `FEDIAF Annex 7.4：犬粮中蛋白每高出推荐值 1% DM，精氨酸需求增加 0.01g/100g DM。当前粗蛋白 ${formatFixedPercent(crudeProteinDryMatterPercent)}% DM，基础蛋白 ${formatFixedPercent(baseProteinDryMatter)}% DM。`;

  if (adjustedArginineDryMatter <= baseArginineDryMatter) {
    return `${base} 当前粗蛋白未高于基础蛋白，使用标准精氨酸下限 ${formatFixedPercent(baseArginineDryMatter)}g/100g DM。/1000kcal ME 和 /MJ ME 按 FEDIAF 标准表换算，不按当前配方能量密度折低。`;
  }

  return `${base} 已将精氨酸下限从 ${formatFixedPercent(baseArginineDryMatter)}g/100g DM 调整为 ${formatFixedPercent(adjustedArginineDryMatter)}g/100g DM。/1000kcal ME 和 /MJ ME 按 FEDIAF 标准表换算，不按当前配方能量密度折低。`;
}

function formatFixedPercent(value: number): string {
  return value.toFixed(2);
}

function appendAssessmentNote(
  existingNote: string | null | undefined,
  note: string,
): string {
  if (!existingNote) {
    return note;
  }

  return existingNote.includes(note) ? existingNote : `${existingNote}\n${note}`;
}

function selectAdultSeleniumDietTargets(
  entries: AssessmentEntry[],
  scenario: FediafDogScenarioCode,
  totalWeightG: number,
  moistureTotal: FieldTotal,
): AssessmentEntry[] {
  if (
    !isAdultDogScenario(scenario) ||
    !entries.some((entry) => isAdultSeleniumDietTarget(entry.nutrientKey))
  ) {
    return entries;
  }

  const selectedNutrientKey = resolveAdultSeleniumDietNutrientKey(
    totalWeightG,
    moistureTotal,
  );
  const omittedNutrientKey =
    selectedNutrientKey === SELENIUM_DRY_DIET_NUTRIENT_KEY
      ? SELENIUM_WET_DIET_NUTRIENT_KEY
      : SELENIUM_DRY_DIET_NUTRIENT_KEY;

  return entries.filter((entry) => entry.nutrientKey !== omittedNutrientKey);
}

function isAdultDogScenario(scenario: FediafDogScenarioCode): boolean {
  return scenario === 'ADULT_MER_95' || scenario === 'ADULT_MER_110';
}

function isAdultSeleniumDietTarget(nutrientKey: string): boolean {
  return (
    nutrientKey === SELENIUM_WET_DIET_NUTRIENT_KEY ||
    nutrientKey === SELENIUM_DRY_DIET_NUTRIENT_KEY
  );
}

function resolveAdultSeleniumDietNutrientKey(
  totalWeightG: number,
  moistureTotal: FieldTotal,
): string {
  const moisturePercent = getRecipeMoisturePercent(
    totalWeightG,
    moistureTotal,
  );

  return moisturePercent !== null &&
    moisturePercent <= DRY_DOG_FOOD_MAX_MOISTURE_PERCENT
    ? SELENIUM_DRY_DIET_NUTRIENT_KEY
    : SELENIUM_WET_DIET_NUTRIENT_KEY;
}

function getRecipeMoisturePercent(
  totalWeightG: number,
  moistureTotal: FieldTotal,
): number | null {
  if (
    moistureTotal.missing ||
    totalWeightG <= 0 ||
    !Number.isFinite(moistureTotal.total)
  ) {
    return null;
  }

  return finiteOrNull((moistureTotal.total / totalWeightG) * 100);
}

function applySeleniumLegalMaxApplicability(
  entries: AssessmentEntry[],
  items: DesignRecipeAssessmentItemInput[],
): AssessmentEntry[] {
  if (hasSeleniumSupplementSource(items)) {
    return entries;
  }

  return entries.map((entry) =>
    isSeleniumNutrient(entry.nutrientKey)
      ? clearAssessmentMaximum(entry)
      : entry,
  );
}

function hasSeleniumSupplementSource(
  items: DesignRecipeAssessmentItemInput[],
): boolean {
  return items.some(
    (item) => isSupplementIngredient(item) && hasPositiveSeleniumAmount(item),
  );
}

function isSupplementIngredient(item: DesignRecipeAssessmentItemInput): boolean {
  return (
    typeof item.ingredientType === 'string' &&
    item.ingredientType.toUpperCase() === SUPPLEMENT_INGREDIENT_TYPE
  );
}

function hasPositiveSeleniumAmount(
  item: DesignRecipeAssessmentItemInput,
): boolean {
  const read = readProfileFieldAmount(
    item.nutritionProfile,
    SELENIUM_FIELD_PATH,
    item.weightG,
  );

  return (
    !read.missing &&
    read.amount !== null &&
    isPositiveFiniteNumber(read.amount)
  );
}

function clearAssessmentMaximum(entry: AssessmentEntry): AssessmentEntry {
  const {
    maxValueLabel: _maxValueLabel,
    maxValueNote: _maxValueNote,
    rangeConflict: _rangeConflict,
    rangeConflictNote: _rangeConflictNote,
    ...entryWithoutMaximumMetadata
  } = entry;

  return {
    ...entryWithoutMaximumMetadata,
    maxValue: null,
    status: getEntryStatus(entry.currentValue, {
      minValue: entry.minValue,
      maxValue: null,
    }),
  };
}

function applyDryMatterLegalMaxConversion(
  entries: AssessmentEntry[],
  dryMatterEnergyKcalPer100g: number | null,
): AssessmentEntry[] {
  if (
    dryMatterEnergyKcalPer100g === null ||
    !isPositiveFiniteNumber(dryMatterEnergyKcalPer100g)
  ) {
    return entries;
  }

  const dryMatterLegalMaxByNutrient = new Map<string, AssessmentEntry>();
  for (const entry of entries) {
    if (
      isDryMatterLegalMaxNutrient(entry.nutrientKey) &&
      entry.expressionBasis === 'PER_100G_DRY_MATTER' &&
      entry.maxValue !== null
    ) {
      dryMatterLegalMaxByNutrient.set(entry.nutrientKey, entry);
    }
  }

  if (dryMatterLegalMaxByNutrient.size === 0) {
    return entries;
  }

  return entries.map((entry) => {
    if (
      !isDryMatterLegalMaxNutrient(entry.nutrientKey) ||
      entry.expressionBasis !== 'PER_1000_KCAL_ME'
    ) {
      return entry;
    }

    const dryMatterLegalMax = dryMatterLegalMaxByNutrient.get(
      entry.nutrientKey,
    );
    if (!dryMatterLegalMax || dryMatterLegalMax.maxValue === null) {
      return entry;
    }

    const convertedMax = finiteOrNull(
      (dryMatterLegalMax.maxValue * 1000) / dryMatterEnergyKcalPer100g,
    );
    if (convertedMax === null) {
      return entry;
    }

    const rangeConflict =
      entry.minValue !== null && convertedMax < entry.minValue;
    const {
      excludeFromAttention: _excludeFromAttention,
      ...entryForAssessment
    } = entry;

    return {
      ...entryForAssessment,
      maxValue: convertedMax,
      maxValueLabel: '欧盟法定上限',
      maxValueNote: appendAssessmentNote(
        entry.maxValueNote,
        formatDryMatterLegalMaxNote(entry),
      ),
      ...(rangeConflict
        ? {
            rangeConflict: true,
            rangeConflictNote: formatDryMatterLegalMaxRangeConflictNote(entry),
          }
        : {}),
      status: getEntryStatus(entry.currentValue, {
        minValue: entry.minValue,
        maxValue: convertedMax,
      }),
    };
  });
}

function isDryMatterLegalMaxNutrient(nutrientKey: string): boolean {
  return (
    DRY_MATTER_LEGAL_MAX_NUTRIENT_KEYS.has(nutrientKey) ||
    isSeleniumNutrient(nutrientKey)
  );
}

function isSeleniumNutrient(nutrientKey: string): boolean {
  return SELENIUM_NUTRIENT_KEYS.has(nutrientKey);
}

function formatDryMatterLegalMaxNote(entry: AssessmentEntry): string {
  if (isSeleniumNutrient(entry.nutrientKey)) {
    return SELENIUM_LEGAL_MAX_NOTE;
  }

  return `FEDIAF 的${entry.label}欧盟法定上限按干物质给出。该上限来源于 FEDIAF 表中标注的 (L)，对应欧盟法律规定的宠物食品上限，不代表中国法规要求。这里已按当前配方能量密度折算为 /1000kcal ME。`;
}

function formatDryMatterLegalMaxRangeConflictNote(
  entry: AssessmentEntry,
): string {
  if (isSeleniumNutrient(entry.nutrientKey)) {
    return SELENIUM_RANGE_CONFLICT_NOTE;
  }

  return `当前配方能量密度下，${entry.label}的推荐下限高于折算欧盟法定上限，无可行区间。`;
}

function buildMacroMetrics(
  items: DesignRecipeAssessmentItemInput[],
  energyTotal: FieldTotal,
  dryMatterG: number | null,
  energyDensityKcalPerKg: number | null,
): Record<AssessedMacroMetricKey, AssessedMacroMetric> {
  const metrics = {} as Record<AssessedMacroMetricKey, AssessedMacroMetric>;

  for (const [key, fieldPath] of Object.entries(MACRO_METRIC_FIELD_PATHS)) {
    const total = getFieldTotal(items, fieldPath, {
      missingValueAsZero: true,
    });
    metrics[key as Exclude<AssessedMacroMetricKey, 'energyDensity'>] =
      createMacroMetric(total, energyTotal, dryMatterG, key === 'moisture');
  }

  metrics.energyDensity = {
    total: energyDensityKcalPerKg,
    per1000Kcal: null,
    dryMatterPercent: null,
  };

  return metrics;
}

function createMacroMetric(
  total: FieldTotal,
  energyTotal: FieldTotal,
  dryMatterG: number | null,
  omitDryMatterPercent = false,
): AssessedMacroMetric {
  const finiteTotal = total.missing ? null : finiteOrNull(total.total);

  return {
    total: finiteTotal,
    per1000Kcal:
      finiteTotal === null ||
      energyTotal.missing ||
      !isPositiveFiniteNumber(energyTotal.total)
        ? null
        : finiteOrNull((finiteTotal / energyTotal.total) * 1000),
    dryMatterPercent:
      omitDryMatterPercent ||
      finiteTotal === null ||
      dryMatterG === null ||
      !isPositiveFiniteNumber(dryMatterG)
        ? null
        : finiteOrNull((finiteTotal / dryMatterG) * 100),
    ...(total.missingAsZero ? { missingAsZero: true } : {}),
  };
}

function calculateFieldDryMatterPercent(
  items: DesignRecipeAssessmentItemInput[],
  fieldPath: string,
  dryMatterG: number | null,
): number | null {
  const total = getFieldTotal(items, fieldPath, {
    missingValueAsZeroForSupplements: true,
  });
  return total.missing ||
    dryMatterG === null ||
    !isPositiveFiniteNumber(dryMatterG)
    ? null
    : finiteOrNull((total.total / dryMatterG) * 100);
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
  const runtimeFieldPaths = getRuntimeFieldPaths(target.fieldPaths);
  const canCalculate =
    !bounds.malformed &&
    isSupportedCategory(target.category) &&
    isSupportedExpressionBasis(target.expressionBasis) &&
    !hasMalformedCalculation(target) &&
    !hasMalformedRatioSemantics(target) &&
    (isRatioTarget(target) ||
      (runtimeFieldPaths !== null &&
        hasValidNonRatioFieldPaths(target, runtimeFieldPaths) &&
        haveCompatibleFieldUnits(runtimeFieldPaths, target.unit)));
  const calculatedValue: CalculatedAssessmentValue = !canCalculate
    ? { value: null }
    : isRatioTarget(target)
      ? calculateRatioValue(target, items)
      : calculateExpressedValue(
          target,
          items,
          energyTotal,
          moistureTotal,
          dryMatterG,
        );
  const currentValue = finiteOrNull(calculatedValue.value);
  const contributors =
    canCalculate && !isRatioTarget(target)
      ? buildTargetContributors(target, items)
      : [];
  const excludeFromAttention =
    canCalculate &&
    (target.excludeFromAttention || isReferenceOnlyBounds(bounds));

  return {
    nutrientKey: target.nutrientKey,
    label: target.label,
    category: target.category,
    expressionBasis: target.expressionBasis,
    unit: target.unit,
    minValue: bounds.minValue,
    maxValue: bounds.maxValue,
    ...(target.minValueNote ? { minValueNote: target.minValueNote } : {}),
    ...(target.maxValueNote ? { maxValueNote: target.maxValueNote } : {}),
    ...(target.maxValueLabel ? { maxValueLabel: target.maxValueLabel } : {}),
    ...(excludeFromAttention ? { excludeFromAttention: true } : {}),
    currentValue,
    status: canCalculate
      ? getEntryStatus(currentValue, bounds)
      : 'MISSING_DATA',
    ...(calculatedValue.missingAsZero ? { missingAsZero: true } : {}),
    ...(contributors.length > 0 ? { contributors } : {}),
  };
}

function calculateRatioValue(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
): CalculatedAssessmentValue {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  if (
    !fieldPaths ||
    fieldPaths.length !== 2 ||
    hasDuplicateFieldPaths(fieldPaths)
  ) {
    return { value: null };
  }

  if (!haveMatchingFieldUnits(fieldPaths)) {
    return { value: null };
  }

  const [numeratorPath, denominatorPath] = fieldPaths;

  if (!numeratorPath || !denominatorPath) {
    return { value: null };
  }

  const numerator = getFieldTotal(items, numeratorPath, {
    missingValueAsZero: true,
  });
  const denominator = getFieldTotal(items, denominatorPath, {
    missingValueAsZero: true,
  });

  if (
    numerator.missing ||
    denominator.missing ||
    !Number.isFinite(numerator.total)
  ) {
    return { value: null };
  }

  const missingAsZero = Boolean(
    numerator.missingAsZero || denominator.missingAsZero,
  );

  if (!isPositiveFiniteNumber(denominator.total)) {
    return numerator.total === 0 && missingAsZero
      ? { value: 0, missingAsZero: true }
      : { value: null };
  }

  return {
    value: finiteOrNull(numerator.total / denominator.total),
    ...(missingAsZero ? { missingAsZero: true } : {}),
  };
}

function calculateExpressedValue(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
  energyTotal: FieldTotal,
  moistureTotal: FieldTotal,
  dryMatterG: number | null,
): CalculatedAssessmentValue {
  const combinedTotal = getTargetFieldTotal(items, target);

  if (combinedTotal.missing) {
    return { value: null };
  }

  switch (target.expressionBasis) {
    case 'PER_1000_KCAL_ME':
      return {
        value:
          !energyTotal.missing && isPositiveFiniteNumber(energyTotal.total)
            ? finiteOrNull((combinedTotal.total / energyTotal.total) * 1000)
            : null,
        ...(combinedTotal.missingAsZero ? { missingAsZero: true } : {}),
      };
    case 'PER_MJ_ME':
      return {
        value:
          !energyTotal.missing && isPositiveFiniteNumber(energyTotal.total)
            ? finiteOrNull(combinedTotal.total / (energyTotal.total * KCAL_TO_MJ))
            : null,
        ...(combinedTotal.missingAsZero ? { missingAsZero: true } : {}),
      };
    case 'PER_100G_DRY_MATTER':
      return {
        value:
          !moistureTotal.missing && dryMatterG !== null && dryMatterG > 0
            ? finiteOrNull((combinedTotal.total / dryMatterG) * 100)
            : combinedTotal.total === 0
              ? 0
              : null,
        ...(combinedTotal.missingAsZero ? { missingAsZero: true } : {}),
      };
    case 'RATIO':
      return { value: null };
    default:
      return { value: null };
  }
}

function buildTargetContributors(
  target: FediafAssessmentTarget,
  items: DesignRecipeAssessmentItemInput[],
): AssessmentNutrientContributor[] {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  if (!fieldPaths || !hasValidNonRatioFieldPaths(target, fieldPaths)) {
    return [];
  }

  const sourceUnit = getCompatibleSourceUnit(fieldPaths, target.unit);
  if (!sourceUnit) {
    return [];
  }

  const contributors = items.map((item) => {
    const contribution = getItemCombinedFieldAmount(
      item,
      fieldPaths,
      sourceUnit,
      target.unit,
    );

    return {
      itemId: item.id,
      itemName: item.name,
      weightG: item.weightG,
      amountUnit: getItemAmountUnit(item),
      amount: contribution.amount,
      unit: target.unit,
      contributionPercent: null,
      missing: contribution.missing,
      ...(contribution.missingAsZero ? { missingAsZero: true } : {}),
    } satisfies AssessmentNutrientContributor;
  });

  const knownTotal = contributors.reduce((sum, contributor) => {
    return contributor.amount !== null ? sum + contributor.amount : sum;
  }, 0);

  return contributors
    .map((contributor) => ({
      ...contributor,
      contributionPercent:
        contributor.amount !== null && isPositiveFiniteNumber(knownTotal)
          ? finiteOrNull((contributor.amount / knownTotal) * 100)
          : null,
    }))
    .sort(compareContributors);
}

function getItemCombinedFieldAmount(
  item: DesignRecipeAssessmentItemInput,
  fieldPaths: string[],
  sourceUnit: string,
  targetUnit: string,
): { amount: number | null; missing: boolean; missingAsZero?: boolean } {
  if (item.weightG === 0) {
    return { amount: 0, missing: false };
  }

  let amount = 0;
  let missingAsZero = false;

  for (const fieldPath of fieldPaths) {
    const read = readProfileFieldAmount(
      item.nutritionProfile,
      fieldPath,
      item.weightG,
      { missingValueAsZero: true },
    );

    if (read.missing || read.amount === null) {
      return { amount: null, missing: true };
    }

    amount += read.amount;
    missingAsZero = missingAsZero || Boolean(read.missingAsZero);
  }

  const convertedAmount = finiteOrNull(
    convertUnitValue(amount, sourceUnit, targetUnit),
  );

  if (convertedAmount === null || convertedAmount < 0) {
    return { amount: null, missing: true };
  }

  return {
    amount: convertedAmount,
    missing: false,
    ...(missingAsZero ? { missingAsZero: true } : {}),
  };
}

function compareContributors(
  left: AssessmentNutrientContributor,
  right: AssessmentNutrientContributor,
): number {
  if (left.missing !== right.missing) {
    return left.missing ? 1 : -1;
  }

  const leftPercent = left.contributionPercent ?? -1;
  const rightPercent = right.contributionPercent ?? -1;
  if (leftPercent !== rightPercent) {
    return rightPercent - leftPercent;
  }

  const leftAmount = left.amount ?? -1;
  const rightAmount = right.amount ?? -1;
  if (leftAmount !== rightAmount) {
    return rightAmount - leftAmount;
  }

  return left.itemName.localeCompare(right.itemName);
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
  options: {
    missingValueAsZero?: boolean;
    missingValueAsZeroForSupplements?: boolean;
  } = {},
): FieldTotal {
  let total = 0;
  let hasPositiveWeightItem = false;
  let missing = false;
  let missingAsZero = false;

  for (const item of items) {
    if (item.weightG === 0) {
      continue;
    }

    hasPositiveWeightItem = true;
    const missingValueAsZero =
      options.missingValueAsZero ||
      (options.missingValueAsZeroForSupplements && isSupplementIngredient(item));
    const read = readProfileFieldAmount(
      item.nutritionProfile,
      fieldPath,
      item.weightG,
      { missingValueAsZero },
    );

    if (read.missing || read.amount === null) {
      missing = true;
      continue;
    }

    total += read.amount;
    missingAsZero = missingAsZero || Boolean(read.missingAsZero);
  }

  const noPositiveItemsMissingAsZero =
    options.missingValueAsZero && !hasPositiveWeightItem;

  return {
    total,
    missing: options.missingValueAsZero
      ? missing
      : !hasPositiveWeightItem || missing,
    ...(missingAsZero || noPositiveItemsMissingAsZero
      ? { missingAsZero: true }
      : {}),
  };
}

function getDogAtwaterEnergyTotal(
  items: DesignRecipeAssessmentItemInput[],
): FieldTotal {
  let total = 0;
  let hasPositiveWeightItem = false;
  let missing = false;
  let missingAsZero = false;

  for (const item of items) {
    if (item.weightG === 0) {
      continue;
    }

    hasPositiveWeightItem = true;

    if (isSupplementIngredient(item)) {
      const read = readProfileFieldAmount(
        item.nutritionProfile,
        'macros.energyKcal',
        item.weightG,
        { missingValueAsZero: true },
      );
      if (read.missing || read.amount === null) {
        missing = true;
        continue;
      }
      total += read.amount;
      missingAsZero = missingAsZero || Boolean(read.missingAsZero);
      continue;
    }

    const calculation = calculateDogAtwaterEnergyPer100g(
      item.nutritionProfile,
    );
    if (calculation.energyKcalPer100g === null) {
      missing = true;
      continue;
    }

    total += (calculation.energyKcalPer100g * item.weightG) / 100;
  }

  return {
    total,
    missing: !hasPositiveWeightItem || missing,
    ...(missingAsZero ? { missingAsZero: true } : {}),
  };
}

function getItemEffectiveWeightG(item: DesignRecipeAssessmentItemInput): number {
  return getProfileEffectiveWeightG(item.nutritionProfile, item.weightG);
}

function getItemAmountUnit(item: DesignRecipeAssessmentItemInput): string {
  const meta = (item.nutritionProfile as any)?.meta ?? {};
  const rawBasisType = meta.rawBasisType;
  if (typeof meta.amountUnitLabel === 'string' && meta.amountUnitLabel.trim()) {
    return meta.amountUnitLabel.trim();
  }
  if (rawBasisType === 'PER_SERVING') {
    return typeof meta.servingUnitLabel === 'string' && meta.servingUnitLabel.trim()
      ? meta.servingUnitLabel.trim()
      : '份';
  }
  if (rawBasisType === 'PER_1_ML' || rawBasisType === 'PER_100_ML') {
    return 'ml';
  }
  return 'g';
}

function getCombinedFieldTotal(
  items: DesignRecipeAssessmentItemInput[],
  fieldPaths: unknown,
  targetUnit: string,
  options: { missingValueAsZero?: boolean } = {},
): FieldTotal {
  const runtimeFieldPaths = getRuntimeFieldPaths(fieldPaths);
  const sourceUnit = runtimeFieldPaths
    ? getCompatibleSourceUnit(runtimeFieldPaths, targetUnit)
    : null;

  if (
    !runtimeFieldPaths ||
    runtimeFieldPaths.length === 0 ||
    !sourceUnit
  ) {
    return { total: 0, missing: true };
  }

  const combined = runtimeFieldPaths.reduce<FieldTotal>(
    (sum, fieldPath) => {
      const fieldTotal = getFieldTotal(items, fieldPath, options);
      return {
        total: sum.total + fieldTotal.total,
        missing: sum.missing || fieldTotal.missing,
        missingAsZero: sum.missingAsZero || fieldTotal.missingAsZero,
      };
    },
    { total: 0, missing: false },
  );

  return {
    total: convertUnitValue(combined.total, sourceUnit, targetUnit),
    missing: combined.missing,
    ...(combined.missingAsZero ? { missingAsZero: true } : {}),
  };
}

function getTargetFieldTotal(
  items: DesignRecipeAssessmentItemInput[],
  target: FediafAssessmentTarget,
): FieldTotal {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);

  if (!fieldPaths || !hasValidNonRatioFieldPaths(target, fieldPaths)) {
    return { total: 0, missing: true };
  }

  return getCombinedFieldTotal(items, fieldPaths, target.unit, {
    missingValueAsZero: true,
  });
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
      ...(total.missingAsZero ? { missingAsZero: true } : {}),
    };
  }

  return nutrients;
}

function getEntryStatus(
  currentValue: number | null,
  target: { minValue: number | null; maxValue: number | null },
): AssessmentEntryStatus {
  if (target.minValue === null && target.maxValue === null) {
    return 'INFO';
  }

  if (currentValue === null) {
    return 'MISSING_DATA';
  }

  if (target.maxValue !== null && currentValue > target.maxValue) {
    return 'EXCESS';
  }

  if (target.minValue !== null && currentValue < target.minValue) {
    return 'DEFICIENT';
  }

  return 'COMPLIANT';
}

function isRatioTarget(target: FediafAssessmentTarget): boolean {
  const fieldPaths = getRuntimeFieldPaths(target.fieldPaths);
  const hasExplicitRatioCalculation = target.calculation === 'RATIO';
  const hasNativeRatioBasis =
    target.expressionBasis === 'RATIO' && target.calculation === undefined;

  return (
    isRatioShaped(target) &&
    target.category === 'RATIO' &&
    isSupportedExpressionBasis(target.expressionBasis) &&
    (hasExplicitRatioCalculation || hasNativeRatioBasis) &&
    fieldPaths?.length === 2 &&
    !hasDuplicateFieldPaths(fieldPaths)
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
  return getCompatibleSourceUnit(fieldPaths, targetUnit) !== null;
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

function getCompatibleSourceUnit(
  fieldPaths: string[],
  targetUnit: string,
): string | null {
  const fieldUnits = getFieldUnits(fieldPaths);
  const firstUnit = fieldUnits[0];

  if (
    firstUnit === null ||
    !fieldUnits.every((fieldUnit) => fieldUnit === firstUnit)
  ) {
    return null;
  }

  return canConvertUnit(firstUnit, targetUnit) ? firstUnit : null;
}

function canConvertUnit(fromUnit: string, toUnit: string): boolean {
  return (
    normalizeUnit(fromUnit) === normalizeUnit(toUnit) ||
    convertMassUnit(1, fromUnit, toUnit) !== null
  );
}

function convertUnitValue(value: number, fromUnit: string, toUnit: string) {
  if (normalizeUnit(fromUnit) === normalizeUnit(toUnit)) {
    return value;
  }

  return convertMassUnit(value, fromUnit, toUnit) ?? value;
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

  return finiteOrNull((value * fromFactor) / toFactor);
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
  const hasNoBounds = minValue === null && maxValue === null;

  return {
    minValue,
    maxValue,
    malformed:
      (!hasNoBounds &&
        minValue !== null &&
        maxValue !== null &&
        minValue > maxValue) ||
      (target.minValue !== null && minValue === null) ||
      (target.maxValue !== null && maxValue === null),
  };
}

function isReferenceOnlyBounds(target: {
  minValue: number | null;
  maxValue: number | null;
}): boolean {
  return target.minValue === null && target.maxValue === null;
}

function sanitizeBound(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function groupAssessmentEntries(
  entries: AssessmentEntry[],
): GroupedAssessmentEntry[] {
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
  const perEnergyEntry = entries.find(
    (entry) => entry.expressionBasis === 'PER_1000_KCAL_ME',
  );
  if (perEnergyEntry) {
    return perEnergyEntry;
  }

  const ratioEntry = entries.find((entry) => entry.expressionBasis === 'RATIO');
  if (ratioEntry) {
    return ratioEntry;
  }

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
    case 'INFO':
      return 0;
  }
}

function summarizeEntries(
  entries: Array<{
    status: AssessmentEntryStatus;
    excludeFromAttention?: boolean;
  }>,
): DesignRecipeAssessmentSummary {
  return entries.reduce<DesignRecipeAssessmentSummary>(
    (summary, entry) => {
      if (entry.excludeFromAttention || entry.status === 'INFO') {
        return summary;
      }

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
  entries: Array<{
    status: AssessmentEntryStatus;
    excludeFromAttention?: boolean;
  }>,
): AssessmentOverallStatus {
  const scorableEntries = entries.filter(
    (entry) => !entry.excludeFromAttention && entry.status !== 'INFO',
  );

  if (scorableEntries.length === 0) {
    return 'INCOMPLETE';
  }

  if (scorableEntries.some((entry) => entry.status === 'MISSING_DATA')) {
    return 'INCOMPLETE';
  }

  if (
    scorableEntries.some(
      (entry) => entry.status === 'DEFICIENT' || entry.status === 'EXCESS',
    )
  ) {
    return 'NON_COMPLIANT';
  }

  return 'COMPLIANT';
}
