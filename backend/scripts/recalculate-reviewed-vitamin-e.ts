import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import { Prisma, PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  recalculateReviewedVitaminE,
  type ReviewedVitaminERecalculationDecision,
  type ReviewedVitaminESourceRecordInput,
} from '../src/domain/nutrition-governance/reviewed-vitamin-e-recalculation';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const DEFAULT_OUTPUT_PATH = 'reports/reviewed-vitamin-e-recalculation.csv';
const APPLY = process.argv.includes('--apply');

interface SourceRecordRow extends ReviewedVitaminESourceRecordInput {
  id: string;
  sourceType: string;
  sourceKey: string;
  rawData: unknown;
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

function buildSourceRecordMatcher(sourceRecords: SourceRecordRow[]) {
  const bySourceKey = new Map<string, SourceRecordRow>();
  for (const sourceRecord of sourceRecords) {
    bySourceKey.set(sourceRecord.sourceKey, sourceRecord);
  }

  return (food: NutritionFoodRow): SourceRecordRow | null => {
    if (!food.externalId) {
      return null;
    }
    return bySourceKey.get(food.externalId) ?? null;
  };
}

async function loadFoods(prisma: PrismaClient): Promise<NutritionFoodRow[]> {
  return prisma.$queryRaw<NutritionFoodRow[]>`
    SELECT
      id,
      name,
      display_name_zh AS "displayNameZh",
      data_source AS "dataSource",
      external_id AS "externalId",
      status::text AS status,
      nutrition_data AS "nutritionData"
    FROM nutrition_food
    WHERE status::text = 'VERIFIED'
    ORDER BY display_name_zh ASC NULLS LAST, name ASC
  `;
}

async function loadSourceRecords(prisma: PrismaClient): Promise<SourceRecordRow[]> {
  return prisma.$queryRaw<SourceRecordRow[]>`
    SELECT
      id,
      source_type::text AS "sourceType",
      source_key AS "sourceKey",
      raw_data AS "rawData"
    FROM nutrition_source_record
    WHERE status::text = 'ACTIVE'
  `;
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

function toCsv(decisions: ReviewedVitaminERecalculationDecision[]): string {
  const header = [
    'nutritionFoodId',
    '显示名称',
    '来源',
    'externalId',
    '当前维生素E(IU)',
    '重算维生素E(IU)',
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

function summarize(decisions: ReviewedVitaminERecalculationDecision[]) {
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

async function syncPrimaryIngredientSnapshots(
  prisma: PrismaClient,
  decisions: ReviewedVitaminERecalculationDecision[],
): Promise<number> {
  let synced = 0;
  for (const decision of decisions) {
    if (decision.action !== 'UPDATE' || !decision.updatedNutritionData) {
      continue;
    }
    const mappings = await prisma.nutritionFoodMapping.findMany({
      where: {
        nutritionFoodId: decision.foodId,
        isPrimary: true,
      },
      select: { ingredientId: true },
    });
    for (const mapping of mappings) {
      await prisma.ingredient.update({
        where: { id: mapping.ingredientId },
        data: {
          nutritionProfile: toJsonInput(decision.updatedNutritionData),
        },
      });
      synced += 1;
    }
  }
  return synced;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const outputPath = getOutputPath(argv);
  const prisma = new PrismaClient();

  try {
    const [foods, sourceRecords] = await Promise.all([
      loadFoods(prisma),
      loadSourceRecords(prisma),
    ]);
    const findSourceRecord = buildSourceRecordMatcher(sourceRecords);
    const decisions = foods.map((food) =>
      recalculateReviewedVitaminE({
        ...food,
        sourceRecord: findSourceRecord(food),
      }),
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${toCsv(decisions)}\n`, 'utf8');

    const { summary, byReason } = summarize(decisions);
    console.log(APPLY ? 'Applying reviewed vitamin E recalculation...' : 'Dry run: reviewed vitamin E recalculation');
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
    const synced = await syncPrimaryIngredientSnapshots(prisma, decisions);
    console.log(`- applied nutrition_food updates: ${applied}`);
    console.log(`- synced primary ingredient snapshots: ${synced}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to recalculate reviewed vitamin E:', error);
    process.exit(1);
  });
}
