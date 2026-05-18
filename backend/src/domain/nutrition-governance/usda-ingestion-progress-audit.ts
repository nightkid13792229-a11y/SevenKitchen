import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
} from './nutrition-profile-contract';

export type UsdaIngestionProgressStage =
  | 'CONFIRMED_USDA_PRIMARY'
  | 'REVIEW_USDA_CANDIDATES'
  | 'FIND_USDA_CANDIDATE'
  | 'FIX_CONFIRMED_PROFILE'
  | 'USE_CFCT_OR_MANUAL';

export type UsdaIngestionProgressIssue =
  | 'MULTIPLE_PRIMARY_MAPPINGS'
  | 'PRIMARY_NOT_USDA'
  | 'INGREDIENT_PROFILE_MISSING'
  | 'INGREDIENT_PROFILE_SOURCE_NOT_USDA'
  | 'INGREDIENT_PROFILE_PRIMARY_MISMATCH'
  | 'PRIMARY_PROFILE_CONTRACT_FAIL'
  | 'INGREDIENT_PROFILE_CONTRACT_FAIL';

export interface UsdaIngestionProgressFood {
  name?: string | null;
  dataSource?: string | null;
  externalId?: string | null;
  status?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  nutritionData?: unknown;
}

export interface UsdaIngestionProgressMapping {
  isPrimary: boolean;
  nutritionFood?: UsdaIngestionProgressFood | null;
}

export interface UsdaIngestionProgressCandidate {
  id: string;
  status: string;
  confidence?: string | null;
  score?: number | null;
  agentReviewStatus?: string | null;
  sourceRecord?: {
    sourceType?: string | null;
    sourceKey?: string | null;
    foodName?: string | null;
  } | null;
}

export interface UsdaIngestionProgressInput {
  id: string;
  name: string;
  nutritionProfile: unknown;
  nutritionFoodMappings?: UsdaIngestionProgressMapping[];
  nutritionCandidates?: UsdaIngestionProgressCandidate[];
}

export interface UsdaIngestionProgressRow {
  ingredientId: string;
  ingredientName: string;
  stage: UsdaIngestionProgressStage;
  nextAction: string;
  issues: UsdaIngestionProgressIssue[];
  issueDetails: string;
  primaryFoodName: string;
  primaryFdcId: string;
  primaryStateLabel: string;
  primaryNutritionFoodStatus: string;
  secondaryUsdaMappingCount: number;
  totalNutritionFoodMappingCount: number;
  pendingUsdaCandidateCount: number;
  confirmedUsdaCandidateCount: number;
  rejectedUsdaCandidateCount: number;
  bestCandidateId: string;
  bestCandidateFdcId: string;
  bestCandidateName: string;
  bestCandidateScore: number;
  bestCandidateConfidence: string;
  bestCandidateAgentStatus: string;
  ingredientProfileSource: string;
  ingredientProfileExternalId: string;
}

const CSV_HEADERS: Array<{
  label: string;
  value: (row: UsdaIngestionProgressRow) => string | number;
}> = [
  { label: '原料ID', value: (row) => row.ingredientId },
  { label: '原料名称', value: (row) => row.ingredientName },
  { label: '阶段', value: (row) => stageLabel(row.stage) },
  { label: '下一步动作', value: (row) => row.nextAction },
  { label: '问题代码', value: (row) => row.issues.join('; ') },
  { label: '问题详情', value: (row) => row.issueDetails },
  { label: '主档案 USDA 食物', value: (row) => row.primaryFoodName },
  { label: '主档案 FDC ID', value: (row) => row.primaryFdcId },
  { label: '主档案状态', value: (row) => row.primaryStateLabel },
  { label: '主档案入库状态', value: (row) => row.primaryNutritionFoodStatus },
  { label: '次级 USDA 档案数', value: (row) => row.secondaryUsdaMappingCount },
  { label: '总档案映射数', value: (row) => row.totalNutritionFoodMappingCount },
  { label: '待审 USDA 候选数', value: (row) => row.pendingUsdaCandidateCount },
  { label: '已确认 USDA 候选数', value: (row) => row.confirmedUsdaCandidateCount },
  { label: '已拒绝 USDA 候选数', value: (row) => row.rejectedUsdaCandidateCount },
  { label: '最佳候选ID', value: (row) => row.bestCandidateId },
  { label: '最佳候选 FDC ID', value: (row) => row.bestCandidateFdcId },
  { label: '最佳候选食物', value: (row) => row.bestCandidateName },
  { label: '最佳候选分数', value: (row) => row.bestCandidateScore },
  { label: '最佳候选置信度', value: (row) => row.bestCandidateConfidence },
  { label: 'Agent 状态', value: (row) => row.bestCandidateAgentStatus },
  { label: 'Ingredient 当前来源', value: (row) => row.ingredientProfileSource },
  { label: 'Ingredient 当前 externalId', value: (row) => row.ingredientProfileExternalId },
];

export function buildUsdaIngestionProgressRows(
  ingredients: UsdaIngestionProgressInput[],
): UsdaIngestionProgressRow[] {
  return ingredients.map(buildProgressRow).sort(compareRows);
}

export function usdaIngestionProgressRowsToCsv(
  rows: UsdaIngestionProgressRow[],
): string {
  return [
    CSV_HEADERS.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

export function usdaIngestionProgressRowsToMarkdown(
  rows: UsdaIngestionProgressRow[],
): string {
  const stageCounts = countRowsByStage(rows);
  const actionableRows = rows.filter(
    (row) => row.stage !== 'CONFIRMED_USDA_PRIMARY',
  );

  return [
    '# USDA 候选营养档案入库进度审计',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    '## 汇总',
    '',
    `- 食材原料总数：${rows.length}`,
    `- 已有 USDA 主档案：${stageCounts.CONFIRMED_USDA_PRIMARY}`,
    `- 待人工审核 USDA 候选：${stageCounts.REVIEW_USDA_CANDIDATES}`,
    `- 需要重新查找/导入 USDA 候选：${stageCounts.FIND_USDA_CANDIDATE}`,
    `- 需要修复已入库档案：${stageCounts.FIX_CONFIRMED_PROFILE}`,
    `- 已转向 CFCT/手工/其他来源：${stageCounts.USE_CFCT_OR_MANUAL}`,
    '',
    '## 阶段说明',
    '',
    '- 已有 USDA 主档案：标准原料已挂 USDA 主档案，且 Ingredient 快照与主档案通过基础合同检查。',
    '- 待人工审核 USDA 候选：已有 USDA 候选，但还没有可用 USDA 主档案。',
    '- 需要重新查找/导入 USDA 候选：没有 USDA 主档案，也没有待审 USDA 候选。',
    '- 需要修复已入库档案：已经有主档案痕迹，但主档案、Ingredient 快照或营养合同存在问题。',
    '- 已转向 CFCT/手工/其他来源：当前主档案不是 USDA；如果仍要 USDA 覆盖，需要重新查找或手动导入 FDC ID。',
    '',
    '## 优先处理清单',
    '',
    ...markdownTable(actionableRows.slice(0, 120)),
    actionableRows.length > 120
      ? `\n> 仅展示前 120 条待处理记录；完整明细见 CSV。`
      : '',
    '',
  ].join('\n');
}

function buildProgressRow(
  ingredient: UsdaIngestionProgressInput,
): UsdaIngestionProgressRow {
  const mappings = ingredient.nutritionFoodMappings ?? [];
  const candidates = ingredient.nutritionCandidates ?? [];
  const primaryMappings = mappings.filter((mapping) => mapping.isPrimary);
  const usdaMappings = mappings.filter((mapping) =>
    isUsdaSource(mapping.nutritionFood?.dataSource),
  );
  const primaryUsdaMapping =
    primaryMappings.find((mapping) =>
      isUsdaSource(mapping.nutritionFood?.dataSource),
    ) ?? null;
  const primaryMapping = primaryMappings[0] ?? null;
  const pendingCandidates = candidates
    .filter((candidate) => candidate.status === 'CANDIDATE')
    .sort(compareCandidates);
  const confirmedCandidateCount = candidates.filter(
    (candidate) => candidate.status === 'CONFIRMED',
  ).length;
  const rejectedCandidateCount = candidates.filter(
    (candidate) => candidate.status === 'REJECTED',
  ).length;
  const bestCandidate = pendingCandidates[0] ?? null;
  const ingredientProfile = normalizeNutritionProfile(
    ingredient.nutritionProfile as NutritionProfile,
  );
  const issues = getIssues({
    primaryMappings,
    primaryMapping,
    primaryUsdaMapping,
    ingredientProfile,
  });
  const issueDetails = getIssueDetails({
    issues,
    primaryUsdaMapping,
    ingredientProfile: ingredient.nutritionProfile,
  });
  const stage = getStage({
    issues,
    primaryMapping,
    primaryUsdaMapping,
    pendingCandidateCount: pendingCandidates.length,
  });

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    stage,
    nextAction: nextAction(stage),
    issues,
    issueDetails,
    primaryFoodName: primaryUsdaMapping?.nutritionFood?.name ?? '',
    primaryFdcId: getFdcId(primaryUsdaMapping?.nutritionFood?.externalId ?? ''),
    primaryStateLabel: formatStateLabel(primaryUsdaMapping?.nutritionFood),
    primaryNutritionFoodStatus: primaryUsdaMapping?.nutritionFood?.status ?? '',
    secondaryUsdaMappingCount: usdaMappings.filter((mapping) => !mapping.isPrimary)
      .length,
    totalNutritionFoodMappingCount: mappings.length,
    pendingUsdaCandidateCount: pendingCandidates.length,
    confirmedUsdaCandidateCount: confirmedCandidateCount,
    rejectedUsdaCandidateCount: rejectedCandidateCount,
    bestCandidateId: bestCandidate?.id ?? '',
    bestCandidateFdcId: getFdcId(bestCandidate?.sourceRecord?.sourceKey ?? ''),
    bestCandidateName: bestCandidate?.sourceRecord?.foodName ?? '',
    bestCandidateScore: roundScore(bestCandidate?.score),
    bestCandidateConfidence: bestCandidate?.confidence ?? '',
    bestCandidateAgentStatus: bestCandidate?.agentReviewStatus ?? '',
    ingredientProfileSource: ingredientProfile?.meta.sourceType ?? '',
    ingredientProfileExternalId: ingredientProfile?.meta.externalId ?? '',
  };
}

function getIssues(params: {
  primaryMappings: UsdaIngestionProgressMapping[];
  primaryMapping: UsdaIngestionProgressMapping | null;
  primaryUsdaMapping: UsdaIngestionProgressMapping | null;
  ingredientProfile: ReturnType<typeof normalizeNutritionProfile>;
}): UsdaIngestionProgressIssue[] {
  const issues: UsdaIngestionProgressIssue[] = [];

  if (params.primaryMappings.length > 1) {
    issues.push('MULTIPLE_PRIMARY_MAPPINGS');
  }

  if (
    params.primaryMapping &&
    !isUsdaSource(params.primaryMapping.nutritionFood?.dataSource)
  ) {
    issues.push('PRIMARY_NOT_USDA');
  }

  if (!params.primaryUsdaMapping) {
    return issues;
  }

  const primaryProfile = params.primaryUsdaMapping.nutritionFood?.nutritionData;
  if (hasContractErrors(primaryProfile)) {
    issues.push('PRIMARY_PROFILE_CONTRACT_FAIL');
  }

  if (!params.ingredientProfile) {
    issues.push('INGREDIENT_PROFILE_MISSING');
  } else {
    if (params.ingredientProfile.meta.sourceType !== 'USDA') {
      issues.push('INGREDIENT_PROFILE_SOURCE_NOT_USDA');
    }
    if (
      params.primaryUsdaMapping.nutritionFood?.externalId &&
      params.ingredientProfile.meta.externalId !==
        getFdcId(params.primaryUsdaMapping.nutritionFood.externalId)
    ) {
      issues.push('INGREDIENT_PROFILE_PRIMARY_MISMATCH');
    }
    if (hasContractErrors(params.ingredientProfile)) {
      issues.push('INGREDIENT_PROFILE_CONTRACT_FAIL');
    }
  }

  return Array.from(new Set(issues));
}

function getIssueDetails(params: {
  issues: UsdaIngestionProgressIssue[];
  primaryUsdaMapping: UsdaIngestionProgressMapping | null;
  ingredientProfile: unknown;
}): string {
  if (params.issues.length === 0) {
    return '';
  }

  const details: string[] = [];
  const primaryIssues = params.issues.includes('PRIMARY_PROFILE_CONTRACT_FAIL')
    ? contractIssueSummary(params.primaryUsdaMapping?.nutritionFood?.nutritionData)
    : '';
  const ingredientIssues = params.issues.includes('INGREDIENT_PROFILE_CONTRACT_FAIL')
    ? contractIssueSummary(params.ingredientProfile)
    : '';

  if (primaryIssues) {
    details.push(`primary:${primaryIssues}`);
  }
  if (ingredientIssues) {
    details.push(`ingredient:${ingredientIssues}`);
  }

  return details.join(' | ');
}

function hasContractErrors(profile: unknown): boolean {
  return validateNutritionProfileContract(profile, {
    requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
    allowedRawBasisTypes: ['PER_100_G'],
    requireSourceMeta: true,
  }).some((issue) => issue.severity === 'ERROR');
}

function contractIssueSummary(profile: unknown): string {
  const issues = validateNutritionProfileContract(profile, {
    requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
    allowedRawBasisTypes: ['PER_100_G'],
    requireSourceMeta: true,
  }).filter((issue) => issue.severity === 'ERROR');

  return Array.from(new Set(issues.map((issue) => issue.code))).join('; ');
}

function getStage(params: {
  issues: UsdaIngestionProgressIssue[];
  primaryMapping: UsdaIngestionProgressMapping | null;
  primaryUsdaMapping: UsdaIngestionProgressMapping | null;
  pendingCandidateCount: number;
}): UsdaIngestionProgressStage {
  if (params.primaryUsdaMapping && params.issues.length === 0) {
    return 'CONFIRMED_USDA_PRIMARY';
  }

  if (
    params.issues.some((issue) =>
      [
        'MULTIPLE_PRIMARY_MAPPINGS',
        'INGREDIENT_PROFILE_MISSING',
        'INGREDIENT_PROFILE_SOURCE_NOT_USDA',
        'INGREDIENT_PROFILE_PRIMARY_MISMATCH',
        'PRIMARY_PROFILE_CONTRACT_FAIL',
        'INGREDIENT_PROFILE_CONTRACT_FAIL',
      ].includes(issue),
    )
  ) {
    return 'FIX_CONFIRMED_PROFILE';
  }

  if (
    params.primaryMapping &&
    !params.primaryUsdaMapping &&
    params.issues.includes('PRIMARY_NOT_USDA')
  ) {
    return 'USE_CFCT_OR_MANUAL';
  }

  if (params.pendingCandidateCount > 0) {
    return 'REVIEW_USDA_CANDIDATES';
  }

  return 'FIND_USDA_CANDIDATE';
}

function nextAction(stage: UsdaIngestionProgressStage): string {
  switch (stage) {
    case 'CONFIRMED_USDA_PRIMARY':
      return '已入库；后续只需抽样验收或补充次级档案';
    case 'REVIEW_USDA_CANDIDATES':
      return '在后台审核 USDA 候选，选择主档案/次级档案后保存';
    case 'FIND_USDA_CANDIDATE':
      return '重新查找 USDA 候选，或手动导入 USDA FDC ID';
    case 'FIX_CONFIRMED_PROFILE':
      return '修复已入库主档案、Ingredient 快照或营养合同问题';
    case 'USE_CFCT_OR_MANUAL':
      return '当前主档案不是 USDA；确认是否接受 CFCT/手工来源或补 USDA 候选';
  }
}

function stageLabel(stage: UsdaIngestionProgressStage): string {
  switch (stage) {
    case 'CONFIRMED_USDA_PRIMARY':
      return '已有 USDA 主档案';
    case 'REVIEW_USDA_CANDIDATES':
      return '待人工审核 USDA 候选';
    case 'FIND_USDA_CANDIDATE':
      return '需要重新查找/导入 USDA 候选';
    case 'FIX_CONFIRMED_PROFILE':
      return '需要修复已入库档案';
    case 'USE_CFCT_OR_MANUAL':
      return '已转向 CFCT/手工/其他来源';
  }
}

function formatStateLabel(food?: UsdaIngestionProgressFood | null): string {
  return [
    food?.preparationStateLabel,
    food?.ediblePortionLabel,
    food?.processingLabel,
  ]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(' / ');
}

function compareCandidates(
  left: UsdaIngestionProgressCandidate,
  right: UsdaIngestionProgressCandidate,
): number {
  const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return confidenceRank(right.confidence) - confidenceRank(left.confidence);
}

function confidenceRank(confidence?: string | null): number {
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

function compareRows(
  left: UsdaIngestionProgressRow,
  right: UsdaIngestionProgressRow,
): number {
  const stageDelta = stageRank(left.stage) - stageRank(right.stage);
  if (stageDelta !== 0) {
    return stageDelta;
  }

  return left.ingredientName.localeCompare(right.ingredientName, 'zh-CN');
}

function stageRank(stage: UsdaIngestionProgressStage): number {
  switch (stage) {
    case 'FIX_CONFIRMED_PROFILE':
      return 0;
    case 'REVIEW_USDA_CANDIDATES':
      return 1;
    case 'FIND_USDA_CANDIDATE':
      return 2;
    case 'USE_CFCT_OR_MANUAL':
      return 3;
    case 'CONFIRMED_USDA_PRIMARY':
      return 4;
  }
}

function countRowsByStage(
  rows: UsdaIngestionProgressRow[],
): Record<UsdaIngestionProgressStage, number> {
  return rows.reduce<Record<UsdaIngestionProgressStage, number>>(
    (counts, row) => {
      counts[row.stage] += 1;
      return counts;
    },
    {
      CONFIRMED_USDA_PRIMARY: 0,
      REVIEW_USDA_CANDIDATES: 0,
      FIND_USDA_CANDIDATE: 0,
      FIX_CONFIRMED_PROFILE: 0,
      USE_CFCT_OR_MANUAL: 0,
    },
  );
}

function markdownTable(rows: UsdaIngestionProgressRow[]): string[] {
  if (rows.length === 0) {
    return ['暂无待处理记录。'];
  }

  return [
    '| 原料 | 阶段 | 推荐候选/主档案 | 待审候选 | 下一步 |',
    '| --- | --- | --- | ---: | --- |',
    ...rows.map((row) =>
      [
        row.ingredientName,
        stageLabel(row.stage),
        row.primaryFoodName ||
          [row.bestCandidateName, row.bestCandidateFdcId]
            .filter(Boolean)
            .join(' / '),
        String(row.pendingUsdaCandidateCount),
        row.nextAction,
      ]
        .map(markdownEscape)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    ),
  ];
}

function getFdcId(sourceKey: string): string {
  const match = sourceKey.match(/USDA:(\d+)/u);
  return match?.[1] ?? sourceKey.replace(/^USDA:/u, '');
}

function isUsdaSource(source: string | null | undefined): boolean {
  return source?.trim().toUpperCase() === 'USDA';
}

function roundScore(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1000) / 1000
    : 0;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function markdownEscape(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ');
}
