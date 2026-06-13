import { PrismaClient, RecipeStatus } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  buildFoodRatioRepairPlans,
  type FoodRatioAuditRecipe,
  type FoodRatioRepairPlan,
} from '../src/support/food-ratio-totals';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

type RepairArgs = {
  apply: boolean;
  recipeId: string | null;
  allStatuses: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run repair:food-ratio-totals',
    );
  }

  const recipes = await loadRecipes(args);
  const plans = buildFoodRatioRepairPlans(recipes).filter(
    (plan) => !plan.report.isNormalized,
  );
  const actionablePlans = plans.filter((plan) => plan.updates.length > 0);

  printSummary(plans, actionablePlans, args);

  if (!args.apply || actionablePlans.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const plan of actionablePlans) {
      for (const update of plan.updates) {
        await tx.recipeItem.update({
          where: { id: update.recipeItemId },
          data: { ratioPercent: update.toRatioPercent },
        });
      }
    }
  });

  console.log('');
  console.log(`已修复 recipe_item 记录数: ${countUpdates(actionablePlans)}`);
}

function parseArgs(argv: string[]): RepairArgs {
  let apply = false;
  let recipeId: string | null = null;
  let allStatuses = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg === '--recipe') {
      recipeId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--all-statuses') {
      allStatuses = true;
    }
  }

  return {
    apply,
    recipeId,
    allStatuses,
  };
}

async function loadRecipes(args: RepairArgs): Promise<FoodRatioAuditRecipe[]> {
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

function printSummary(
  plans: FoodRatioRepairPlan[],
  actionablePlans: FoodRatioRepairPlan[],
  args: RepairArgs,
) {
  console.log(
    args.apply
      ? 'Food Ratio Totals Repair (apply mode)'
      : 'Food Ratio Totals Repair (dry-run)',
  );
  console.log(`ENV_FILE=${process.env.ENV_FILE || '.env'}`);
  console.log(args.allStatuses ? '扫描状态: all' : '扫描状态: PUBLIC');
  if (args.recipeId) {
    console.log(`限定食谱: ${args.recipeId}`);
  }
  console.log(`异常食谱版本数: ${plans.length}`);
  console.log(`可修复版本数: ${actionablePlans.length}`);
  console.log(`预计更新 recipe_item 记录数: ${countUpdates(actionablePlans)}`);
  console.log('');

  if (plans.length === 0) {
    console.log('没有发现需要修复的 FOOD 占比。');
    return;
  }

  for (const plan of plans) {
    const report = plan.report;
    console.log(
      `- ${report.recipeId} v${report.version} | ${report.name} | FOOD=${report.foodRatioTotalPercent.toFixed(6)}% | delta=${report.deltaPercent.toFixed(6)}pp`,
    );

    if (plan.skippedReason) {
      console.log(`  skipped: ${plan.skippedReason}`);
      continue;
    }

    for (const update of plan.updates) {
      console.log(
        `  ${update.ingredientName ?? update.recipeItemId}: ${formatRatio(update.fromRatioPercent)} -> ${formatRatio(update.toRatioPercent)}`,
      );
    }
  }

  if (!args.apply && actionablePlans.length > 0) {
    console.log('');
    console.log('当前为 dry-run。确认无误后追加 --apply 执行落库。');
  }
}

function countUpdates(plans: FoodRatioRepairPlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.updates.length, 0);
}

function formatRatio(value: number | null): string {
  return value === null ? 'null' : `${value.toFixed(8)}%`;
}

main()
  .catch((error) => {
    console.error('Food ratio totals repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
