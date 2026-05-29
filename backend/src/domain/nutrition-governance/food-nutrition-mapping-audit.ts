import {
  NUTRITION_FIELD_CATALOG,
  type NutritionFieldTab,
} from '../ingredient/nutrition-field-catalog';
import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile, NutritionProfileV2 } from '../ingredient/types';
import { FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS } from './nutrition-profile-contract';

export type AuditRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type ProcessingMatchStatus =
  | 'PRIMARY_BASE_PROFILE'
  | 'PRIMARY_PROCESSING_REVIEW'
  | 'SECONDARY_PROFILE'
  | 'NO_PROFILE';
export type SemanticMatchStatus = 'NEEDS_MANUAL_REVIEW' | 'LIKELY_MATCH';
export type GranularityStatus =
  | 'SHARED_PROFILE_REVIEW'
  | 'GENERIC_PROFILE_REVIEW'
  | 'PROFILE_SPECIFICITY_REVIEW';
export type SourceFreshnessStatus =
  | 'USDA_SR_LEGACY_REVIEW'
  | 'SOURCE_CURRENTNESS_REVIEW'
  | 'SOURCE_NOT_IDENTIFIED';
export type RecommendedAuditAction =
  | 'REVIEW_BEFORE_APPROVAL'
  | 'KEEP_WITH_PERIODIC_REVIEW';

export interface AuditedFoodNutritionFood {
  id: string;
  name: string;
  nameEn?: string | null;
  displayNameZh?: string | null;
  dataSource?: string | null;
  externalId?: string | null;
  status?: string | null;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  nutritionData?: unknown;
  verifiedAt?: Date | string | null;
}

export interface AuditedFoodNutritionMapping {
  isPrimary: boolean;
  yieldRate?: number | null;
  notes?: string | null;
  nutritionFood: AuditedFoodNutritionFood;
}

export interface AuditedFoodIngredient {
  id: string;
  name: string;
  mappings: AuditedFoodNutritionMapping[];
}

export interface NutritionGroupCompleteness {
  present: number;
  expected: number;
  score: number;
}

export interface NutritionProfileCompletenessAssessment {
  presentFieldCount: number;
  expectedFieldCount: number;
  completenessScore: number;
  nonZeroValueFieldCount: number;
  zeroValueFieldCount: number;
  emptyFieldCount: number;
  zeroValueFields: string[];
  emptyFields: string[];
  zeroValueFieldsWithoutSource: string[];
  criticalMissingFields: string[];
  groupScores: Record<NutritionFieldTab, NutritionGroupCompleteness>;
}

export interface FoodNutritionMappingAuditRow {
  ingredientId: string;
  ingredientName: string;
  mappingRole: 'PRIMARY' | 'SECONDARY';
  nutritionFoodId: string;
  nutritionFoodName: string;
  nutritionFoodNameEn: string;
  displayNameZh: string;
  dataSource: string;
  externalId: string;
  status: string;
  preparationState: string;
  preparationStateLabel: string;
  ediblePortionLabel: string;
  processingLabel: string;
  yieldRate: number | '';
  isSharedProfile: 'Y' | 'N';
  mappedIngredientNames: string;
  mappedIngredientCount: number;
  semanticMatchStatus: SemanticMatchStatus;
  processingMatchStatus: ProcessingMatchStatus;
  granularityStatus: GranularityStatus;
  sourceFreshnessStatus: SourceFreshnessStatus;
  completenessScore: number;
  nonZeroValueFieldCount: number;
  zeroValueFieldCount: number;
  emptyFieldCount: number;
  zeroValueWithoutSourceCount: number;
  zeroValueFields: string;
  emptyFields: string;
  zeroValueFieldsWithoutSource: string;
  criticalMissingFields: string;
  issueTypes: string;
  riskLevel: AuditRiskLevel;
  recommendedAction: RecommendedAuditAction;
  reviewDecision: string;
  reviewNote: string;
}

export interface FoodNutritionIngredientOverviewRow {
  ingredientId: string;
  ingredientName: string;
  mappingCount: number;
  primaryProfileId: string;
  primaryProfileName: string;
  primaryDataSource: string;
  primaryExternalId: string;
  secondaryProfileCount: number;
  sharedProfileCount: number;
  bestCompletenessScore: number;
  semanticMatchStatus: SemanticMatchStatus;
  processingMatchStatus: ProcessingMatchStatus;
  granularityStatus: GranularityStatus;
  sourceFreshnessStatus: SourceFreshnessStatus;
  issueTypes: string;
  overallRiskLevel: AuditRiskLevel;
  recommendedAction: RecommendedAuditAction;
  reviewDecision: string;
  reviewNote: string;
}

export interface FoodNutritionCompletenessRow {
  nutritionFoodId: string;
  nutritionFoodName: string;
  displayNameZh: string;
  dataSource: string;
  externalId: string;
  rawBasisType: string;
  sourceVersion: string;
  sourceTitle: string;
  completenessScore: number;
  presentFieldCount: number;
  expectedFieldCount: number;
  nonZeroValueFieldCount: number;
  zeroValueFieldCount: number;
  emptyFieldCount: number;
  zeroValueWithoutSourceCount: number;
  zeroValueFields: string;
  emptyFields: string;
  zeroValueFieldsWithoutSource: string;
  macrosScore: number;
  mineralsScore: number;
  vitaminsScore: number;
  fattyAcidsScore: number;
  aminoAcidsScore: number;
  criticalMissingFields: string;
  mappedIngredientNames: string;
}

export interface SharedNutritionProfileRow {
  nutritionFoodId: string;
  displayNameZh: string;
  nutritionFoodName: string;
  dataSource: string;
  externalId: string;
  mappedIngredientCount: number;
  mappedIngredientNames: string;
  reviewNote: string;
}

export interface CandidateReviewRow {
  ingredientId: string;
  ingredientName: string;
  currentPrimaryProfileId: string;
  currentPrimaryProfileName: string;
  currentIssueTypes: string;
  riskLevel: AuditRiskLevel;
  recommendedSource: string;
  recommendedFoodName: string;
  recommendedExternalId: string;
  reviewDecision: string;
  reviewNote: string;
}

export interface AuditGuideRow {
  field: string;
  meaning: string;
  suggestedUse: string;
}

export interface FoodNutritionMappingAudit {
  ingredientOverviewRows: FoodNutritionIngredientOverviewRow[];
  mappingRows: FoodNutritionMappingAuditRow[];
  completenessRows: FoodNutritionCompletenessRow[];
  sharedProfileRows: SharedNutritionProfileRow[];
  candidateReviewRows: CandidateReviewRow[];
  guideRows: AuditGuideRow[];
}

const BASE_PRIMARY_STATES = new Set([
  'RAW',
  'DRIED',
  'OIL',
  'POWDER',
  'SOAKED',
  'FREEZE_DRIED',
  'AIR_DRIED',
  'CONCENTRATE',
]);

const GROUPS: NutritionFieldTab[] = [
  'macros',
  'minerals',
  'vitamins',
  'fattyAcids',
  'aminoAcids',
];

interface NutritionProfileValueStats {
  nonZeroValueFieldCount: number;
  zeroValueFieldCount: number;
  emptyFieldCount: number;
  zeroValueFields: string[];
  emptyFields: string[];
  zeroValueFieldsWithoutSource: string[];
}

export function assessNutritionProfileCompleteness(
  nutritionProfile: unknown,
): NutritionProfileCompletenessAssessment {
  const profile = normalizeNutritionProfile(
    nutritionProfile as NutritionProfile,
  );
  const valueStats = assessNutritionProfileValueStats(profile);
  const expectedByGroup = groupExpectedFieldCounts();
  const groupScores = GROUPS.reduce(
    (result, group) => {
      const expected = expectedByGroup[group] ?? 0;
      const present = profile ? countPresentFields(profile, group) : 0;
      result[group] = {
        present,
        expected,
        score: expected === 0 ? 0 : Math.round((present / expected) * 100),
      };
      return result;
    },
    {} as Record<NutritionFieldTab, NutritionGroupCompleteness>,
  );
  const presentFieldCount = GROUPS.reduce(
    (sum, group) => sum + groupScores[group].present,
    0,
  );
  const expectedFieldCount = GROUPS.reduce(
    (sum, group) => sum + groupScores[group].expected,
    0,
  );

  return {
    presentFieldCount,
    expectedFieldCount,
    completenessScore:
      expectedFieldCount === 0
        ? 0
        : Math.round((presentFieldCount / expectedFieldCount) * 100),
    nonZeroValueFieldCount: valueStats.nonZeroValueFieldCount,
    zeroValueFieldCount: valueStats.zeroValueFieldCount,
    emptyFieldCount: valueStats.emptyFieldCount,
    zeroValueFields: valueStats.zeroValueFields,
    emptyFields: valueStats.emptyFields,
    zeroValueFieldsWithoutSource: valueStats.zeroValueFieldsWithoutSource,
    criticalMissingFields: getCriticalMissingFields(profile),
    groupScores,
  };
}

export function buildFoodNutritionMappingAudit(
  ingredients: AuditedFoodIngredient[],
): FoodNutritionMappingAudit {
  const sharedProfileMap = buildSharedProfileMap(ingredients);
  const mappingRows = ingredients
    .flatMap((ingredient) =>
      ingredient.mappings.map((mapping) =>
        buildMappingRow(ingredient, mapping, sharedProfileMap),
      ),
    )
    .sort(compareMappingRows);
  const ingredientOverviewRows = ingredients
    .map((ingredient) => buildIngredientOverviewRow(ingredient, mappingRows))
    .sort(compareOverviewRows);
  const completenessRows = buildCompletenessRows(mappingRows, ingredients);
  const sharedProfileRows = buildSharedProfileRows(mappingRows);
  const candidateReviewRows = buildCandidateReviewRows(ingredientOverviewRows);

  return {
    ingredientOverviewRows,
    mappingRows,
    completenessRows,
    sharedProfileRows,
    candidateReviewRows,
    guideRows: buildGuideRows(),
  };
}

function buildMappingRow(
  ingredient: AuditedFoodIngredient,
  mapping: AuditedFoodNutritionMapping,
  sharedProfileMap: Map<string, string[]>,
): FoodNutritionMappingAuditRow {
  const nutritionFood = mapping.nutritionFood;
  const mappedIngredientNames = sharedProfileMap.get(nutritionFood.id) ?? [
    ingredient.name,
  ];
  const completeness = assessNutritionProfileCompleteness(
    nutritionFood.nutritionData,
  );
  const processingMatchStatus = getProcessingMatchStatus(mapping);
  const isSharedProfile = mappedIngredientNames.length > 1;
  const granularityStatus = getGranularityStatus(
    nutritionFood,
    isSharedProfile,
  );
  const sourceFreshnessStatus = getSourceFreshnessStatus(nutritionFood);
  const issueTypes = getIssueTypes({
    completeness,
    processingMatchStatus,
    granularityStatus,
    sourceFreshnessStatus,
    isSharedProfile,
  });
  const riskLevel = getRiskLevel(issueTypes);

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    mappingRole: mapping.isPrimary ? 'PRIMARY' : 'SECONDARY',
    nutritionFoodId: nutritionFood.id,
    nutritionFoodName: nutritionFood.name,
    nutritionFoodNameEn: nutritionFood.nameEn ?? '',
    displayNameZh: nutritionFood.displayNameZh ?? '',
    dataSource: nutritionFood.dataSource ?? '',
    externalId: nutritionFood.externalId ?? '',
    status: nutritionFood.status ?? '',
    preparationState: nutritionFood.preparationState ?? '',
    preparationStateLabel: nutritionFood.preparationStateLabel ?? '',
    ediblePortionLabel: nutritionFood.ediblePortionLabel ?? '',
    processingLabel: nutritionFood.processingLabel ?? '',
    yieldRate: typeof mapping.yieldRate === 'number' ? mapping.yieldRate : '',
    isSharedProfile: isSharedProfile ? 'Y' : 'N',
    mappedIngredientNames: mappedIngredientNames.join(' / '),
    mappedIngredientCount: mappedIngredientNames.length,
    semanticMatchStatus: getSemanticMatchStatus(ingredient, nutritionFood),
    processingMatchStatus,
    granularityStatus,
    sourceFreshnessStatus,
    completenessScore: completeness.completenessScore,
    nonZeroValueFieldCount: completeness.nonZeroValueFieldCount,
    zeroValueFieldCount: completeness.zeroValueFieldCount,
    emptyFieldCount: completeness.emptyFieldCount,
    zeroValueWithoutSourceCount:
      completeness.zeroValueFieldsWithoutSource.length,
    zeroValueFields: completeness.zeroValueFields.join('; '),
    emptyFields: completeness.emptyFields.join('; '),
    zeroValueFieldsWithoutSource:
      completeness.zeroValueFieldsWithoutSource.join('; '),
    criticalMissingFields: completeness.criticalMissingFields.join('; '),
    issueTypes: issueTypes.join('; '),
    riskLevel,
    recommendedAction: getRecommendedAction(riskLevel),
    reviewDecision: '',
    reviewNote: mapping.notes ?? '',
  };
}

function buildIngredientOverviewRow(
  ingredient: AuditedFoodIngredient,
  mappingRows: FoodNutritionMappingAuditRow[],
): FoodNutritionIngredientOverviewRow {
  const rows = mappingRows.filter((row) => row.ingredientId === ingredient.id);
  const primaryRow =
    rows.find((row) => row.mappingRole === 'PRIMARY') ?? rows[0] ?? null;
  const hasPrimaryRow = rows.some((row) => row.mappingRole === 'PRIMARY');
  const issueTypes = unique([
    ...rows.flatMap((row) => splitList(row.issueTypes)),
    ...(rows.length === 0 ? ['MISSING_NUTRITION_PROFILE_MAPPING'] : []),
    ...(rows.length > 0 && !hasPrimaryRow ? ['MISSING_PRIMARY_PROFILE'] : []),
  ]).join('; ');
  const riskLevel =
    rows.length === 0 || !hasPrimaryRow
      ? 'HIGH'
      : getHighestRisk(rows.map((row) => row.riskLevel));

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    mappingCount: rows.length,
    primaryProfileId: primaryRow?.nutritionFoodId ?? '',
    primaryProfileName:
      primaryRow?.displayNameZh || primaryRow?.nutritionFoodName || '',
    primaryDataSource: primaryRow?.dataSource ?? '',
    primaryExternalId: primaryRow?.externalId ?? '',
    secondaryProfileCount: rows.filter((row) => row.mappingRole === 'SECONDARY')
      .length,
    sharedProfileCount: rows.filter((row) => row.isSharedProfile === 'Y')
      .length,
    bestCompletenessScore:
      rows.length === 0
        ? 0
        : Math.max(...rows.map((row) => row.completenessScore)),
    semanticMatchStatus:
      primaryRow?.semanticMatchStatus ?? 'NEEDS_MANUAL_REVIEW',
    processingMatchStatus: primaryRow?.processingMatchStatus ?? 'NO_PROFILE',
    granularityStatus:
      primaryRow?.granularityStatus ?? 'PROFILE_SPECIFICITY_REVIEW',
    sourceFreshnessStatus:
      primaryRow?.sourceFreshnessStatus ?? 'SOURCE_NOT_IDENTIFIED',
    issueTypes,
    overallRiskLevel: riskLevel,
    recommendedAction: getRecommendedAction(riskLevel),
    reviewDecision: '',
    reviewNote: rows.length === 0 ? '缺少营养档案映射' : '',
  };
}

function buildCompletenessRows(
  mappingRows: FoodNutritionMappingAuditRow[],
  ingredients: AuditedFoodIngredient[],
): FoodNutritionCompletenessRow[] {
  const foodById = new Map<string, AuditedFoodNutritionFood>();
  for (const ingredient of ingredients) {
    for (const mapping of ingredient.mappings) {
      foodById.set(mapping.nutritionFood.id, mapping.nutritionFood);
    }
  }

  return Array.from(foodById.values())
    .map((food) => {
      const mappedRows = mappingRows.filter(
        (row) => row.nutritionFoodId === food.id,
      );
      const completeness = assessNutritionProfileCompleteness(
        food.nutritionData,
      );
      const profile = normalizeNutritionProfile(
        food.nutritionData as NutritionProfile,
      );

      return {
        nutritionFoodId: food.id,
        nutritionFoodName: food.name,
        displayNameZh: food.displayNameZh ?? '',
        dataSource: food.dataSource ?? '',
        externalId: food.externalId ?? '',
        rawBasisType: profile?.meta.rawBasisType ?? '',
        sourceVersion: profile?.meta.sourceVersion ?? '',
        sourceTitle: profile?.meta.sourceTitle ?? '',
        completenessScore: completeness.completenessScore,
        presentFieldCount: completeness.presentFieldCount,
        expectedFieldCount: completeness.expectedFieldCount,
        nonZeroValueFieldCount: completeness.nonZeroValueFieldCount,
        zeroValueFieldCount: completeness.zeroValueFieldCount,
        emptyFieldCount: completeness.emptyFieldCount,
        zeroValueWithoutSourceCount:
          completeness.zeroValueFieldsWithoutSource.length,
        zeroValueFields: completeness.zeroValueFields.join('; '),
        emptyFields: completeness.emptyFields.join('; '),
        zeroValueFieldsWithoutSource:
          completeness.zeroValueFieldsWithoutSource.join('; '),
        macrosScore: completeness.groupScores.macros.score,
        mineralsScore: completeness.groupScores.minerals.score,
        vitaminsScore: completeness.groupScores.vitamins.score,
        fattyAcidsScore: completeness.groupScores.fattyAcids.score,
        aminoAcidsScore: completeness.groupScores.aminoAcids.score,
        criticalMissingFields: completeness.criticalMissingFields.join('; '),
        mappedIngredientNames: unique(
          mappedRows.flatMap((row) =>
            splitMappedNames(row.mappedIngredientNames),
          ),
        ).join(' / '),
      };
    })
    .sort((left, right) =>
      left.mappedIngredientNames.localeCompare(
        right.mappedIngredientNames,
        'zh-CN',
      ),
    );
}

function buildSharedProfileRows(
  mappingRows: FoodNutritionMappingAuditRow[],
): SharedNutritionProfileRow[] {
  const byFoodId = new Map<string, FoodNutritionMappingAuditRow[]>();
  for (const row of mappingRows) {
    byFoodId.set(row.nutritionFoodId, [
      ...(byFoodId.get(row.nutritionFoodId) ?? []),
      row,
    ]);
  }

  return Array.from(byFoodId.entries())
    .map(([, rows]) => rows[0])
    .filter((row) => row.mappedIngredientCount > 1)
    .map((row) => ({
      nutritionFoodId: row.nutritionFoodId,
      displayNameZh: row.displayNameZh,
      nutritionFoodName: row.nutritionFoodName,
      dataSource: row.dataSource,
      externalId: row.externalId,
      mappedIngredientCount: row.mappedIngredientCount,
      mappedIngredientNames: row.mappedIngredientNames,
      reviewNote:
        '共享营养档案需确认是否为可接受的同类近似；如会误导配方设计，应补独立档案或改映射级显示名。',
    }))
    .sort((left, right) =>
      left.mappedIngredientNames.localeCompare(
        right.mappedIngredientNames,
        'zh-CN',
      ),
    );
}

function buildCandidateReviewRows(
  overviewRows: FoodNutritionIngredientOverviewRow[],
): CandidateReviewRow[] {
  return overviewRows
    .filter((row) => row.overallRiskLevel !== 'LOW')
    .map((row) => ({
      ingredientId: row.ingredientId,
      ingredientName: row.ingredientName,
      currentPrimaryProfileId: row.primaryProfileId,
      currentPrimaryProfileName: row.primaryProfileName,
      currentIssueTypes: row.issueTypes,
      riskLevel: row.overallRiskLevel,
      recommendedSource: '',
      recommendedFoodName: '',
      recommendedExternalId: '',
      reviewDecision: '',
      reviewNote: '',
    }));
}

function buildGuideRows(): AuditGuideRow[] {
  return [
    {
      field: 'semanticMatchStatus',
      meaning: '标准原料语义与营养档案英文/中文名称是否匹配。',
      suggestedUse: '第一阶段默认需要人工复核，后续可填 PASS / CHANGE。',
    },
    {
      field: 'processingMatchStatus',
      meaning: '主档案是否为原料基础状态，次级档案是否为可选加工状态。',
      suggestedUse:
        'PRIMARY_PROCESSING_REVIEW 代表主档案可能不应使用熟制或加工档案。',
    },
    {
      field: 'granularityStatus',
      meaning: '营养档案颗粒度是否与标准原料一致，是否为共享或泛化档案。',
      suggestedUse: 'SHARED_PROFILE_REVIEW 需要确认多个原料共用是否合理。',
    },
    {
      field: 'sourceFreshnessStatus',
      meaning: '来源是否需要核查最新性。',
      suggestedUse:
        'USDA_SR_LEGACY_REVIEW 表示当前为 USDA 2019 SR Legacy 导入，应核查是否存在更细 Foundation 或其他来源。',
    },
    {
      field: 'completenessScore',
      meaning: '内部营养字段目录中已有数值字段占比，0 也算已记录。',
      suggestedUse:
        '低分或 criticalMissingFields 非空的档案需要补字段或换来源。',
    },
    {
      field: 'nonZeroValueFieldCount / zeroValueFieldCount / emptyFieldCount',
      meaning:
        '把完整性拆成非0数值、0值和空字段三类；三者合计等于 expectedFieldCount。',
      suggestedUse:
        '用于判断档案完整性是否被大量 0 值撑高，空字段仍应优先补源。',
    },
    {
      field: 'zeroValueFieldsWithoutSource',
      meaning:
        '值为 0 但没有字段级 sourceForms、fieldSources 或 conversionNotes 说明的字段。',
      suggestedUse:
        '这些字段不直接视为缺失，但需要在人工审核中确认不是默认空值误写为 0。',
    },
  ];
}

function getProcessingMatchStatus(
  mapping: AuditedFoodNutritionMapping,
): ProcessingMatchStatus {
  if (!mapping.nutritionFood) {
    return 'NO_PROFILE';
  }
  if (!mapping.isPrimary) {
    return 'SECONDARY_PROFILE';
  }

  const state = mapping.nutritionFood.preparationState ?? '';
  return BASE_PRIMARY_STATES.has(state)
    ? 'PRIMARY_BASE_PROFILE'
    : 'PRIMARY_PROCESSING_REVIEW';
}

function getSemanticMatchStatus(
  ingredient: AuditedFoodIngredient,
  nutritionFood: AuditedFoodNutritionFood,
): SemanticMatchStatus {
  const displayName = nutritionFood.displayNameZh ?? '';
  return displayName.includes(ingredient.name)
    ? 'LIKELY_MATCH'
    : 'NEEDS_MANUAL_REVIEW';
}

function getGranularityStatus(
  nutritionFood: AuditedFoodNutritionFood,
  isSharedProfile: boolean,
): GranularityStatus {
  if (isSharedProfile) {
    return 'SHARED_PROFILE_REVIEW';
  }

  return hasGenericProfileMarker(nutritionFood.name)
    ? 'GENERIC_PROFILE_REVIEW'
    : 'PROFILE_SPECIFICITY_REVIEW';
}

function getSourceFreshnessStatus(
  nutritionFood: AuditedFoodNutritionFood,
): SourceFreshnessStatus {
  const dataSource = (nutritionFood.dataSource ?? '').toUpperCase();
  if (!dataSource) {
    return 'SOURCE_NOT_IDENTIFIED';
  }

  if (dataSource === 'USDA') {
    const profile = normalizeNutritionProfile(
      nutritionFood.nutritionData as NutritionProfile,
    );
    const version = profile?.meta.sourceVersion ?? '';
    return version.includes('2019-04-01')
      ? 'USDA_SR_LEGACY_REVIEW'
      : 'SOURCE_CURRENTNESS_REVIEW';
  }

  return 'SOURCE_CURRENTNESS_REVIEW';
}

function getIssueTypes(params: {
  completeness: NutritionProfileCompletenessAssessment;
  processingMatchStatus: ProcessingMatchStatus;
  granularityStatus: GranularityStatus;
  sourceFreshnessStatus: SourceFreshnessStatus;
  isSharedProfile: boolean;
}): string[] {
  const issues: string[] = [];

  if (params.completeness.criticalMissingFields.length > 0) {
    issues.push('CRITICAL_NUTRIENT_FIELDS_MISSING');
  }
  if (params.completeness.completenessScore < 70) {
    issues.push('LOW_NUTRIENT_COMPLETENESS');
  }
  if (params.processingMatchStatus === 'PRIMARY_PROCESSING_REVIEW') {
    issues.push('PRIMARY_PROCESSING_REVIEW');
  }
  if (params.isSharedProfile) {
    issues.push('SHARED_PROFILE');
  }
  if (params.granularityStatus === 'GENERIC_PROFILE_REVIEW') {
    issues.push('GENERIC_PROFILE');
  }
  if (params.sourceFreshnessStatus === 'USDA_SR_LEGACY_REVIEW') {
    issues.push('USDA_SR_LEGACY_REVIEW');
  }

  return unique(issues);
}

function getRiskLevel(issueTypes: string[]): AuditRiskLevel {
  if (
    issueTypes.includes('CRITICAL_NUTRIENT_FIELDS_MISSING') ||
    issueTypes.includes('PRIMARY_PROCESSING_REVIEW')
  ) {
    return 'HIGH';
  }

  if (issueTypes.length > 0) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function getHighestRisk(levels: AuditRiskLevel[]): AuditRiskLevel {
  if (levels.includes('HIGH')) {
    return 'HIGH';
  }
  if (levels.includes('MEDIUM')) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function getRecommendedAction(
  riskLevel: AuditRiskLevel,
): RecommendedAuditAction {
  return riskLevel === 'LOW'
    ? 'KEEP_WITH_PERIODIC_REVIEW'
    : 'REVIEW_BEFORE_APPROVAL';
}

function groupExpectedFieldCounts(): Record<NutritionFieldTab, number> {
  return GROUPS.reduce(
    (result, group) => {
      result[group] = NUTRITION_FIELD_CATALOG.filter(
        (field) => field.tabKey === group,
      ).length;
      return result;
    },
    {} as Record<NutritionFieldTab, number>,
  );
}

function countPresentFields(
  profile: NutritionProfileV2,
  group: NutritionFieldTab,
): number {
  const values = profile[group] as Record<string, number | null | undefined>;
  return NUTRITION_FIELD_CATALOG.filter(
    (field) => field.tabKey === group,
  ).filter((field) => isPresentNutritionValue(values[field.fieldKey])).length;
}

function assessNutritionProfileValueStats(
  profile: NutritionProfileV2 | null,
): NutritionProfileValueStats {
  const nonZeroValueFields: string[] = [];
  const zeroValueFields: string[] = [];
  const emptyFields: string[] = [];
  const zeroValueFieldsWithoutSource: string[] = [];

  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = getValueAtPath(profile, field.fieldPath);

    if (!isPresentNutritionValue(value)) {
      emptyFields.push(field.fieldPath);
      continue;
    }

    if (value === 0) {
      zeroValueFields.push(field.fieldPath);
      if (!hasFieldSourceEvidence(profile, field.fieldPath)) {
        zeroValueFieldsWithoutSource.push(field.fieldPath);
      }
      continue;
    }

    nonZeroValueFields.push(field.fieldPath);
  }

  return {
    nonZeroValueFieldCount: nonZeroValueFields.length,
    zeroValueFieldCount: zeroValueFields.length,
    emptyFieldCount: emptyFields.length,
    zeroValueFields,
    emptyFields,
    zeroValueFieldsWithoutSource,
  };
}

function getCriticalMissingFields(
  profile: NutritionProfileV2 | null,
): string[] {
  if (!profile) {
    return [...FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS];
  }

  return FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS.filter(
    (fieldPath) => !isPresentAtPath(profile, fieldPath),
  );
}

function isPresentAtPath(profile: NutritionProfileV2, fieldPath: string) {
  const value = getValueAtPath(profile, fieldPath);

  return isPresentNutritionValue(value);
}

function getValueAtPath(
  profile: NutritionProfileV2 | null,
  fieldPath: string,
): unknown {
  return fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, profile);
}

function isPresentNutritionValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasFieldSourceEvidence(
  profile: NutritionProfileV2 | null,
  fieldPath: string,
): boolean {
  if (!profile) {
    return false;
  }

  return (
    hasSourceEvidence(profile.meta.sourceForms?.[fieldPath]) ||
    hasSourceEvidence(profile.meta.fieldSources?.[fieldPath]) ||
    hasSourceEvidence(profile.meta.conversionNotes?.[fieldPath])
  );
}

function hasSourceEvidence(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function buildSharedProfileMap(
  ingredients: AuditedFoodIngredient[],
): Map<string, string[]> {
  const byFoodId = new Map<string, Set<string>>();

  for (const ingredient of ingredients) {
    for (const mapping of ingredient.mappings) {
      const existing = byFoodId.get(mapping.nutritionFood.id) ?? new Set();
      existing.add(ingredient.name);
      byFoodId.set(mapping.nutritionFood.id, existing);
    }
  }

  return new Map(
    Array.from(byFoodId.entries()).map(([id, names]) => [
      id,
      Array.from(names).sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    ]),
  );
}

function hasGenericProfileMarker(name: string): boolean {
  const normalized = name.toLowerCase();
  return [
    'includes foods for',
    'all classes',
    'all purpose',
    'not further specified',
    'composite',
    'mixed species',
  ].some((marker) => normalized.includes(marker));
}

function compareMappingRows(
  left: FoodNutritionMappingAuditRow,
  right: FoodNutritionMappingAuditRow,
): number {
  return (
    left.ingredientName.localeCompare(right.ingredientName, 'zh-CN') ||
    left.mappingRole.localeCompare(right.mappingRole) ||
    left.displayNameZh.localeCompare(right.displayNameZh, 'zh-CN')
  );
}

function compareOverviewRows(
  left: FoodNutritionIngredientOverviewRow,
  right: FoodNutritionIngredientOverviewRow,
): number {
  const riskRank: Record<AuditRiskLevel, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return (
    riskRank[left.overallRiskLevel] - riskRank[right.overallRiskLevel] ||
    left.ingredientName.localeCompare(right.ingredientName, 'zh-CN')
  );
}

function splitList(value: string): string[] {
  return value
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitMappedNames(value: string): string[] {
  return value
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
