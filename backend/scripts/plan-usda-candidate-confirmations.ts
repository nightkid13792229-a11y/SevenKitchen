import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionCandidateStatus,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { normalizeNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  NutritionProfileV2,
} from '../src/domain/ingredient/types';
import { attachSourceRecordProfileMetadata } from '../src/domain/nutrition-governance/nutrition-governance.utils';
import {
  FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
  validateNutritionProfileContract,
  type NutritionProfileContractIssue,
} from '../src/domain/nutrition-governance/nutrition-profile-contract';
import {
  buildUsdaCandidateReviewRows,
  type UsdaCandidateReviewAction,
  type UsdaCandidateReviewInput,
  type UsdaCandidateReviewRiskLevel,
} from '../src/domain/nutrition-governance/usda-candidate-review';

loadEnv({ path: process.env.ENV_FILE || '.env' });

type PlanCandidate = UsdaCandidateReviewInput['candidates'][number] & {
  sourceRecord: UsdaCandidateReviewInput['candidates'][number]['sourceRecord'] & {
    sourceType?: string | null;
    sourceTitle?: string | null;
    sourceDetail?: unknown;
  };
};

export type UsdaCandidateConfirmationPlannedAction =
  | 'WOULD_CONFIRM'
  | 'SKIP_REVIEW'
  | 'SKIP_NO_CANDIDATE'
  | 'BLOCK_CONTRACT';

export interface UsdaCandidateConfirmationPlanInput {
  ingredient: UsdaCandidateReviewInput['ingredient'];
  candidates: PlanCandidate[];
}

export interface UsdaCandidateConfirmationPlanRow {
  ingredientId: string;
  ingredientName: string;
  candidateId: string;
  fdcId: string;
  foodName: string;
  dataType: string;
  confidence: string;
  score: number;
  riskLevel: UsdaCandidateReviewRiskLevel;
  recommendedAction: UsdaCandidateReviewAction;
  plannedAction: UsdaCandidateConfirmationPlannedAction;
  contractResult: 'PASS' | 'FAIL' | 'SKIP';
  issueCodes: string;
  issueDetails: string;
  wouldWrite: 'YES' | 'NO';
}

const CSV_HEADERS: Array<{
  label: string;
  value: (row: UsdaCandidateConfirmationPlanRow) => string | number;
}> = [
  { label: '原料ID', value: (row) => row.ingredientId },
  { label: '原料名称', value: (row) => row.ingredientName },
  { label: '候选ID', value: (row) => row.candidateId },
  { label: 'FDC ID', value: (row) => row.fdcId },
  { label: 'USDA描述', value: (row) => row.foodName },
  { label: '数据类型', value: (row) => row.dataType },
  { label: '置信度', value: (row) => row.confidence },
  { label: '分数', value: (row) => row.score },
  { label: '风险等级', value: (row) => row.riskLevel },
  { label: '审核建议', value: (row) => row.recommendedAction },
  { label: '计划动作', value: (row) => row.plannedAction },
  { label: '合同校验', value: (row) => row.contractResult },
  { label: '问题代码', value: (row) => row.issueCodes },
  { label: '问题详情', value: (row) => row.issueDetails },
  { label: '是否会写入', value: (row) => row.wouldWrite },
];

export function buildUsdaCandidateConfirmationPlanRows(
  inputs: UsdaCandidateConfirmationPlanInput[],
): UsdaCandidateConfirmationPlanRow[] {
  const reviewRows = buildUsdaCandidateReviewRows(inputs);
  const inputByIngredientId = new Map(
    inputs.map((input) => [input.ingredient.id, input]),
  );

  return reviewRows.map((reviewRow) => {
    const input = inputByIngredientId.get(reviewRow.ingredientId);
    const candidate =
      input?.candidates.find(
        (item) => item.id === reviewRow.bestCandidateId,
      ) ?? null;

    if (!candidate) {
      return {
        ingredientId: reviewRow.ingredientId,
        ingredientName: reviewRow.ingredientName,
        candidateId: '',
        fdcId: '',
        foodName: '',
        dataType: '',
        confidence: '',
        score: 0,
        riskLevel: reviewRow.riskLevel,
        recommendedAction: reviewRow.recommendedAction,
        plannedAction: 'SKIP_NO_CANDIDATE',
        contractResult: 'SKIP',
        issueCodes: '',
        issueDetails: '',
        wouldWrite: 'NO',
      };
    }

    const confirmedProfile = buildDryRunConfirmedProfile(candidate);
    const issues = validateNutritionProfileContract(confirmedProfile, {
      requiredFieldPaths: FOOD_CONFIRMATION_REQUIRED_FIELD_PATHS,
      allowedRawBasisTypes: ['PER_100_G'],
      requireSourceMeta: true,
    });
    const contractResult = issues.some((issue) => issue.severity === 'ERROR')
      ? 'FAIL'
      : 'PASS';
    const plannedAction = getPlannedAction(
      reviewRow.recommendedAction,
      contractResult,
    );

    return {
      ingredientId: reviewRow.ingredientId,
      ingredientName: reviewRow.ingredientName,
      candidateId: candidate.id,
      fdcId: reviewRow.bestFdcId,
      foodName: reviewRow.bestFoodName,
      dataType: reviewRow.bestDataType,
      confidence: candidate.confidence,
      score: candidate.score,
      riskLevel: reviewRow.riskLevel,
      recommendedAction: reviewRow.recommendedAction,
      plannedAction,
      contractResult,
      issueCodes: formatIssueCodes(issues),
      issueDetails: formatIssueDetails(issues),
      wouldWrite: plannedAction === 'WOULD_CONFIRM' ? 'YES' : 'NO',
    };
  });
}

export function usdaCandidateConfirmationPlanRowsToCsv(
  rows: UsdaCandidateConfirmationPlanRow[],
): string {
  return [
    CSV_HEADERS.map((header) => csvEscape(header.label)).join(','),
    ...rows.map((row) =>
      CSV_HEADERS.map((header) => csvEscape(header.value(row))).join(','),
    ),
  ].join('\n');
}

function buildDryRunConfirmedProfile(
  candidate: PlanCandidate,
): NutritionProfileV2 | null {
  const profile = normalizeNutritionProfile(
    candidate.normalizedNutrition as NutritionProfile,
  );
  if (!profile) {
    return null;
  }

  const sourceTitle =
    candidate.sourceRecord.sourceTitle?.trim() || profile.meta.sourceTitle;

  return attachSourceRecordProfileMetadata(profile, {
    sourceType:
      (candidate.sourceRecord.sourceType as NutritionProfileV2['meta']['sourceType']) ??
      profile.meta.sourceType,
    sourceKey: candidate.sourceRecord.sourceKey,
    sourceTitle,
    sourceDetail: candidate.sourceRecord.sourceDetail,
    confidenceLevel: candidate.confidence,
    versionNote: sourceTitle ? `Dry-run confirmation from ${sourceTitle}` : null,
  });
}

function getPlannedAction(
  recommendedAction: UsdaCandidateReviewAction,
  contractResult: 'PASS' | 'FAIL',
): UsdaCandidateConfirmationPlannedAction {
  if (recommendedAction !== 'CONFIRM_FIRST') {
    return 'SKIP_REVIEW';
  }

  return contractResult === 'PASS' ? 'WOULD_CONFIRM' : 'BLOCK_CONTRACT';
}

function formatIssueCodes(
  issues: readonly NutritionProfileContractIssue[],
): string {
  return Array.from(new Set(issues.map((issue) => issue.code))).join('; ');
}

function formatIssueDetails(
  issues: readonly NutritionProfileContractIssue[],
): string {
  return issues
    .map((issue) => `${issue.severity}:${issue.code}:${issue.fieldPath}`)
    .join(' | ');
}

async function writePlanReport(
  path: string,
  rows: UsdaCandidateConfirmationPlanRow[],
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${usdaCandidateConfirmationPlanRowsToCsv(rows)}\n`,
    'utf8',
  );
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function resolveOutputPath(args: string[]): string {
  const outIndex = args.indexOf('--out');
  const explicitOutputPath =
    outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : null;

  return resolve(
    process.cwd(),
    explicitOutputPath ||
      process.env.USDA_CANDIDATE_CONFIRMATION_PLAN_REPORT ||
      'reports/usda-candidate-confirmation-plan.csv',
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。示例: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen ts-node -r tsconfig-paths/register scripts/plan-usda-candidate-confirmations.ts',
    );
  }

  const outputPath = resolveOutputPath(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const ingredients = await prisma.ingredient.findMany({
      where: { type: IngredientType.FOOD },
      select: {
        id: true,
        name: true,
        nutritionCandidates: {
          where: {
            status: NutritionCandidateStatus.CANDIDATE,
            sourceRecord: { sourceType: 'USDA' },
          },
          select: {
            id: true,
            confidence: true,
            score: true,
            normalizedNutrition: true,
            sourceRecord: {
              select: {
                sourceType: true,
                sourceKey: true,
                sourceTitle: true,
                sourceDetail: true,
                foodName: true,
                foodNameEn: true,
                dataType: true,
                category: true,
              },
            },
          },
          orderBy: [{ score: 'desc' }, { confidence: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });
    const rows = buildUsdaCandidateConfirmationPlanRows(
      ingredients.map((ingredient) => ({
        ingredient: {
          id: ingredient.id,
          name: ingredient.name,
        },
        candidates: ingredient.nutritionCandidates,
      })),
    );

    await writePlanReport(outputPath, rows);

    const wouldWriteCount = rows.filter((row) => row.wouldWrite === 'YES').length;
    const blockedCount = rows.filter(
      (row) => row.plannedAction === 'BLOCK_CONTRACT',
    ).length;
    const reviewCount = rows.filter(
      (row) => row.plannedAction === 'SKIP_REVIEW',
    ).length;
    const noCandidateCount = rows.filter(
      (row) => row.plannedAction === 'SKIP_NO_CANDIDATE',
    ).length;

    console.log('USDA candidate confirmation dry-run');
    console.log(`扫描食材数: ${rows.length}`);
    console.log(`可写入: ${wouldWriteCount}`);
    console.log(`合同阻断: ${blockedCount}`);
    console.log(`需继续复核: ${reviewCount}`);
    console.log(`无 USDA 候选: ${noCandidateCount}`);
    console.log(`报告已写入: ${outputPath}`);
    console.log('Dry run only. No database rows were changed.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[USDA confirmation dry-run] Failed:', error);
    process.exitCode = 1;
  });
}
