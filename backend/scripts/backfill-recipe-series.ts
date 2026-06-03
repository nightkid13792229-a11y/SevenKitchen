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

const LIFE_STAGE_NAME_PATTERNS = [
  'LOW_ACTIVITY_ADULT_OR_SENIOR',
  'PUPPY_UNDER_14_WEEKS',
  'PUPPY_14_WEEKS_PLUS',
  'HIGH_ACTIVITY_ADULT',
  'REPRODUCTION',
  'PREGNANCY',
  'LACTATION',
  'SENIOR',
  'PUPPY',
  'ADULT',
  '小于\\s*14\\s*周幼犬',
  '(?:大于等于|大于等於|>=|≥)\\s*14\\s*周幼犬',
  '14\\s*周(?:以上|及以上|\\+)幼犬',
  '普通或高运动量成犬',
  '低(?:运动量|能量)?成犬(?:或|/|／)老年犬',
  '低能量成年犬\\s*(?:/|／)\\s*老年犬',
  '低运动量成犬',
  '普通成年犬',
  '高运动量成犬',
  '低能量成年犬',
  '普通成犬',
  '繁殖期',
  '妊娠期',
  '哺乳期',
  '老年犬',
  '幼犬',
  '成犬',
];
const LIFE_STAGE_NAME_PATTERN_SOURCE = LIFE_STAGE_NAME_PATTERNS.join('|');
const BRACKETED_LIFE_STAGE_NAME_PATTERN = new RegExp(
  `\\s*[（(\\[【]\\s*(?:${LIFE_STAGE_NAME_PATTERN_SOURCE})\\s*[）)\\]】]\\s*`,
  'giu',
);
const TRAILING_LIFE_STAGE_NAME_PATTERN = new RegExp(
  `(?:[\\s_—–|/／:：,，、·-]+)?(?:${LIFE_STAGE_NAME_PATTERN_SOURCE})\\s*$`,
  'iu',
);
const SERIES_NAME_SEPARATOR_PATTERN =
  /^[\s_—–|/／:：,，、·-]+|[\s_—–|/／:：,，、·-]+$/gu;

type RecipeSeriesBackfillLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type RecipeSeriesBackfillRecipe = {
  recipeId: string;
  name: string;
  version: number;
  status?: string | null;
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
  designRecipe: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    callback: (tx: RecipeSeriesBackfillPrisma) => Promise<T>,
  ) => Promise<T>;
  $disconnect?: () => Promise<void>;
};

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
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

function normalizeRecipeSeriesName(name: string): string {
  let normalized = name.trim();
  if (!normalized) return '';

  normalized = normalized.replace(BRACKETED_LIFE_STAGE_NAME_PATTERN, ' ');

  let previous: string;
  do {
    previous = normalized;
    normalized = normalized
      .replace(TRAILING_LIFE_STAGE_NAME_PATTERN, '')
      .replace(SERIES_NAME_SEPARATOR_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim();
  } while (normalized && normalized !== previous);

  return normalized;
}

function getRecipeSeriesGroupKey(recipe: RecipeSeriesBackfillRecipe): string {
  return (
    normalizeRecipeSeriesName(recipe.name) || recipe.recipeId
  ).toLowerCase();
}

function getRecipeSeriesDisplayName(
  recipe: RecipeSeriesBackfillRecipe,
): string {
  return (
    normalizeRecipeSeriesName(recipe.name) || recipe.name || recipe.recipeId
  );
}

function isPublicBackfillRecipe(recipe: RecipeSeriesBackfillRecipe): boolean {
  return !recipe.status || recipe.status === 'PUBLIC';
}

export function inferSeriesLifeStageFromRecipe(
  recipe: Pick<
    RecipeSeriesBackfillRecipe,
    'applicableLifeStages' | 'nutritionDetailedData'
  >,
): RecipeSeriesLifeStage {
  const normalizedStages = normalizeStringArray(
    recipe.applicableLifeStages,
  ).map((stage) => stage.toUpperCase());
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
  const seriesByGroupKey = new Map<string, RecipeSeriesToCreate>();
  const existingSeriesIdByGroupKey = new Map<string, string>();
  const recipeUpdates: RecipeSeriesRecipeUpdate[] = [];
  const publicRecipes = recipes.filter(isPublicBackfillRecipe);

  for (const recipe of publicRecipes) {
    const groupKey = getRecipeSeriesGroupKey(recipe);
    if (recipe.seriesId && !existingSeriesIdByGroupKey.has(groupKey)) {
      existingSeriesIdByGroupKey.set(groupKey, recipe.seriesId);
    }
  }

  for (const recipe of publicRecipes) {
    if (recipe.seriesId) continue;

    const groupKey = getRecipeSeriesGroupKey(recipe);
    const existingSeriesId = existingSeriesIdByGroupKey.get(groupKey);
    if (existingSeriesId) {
      recipeUpdates.push({
        recipeId: recipe.recipeId,
        version: recipe.version,
        seriesId: existingSeriesId,
        seriesLifeStage: inferSeriesLifeStageFromRecipe(recipe),
      });
      continue;
    }

    let series = seriesByGroupKey.get(groupKey);
    if (!series) {
      series = {
        id: randomUUID(),
        recipeId: recipe.recipeId,
        name: getRecipeSeriesDisplayName(recipe),
      };
      seriesByGroupKey.set(groupKey, series);
    }

    recipeUpdates.push({
      recipeId: recipe.recipeId,
      version: recipe.version,
      seriesId: series.id,
      seriesLifeStage: inferSeriesLifeStageFromRecipe(recipe),
    });
  }

  return {
    seriesToCreate: Array.from(seriesByGroupKey.values()),
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
      await tx.designRecipe.updateMany({
        where: {
          publishedRecipeId: update.recipeId,
          publishedRecipeVersion: update.version,
          seriesId: null,
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
      where: { status: 'PUBLIC', seriesId: null },
      select: { recipeId: true },
      orderBy: [{ recipeId: 'asc' }],
    });
    const recipeIds = Array.from(
      new Set(recipesMissingSeries.map((recipe) => recipe.recipeId)),
    );
    const recipes =
      recipeIds.length > 0
        ? await prisma.recipe.findMany({
            where: {
              status: 'PUBLIC',
              OR: [
                { recipeId: { in: recipeIds } },
                { seriesId: { not: null } },
              ],
            },
            select: {
              recipeId: true,
              name: true,
              version: true,
              status: true,
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
