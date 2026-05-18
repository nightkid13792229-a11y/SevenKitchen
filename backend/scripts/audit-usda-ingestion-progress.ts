import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionGovernanceSourceType,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  buildUsdaIngestionProgressRows,
  usdaIngestionProgressRowsToCsv,
  usdaIngestionProgressRowsToMarkdown,
} from '../src/domain/nutrition-governance/usda-ingestion-progress-audit';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/sevenkitchen';

async function main() {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || DEFAULT_LOCAL_DATABASE_URL;

  const { csvPath, markdownPath } = resolveOutputPaths(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const ingredients = await prisma.ingredient.findMany({
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
            id: true,
            status: true,
            confidence: true,
            score: true,
            agentReviewStatus: true,
            sourceRecord: {
              select: {
                sourceType: true,
                sourceKey: true,
                foodName: true,
              },
            },
          },
          orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const rows = buildUsdaIngestionProgressRows(ingredients);
    await writeReport(csvPath, usdaIngestionProgressRowsToCsv(rows));
    await writeReport(markdownPath, usdaIngestionProgressRowsToMarkdown(rows));

    const stageCounts = rows.reduce<Record<string, number>>((counts, row) => {
      counts[row.stage] = (counts[row.stage] ?? 0) + 1;
      return counts;
    }, {});

    console.log('USDA ingestion progress audit');
    console.log(`扫描食材数: ${rows.length}`);
    console.log(
      `已有 USDA 主档案: ${stageCounts.CONFIRMED_USDA_PRIMARY ?? 0}`,
    );
    console.log(
      `待人工审核 USDA 候选: ${stageCounts.REVIEW_USDA_CANDIDATES ?? 0}`,
    );
    console.log(
      `需要重新查找/导入 USDA 候选: ${stageCounts.FIND_USDA_CANDIDATE ?? 0}`,
    );
    console.log(
      `需要修复已入库档案: ${stageCounts.FIX_CONFIRMED_PROFILE ?? 0}`,
    );
    console.log(
      `已转向 CFCT/手工/其他来源: ${stageCounts.USE_CFCT_OR_MANUAL ?? 0}`,
    );
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
        process.env.USDA_INGESTION_PROGRESS_CSV ||
        `../docs/reports/${reportDate}-usda-nutrition-ingestion-progress.csv`,
    ),
    markdownPath: resolve(
      process.cwd(),
      argValue(args, '--md') ||
        process.env.USDA_INGESTION_PROGRESS_MARKDOWN ||
        `../docs/reports/${reportDate}-usda-nutrition-ingestion-progress.md`,
    ),
  };
}

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[audit] Failed to audit USDA ingestion progress:', error);
    process.exitCode = 1;
  });
}
