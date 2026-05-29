import { NUTRITION_FIELD_CATALOG } from '../ingredient/nutrition-field-catalog';
import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile, NutritionProfileV2 } from '../ingredient/types';
import { getFoodStateMismatches } from './food-state-match';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
} from './nutrition-profile-contract';

export type UsdaQualityAuditStatus =
  | 'PASS'
  | 'PASS_WITH_NOTE'
  | 'NEEDS_FIX'
  | 'NEEDS_USER_DECISION'
  | 'REJECT_OR_REMATCH';

export type UsdaStateCoverageStatus =
  | 'RAW_AND_COOKED_READY'
  | 'RAW_ONLY_NEEDS_COOKED'
  | 'COOKED_ONLY_NEEDS_RAW'
  | 'STATE_NOT_APPLICABLE'
  | 'STATE_NEEDS_DECISION'
  | 'NO_USDA_PROFILE';

export type UsdaQualityIssueCode =
  | 'NO_PRIMARY_USDA_PROFILE'
  | 'MULTIPLE_PRIMARY_MAPPINGS'
  | 'INGREDIENT_PROFILE_MISSING'
  | 'INGREDIENT_PROFILE_SOURCE_NOT_USDA'
  | 'INGREDIENT_PROFILE_PRIMARY_MISMATCH'
  | 'PRIMARY_PROFILE_CONTRACT_FAIL'
  | 'INGREDIENT_PROFILE_CONTRACT_FAIL'
  | 'SOURCE_RECORD_MISSING'
  | 'SOURCE_RECORD_VALUE_MISMATCH'
  | 'INGREDIENT_PRIMARY_VALUE_MISMATCH'
  | 'SOURCE_FORM_VALUE_MISMATCH'
  | 'SOURCE_FORM_MISSING_FOR_VALUE'
  | 'DRY_DESCRIPTION_WITHOUT_DRY_NAME'
  | 'POWDER_DESCRIPTION_WITHOUT_POWDER_NAME'
  | 'UV_EXPOSED_DESCRIPTION'
  | 'WILD_DESCRIPTION_NEEDS_DECISION'
  | 'PEELED_DESCRIPTION_NEEDS_LABEL'
  | 'WITH_PEEL_DESCRIPTION_NEEDS_LABEL'
  | 'MISSING_COOKED_PROFILE'
  | 'MISSING_RAW_PROFILE'
  | 'STATE_COVERAGE_NEEDS_DECISION'
  | 'NO_USDA_CANDIDATE';

export interface UsdaQualityNutritionFood {
  name?: string | null;
  dataSource?: string | null;
  externalId?: string | null;
  status?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  nutritionData?: unknown;
}

export interface UsdaQualityMapping {
  isPrimary: boolean;
  nutritionFood?: UsdaQualityNutritionFood | null;
}

export interface UsdaQualityCandidate {
  status: string;
  confidence?: string | null;
  score?: number | null;
  sourceRecord?: {
    sourceType?: string | null;
    sourceKey?: string | null;
    foodName?: string | null;
  } | null;
}

export interface UsdaQualitySourceRecord {
  sourceKey: string;
  sourceTitle?: string | null;
  foodName?: string | null;
  normalizedNutrition?: unknown;
}

export interface UsdaQualityAuditInput {
  id: string;
  name: string;
  nutritionProfile: unknown;
  nutritionFoodMappings?: UsdaQualityMapping[];
  nutritionCandidates?: UsdaQualityCandidate[];
  sourceRecords?: UsdaQualitySourceRecord[];
}

export interface UsdaQualityAuditRow {
  ingredientId: string;
  ingredientName: string;
  status: UsdaQualityAuditStatus;
  stateCoverage: UsdaStateCoverageStatus;
  issueCodes: UsdaQualityIssueCode[];
  issueSummary: string;
  primaryFdcId: string;
  primaryFoodName: string;
  primaryStateLabel: string;
  secondaryUsdaMappingCount: number;
  pendingUsdaCandidateCount: number;
  nutrientMismatchCount: number;
  nutrientMismatchExamples: string;
  nextAction: string;
}

const CSV_HEADERS: Array<{
  label: string;
  value: (row: UsdaQualityAuditRow) => string | number;
}> = [
  { label: '原料ID', value: (row) => row.ingredientId },
  { label: '原料名称', value: (row) => row.ingredientName },
  { label: '审核结论', value: (row) => statusLabel(row.status) },
  { label: '加工状态覆盖', value: (row) => stateCoverageLabel(row.stateCoverage) },
  { label: '问题代码', value: (row) => row.issueCodes.join('; ') },
  { label: '问题摘要', value: (row) => row.issueSummary },
  { label: '主档案 FDC ID', value: (row) => row.primaryFdcId },
  { label: '主档案 USDA 词条', value: (row) => row.primaryFoodName },
  { label: '主档案状态', value: (row) => row.primaryStateLabel },
  { label: '次级 USDA 档案数', value: (row) => row.secondaryUsdaMappingCount },
  { label: '待审 USDA 候选数', value: (row) => row.pendingUsdaCandidateCount },
  { label: '营养数值差异数', value: (row) => row.nutrientMismatchCount },
  { label: '营养数值差异示例', value: (row) => row.nutrientMismatchExamples },
  { label: '下一步动作', value: (row) => row.nextAction },
];

const NUMERIC_TOLERANCE = 0.001;

export function auditUsdaNutritionQualityRows(
  inputs: UsdaQualityAuditInput[],
): UsdaQualityAuditRow[] {
  return inputs.map(auditRow).sort(compareRows);
}

export function usdaQualityAuditRowsToCsv(
  rows: UsdaQualityAuditRow[],
): string {
  return [
    CSV_HEADERS.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

export function usdaQualityAuditRowsToMarkdown(
  rows: UsdaQualityAuditRow[],
): string {
  const byStatus = countBy(rows, (row) => row.status);
  const byState = countBy(rows, (row) => row.stateCoverage);
  const issueCounts = getIssueCounts(rows).slice(0, 20);
  const exceptionRows = rows.filter((row) => row.status !== 'PASS');

  return [
    '# USDA 主档案质量审核',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 汇总',
    '',
    `- 审核原料数：${rows.length}`,
    `- 通过：${byStatus.PASS ?? 0}`,
    `- 通过但有说明：${byStatus.PASS_WITH_NOTE ?? 0}`,
    `- 需要修复：${byStatus.NEEDS_FIX ?? 0}`,
    `- 需要人工决策：${byStatus.NEEDS_USER_DECISION ?? 0}`,
    `- 建议拒绝或重新匹配：${byStatus.REJECT_OR_REMATCH ?? 0}`,
    '',
    '## 加工状态覆盖',
    '',
    `- 生熟两档齐全：${byState.RAW_AND_COOKED_READY ?? 0}`,
    `- 只有生档案、建议补熟档案：${byState.RAW_ONLY_NEEDS_COOKED ?? 0}`,
    `- 只有熟档案、建议补生档案：${byState.COOKED_ONLY_NEEDS_RAW ?? 0}`,
    `- 不适用生熟两档：${byState.STATE_NOT_APPLICABLE ?? 0}`,
    `- 状态是否补充需要判断：${byState.STATE_NEEDS_DECISION ?? 0}`,
    `- 暂无 USDA 档案：${byState.NO_USDA_PROFILE ?? 0}`,
    '',
    '## 高频问题',
    '',
    ...formatIssueCounts(issueCounts),
    '',
    '## 异常清单',
    '',
    ...formatExceptionTable(exceptionRows),
    '',
  ].join('\n');
}

function auditRow(input: UsdaQualityAuditInput): UsdaQualityAuditRow {
  const mappings = input.nutritionFoodMappings ?? [];
  const usdaMappings = mappings.filter((mapping) =>
    isUsdaSource(mapping.nutritionFood?.dataSource),
  );
  const primaryMappings = mappings.filter((mapping) => mapping.isPrimary);
  const primaryUsdaMapping =
    primaryMappings.find((mapping) =>
      isUsdaSource(mapping.nutritionFood?.dataSource),
    ) ?? null;
  const primaryFood = primaryUsdaMapping?.nutritionFood ?? null;
  const primaryProfile = normalizeNutritionProfile(
    primaryFood?.nutritionData as NutritionProfile,
  );
  const ingredientProfile = normalizeNutritionProfile(
    input.nutritionProfile as NutritionProfile,
  );
  const primaryFdcId = normalizeFdcId(primaryFood?.externalId ?? '');
  const sourceRecord = input.sourceRecords?.find(
    (record) => normalizeFdcId(record.sourceKey) === primaryFdcId,
  );
  const sourceProfile = normalizeNutritionProfile(
    sourceRecord?.normalizedNutrition as NutritionProfile,
  );
  const pendingUsdaCandidateCount = (input.nutritionCandidates ?? []).filter(
    (candidate) =>
      candidate.status === 'CANDIDATE' &&
      candidate.sourceRecord?.sourceType === 'USDA',
  ).length;

  const issueCodes: UsdaQualityIssueCode[] = [];
  const mismatchExamples: string[] = [];

  if (!primaryUsdaMapping) {
    issueCodes.push('NO_PRIMARY_USDA_PROFILE');
    if (pendingUsdaCandidateCount === 0) {
      issueCodes.push('NO_USDA_CANDIDATE');
    }
  }
  if (primaryMappings.length > 1) {
    issueCodes.push('MULTIPLE_PRIMARY_MAPPINGS');
  }
  if (primaryUsdaMapping && !ingredientProfile) {
    issueCodes.push('INGREDIENT_PROFILE_MISSING');
  }
  if (ingredientProfile && ingredientProfile.meta.sourceType !== 'USDA') {
    issueCodes.push('INGREDIENT_PROFILE_SOURCE_NOT_USDA');
  }
  if (
    primaryFdcId &&
    ingredientProfile?.meta.externalId &&
    ingredientProfile.meta.externalId !== primaryFdcId
  ) {
    issueCodes.push('INGREDIENT_PROFILE_PRIMARY_MISMATCH');
  }
  if (primaryProfile && hasContractErrors(primaryProfile)) {
    issueCodes.push('PRIMARY_PROFILE_CONTRACT_FAIL');
  }
  if (ingredientProfile && hasContractErrors(ingredientProfile)) {
    issueCodes.push('INGREDIENT_PROFILE_CONTRACT_FAIL');
  }
  if (primaryUsdaMapping && !sourceRecord) {
    issueCodes.push('SOURCE_RECORD_MISSING');
  }

  if (primaryProfile && ingredientProfile) {
    addValueMismatches({
      left: primaryProfile,
      right: ingredientProfile,
      issueCode: 'INGREDIENT_PRIMARY_VALUE_MISMATCH',
      issueCodes,
      examples: mismatchExamples,
      prefix: 'Ingredient vs primary',
    });
  }
  if (primaryProfile && sourceProfile) {
    addValueMismatches({
      left: primaryProfile,
      right: sourceProfile,
      issueCode: 'SOURCE_RECORD_VALUE_MISMATCH',
      issueCodes,
      examples: mismatchExamples,
      prefix: 'Primary vs source',
    });
  }
  if (primaryProfile) {
    addSourceFormMismatches({
      profile: primaryProfile,
      issueCodes,
      examples: mismatchExamples,
    });
  }

  issueCodes.push(
    ...getSemanticIssues({
      ingredientName: input.name,
      primaryFood,
    }),
  );

  const stateCoverage = getStateCoverage({
    ingredientName: input.name,
    mappings: usdaMappings,
    hasPrimaryUsda: Boolean(primaryUsdaMapping),
  });
  issueCodes.push(...getStateCoverageIssues(stateCoverage));

  const uniqueIssueCodes = Array.from(new Set(issueCodes));
  const status = getStatus(uniqueIssueCodes);

  return {
    ingredientId: input.id,
    ingredientName: input.name,
    status,
    stateCoverage,
    issueCodes: uniqueIssueCodes,
    issueSummary: uniqueIssueCodes.map(issueLabel).join('；'),
    primaryFdcId,
    primaryFoodName: primaryFood?.name ?? '',
    primaryStateLabel: formatStateLabel(primaryFood),
    secondaryUsdaMappingCount: usdaMappings.filter((mapping) => !mapping.isPrimary)
      .length,
    pendingUsdaCandidateCount,
    nutrientMismatchCount: mismatchExamples.length,
    nutrientMismatchExamples: mismatchExamples.slice(0, 8).join(' | '),
    nextAction: nextAction(status, stateCoverage),
  };
}

function addValueMismatches(params: {
  left: NutritionProfileV2;
  right: NutritionProfileV2;
  issueCode: UsdaQualityIssueCode;
  issueCodes: UsdaQualityIssueCode[];
  examples: string[];
  prefix: string;
}) {
  for (const field of NUTRITION_FIELD_CATALOG) {
    const leftValue = getProfileValue(params.left, field.fieldPath);
    const rightValue = getProfileValue(params.right, field.fieldPath);
    if (
      typeof leftValue === 'number' &&
      typeof rightValue === 'number' &&
      !nearlyEqual(leftValue, rightValue)
    ) {
      params.issueCodes.push(params.issueCode);
      params.examples.push(
        `${params.prefix} ${field.fieldPath}: ${leftValue} vs ${rightValue}`,
      );
    }
  }
}

function addSourceFormMismatches(params: {
  profile: NutritionProfileV2;
  issueCodes: UsdaQualityIssueCode[];
  examples: string[];
}) {
  const sourceForms = params.profile.meta.sourceForms ?? {};
  for (const field of NUTRITION_FIELD_CATALOG) {
    const value = getProfileValue(params.profile, field.fieldPath);
    const sourceForm = sourceForms[field.fieldPath];
    if (typeof value !== 'number') {
      continue;
    }
    if (!sourceForm) {
      params.issueCodes.push('SOURCE_FORM_MISSING_FOR_VALUE');
      params.examples.push(`Missing source form ${field.fieldPath}`);
      continue;
    }
    if (
      typeof sourceForm.canonicalValue === 'number' &&
      !nearlyEqual(value, sourceForm.canonicalValue)
    ) {
      params.issueCodes.push('SOURCE_FORM_VALUE_MISMATCH');
      params.examples.push(
        `Source form ${field.fieldPath}: ${value} vs ${sourceForm.canonicalValue}`,
      );
    }
  }
}

function getSemanticIssues(params: {
  ingredientName: string;
  primaryFood: UsdaQualityNutritionFood | null;
}): UsdaQualityIssueCode[] {
  if (!params.primaryFood?.name) {
    return [];
  }

  const description = params.primaryFood.name.toLowerCase();
  const edibleLabel = params.primaryFood.ediblePortionLabel ?? '';
  const issues: UsdaQualityIssueCode[] = [];

  for (const mismatch of getFoodStateMismatches({
    ingredientName: params.ingredientName,
    foodDescription: params.primaryFood.name,
  })) {
    issues.push(mismatch);
  }

  if (/(ultraviolet|uv[-\s]?exposed|exposed to ultraviolet)/u.test(description)) {
    issues.push('UV_EXPOSED_DESCRIPTION');
  }
  if (
    /\bwild\b/u.test(description) &&
    !/(野生|wild)/iu.test(params.ingredientName)
  ) {
    issues.push('WILD_DESCRIPTION_NEEDS_DECISION');
  }
  if (
    /\bpeeled\b/u.test(description) &&
    !/(去皮|peeled)/iu.test(edibleLabel)
  ) {
    issues.push('PEELED_DESCRIPTION_NEEDS_LABEL');
  }
  if (
    /with peel/u.test(description) &&
    !/(带皮|with peel)/iu.test(edibleLabel)
  ) {
    issues.push('WITH_PEEL_DESCRIPTION_NEEDS_LABEL');
  }

  return issues;
}

function getStateCoverage(params: {
  ingredientName: string;
  mappings: UsdaQualityMapping[];
  hasPrimaryUsda: boolean;
}): UsdaStateCoverageStatus {
  if (!params.hasPrimaryUsda) {
    return 'NO_USDA_PROFILE';
  }

  const hasRaw = params.mappings.some((mapping) => isRawFood(mapping.nutritionFood));
  const hasCooked = params.mappings.some((mapping) =>
    isCookedFood(mapping.nutritionFood),
  );

  if (isStateCoverageNotApplicable(params.ingredientName, params.mappings)) {
    return 'STATE_NOT_APPLICABLE';
  }

  if (hasRaw && hasCooked) {
    return 'RAW_AND_COOKED_READY';
  }

  if (requiresRawCookedCoverage(params.ingredientName, params.mappings)) {
    if (hasRaw && !hasCooked) {
      return 'RAW_ONLY_NEEDS_COOKED';
    }
    if (hasCooked && !hasRaw) {
      return 'COOKED_ONLY_NEEDS_RAW';
    }
  }

  return 'STATE_NEEDS_DECISION';
}

function getStateCoverageIssues(
  stateCoverage: UsdaStateCoverageStatus,
): UsdaQualityIssueCode[] {
  switch (stateCoverage) {
    case 'RAW_ONLY_NEEDS_COOKED':
      return ['MISSING_COOKED_PROFILE'];
    case 'COOKED_ONLY_NEEDS_RAW':
      return ['MISSING_RAW_PROFILE'];
    case 'STATE_NEEDS_DECISION':
      return ['STATE_COVERAGE_NEEDS_DECISION'];
    default:
      return [];
  }
}

function isStateCoverageNotApplicable(
  ingredientName: string,
  mappings: UsdaQualityMapping[],
): boolean {
  const name = ingredientName.toLowerCase();
  const descriptions = mappings
    .map((mapping) => mapping.nutritionFood?.name ?? '')
    .join(' ')
    .toLowerCase();
  const states = mappings
    .map((mapping) => mapping.nutritionFood?.preparationStateLabel ?? '')
    .join(' ');

  return (
    isCommonRawFruitOrHerb(name) ||
    /油|油脂|粉|咖喱|姜黄|丁香/u.test(name) ||
    /籽|芝麻|坚果|巴旦木|核桃|奇亚/u.test(name) ||
    /\b(oil|spices|ground|powder|nuts|seeds)\b/u.test(descriptions) ||
    /(油脂|粉|干)/u.test(states)
  );
}

function isCommonRawFruitOrHerb(normalizedIngredientName: string): boolean {
  return /苹果|香蕉|梨|蓝莓|树莓|菠萝|木瓜|草莓|西瓜|哈密瓜|香菜|生菜|黄瓜/u.test(
    normalizedIngredientName,
  );
}

function requiresRawCookedCoverage(
  ingredientName: string,
  mappings: UsdaQualityMapping[],
): boolean {
  const name = ingredientName.toLowerCase();
  const descriptions = mappings
    .map((mapping) => mapping.nutritionFood?.name ?? '')
    .join(' ')
    .toLowerCase();

  return (
    /肉|胸|腿|里脊|肝|心|肾|脾|胗|蛋|鱼|虾|贝|蚝|鸡|鸭|鹅|牛|猪|羊|兔|鹿|马/u.test(
      name,
    ) ||
    /米|燕麦|藜麦|薏仁|小米|豆|土豆|山药|红薯|紫薯|南瓜|玉米粒/u.test(name) ||
    /(meat|chicken|duck|goose|beef|pork|fish|mollusk|egg|rice|oats|millet|quinoa|beans|potato|yam|sweet potato|pumpkin|corn)/u.test(
      descriptions,
    )
  );
}

function isRawFood(food?: UsdaQualityNutritionFood | null): boolean {
  const label = food?.preparationStateLabel ?? '';
  const name = food?.name?.toLowerCase() ?? '';
  return /生|raw/u.test(label) || /\braw\b/u.test(name);
}

function isCookedFood(food?: UsdaQualityNutritionFood | null): boolean {
  const label = `${food?.preparationStateLabel ?? ''} ${
    food?.processingLabel ?? ''
  }`;
  const name = food?.name?.toLowerCase() ?? '';
  return (
    /熟|熟制|烹调|煮|烤/u.test(label) ||
    /\b(cooked|boiled|baked|roasted|grilled|braised|simmered|microwaved|broiled)\b/u.test(
      name,
    )
  );
}

function getStatus(
  issueCodes: readonly UsdaQualityIssueCode[],
): UsdaQualityAuditStatus {
  if (
    issueCodes.some((code) =>
      ['UV_EXPOSED_DESCRIPTION'].includes(code),
    )
  ) {
    return 'REJECT_OR_REMATCH';
  }

  if (
    issueCodes.some((code) =>
      [
        'MULTIPLE_PRIMARY_MAPPINGS',
        'INGREDIENT_PROFILE_MISSING',
        'INGREDIENT_PROFILE_SOURCE_NOT_USDA',
        'INGREDIENT_PROFILE_PRIMARY_MISMATCH',
        'PRIMARY_PROFILE_CONTRACT_FAIL',
        'INGREDIENT_PROFILE_CONTRACT_FAIL',
        'SOURCE_RECORD_MISSING',
        'SOURCE_RECORD_VALUE_MISMATCH',
        'INGREDIENT_PRIMARY_VALUE_MISMATCH',
        'SOURCE_FORM_VALUE_MISMATCH',
      ].includes(code),
    )
  ) {
    return 'NEEDS_FIX';
  }

  if (
    issueCodes.some((code) =>
      [
        'NO_PRIMARY_USDA_PROFILE',
        'NO_USDA_CANDIDATE',
        'DRY_DESCRIPTION_WITHOUT_DRY_NAME',
        'POWDER_DESCRIPTION_WITHOUT_POWDER_NAME',
        'WILD_DESCRIPTION_NEEDS_DECISION',
        'PEELED_DESCRIPTION_NEEDS_LABEL',
        'WITH_PEEL_DESCRIPTION_NEEDS_LABEL',
        'MISSING_COOKED_PROFILE',
        'MISSING_RAW_PROFILE',
        'STATE_COVERAGE_NEEDS_DECISION',
      ].includes(code),
    )
  ) {
    return 'NEEDS_USER_DECISION';
  }

  if (issueCodes.length > 0) {
    return 'PASS_WITH_NOTE';
  }

  return 'PASS';
}

function nextAction(
  status: UsdaQualityAuditStatus,
  stateCoverage: UsdaStateCoverageStatus,
): string {
  if (status === 'PASS') {
    return '可保留；无需逐条人工审核';
  }
  if (status === 'PASS_WITH_NOTE') {
    return '可保留；保留备注供后续抽样验收';
  }
  if (status === 'NEEDS_FIX') {
    return '先修复数据结构、来源记录或营养数值不一致';
  }
  if (status === 'REJECT_OR_REMATCH') {
    return '建议拒绝当前主档案并重新匹配';
  }
  if (stateCoverage === 'RAW_ONLY_NEEDS_COOKED') {
    return '确认是否需要补熟制次级档案';
  }
  if (stateCoverage === 'COOKED_ONLY_NEEDS_RAW') {
    return '确认是否需要补生制主档案';
  }
  if (stateCoverage === 'NO_USDA_PROFILE') {
    return '查找 USDA 候选或决定转 CFCT/手工来源';
  }
  return '需要人工判断语义匹配或加工状态覆盖';
}

function hasContractErrors(profile: NutritionProfileV2): boolean {
  return validateNutritionProfileContract(profile, {
    requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
    allowedRawBasisTypes: ['PER_100_G'],
    requireSourceMeta: true,
  }).some((issue) => issue.severity === 'ERROR');
}

function getProfileValue(
  profile: NutritionProfileV2,
  fieldPath: string,
): number | null {
  const [tabKey, fieldKey] = fieldPath.split('.') as [
    keyof Pick<
      NutritionProfileV2,
      'macros' | 'minerals' | 'vitamins' | 'fattyAcids' | 'aminoAcids'
    >,
    string,
  ];
  const value = profile[tabKey]?.[fieldKey as never];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatStateLabel(food?: UsdaQualityNutritionFood | null): string {
  return [
    food?.preparationStateLabel,
    food?.ediblePortionLabel,
    food?.processingLabel,
  ]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(' / ');
}

function normalizeFdcId(value: string): string {
  return value.trim().replace(/^USDA:/iu, '');
}

function isUsdaSource(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === 'USDA';
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= NUMERIC_TOLERANCE;
}

function compareRows(
  left: UsdaQualityAuditRow,
  right: UsdaQualityAuditRow,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    left.ingredientName.localeCompare(right.ingredientName, 'zh-CN')
  );
}

function statusRank(status: UsdaQualityAuditStatus): number {
  switch (status) {
    case 'NEEDS_FIX':
      return 0;
    case 'REJECT_OR_REMATCH':
      return 1;
    case 'NEEDS_USER_DECISION':
      return 2;
    case 'PASS_WITH_NOTE':
      return 3;
    case 'PASS':
      return 4;
  }
}

function countBy<T extends string>(
  rows: UsdaQualityAuditRow[],
  getter: (row: UsdaQualityAuditRow) => T,
): Partial<Record<T, number>> {
  return rows.reduce<Partial<Record<T, number>>>((counts, row) => {
    const key = getter(row);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function getIssueCounts(
  rows: UsdaQualityAuditRow[],
): Array<{ code: UsdaQualityIssueCode; count: number }> {
  const counts = new Map<UsdaQualityIssueCode, number>();
  for (const row of rows) {
    for (const code of row.issueCodes) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function formatIssueCounts(
  counts: Array<{ code: UsdaQualityIssueCode; count: number }>,
): string[] {
  if (counts.length === 0) {
    return ['- 无'];
  }
  return counts.map((item) => `- ${issueLabel(item.code)}：${item.count}`);
}

function formatExceptionTable(rows: UsdaQualityAuditRow[]): string[] {
  if (rows.length === 0) {
    return ['暂无异常。'];
  }

  return [
    '| 原料 | 结论 | 状态覆盖 | 主档案 | 问题 | 下一步 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.slice(0, 160).map((row) =>
      [
        row.ingredientName,
        statusLabel(row.status),
        stateCoverageLabel(row.stateCoverage),
        [row.primaryFoodName, row.primaryFdcId].filter(Boolean).join(' / '),
        row.issueSummary,
        row.nextAction,
      ]
        .map(markdownEscape)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
    rows.length > 160 ? `\n> 仅展示前 160 条；完整明细见 CSV。` : '',
  ];
}

function statusLabel(status: UsdaQualityAuditStatus): string {
  switch (status) {
    case 'PASS':
      return '通过';
    case 'PASS_WITH_NOTE':
      return '通过但有说明';
    case 'NEEDS_FIX':
      return '需要修复';
    case 'NEEDS_USER_DECISION':
      return '需要人工决策';
    case 'REJECT_OR_REMATCH':
      return '建议拒绝或重新匹配';
  }
}

function stateCoverageLabel(status: UsdaStateCoverageStatus): string {
  switch (status) {
    case 'RAW_AND_COOKED_READY':
      return '生熟两档齐全';
    case 'RAW_ONLY_NEEDS_COOKED':
      return '只有生档案，建议补熟档案';
    case 'COOKED_ONLY_NEEDS_RAW':
      return '只有熟档案，建议补生档案';
    case 'STATE_NOT_APPLICABLE':
      return '不适用生熟两档';
    case 'STATE_NEEDS_DECISION':
      return '加工状态需判断';
    case 'NO_USDA_PROFILE':
      return '暂无 USDA 档案';
  }
}

function issueLabel(code: UsdaQualityIssueCode): string {
  const labels: Record<UsdaQualityIssueCode, string> = {
    NO_PRIMARY_USDA_PROFILE: '没有 USDA 主档案',
    MULTIPLE_PRIMARY_MAPPINGS: '存在多个主档案',
    INGREDIENT_PROFILE_MISSING: 'Ingredient 营养快照缺失',
    INGREDIENT_PROFILE_SOURCE_NOT_USDA: 'Ingredient 快照来源不是 USDA',
    INGREDIENT_PROFILE_PRIMARY_MISMATCH: 'Ingredient 快照 FDC ID 与主档案不一致',
    PRIMARY_PROFILE_CONTRACT_FAIL: '主档案营养结构合同失败',
    INGREDIENT_PROFILE_CONTRACT_FAIL: 'Ingredient 快照营养结构合同失败',
    SOURCE_RECORD_MISSING: 'USDA 来源记录缺失',
    SOURCE_RECORD_VALUE_MISMATCH: '主档案与来源记录数值不一致',
    INGREDIENT_PRIMARY_VALUE_MISMATCH: 'Ingredient 快照与主档案数值不一致',
    SOURCE_FORM_VALUE_MISMATCH: '来源项 canonicalValue 与档案数值不一致',
    SOURCE_FORM_MISSING_FOR_VALUE: '有数值但缺少来源项记录',
    DRY_DESCRIPTION_WITHOUT_DRY_NAME: 'USDA 词条为干制，但标准原料名未标干',
    POWDER_DESCRIPTION_WITHOUT_POWDER_NAME: 'USDA 词条为粉/粉碎，但标准原料名未标粉',
    UV_EXPOSED_DESCRIPTION: 'USDA 词条包含紫外照射',
    WILD_DESCRIPTION_NEEDS_DECISION: 'USDA 词条为野生来源，需要确认',
    PEELED_DESCRIPTION_NEEDS_LABEL: 'USDA 词条为去皮，但可食部标签未标去皮',
    WITH_PEEL_DESCRIPTION_NEEDS_LABEL: 'USDA 词条为带皮，但可食部标签未标带皮',
    MISSING_COOKED_PROFILE: '缺少熟制档案',
    MISSING_RAW_PROFILE: '缺少生制档案',
    STATE_COVERAGE_NEEDS_DECISION: '是否需要补加工状态档案待判断',
    NO_USDA_CANDIDATE: '没有待审 USDA 候选',
  };
  return labels[code];
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function markdownEscape(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}
