import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  type RecipeSeriesLifeStage,
} from '../src/domain/recipe/recipe-series';

const CREATED_BY = 'recipe-series-backfill';
const LEGACY_LIFE_STAGE_TO_SERIES_LIFE_STAGE: Record<
  string,
  RecipeSeriesLifeStage
> = {
  PUPPY: 'PUPPY_14_WEEKS_PLUS',
  SENIOR: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
  PREGNANCY: 'REPRODUCTION',
  LACTATION: 'REPRODUCTION',
  ADULT: 'HIGH_ACTIVITY_ADULT',
};

type RecipeSeriesBackfillLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type RecipeSeriesBackfillRecipe = {
  recipeId: string;
  name: string;
  version: number;
  seriesId?: string | null;
  applicableLifeStages?: unknown;
  nutritionDetailedData?: unknown;
};

export type RecipeSeriesToCreate = {
  id: string;
  recipeId: string;
  name: string;
};

export type RecipeSeriesRecipeUpdate = {
  recipeId: string;
  version: number;
  seriesId: string;
  seriesLifeStage: RecipeSeriesLifeStage;
};

export type RecipeSeriesBackfillPlan = {
  seriesToCreate: RecipeSeriesToCreate[];
  recipeUpdates: RecipeSeriesRecipeUpdate[];
};

type RecipeSeriesBackfillPrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<RecipeSeriesBackfillRecipe[]>;
    update: (args: unknown) => Promise<unknown>;
  };
  recipeSeries: {
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    callback: (tx: RecipeSeriesBackfillPrisma) => Promise<T>,
  ) => Promise<T>;
  $disconnect?: () => Promise<void>;
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      return normalizeStringArray(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  return [];
}

export function inferSeriesLifeStageFromRecipe(
  recipe: Pick<
    RecipeSeriesBackfillRecipe,
    'applicableLifeStages' | 'nutritionDetailedData'
  >,
): RecipeSeriesLifeStage {
  const normalizedStages = normalizeStringArray(recipe.applicableLifeStages).map(
    (stage) => stage.toUpperCase(),
  );
  const stages = new Set(normalizedStages);
  const currentSeriesStage = ORDERED_RECIPE_SERIES_LIFE_STAGES.find((stage) =>
    stages.has(stage),
  );
  if (currentSeriesStage) return currentSeriesStage;

  for (const stage of normalizedStages) {
    const legacySeriesStage = LEGACY_LIFE_STAGE_TO_SERIES_LIFE_STAGE[stage];
    if (legacySeriesStage) return legacySeriesStage;
  }

  return 'HIGH_ACTIVITY_ADULT';
}

export function buildRecipeSeriesBackfillPlan(
  recipes: RecipeSeriesBackfillRecipe[],
): RecipeSeriesBackfillPlan {
  const seriesByRecipeId = new Map<string, RecipeSeriesToCreate>();
  const existingSeriesIdByRecipeId = new Map<string, string>();
  const recipeUpdates: RecipeSeriesRecipeUpdate[] = [];

  for (const recipe of recipes) {
    if (recipe.seriesId && !existingSeriesIdByRecipeId.has(recipe.recipeId)) {
      existingSeriesIdByRecipeId.set(recipe.recipeId, recipe.seriesId);
    }
  }

  for (const recipe of recipes) {
    if (recipe.seriesId) continue;

    const existingSeriesId = existingSeriesIdByRecipeId.get(recipe.recipeId);
    if (existingSeriesId) {
      recipeUpdates.push({
        recipeId: recipe.recipeId,
        version: recipe.version,
        seriesId: existingSeriesId,
        seriesLifeStage: inferSeriesLifeStageFromRecipe(recipe),
      });
      continue;
    }

    let series = seriesByRecipeId.get(recipe.recipeId);
    if (!series) {
      series = {
        id: randomUUID(),
        recipeId: recipe.recipeId,
        name: recipe.name,
      };
      seriesByRecipeId.set(recipe.recipeId, series);
    }

    recipeUpdates.push({
      recipeId: recipe.recipeId,
      version: recipe.version,
      seriesId: series.id,
      seriesLifeStage: inferSeriesLifeStageFromRecipe(recipe),
    });
  }

  return {
    seriesToCreate: Array.from(seriesByRecipeId.values()),
    recipeUpdates,
  };
}

async function applyRecipeSeriesBackfillPlan({
  prisma,
  plan,
}: {
  prisma: RecipeSeriesBackfillPrisma;
  plan: RecipeSeriesBackfillPlan;
}) {
  await prisma.$transaction(async (tx) => {
    for (const series of plan.seriesToCreate) {
      await tx.recipeSeries.create({
        data: {
          id: series.id,
          name: series.name,
          createdBy: CREATED_BY,
        },
      });
    }

    for (const update of plan.recipeUpdates) {
      await tx.recipe.update({
        where: {
          recipeId_version: {
            recipeId: update.recipeId,
            version: update.version,
          },
        },
        data: {
          seriesId: update.seriesId,
          seriesLifeStage: update.seriesLifeStage,
        },
      });
    }
  });
}

export async function runRecipeSeriesBackfill({
  prisma,
  apply,
  logger,
  disconnect = true,
}: {
  prisma: RecipeSeriesBackfillPrisma;
  apply: boolean;
  logger: RecipeSeriesBackfillLogger;
  disconnect?: boolean;
}): Promise<RecipeSeriesBackfillPlan> {
  try {
    const recipesMissingSeries = await prisma.recipe.findMany({
      where: { seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    const recipeIds = Array.from(
      new Set(recipesMissingSeries.map((recipe) => recipe.recipeId)),
    );
    const recipes =
      recipeIds.length > 0
        ? await prisma.recipe.findMany({
            where: { recipeId: { in: recipeIds } },
            select: {
              recipeId: true,
              name: true,
              version: true,
              seriesId: true,
              applicableLifeStages: true,
              nutritionDetailedData: true,
            },
            orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
          })
        : [];

    const plan = buildRecipeSeriesBackfillPlan(recipes);
    logger.info(
      JSON.stringify(
        {
          apply,
          seriesToCreate: plan.seriesToCreate.length,
          recipeUpdates: plan.recipeUpdates.length,
        },
        null,
        2,
      ),
    );

    if (apply) {
      await applyRecipeSeriesBackfillPlan({ prisma, plan });
    }

    return plan;
  } catch (error) {
    logger.error(
      error instanceof Error
        ? error.message
        : 'Unknown recipe series backfill failure',
    );
    throw error;
  } finally {
    if (disconnect) {
      await prisma.$disconnect?.();
    }
  }
}

function parseRecipeSeriesBackfillArgs(argv: string[]) {
  return {
    apply: argv.includes('--apply'),
  };
}

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未设置，无法执行食谱系列回填脚本');
  }

  const args = parseRecipeSeriesBackfillArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  await runRecipeSeriesBackfill({
    prisma: prisma as unknown as RecipeSeriesBackfillPrisma,
    apply: args.apply,
    logger: {
      info: (message) => console.log(message),
      error: (message) => console.error(message),
    },
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to backfill recipe series:', error);
    process.exit(1);
  });
}
