import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionGovernanceSourceType,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  auditUsdaNutritionQualityRows,
  usdaQualityAuditRowsToCsv,
  usdaQualityAuditRowsToMarkdown,
} from '../src/domain/nutrition-governance/usda-quality-audit';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;

  const { csvPath, markdownPath } = resolveOutputPaths(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const [ingredients, sourceRecords] = await Promise.all([
      prisma.ingredient.findMany({
        where: { type: IngredientType.FOOD },
        select: {
          id: true,
          name: true,
          nutritionProfile: true,
          nutritionFoodMappings: {
            select: {
              isPrimary: true,
              nutritionFood: {
                select: {
                  name: true,
                  dataSource: true,
                  externalId: true,
                  status: true,
                  preparationStateLabel: true,
                  ediblePortionLabel: true,
                  processingLabel: true,
                  nutritionData: true,
                },
              },
            },
            orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
          },
          nutritionCandidates: {
            where: {
              sourceRecord: { sourceType: NutritionGovernanceSourceType.USDA },
            },
            select: {
              status: true,
              confidence: true,
              score: true,
              sourceRecord: {
                select: {
                  sourceType: true,
                  sourceKey: true,
                  foodName: true,
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.nutritionSourceRecord.findMany({
        where: {
          sourceType: NutritionGovernanceSourceType.USDA,
          status: 'ACTIVE',
        },
        select: {
          sourceKey: true,
          sourceTitle: true,
          foodName: true,
          normalizedNutrition: true,
        },
      }),
    ]);

    const rows = auditUsdaNutritionQualityRows(
      ingredients.map((ingredient) => ({
        ...ingredient,
        sourceRecords,
      })),
    );

    await writeReport(csvPath, usdaQualityAuditRowsToCsv(rows));
    await writeReport(markdownPath, usdaQualityAuditRowsToMarkdown(rows));

    const statusCounts = rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    }, {});

    console.log('USDA nutrition quality audit');
    console.log(`扫描食材数: ${rows.length}`);
    console.log(`通过: ${statusCounts.PASS ?? 0}`);
    console.log(`通过但有说明: ${statusCounts.PASS_WITH_NOTE ?? 0}`);
    console.log(`需要修复: ${statusCounts.NEEDS_FIX ?? 0}`);
    console.log(`需要人工决策: ${statusCounts.NEEDS_USER_DECISION ?? 0}`);
    console.log(`建议拒绝或重新匹配: ${statusCounts.REJECT_OR_REMATCH ?? 0}`);
    console.log(`CSV 明细: ${csvPath}`);
    console.log(`Markdown 摘要: ${markdownPath}`);
    console.log('Audit only. No database rows were changed.');
  } finally {
    await prisma.$disconnect();
  }
}

async function writeReport(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${content.trimEnd()}\n`, 'utf8');
}

function resolveOutputPaths(args: string[]): {
  csvPath: string;
  markdownPath: string;
} {
  const reportDate = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);
  return {
    csvPath: resolve(
      process.cwd(),
      argValue(args, '--csv') ||
        process.env.USDA_QUALITY_AUDIT_CSV ||
        `../docs/reports/${reportDate}-usda-nutrition-quality-audit.csv`,
    ),
    markdownPath: resolve(
      process.cwd(),
      argValue(args, '--md') ||
        process.env.USDA_QUALITY_AUDIT_MARKDOWN ||
        `../docs/reports/${reportDate}-usda-nutrition-quality-audit.md`,
    ),
  };
}

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audit] Failed to audit USDA nutrition quality:', error);
    process.exitCode = 1;
  });
}
