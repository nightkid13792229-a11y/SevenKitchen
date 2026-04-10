import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  buildFavoriteRepairPlan,
  type FavoriteFamilyVersion,
  type FavoriteRecord,
} from '../src/support/favorite-recipe-repair';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production pnpm repair:favorite-counts',
    );
  }

  const versions = await prisma.recipe.findMany({
    where: args.recipeId ? { recipeId: args.recipeId } : undefined,
    select: {
      id: true,
      recipeId: true,
      version: true,
      status: true,
      name: true,
      favoriteCount: true,
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
  });

  if (versions.length === 0) {
    console.log(args.recipeId ? `未找到食谱 ${args.recipeId}` : '没有可处理的食谱。');
    return;
  }

  const versionsByBusinessId = new Map<string, typeof versions>();
  for (const version of versions) {
    const existing = versionsByBusinessId.get(version.recipeId) ?? [];
    existing.push(version);
    versionsByBusinessId.set(version.recipeId, existing);
  }

  const summaries: RepairSummary[] = [];

  for (const [businessRecipeId, familyVersions] of versionsByBusinessId.entries()) {
    const versionIds = familyVersions.map((version) => version.id);
    const favorites = await prisma.favoriteRecipe.findMany({
      where: {
        recipeId: {
          in: versionIds,
        },
      },
      select: {
        id: true,
        userId: true,
        recipeId: true,
        createdAt: true,
      },
      orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    const plan = buildFavoriteRepairPlan(
      familyVersions.map(
        (version): FavoriteFamilyVersion => ({
          id: version.id,
          businessRecipeId: version.recipeId,
          version: version.version,
          status: version.status,
        }),
      ),
      favorites.map(
        (favorite): FavoriteRecord => ({
          id: favorite.id,
          userId: favorite.userId,
          recipeId: favorite.recipeId,
          createdAt: favorite.createdAt,
        }),
      ),
    );

    const countChanges = familyVersions
      .map((version) => ({
        recipeVersionId: version.id,
        from: version.favoriteCount,
        to: plan.expectedCounts[version.id] ?? 0,
      }))
      .filter((change) => change.from !== change.to);

    const hasChanges =
      plan.moveOperations.length > 0 ||
      plan.deleteFavoriteIds.length > 0 ||
      countChanges.length > 0;

    if (!hasChanges) {
      continue;
    }

    summaries.push({
      businessRecipeId,
      name: familyVersions[0].name,
      targetRecipeId: plan.targetRecipeId,
      moveOperations: plan.moveOperations,
      deleteFavoriteIds: plan.deleteFavoriteIds,
      countChanges,
    });

    if (!args.apply) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (plan.deleteFavoriteIds.length > 0) {
        await tx.favoriteRecipe.deleteMany({
          where: {
            id: {
              in: plan.deleteFavoriteIds,
            },
          },
        });
      }

      for (const move of plan.moveOperations) {
        await tx.favoriteRecipe.update({
          where: { id: move.favoriteId },
          data: {
            recipeId: move.toRecipeId,
          },
        });
      }

      await tx.recipe.updateMany({
        where: {
          id: {
            in: versionIds,
          },
        },
        data: {
          favoriteCount: 0,
        },
      });

      for (const [recipeVersionId, count] of Object.entries(plan.expectedCounts)) {
        if (count === 0) {
          continue;
        }
        await tx.recipe.update({
          where: { id: recipeVersionId },
          data: {
            favoriteCount: count,
          },
        });
      }
    });
  }

  printSummary(summaries, args.apply);
}

interface RepairArgs {
  apply: boolean;
  recipeId: string | null;
}

interface RepairSummary {
  businessRecipeId: string;
  name: string;
  targetRecipeId: string;
  moveOperations: Array<{ favoriteId: string; toRecipeId: string }>;
  deleteFavoriteIds: string[];
  countChanges: Array<{ recipeVersionId: string; from: number; to: number }>;
}

function parseArgs(argv: string[]): RepairArgs {
  let apply = false;
  let recipeId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg === '--recipe') {
      recipeId = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return {
    apply,
    recipeId,
  };
}

function printSummary(summaries: RepairSummary[], apply: boolean) {
  console.log(apply ? 'Favorite Count Repair (apply mode)' : 'Favorite Count Repair (dry-run)');
  console.log(`ENV_FILE=${process.env.ENV_FILE || '.env'}`);
  console.log(`命中食谱数: ${summaries.length}`);
  console.log('');

  if (summaries.length === 0) {
    console.log('没有发现需要修复的收藏数据。');
    return;
  }

  for (const summary of summaries) {
    console.log(
      `- ${summary.businessRecipeId} | ${summary.name} | target=${summary.targetRecipeId}`,
    );

    if (summary.moveOperations.length > 0) {
      console.log(`  move favorites: ${summary.moveOperations.length}`);
    }
    if (summary.deleteFavoriteIds.length > 0) {
      console.log(`  delete duplicates: ${summary.deleteFavoriteIds.length}`);
    }
    for (const change of summary.countChanges) {
      console.log(
        `  count ${change.recipeVersionId}: ${change.from} -> ${change.to}`,
      );
    }
  }
}

main()
  .catch((error) => {
    console.error('Favorite count repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
