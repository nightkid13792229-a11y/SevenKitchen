import {
  normalizeNutritionProfile,
} from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';

export type AuditedIngredientType = 'FOOD' | 'SUPPLEMENT';
export type IngredientNutritionSuggestedSource =
  | 'USDA'
  | 'CFCT'
  | 'SUPPLEMENT_LABEL';
export type IngredientNutritionCoveragePriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AuditedNutritionCandidate {
  confidence?: string | null;
  score?: number | null;
  sourceRecord?: {
    sourceType?: string | null;
    foodName?: string | null;
    sourceKey?: string | null;
  } | null;
}

export interface AuditedSupplementNutritionDraft {
  status?: string | null;
  missingFields?: string[] | null;
}

export interface AuditedIngredientNutritionInput {
  id: string;
  name: string;
  type: AuditedIngredientType;
  nutritionProfile: unknown;
  nutritionCandidates?: AuditedNutritionCandidate[];
  supplementNutritionDrafts?: AuditedSupplementNutritionDraft[];
}

export interface IngredientNutritionCoverageRow {
  ingredientId: string;
  ingredientName: string;
  ingredientType: AuditedIngredientType;
  hasNutritionProfile: boolean;
  currentSource: string;
  currentSourceTitle: string;
  missingKeyFields: string[];
  suggestedSource: IngredientNutritionSuggestedSource;
  priority: IngredientNutritionCoveragePriority;
  pendingCandidateCount: number;
  bestCandidate: string;
  pendingSupplementDraftCount: number;
  notes: string;
}

const FOOD_KEY_FIELDS = [
  'macros.energyKcal',
  'macros.moisture',
  'macros.crudeProtein',
  'macros.crudeFat',
  'minerals.calcium',
  'minerals.phosphorus',
] as const;

const FOOD_CRITICAL_FIELDS = new Set([
  'macros.energyKcal',
  'macros.crudeProtein',
  'macros.crudeFat',
]);

const CSV_HEADERS: Array<{
  label: string;
  value: (row: IngredientNutritionCoverageRow) => string | number | boolean;
}> = [
  { label: '原料ID', value: (row) => row.ingredientId },
  { label: '原料名称', value: (row) => row.ingredientName },
  { label: '类型', value: (row) => row.ingredientType },
  {
    label: '是否已有营养档案',
    value: (row) => (row.hasNutritionProfile ? 'YES' : 'NO'),
  },
  { label: '当前来源', value: (row) => row.currentSource },
  { label: '当前来源标题', value: (row) => row.currentSourceTitle },
  {
    label: '缺失关键字段',
    value: (row) => row.missingKeyFields.join('; '),
  },
  { label: '建议数据来源', value: (row) => row.suggestedSource },
  { label: '优先级', value: (row) => row.priority },
  { label: '待确认候选数', value: (row) => row.pendingCandidateCount },
  { label: '最佳候选', value: (row) => row.bestCandidate },
  { label: '补剂草稿数', value: (row) => row.pendingSupplementDraftCount },
  { label: '备注', value: (row) => row.notes },
];

export function buildIngredientNutritionCoverageRows(
  ingredients: AuditedIngredientNutritionInput[],
): IngredientNutritionCoverageRow[] {
  return ingredients
    .map((ingredient) => buildCoverageRow(ingredient))
    .sort(compareCoverageRows);
}

export function ingredientNutritionCoverageRowsToCsv(
  rows: IngredientNutritionCoverageRow[],
): string {
  return [
    CSV_HEADERS.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

function buildCoverageRow(
  ingredient: AuditedIngredientNutritionInput,
): IngredientNutritionCoverageRow {
  const profile = normalizeNutritionProfile(
    ingredient.nutritionProfile as NutritionProfile,
  );
  const hasNutritionProfile = profile !== null;
  const missingKeyFields =
    ingredient.type === 'FOOD'
      ? getMissingFoodKeyFields(profile)
      : getMissingSupplementKeyFields(profile);
  const pendingCandidateCount = ingredient.nutritionCandidates?.length ?? 0;
  const pendingSupplementDraftCount =
    ingredient.supplementNutritionDrafts?.filter(
      (draft) => draft.status === 'DRAFT',
    ).length ?? 0;
  const suggestedSource = getSuggestedSource(ingredient.type);

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    ingredientType: ingredient.type,
    hasNutritionProfile,
    currentSource: getCurrentSource(profile),
    currentSourceTitle: getCurrentSourceTitle(profile),
    missingKeyFields,
    suggestedSource,
    priority: getPriority({
      ingredientType: ingredient.type,
      hasNutritionProfile,
      currentSource: getCurrentSource(profile),
      missingKeyFields,
    }),
    pendingCandidateCount,
    bestCandidate: formatBestCandidate(ingredient.nutritionCandidates ?? []),
    pendingSupplementDraftCount,
    notes: buildNotes({
      ingredientType: ingredient.type,
      hasNutritionProfile,
      pendingCandidateCount,
      pendingSupplementDraftCount,
      suggestedSource,
      missingKeyFields,
    }),
  };
}

function getMissingFoodKeyFields(
  profile: ReturnType<typeof normalizeNutritionProfile>,
): string[] {
  if (!profile) {
    return [...FOOD_KEY_FIELDS];
  }

  return FOOD_KEY_FIELDS.filter((fieldPath) => !hasFiniteField(profile, fieldPath));
}

function getMissingSupplementKeyFields(
  profile: ReturnType<typeof normalizeNutritionProfile>,
): string[] {
  if (!profile) {
    return ['meta.rawBasisType', 'canonicalNutritionValue'];
  }

  const missingFields: string[] = [];
  if (!profile.meta.rawBasisType) {
    missingFields.push('meta.rawBasisType');
  }
  if (!hasAnyFiniteNutritionValue(profile)) {
    missingFields.push('canonicalNutritionValue');
  }

  return missingFields;
}

function getCurrentSource(
  profile: ReturnType<typeof normalizeNutritionProfile>,
): string {
  const sourceType = profile?.meta?.sourceType?.trim();
  return sourceType || 'UNKNOWN';
}

function getCurrentSourceTitle(
  profile: ReturnType<typeof normalizeNutritionProfile>,
): string {
  return (
    profile?.meta?.sourceTitle?.trim() ||
    profile?.meta?.sourceProvider?.trim() ||
    ''
  );
}

function getSuggestedSource(
  ingredientType: AuditedIngredientType,
): IngredientNutritionSuggestedSource {
  return ingredientType === 'SUPPLEMENT' ? 'SUPPLEMENT_LABEL' : 'USDA';
}

function getPriority(params: {
  ingredientType: AuditedIngredientType;
  hasNutritionProfile: boolean;
  currentSource: string;
  missingKeyFields: string[];
}): IngredientNutritionCoveragePriority {
  if (!params.hasNutritionProfile) {
    return 'HIGH';
  }

  if (
    params.ingredientType === 'FOOD' &&
    params.missingKeyFields.some((fieldPath) => FOOD_CRITICAL_FIELDS.has(fieldPath))
  ) {
    return 'HIGH';
  }

  if (
    params.ingredientType === 'SUPPLEMENT' &&
    params.missingKeyFields.includes('canonicalNutritionValue')
  ) {
    return 'HIGH';
  }

  if (params.missingKeyFields.length > 0 || params.currentSource === 'UNKNOWN') {
    return 'MEDIUM';
  }

  return 'LOW';
}

function formatBestCandidate(candidates: AuditedNutritionCandidate[]): string {
  const bestCandidate = [...candidates].sort(
    (left, right) => (right.score ?? 0) - (left.score ?? 0),
  )[0];

  if (!bestCandidate?.sourceRecord) {
    return '';
  }

  const sourceType = bestCandidate.sourceRecord.sourceType ?? 'UNKNOWN';
  const foodName =
    bestCandidate.sourceRecord.foodName ||
    bestCandidate.sourceRecord.sourceKey ||
    '未命名候选';
  const score =
    typeof bestCandidate.score === 'number'
      ? ` (${Math.round(bestCandidate.score * 100)}%)`
      : '';

  return `${sourceType} ${foodName}${score}`;
}

function buildNotes(params: {
  ingredientType: AuditedIngredientType;
  hasNutritionProfile: boolean;
  pendingCandidateCount: number;
  pendingSupplementDraftCount: number;
  suggestedSource: IngredientNutritionSuggestedSource;
  missingKeyFields: string[];
}): string {
  const notes: string[] = [];

  if (params.ingredientType === 'FOOD') {
    notes.push('优先 USDA；USDA 不合适再使用本地 CFCT reviewed JSON');
    if (params.pendingCandidateCount > 0) {
      notes.push(`有 ${params.pendingCandidateCount} 个待确认候选`);
    }
  } else {
    notes.push('优先上传产品标签图片生成补剂草稿并人工确认');
    if (params.pendingSupplementDraftCount > 0) {
      notes.push(`有 ${params.pendingSupplementDraftCount} 个待确认补剂草稿`);
    }
  }

  if (!params.hasNutritionProfile) {
    notes.push('尚无营养档案');
  } else if (params.missingKeyFields.length > 0) {
    notes.push('关键字段不完整');
  }

  return notes.join('；');
}

function hasFiniteField(profile: object, fieldPath: string): boolean {
  const value = fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, profile);

  return typeof value === 'number' && Number.isFinite(value);
}

function hasAnyFiniteNutritionValue(
  profile: ReturnType<typeof normalizeNutritionProfile>,
): boolean {
  if (!profile) {
    return false;
  }

  return [
    profile.macros,
    profile.minerals,
    profile.vitamins,
    profile.fattyAcids,
    profile.aminoAcids,
  ].some((group) =>
    Object.values(group).some((value) => typeof value === 'number'),
  );
}

function compareCoverageRows(
  left: IngredientNutritionCoverageRow,
  right: IngredientNutritionCoverageRow,
): number {
  const priorityRank: Record<IngredientNutritionCoveragePriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    left.ingredientType.localeCompare(right.ingredientType) ||
    left.ingredientName.localeCompare(right.ingredientName, 'zh-CN')
  );
}

function csvEscape(value: string | number | boolean): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
