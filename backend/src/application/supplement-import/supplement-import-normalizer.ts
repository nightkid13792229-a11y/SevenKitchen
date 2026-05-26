import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import type { NutritionFieldDefinition } from '../../domain/ingredient/nutrition-field-catalog';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import type {
  ExtractedSupplementImportPayload,
  ExtractedSupplementNutritionItem,
  NormalizedSupplementImportDraft,
  SupplementAddTiming,
  SupplementCategoryType,
  SupplementDuplicateCandidate,
  SupplementImportValidationIssue,
  SupplementImportValidationResult,
} from './supplement-import.types';

const NUTRIENT_ALIASES: Record<string, string> = {
  ca: 'minerals.calcium',
  calcium: 'minerals.calcium',
  钙: 'minerals.calcium',
  p: 'minerals.phosphorus',
  phosphorus: 'minerals.phosphorus',
  磷: 'minerals.phosphorus',
  iodine: 'minerals.iodine',
  iodide: 'minerals.iodine',
  碘: 'minerals.iodine',
  vitamin_d: 'vitamins.vitaminD',
  vitamin_d3: 'vitamins.vitaminD',
  维生素d: 'vitamins.vitaminD',
  dha: 'fattyAcids.dha',
  epa: 'fattyAcids.epa',
  taurine: 'aminoAcids.taurine',
  牛磺酸: 'aminoAcids.taurine',
};

const VALID_BASE_UNITS = new Set(['G', 'ML', 'PCS']);
const VALID_ADD_TIMINGS = new Set(['BEFORE_MIXING', 'BEFORE_MEAL']);
const VALID_CATEGORY_TYPES = new Set([
  'MINERAL',
  'VITAMIN',
  'AMINO_ACID',
  'FATTY_ACID',
  'PROBIOTIC',
  'FUNCTIONAL',
  'OTHER',
]);

const catalogByPath = new Map(
  NUTRITION_FIELD_CATALOG.map((field) => [field.fieldPath, field]),
);

export function normalizeExtractedSupplementImport(
  input: ExtractedSupplementImportPayload,
  imageUrls: string[],
): NormalizedSupplementImportDraft {
  const confidenceValues: number[] = [];
  const profile = createEmptyNutritionProfile(input, imageUrls);
  const rejectedNutritionItems: NormalizedSupplementImportDraft['rejectedNutritionItems'] =
    [];

  for (const item of input.nutrition?.items ?? []) {
    const normalized = normalizeNutritionItem(item);
    if (!normalized) {
      rejectedNutritionItems.push({
        name: item.name ?? '',
        value: item.value ?? null,
        unit: item.unit ?? null,
        reason: '无法匹配系统营养字段',
      });
      continue;
    }

    if (
      typeof item.confidence === 'number' &&
      Number.isFinite(item.confidence)
    ) {
      confidenceValues.push(item.confidence);
    }

    setProfileValue(profile, normalized.field, normalized.value);
  }

  profile.meta.confidenceLevel = confidenceLevel(confidenceValues);

  return {
    ingredient: normalizeIngredient(input),
    nutritionProfile: profile,
    rejectedNutritionItems,
    duplicateCandidates: [],
    duplicateResolution: null,
    riskFlags: [],
  };
}

export function validateSupplementImportForConfirm(
  draft: NormalizedSupplementImportDraft,
): SupplementImportValidationResult {
  const errors: SupplementImportValidationIssue[] = [];
  const warnings: SupplementImportValidationIssue[] = [];
  const ingredient = draft.ingredient;

  addBlockingIf(
    !hasText(ingredient.name),
    errors,
    'INGREDIENT_NAME_REQUIRED',
    '补剂名称不能为空',
  );
  addBlockingIf(
    !hasText(ingredient.brand),
    errors,
    'BRAND_REQUIRED',
    '品牌不能为空',
  );
  addBlockingIf(
    !hasText(ingredient.productSpec),
    errors,
    'PRODUCT_SPEC_REQUIRED',
    '产品规格不能为空',
  );
  addBlockingIf(
    !VALID_BASE_UNITS.has(String(ingredient.baseUnit ?? '')),
    errors,
    'BASE_UNIT_INVALID',
    '基础单位必须是 G、ML 或 PCS',
  );
  addBlockingIf(
    !hasText(ingredient.unitDisplayLabel),
    errors,
    'UNIT_DISPLAY_LABEL_REQUIRED',
    '显示单位不能为空',
  );
  addBlockingIf(
    !VALID_ADD_TIMINGS.has(String(ingredient.addTiming ?? '')),
    errors,
    'ADD_TIMING_INVALID',
    '添加时机必须是 BEFORE_MIXING 或 BEFORE_MEAL',
  );
  addBlockingIf(
    typeof ingredient.productionLossRate !== 'number' ||
      ingredient.productionLossRate <= 0,
    errors,
    'PRODUCTION_LOSS_RATE_REQUIRED',
    '生产损耗率必须大于 0',
  );

  const exactCandidates = draft.duplicateCandidates.filter(
    (candidate) => candidate.matchType === 'EXACT',
  );
  const likelyCandidates = draft.duplicateCandidates.filter(
    (candidate) => candidate.matchType === 'LIKELY',
  );
  const resolution = draft.duplicateResolution;

  addBlockingIf(
    exactCandidates.length > 0 &&
      (resolution?.action !== 'UPDATE_EXISTING' ||
        !hasText(resolution.ingredientId) ||
        !exactCandidates.some(
          (candidate) => candidate.ingredientId === resolution.ingredientId,
        )),
    errors,
    'DUPLICATE_RESOLUTION_REQUIRED',
    '精确重复项必须选择更新已有补剂',
  );
  addBlockingIf(
    likelyCandidates.length > 0 && !resolution,
    errors,
    'DUPLICATE_RESOLUTION_REQUIRED',
    '疑似重复项必须先选择处理方式',
  );

  for (const flag of draft.riskFlags ?? []) {
    const issue = {
      code: flag.code,
      message: flag.message,
      level: flag.level,
    };
    if (flag.level === 'BLOCKING') {
      errors.push(issue);
    } else if (flag.level === 'WARNING') {
      warnings.push(issue);
    }
  }

  return {
    canConfirm: errors.length === 0,
    errors,
    warnings,
  };
}

export function classifySupplementImportDuplicates(
  draftIngredient: {
    name: string;
    brand?: string | null;
    productSpec?: string | null;
  },
  existing: Array<{
    id: string;
    name: string;
    brand?: string | null;
    productModel?: string | null;
  }>,
): SupplementDuplicateCandidate[] {
  const name = normalizeComparableText(draftIngredient.name);
  const brand = normalizeComparableText(draftIngredient.brand);
  const productSpec = normalizeComparableText(draftIngredient.productSpec);

  return existing
    .map((item): SupplementDuplicateCandidate | null => {
      const existingName = normalizeComparableText(item.name);
      const existingBrand = normalizeComparableText(item.brand);
      const existingProductSpec = normalizeComparableText(item.productModel);

      if (
        name === existingName &&
        brand === existingBrand &&
        productSpec === existingProductSpec
      ) {
        return {
          ingredientId: item.id,
          matchType: 'EXACT',
          name: item.name,
          brand: item.brand ?? null,
          productSpec: item.productModel ?? null,
        };
      }

      if (name === existingName && brand === existingBrand) {
        return {
          ingredientId: item.id,
          matchType: 'LIKELY',
          name: item.name,
          brand: item.brand ?? null,
          productSpec: item.productModel ?? null,
        };
      }

      if (name === existingName) {
        return {
          ingredientId: item.id,
          matchType: 'POSSIBLE',
          name: item.name,
          brand: item.brand ?? null,
          productSpec: item.productModel ?? null,
        };
      }

      return null;
    })
    .filter((candidate): candidate is SupplementDuplicateCandidate =>
      Boolean(candidate),
    )
    .sort(
      (left, right) =>
        duplicateRank(left.matchType) - duplicateRank(right.matchType),
    );
}

function createEmptyNutritionProfile(
  input: ExtractedSupplementImportPayload,
  imageUrls: string[],
): NutritionProfileV2 {
  return {
    meta: {
      rawBasisType: input.nutrition?.rawBasisType ?? 'PER_SERVING',
      servingWeightG: input.nutrition?.servingWeightG ?? null,
      sourceType: 'LABEL',
      attachments: imageUrls,
      confidenceLevel: null,
    },
    macros: {},
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  } as NutritionProfileV2;
}

function normalizeIngredient(
  input: ExtractedSupplementImportPayload,
): NormalizedSupplementImportDraft['ingredient'] {
  const ingredient = input.ingredient;
  const addTiming = String(ingredient?.addTiming ?? '');
  const categoryType = String(ingredient?.categoryType ?? '');

  return {
    name: cleanText(ingredient?.name),
    type: 'SUPPLEMENT',
    brand: nullableCleanText(ingredient?.brand),
    productSpec: nullableCleanText(ingredient?.productSpec),
    baseUnit: nullableCleanText(ingredient?.baseUnit)?.toUpperCase() ?? null,
    unitDisplayLabel: nullableCleanText(ingredient?.unitDisplayLabel),
    weightG: finiteNumberOrNull(ingredient?.weightG),
    addTiming: VALID_ADD_TIMINGS.has(addTiming)
      ? (addTiming as SupplementAddTiming)
      : null,
    productionLossRate: finiteNumberOrNull(ingredient?.productionLossRate),
    categoryType: VALID_CATEGORY_TYPES.has(categoryType)
      ? (categoryType as SupplementCategoryType)
      : null,
  };
}

function normalizeNutritionItem(
  item: ExtractedSupplementNutritionItem,
): { field: NutritionFieldDefinition; value: number } | null {
  const fieldPath = NUTRIENT_ALIASES[toAliasKey(item.name)];
  const field = fieldPath ? catalogByPath.get(fieldPath) : undefined;
  const value = item.value;

  if (!field || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const converted = convertUnit(value, item.unit, field.unit);
  if (converted === null) {
    return null;
  }

  return {
    field,
    value: roundForStableTests(converted),
  };
}

function convertUnit(
  value: number,
  rawUnit: string | null | undefined,
  catalogUnit: string,
): number | null {
  const from = normalizeUnit(rawUnit);
  const to = normalizeUnit(catalogUnit);

  if (from === to) {
    return value;
  }

  if (from === 'IU' || to === 'IU') {
    return null;
  }

  if (from === 'g' && to === 'mg') {
    return value * 1000;
  }
  if (from === 'mg' && to === 'g') {
    return value / 1000;
  }
  if (from === 'mg' && to === 'μg') {
    return value * 1000;
  }
  if (from === 'μg' && to === 'mg') {
    return value / 1000;
  }
  if (from === 'kJ' && to === 'kcal') {
    return value / 4.184;
  }
  if (from === 'kcal' && to === 'kJ') {
    return value * 4.184;
  }

  return null;
}

function setProfileValue(
  profile: NutritionProfileV2,
  field: NutritionFieldDefinition,
  value: number,
): void {
  const tab = profile[field.tabKey] as Record<string, number | null>;
  tab[field.fieldKey] = value;
}

function confidenceLevel(
  values: number[],
): NutritionProfileV2['meta']['confidenceLevel'] {
  if (values.length === 0) {
    return null;
  }

  const average =
    values.reduce((total, value) => total + value, 0) / values.length;

  if (average >= 0.9) {
    return 'HIGH';
  }
  if (average >= 0.6) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function toAliasKey(value: string | null | undefined): string {
  return cleanText(value).toLowerCase().replace(/\s+/g, '_');
}

function normalizeUnit(unit: string | null | undefined): string {
  const cleaned = cleanText(unit);
  if (cleaned === 'ug' || cleaned === 'mcg') {
    return 'μg';
  }
  if (cleaned.toLowerCase() === 'kj') {
    return 'kJ';
  }
  if (cleaned.toLowerCase() === 'iu') {
    return 'IU';
  }
  return cleaned.toLowerCase();
}

function addBlockingIf(
  condition: boolean,
  errors: SupplementImportValidationIssue[],
  code: string,
  message: string,
): void {
  if (condition) {
    errors.push({ code, message, level: 'BLOCKING' });
  }
}

function duplicateRank(matchType: SupplementDuplicateCandidate['matchType']) {
  if (matchType === 'EXACT') {
    return 0;
  }
  if (matchType === 'LIKELY') {
    return 1;
  }
  return 2;
}

function normalizeComparableText(value: string | null | undefined): string {
  return cleanText(value).toLowerCase().replace(/\s+/g, '');
}

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableCleanText(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : null;
}

function hasText(value: string | null | undefined): boolean {
  return cleanText(value).length > 0;
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundForStableTests(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
