import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import { NutritionFoodStatus, Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  recalculateReviewedVitaminA,
  type ReviewedVitaminARecalculationDecision,
  type ReviewedVitaminASourceRecordInput,
} from '../src/domain/nutrition-governance/reviewed-vitamin-a-recalculation';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const DEFAULT_OUTPUT_PATH = 'reports/reviewed-vitamin-a-recalculation.csv';
const APPLY = process.argv.includes('--apply');

interface SourceRecordRow extends ReviewedVitaminASourceRecordInput {
  id: string;
  sourceType: string;
  sourceKey: string;
  sourceDetail: unknown;
  rawData: unknown;
  normalizedNutrition: unknown;
}

interface NutritionFoodRow {
  id: string;
  name: string;
  displayNameZh: string | null;
  dataSource: string;
  externalId: string | null;
  status: string;
  nutritionData: unknown;
}

function getOutputPath(argv: string[]): string {
  const outputArg = argv.find((arg) => arg.startsWith('--output='));
  return resolve(outputArg?.slice('--output='.length) || DEFAULT_OUTPUT_PATH);
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sourceDetailFoodCode(sourceRecord: SourceRecordRow): string | null {
  const value = isRecord(sourceRecord.sourceDetail)
    ? sourceRecord.sourceDetail.foodCode
    : null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildSourceRecordMatcher(sourceRecords: SourceRecordRow[]) {
  const bySourceKey = new Map<string, SourceRecordRow>();
  const cfctByFoodCode = new Map<string, SourceRecordRow>();

  for (const sourceRecord of sourceRecords) {
    bySourceKey.set(sourceRecord.sourceKey, sourceRecord);
    if (sourceRecord.sourceType === 'CFCT') {
      const foodCode = sourceDetailFoodCode(sourceRecord);
      if (foodCode) {
        cfctByFoodCode.set(foodCode, sourceRecord);
      }
    }
  }

  return (food: NutritionFoodRow): SourceRecordRow | null => {
    if (food.externalId) {
      const exact = bySourceKey.get(food.externalId);
      if (exact) {
        return exact;
      }
    }

    if (food.dataSource === 'CFCT' && food.externalId?.startsWith('CFCT:')) {
      const foodCode = food.externalId.slice('CFCT:'.length);
      return (
        cfctByFoodCode.get(foodCode) ??
        sourceRecords.find(
          (sourceRecord) =>
            sourceRecord.sourceType === 'CFCT' &&
            sourceRecord.sourceKey.startsWith(`${food.externalId}:`),
        ) ??
        null
      );
    }

    return null;
  };
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'number'
        ? Number.isInteger(value)
          ? `${value}`
          : `${Math.round(value * 1_000_000) / 1_000_000}`
        : `${value}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(decisions: ReviewedVitaminARecalculationDecision[]): string {
  const header = [
    'nutritionFoodId',
    '显示名称',
    '来源',
    'externalId',
    '当前维生素A(IU)',
    '重算维生素A(IU)',
    '差值(IU)',
    '差异%',
    '动作',
    '结论',
    '证据说明',
    'sourceRecordId',
  ];
  const rows = decisions.map((decision) => [
    decision.foodId,
    decision.displayName,
    decision.dataSource,
    decision.externalId,
    decision.currentValueIu,
    decision.recalculatedValueIu,
    decision.deltaIu,
    decision.deltaPercent,
    decision.action,
    decision.reasonZh,
    decision.evidence,
    decision.sourceRecordId,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function summarize(decisions: ReviewedVitaminARecalculationDecision[]) {
  const summary = {
    scanned: decisions.length,
    updates: decisions.filter((decision) => decision.action === 'UPDATE').length,
    noChange: decisions.filter((decision) => decision.action === 'NO_CHANGE').length,
    skipped: decisions.filter((decision) => decision.action === 'SKIP').length,
    valueChanges: decisions.filter(
      (decision) =>
        decision.action === 'UPDATE' &&
        decision.currentValueIu !== decision.recalculatedValueIu,
    ).length,
  };
  const byReason = new Map<string, number>();
  for (const decision of decisions) {
    byReason.set(
      decision.reasonCode,
      (byReason.get(decision.reasonCode) ?? 0) + 1,
    );
  }
  return { summary, byReason };
}

async function loadSourceRecords(prisma: PrismaClient): Promise<SourceRecordRow[]> {
  return prisma.$queryRaw<SourceRecordRow[]>`
    SELECT
      id,
      source_type::text AS "sourceType",
      source_key AS "sourceKey",
      source_detail AS "sourceDetail",
      raw_data AS "rawData",
      normalized_nutrition AS "normalizedNutrition"
    FROM nutrition_source_record
    WHERE status::text = 'ACTIVE'
  `;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const outputPath = getOutputPath(argv);
  const prisma = new PrismaClient();

  try {
    const [foods, sourceRecords] = await Promise.all([
      prisma.nutritionFood.findMany({
        where: { status: NutritionFoodStatus.VERIFIED },
        select: {
          id: true,
          name: true,
          displayNameZh: true,
          dataSource: true,
          externalId: true,
          status: true,
          nutritionData: true,
        },
        orderBy: [{ displayNameZh: 'asc' }, { name: 'asc' }],
      }),
      loadSourceRecords(prisma),
    ]);
    const findSourceRecord = buildSourceRecordMatcher(sourceRecords);
    const decisions = foods.map((food) =>
      recalculateReviewedVitaminA({
        ...food,
        status: food.status,
        sourceRecord: findSourceRecord(food),
      }),
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${toCsv(decisions)}\n`, 'utf8');

    const { summary, byReason } = summarize(decisions);
    console.log(APPLY ? 'Applying reviewed vitamin A recalculation...' : 'Dry run: reviewed vitamin A recalculation');
    console.log(`- scanned VERIFIED profiles: ${summary.scanned}`);
    console.log(`- updates: ${summary.updates}`);
    console.log(`- value changes: ${summary.valueChanges}`);
    console.log(`- no change: ${summary.noChange}`);
    console.log(`- skipped: ${summary.skipped}`);
    console.log('- by reason:');
    for (const [reason, count] of [...byReason.entries()].sort()) {
      console.log(`  - ${reason}: ${count}`);
    }
    console.log(`- report: ${outputPath}`);

    if (!APPLY) {
      console.log('Dry run complete. Re-run with --apply to persist safe updates.');
      return;
    }

    let applied = 0;
    for (const decision of decisions) {
      if (decision.action !== 'UPDATE' || !decision.updatedNutritionData) {
        continue;
      }
      await prisma.nutritionFood.update({
        where: { id: decision.foodId },
        data: {
          nutritionData: toJsonInput(decision.updatedNutritionData),
        },
      });
      applied += 1;
    }
    console.log(`- applied nutrition_food updates: ${applied}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to recalculate reviewed vitamin A:', error);
    process.exit(1);
  });
}
