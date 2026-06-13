import { PrismaClient, RecipeStatus } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  buildFoodRatioAuditReports,
  type FoodRatioAuditRecipe,
  type FoodRatioAuditReport,
} from '../src/support/food-ratio-totals';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

type AuditArgs = {
  recipeId: string | null;
  includeOk: boolean;
  allStatuses: boolean;
  limit: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run audit:food-ratio-totals',
    );
  }

  const recipes = await loadRecipes(args);
  const allReports = buildFoodRatioAuditReports(recipes, { includeOk: true });
  const visibleReports = buildFoodRatioAuditReports(recipes, {
    includeOk: args.includeOk,
  }).slice(0, args.limit);

  printHeader(allReports, visibleReports, args);

  if (visibleReports.length === 0) {
    console.log('未发现 FOOD 占比合计异常的公开食谱。');
    return;
  }

  printReports(visibleReports);
}

function parseArgs(argv: string[]): AuditArgs {
  let recipeId: string | null = null;
  let includeOk = false;
  let allStatuses = false;
  let limit = 50;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--recipe') {
      recipeId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--include-ok') {
      includeOk = true;
      continue;
    }

    if (arg === '--all-statuses') {
      allStatuses = true;
      continue;
    }

    if (arg === '--limit') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = parsed;
      }
      index += 1;
    }
  }

  return {
    recipeId,
    includeOk,
    allStatuses,
    limit,
  };
}

async function loadRecipes(args: AuditArgs): Promise<FoodRatioAuditRecipe[]> {
  const recipes = await prisma.recipe.findMany({
    where: {
      ...(args.recipeId ? { recipeId: args.recipeId } : {}),
      ...(args.allStatuses ? {} : { status: RecipeStatus.PUBLIC }),
    },
    select: {
      id: true,
      recipeId: true,
      version: true,
      name: true,
      status: true,
      seriesLifeStage: true,
      items: {
        select: {
          id: true,
          ratioPercent: true,
          ingredient: {
            select: {
              name: true,
              type: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
  });

  return recipes.map((recipe) => ({
    ...recipe,
    status: String(recipe.status),
    items: recipe.items.map((item) => ({
      ...item,
      ingredient: {
        ...item.ingredient,
        type: String(item.ingredient.type),
      },
    })),
  }));
}

function printHeader(
  allReports: FoodRatioAuditReport[],
  visibleReports: FoodRatioAuditReport[],
  args: AuditArgs,
) {
  const flaggedCount = allReports.filter(
    (report) => !report.isNormalized,
  ).length;

  console.log('Food Ratio Totals Audit');
  console.log('Read-only Prisma audit for published recipe FOOD ratios.');
  console.log(`ENV_FILE=${process.env.ENV_FILE || '.env'}`);
  console.log(args.allStatuses ? '扫描状态: all' : '扫描状态: PUBLIC');
  if (args.recipeId) {
    console.log(`限定食谱: ${args.recipeId}`);
  }
  console.log(`扫描食谱版本数: ${allReports.length}`);
  console.log(`命中异常版本数: ${flaggedCount}`);
  console.log(`当前输出数量: ${visibleReports.length}`);
  console.log('');
}

function printReports(reports: FoodRatioAuditReport[]) {
  for (const report of reports) {
    const status = report.isNormalized ? 'OK' : 'WARN';
    const stage = report.seriesLifeStage ?? 'none';

    console.log(
      `- ${status} ${report.recipeId} v${report.version} | ${report.name} | stage=${stage} | FOOD=${formatPercent(report.foodRatioTotalPercent)} | delta=${formatDelta(report.deltaPercent)} | foodItems=${report.foodItemCount}`,
    );
  }
}

function formatPercent(value: number): string {
  return `${value.toFixed(6)}%`;
}

function formatDelta(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${value.toFixed(6)}pp`;
}

main()
  .catch((error) => {
    console.error('Food ratio totals audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
