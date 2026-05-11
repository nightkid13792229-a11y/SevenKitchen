import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';
import { getFoodStateMismatches } from './food-state-match';

export type UsdaCandidateReviewRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type UsdaCandidateReviewAction =
  | 'CONFIRM_FIRST'
  | 'REVIEW'
  | 'CHANGE_OR_CFCT';
export type UsdaCandidateReviewFlag =
  | 'NO_CANDIDATE'
  | 'NOT_HIGH_CONFIDENCE'
  | 'LOW_SCORE'
  | 'MULTIPLE_TOP_CANDIDATES'
  | 'PREPARED_OR_PROCESSED'
  | 'ADDED_SALT'
  | 'SWEET_POTATO_MISMATCH'
  | 'LEAF_MISMATCH'
  | 'STATE_MISMATCH'
  | 'OIL_MISMATCH'
  | 'MISSING_CRITICAL_NUTRIENTS'
  | 'MISSING_SUPPORTING_NUTRIENTS';

export interface UsdaCandidateReviewInput {
  ingredient: {
    id: string;
    name: string;
  };
  candidates: UsdaCandidateReviewCandidate[];
}

export interface UsdaCandidateReviewCandidate {
  id: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  normalizedNutrition: unknown;
  sourceRecord: {
    sourceKey?: string | null;
    foodName?: string | null;
    foodNameEn?: string | null;
    dataType?: string | null;
    category?: string | null;
  };
}

export interface UsdaCandidateReviewRow {
  ingredientId: string;
  ingredientName: string;
  bestCandidateId: string;
  bestSourceKey: string;
  bestFdcId: string;
  bestFoodName: string;
  bestCategory: string;
  bestDataType: string;
  bestConfidence: string;
  bestScore: number;
  alternativeCandidateCount: number;
  tiedTopCandidateCount: number;
  riskLevel: UsdaCandidateReviewRiskLevel;
  riskFlags: UsdaCandidateReviewFlag[];
  recommendedAction: UsdaCandidateReviewAction;
  alternativesSummary: string;
}

const CRITICAL_NUTRIENT_FIELDS = [
  'macros.energyKcal',
  'macros.crudeProtein',
  'macros.crudeFat',
] as const;

const SUPPORTING_NUTRIENT_FIELDS = [
  'macros.moisture',
  'minerals.calcium',
  'minerals.phosphorus',
] as const;

const PREPARED_DESCRIPTION_PATTERNS = [
  'babyfood',
  'breaded',
  'butter',
  'candies',
  'canned',
  'cereals ready to eat',
  'chocolate',
  'cooked',
  'fried',
  'honey roasted',
  'lunchmeat',
  'nougat',
  'restaurant',
  'roasted',
  'sauce',
  'soup',
  'tahini',
] as const;

const LEAFY_OR_HERB_INGREDIENT_NAME_FRAGMENTS = [
  '叶',
  '白菜',
  '菠菜',
  '生菜',
  '香菜',
  '油菜',
  '芹菜',
  '甘蓝',
  '薄荷',
  '罗勒',
  '欧芹',
] as const;

const CSV_HEADERS: Array<{
  label: string;
  value: (row: UsdaCandidateReviewRow) => string | number;
}> = [
  { label: '原料ID', value: (row) => row.ingredientId },
  { label: '原料名称', value: (row) => row.ingredientName },
  { label: '最佳候选ID', value: (row) => row.bestCandidateId },
  { label: 'FDC ID', value: (row) => row.bestFdcId },
  { label: 'USDA描述', value: (row) => row.bestFoodName },
  { label: '类别', value: (row) => row.bestCategory },
  { label: '数据类型', value: (row) => row.bestDataType },
  { label: '置信度', value: (row) => row.bestConfidence },
  { label: '分数', value: (row) => row.bestScore },
  { label: '备选数', value: (row) => row.alternativeCandidateCount },
  { label: '同分最佳数', value: (row) => row.tiedTopCandidateCount },
  { label: '风险等级', value: (row) => riskLevelLabel(row.riskLevel) },
  {
    label: '风险提示',
    value: (row) => row.riskFlags.map(flagLabel).join('; '),
  },
  { label: '建议动作', value: (row) => actionLabel(row.recommendedAction) },
  { label: '备选摘要', value: (row) => row.alternativesSummary },
];

export function buildUsdaCandidateReviewRows(
  inputs: UsdaCandidateReviewInput[],
): UsdaCandidateReviewRow[] {
  return inputs.map(buildReviewRow).sort(compareReviewRows);
}

export function usdaCandidateReviewRowsToCsv(
  rows: UsdaCandidateReviewRow[],
): string {
  return [
    CSV_HEADERS.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

function buildReviewRow(
  input: UsdaCandidateReviewInput,
): UsdaCandidateReviewRow {
  const candidates = [...input.candidates].sort(compareCandidates);
  const bestCandidate = candidates[0] ?? null;

  if (!bestCandidate) {
    return {
      ingredientId: input.ingredient.id,
      ingredientName: input.ingredient.name,
      bestCandidateId: '',
      bestSourceKey: '',
      bestFdcId: '',
      bestFoodName: '',
      bestCategory: '',
      bestDataType: '',
      bestConfidence: '',
      bestScore: 0,
      alternativeCandidateCount: 0,
      tiedTopCandidateCount: 0,
      riskLevel: 'HIGH',
      riskFlags: ['NO_CANDIDATE'],
      recommendedAction: 'CHANGE_OR_CFCT',
      alternativesSummary: '',
    };
  }

  const tiedTopCandidateCount = candidates.filter(
    (candidate) => candidate.score === bestCandidate.score,
  ).length;
  const riskFlags = getRiskFlags({
    ingredientName: input.ingredient.name,
    bestCandidate,
    tiedTopCandidateCount,
  });
  const riskLevel = getRiskLevel(riskFlags);

  return {
    ingredientId: input.ingredient.id,
    ingredientName: input.ingredient.name,
    bestCandidateId: bestCandidate.id,
    bestSourceKey: bestCandidate.sourceRecord.sourceKey ?? '',
    bestFdcId: getFdcId(bestCandidate.sourceRecord.sourceKey ?? ''),
    bestFoodName: bestCandidate.sourceRecord.foodName ?? '',
    bestCategory: bestCandidate.sourceRecord.category ?? '',
    bestDataType: bestCandidate.sourceRecord.dataType ?? '',
    bestConfidence: bestCandidate.confidence,
    bestScore: bestCandidate.score,
    alternativeCandidateCount: Math.max(candidates.length - 1, 0),
    tiedTopCandidateCount,
    riskLevel,
    riskFlags,
    recommendedAction: getRecommendedAction(riskLevel),
    alternativesSummary: formatAlternatives(candidates.slice(1)),
  };
}

function compareCandidates(
  left: UsdaCandidateReviewCandidate,
  right: UsdaCandidateReviewCandidate,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const confidenceDelta =
    confidenceRank(right.confidence) - confidenceRank(left.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return (left.sourceRecord.foodName ?? '').localeCompare(
    right.sourceRecord.foodName ?? '',
  );
}

function confidenceRank(confidence: string): number {
  switch (confidence) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
    default:
      return 0;
  }
}

function getRiskFlags(params: {
  ingredientName: string;
  bestCandidate: UsdaCandidateReviewCandidate;
  tiedTopCandidateCount: number;
}): UsdaCandidateReviewFlag[] {
  const flags: UsdaCandidateReviewFlag[] = [];
  const description = normalizeDescription(
    params.bestCandidate.sourceRecord.foodName ?? '',
  );
  const normalizedIngredientName = params.ingredientName.trim();

  if (params.bestCandidate.confidence !== 'HIGH') {
    flags.push('NOT_HIGH_CONFIDENCE');
  }
  if (params.bestCandidate.score < 0.85) {
    flags.push('LOW_SCORE');
  }
  if (params.tiedTopCandidateCount > 1) {
    flags.push('MULTIPLE_TOP_CANDIDATES');
  }
  if (
    PREPARED_DESCRIPTION_PATTERNS.some((pattern) =>
      descriptionHasPhrase(description, pattern),
    )
  ) {
    flags.push('PREPARED_OR_PROCESSED');
  }
  if (
    !normalizedIngredientName.includes('盐') &&
    (descriptionHasToken(description, 'salt') ||
      descriptionHasToken(description, 'salted'))
  ) {
    flags.push('ADDED_SALT');
  }
  if (
    !normalizedIngredientName.includes('红薯') &&
    description.includes('sweet potato')
  ) {
    flags.push('SWEET_POTATO_MISMATCH');
  }
  if (
    !isLeafyOrHerbIngredientName(normalizedIngredientName) &&
    (descriptionHasToken(description, 'leaf') ||
      descriptionHasToken(description, 'leaves'))
  ) {
    flags.push('LEAF_MISMATCH');
  }
  if (
    getFoodStateMismatches({
      ingredientName: params.ingredientName,
      foodDescription: params.bestCandidate.sourceRecord.foodName ?? '',
    }).length > 0
  ) {
    flags.push('STATE_MISMATCH');
  }
  if (
    !normalizedIngredientName.includes('油') &&
    descriptionHasToken(description, 'oil')
  ) {
    flags.push('OIL_MISMATCH');
  }

  const missingCriticalFields = getMissingFields(
    params.bestCandidate.normalizedNutrition,
    CRITICAL_NUTRIENT_FIELDS,
  );
  if (missingCriticalFields.length > 0) {
    flags.push('MISSING_CRITICAL_NUTRIENTS');
  }

  const missingSupportingFields = getMissingFields(
    params.bestCandidate.normalizedNutrition,
    SUPPORTING_NUTRIENT_FIELDS,
  );
  if (missingSupportingFields.length > 0) {
    flags.push('MISSING_SUPPORTING_NUTRIENTS');
  }

  return Array.from(new Set(flags));
}

function getRiskLevel(
  flags: UsdaCandidateReviewFlag[],
): UsdaCandidateReviewRiskLevel {
  if (
    flags.some((flag) =>
      [
        'NO_CANDIDATE',
        'PREPARED_OR_PROCESSED',
        'ADDED_SALT',
        'SWEET_POTATO_MISMATCH',
        'LEAF_MISMATCH',
        'STATE_MISMATCH',
        'OIL_MISMATCH',
        'MISSING_CRITICAL_NUTRIENTS',
      ].includes(flag),
    )
  ) {
    return 'HIGH';
  }

  if (flags.length > 0) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function getRecommendedAction(
  riskLevel: UsdaCandidateReviewRiskLevel,
): UsdaCandidateReviewAction {
  switch (riskLevel) {
    case 'LOW':
      return 'CONFIRM_FIRST';
    case 'MEDIUM':
      return 'REVIEW';
    case 'HIGH':
      return 'CHANGE_OR_CFCT';
  }
}

function getMissingFields(
  nutritionProfile: unknown,
  fields: readonly string[],
): string[] {
  const profile = normalizeNutritionProfile(
    nutritionProfile as NutritionProfile,
  );
  if (!profile) {
    return [...fields];
  }

  return fields.filter((field) => !hasFiniteField(profile, field));
}

function hasFiniteField(value: unknown, fieldPath: string): boolean {
  const fieldValue = fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);

  return typeof fieldValue === 'number' && Number.isFinite(fieldValue);
}

function formatAlternatives(
  candidates: UsdaCandidateReviewCandidate[],
): string {
  return candidates
    .slice(0, 3)
    .map((candidate) => {
      const sourceKey = candidate.sourceRecord.sourceKey ?? '';
      const name = candidate.sourceRecord.foodName ?? '';
      return `${sourceKey} ${name} (${Math.round(candidate.score * 100)}%)`;
    })
    .join(' | ');
}

function getFdcId(sourceKey: string): string {
  return sourceKey.replace(/^USDA:/u, '');
}

function normalizeDescription(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ');
}

function descriptionHasToken(description: string, token: string): boolean {
  return description.split(/\s+/u).includes(token);
}

function descriptionHasPhrase(description: string, phrase: string): boolean {
  const tokens = description.split(/\s+/u).filter(Boolean);
  const phraseTokens = phrase.split(/\s+/u).filter(Boolean);

  return tokens.some((_, index) =>
    phraseTokens.every((token, offset) => tokens[index + offset] === token),
  );
}

function isLeafyOrHerbIngredientName(ingredientName: string): boolean {
  return LEAFY_OR_HERB_INGREDIENT_NAME_FRAGMENTS.some((fragment) =>
    ingredientName.includes(fragment),
  );
}

function compareReviewRows(
  left: UsdaCandidateReviewRow,
  right: UsdaCandidateReviewRow,
): number {
  const riskDelta = riskRank(right.riskLevel) - riskRank(left.riskLevel);
  if (riskDelta !== 0) {
    return riskDelta;
  }

  return left.ingredientName.localeCompare(right.ingredientName, 'zh-Hans-CN');
}

function riskRank(riskLevel: UsdaCandidateReviewRiskLevel): number {
  switch (riskLevel) {
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}

function riskLevelLabel(riskLevel: UsdaCandidateReviewRiskLevel): string {
  switch (riskLevel) {
    case 'LOW':
      return '低';
    case 'MEDIUM':
      return '中';
    case 'HIGH':
      return '高';
  }
}

function actionLabel(action: UsdaCandidateReviewAction): string {
  switch (action) {
    case 'CONFIRM_FIRST':
      return '可优先确认';
    case 'REVIEW':
      return '人工复核后确认';
    case 'CHANGE_OR_CFCT':
      return '换候选或改用 CFCT';
  }
}

function flagLabel(flag: UsdaCandidateReviewFlag): string {
  const labels: Record<UsdaCandidateReviewFlag, string> = {
    NO_CANDIDATE: '无 USDA 候选',
    NOT_HIGH_CONFIDENCE: '非高置信',
    LOW_SCORE: '分数偏低',
    MULTIPLE_TOP_CANDIDATES: '多个同分最佳候选',
    PREPARED_OR_PROCESSED: '疑似熟制/加工/复合食品',
    ADDED_SALT: '疑似加盐',
    SWEET_POTATO_MISMATCH: '可能误匹配红薯',
    LEAF_MISMATCH: '可能误匹配叶片',
    STATE_MISMATCH: '干/粉状态可能不匹配',
    OIL_MISMATCH: '可能误匹配油脂',
    MISSING_CRITICAL_NUTRIENTS: '缺少核心营养值',
    MISSING_SUPPORTING_NUTRIENTS: '缺少水分/钙/磷等辅助值',
  };

  return labels[flag];
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}
