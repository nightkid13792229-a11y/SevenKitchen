import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  type RecipeSeriesLifeStage,
} from '../src/domain/recipe/recipe-series';

const CREATED_BY = 'recipe-series-backfill';
const BACKFILL_RECIPE_STATUSES = ['PUBLIC', 'PRIVATE_CUSTOM', 'DRAFT'] as const;

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
  id?: string | null;
  recipeId: string;
  name: string;
  version: number;
  status?: string | null;
  seriesId?: string | null;
  seriesLifeStage?: string | null;
  energyDensityKcalPerKg?: number | null;
  productionLossRate?: number | null;
  batchLaborHours?: number | null;
  createdAt?: Date | string | null;
  coverImageUrl?: string | null;
  coverTitle?: string | null;
  description?: string | null;
  detailImages?: unknown;
  salesCount?: number | null;
  diyGenCount?: number | null;
  likeCount?: number | null;
  favoriteCount?: number | null;
  viewCount?: number | null;
  applicableLifeStages?: unknown;
  targetHealthTags?: unknown;
  nutritionDetailedData?: unknown;
  nutritionStandard?: string | null;
  productionSteps?: string | null;
  videoUrl?: string | null;
  designSource?: string | null;
  customOrderId?: string | null;
  isCustomRecipe?: boolean | null;
  items?: RecipeSeriesBackfillRecipeItem[];
  healthTagAssignments?: RecipeSeriesBackfillRecipeHealthTagAssignment[];
};

export type RecipeSeriesBackfillRecipeItem = {
  ingredientId: string;
  nutritionFoodId?: string | null;
  preparationMethod?: string | null;
  exampleWeight?: number | null;
  ratioPercent?: number | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
  supplementTargets?: unknown;
  sortOrder?: number | null;
  supplementAlternatives?: RecipeSeriesBackfillRecipeSupplementAlternative[];
};

export type RecipeSeriesBackfillRecipeSupplementAlternative = {
  alternativeIngredientId: string;
  sortOrder?: number | null;
  isActive?: boolean | null;
};

export type RecipeSeriesBackfillRecipeHealthTagAssignment = {
  healthTagId: string;
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

export type RecipeSeriesRecipeClone = {
  sourceRecipeId: string;
  sourceVersion: number;
  recipeId: string;
  version: number;
  seriesId: string;
  seriesLifeStage: RecipeSeriesLifeStage;
  sourceRecipe?: RecipeSeriesBackfillRecipe;
};

export type RecipeSeriesBackfillPlan = {
  seriesToCreate: RecipeSeriesToCreate[];
  recipeUpdates: RecipeSeriesRecipeUpdate[];
  recipeClones: RecipeSeriesRecipeClone[];
};

type RecipeSeriesBackfillPrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<RecipeSeriesBackfillRecipe[]>;
    update: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
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

function isBackfillRecipeStatus(status?: string | null): boolean {
  return (
    !status ||
    BACKFILL_RECIPE_STATUSES.includes(
      status as (typeof BACKFILL_RECIPE_STATUSES)[number],
    )
  );
}

function isBackfillRecipe(recipe: RecipeSeriesBackfillRecipe): boolean {
  return isBackfillRecipeStatus(recipe.status);
}

function isRecipeSeriesLifeStage(
  value?: string | null,
): value is RecipeSeriesLifeStage {
  return ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(
    value as RecipeSeriesLifeStage,
  );
}

function dedupeSeriesLifeStages(
  stages: RecipeSeriesLifeStage[],
): RecipeSeriesLifeStage[] {
  const stageSet = new Set(stages);
  return ORDERED_RECIPE_SERIES_LIFE_STAGES.filter((stage) =>
    stageSet.has(stage),
  );
}

export function inferSeriesLifeStagesFromRecipe(
  recipe: Pick<
    RecipeSeriesBackfillRecipe,
    'applicableLifeStages' | 'nutritionDetailedData' | 'seriesLifeStage'
  >,
): RecipeSeriesLifeStage[] {
  const explicitSeriesLifeStage =
    typeof recipe.seriesLifeStage === 'string'
      ? recipe.seriesLifeStage.trim().toUpperCase()
      : '';

  const normalizedStages = normalizeStringArray(
    recipe.applicableLifeStages,
  ).map((stage) => stage.toUpperCase());
  const stages = new Set(normalizedStages);
  const currentSeriesStages = ORDERED_RECIPE_SERIES_LIFE_STAGES.filter(
    (stage) => stages.has(stage),
  );
  const legacySeriesStages = normalizedStages
    .map((stage) => LEGACY_LIFE_STAGE_TO_SERIES_LIFE_STAGE[stage])
    .filter((stage): stage is RecipeSeriesLifeStage => Boolean(stage));
  const inferredStages = dedupeSeriesLifeStages([
    ...currentSeriesStages,
    ...legacySeriesStages,
  ]);

  if (isRecipeSeriesLifeStage(explicitSeriesLifeStage)) {
    return [
      explicitSeriesLifeStage,
      ...inferredStages.filter((stage) => stage !== explicitSeriesLifeStage),
    ];
  }

  return inferredStages.length > 0 ? inferredStages : ['HIGH_ACTIVITY_ADULT'];
}

export function inferSeriesLifeStageFromRecipe(
  recipe: Pick<
    RecipeSeriesBackfillRecipe,
    'applicableLifeStages' | 'nutritionDetailedData' | 'seriesLifeStage'
  >,
): RecipeSeriesLifeStage {
  return inferSeriesLifeStagesFromRecipe(recipe)[0];
}

export function buildRecipeSeriesBackfillPlan(
  recipes: RecipeSeriesBackfillRecipe[],
): RecipeSeriesBackfillPlan {
  const seriesByGroupKey = new Map<string, RecipeSeriesToCreate>();
  const existingSeriesIdByGroupKey = new Map<string, string>();
  const recipesByGroupKey = new Map<string, RecipeSeriesBackfillRecipe[]>();
  const cloneRecipeIdByStageKey = new Map<string, string>();
  const plannedCloneVersionStageKeys = new Set<string>();
  const recipeUpdates: RecipeSeriesRecipeUpdate[] = [];
  const recipeClones: RecipeSeriesRecipeClone[] = [];
  const backfillRecipes = recipes
    .filter(isBackfillRecipe)
    .sort((left, right) => compareRecipeMutationIdentity(left, right));

  for (const recipe of backfillRecipes) {
    const groupKey = getRecipeSeriesGroupKey(recipe);
    recipesByGroupKey.set(groupKey, [
      ...(recipesByGroupKey.get(groupKey) ?? []),
      recipe,
    ]);

    if (recipe.seriesId && !existingSeriesIdByGroupKey.has(groupKey)) {
      existingSeriesIdByGroupKey.set(groupKey, recipe.seriesId);
    }
  }

  for (const recipe of backfillRecipes) {
    const groupKey = getRecipeSeriesGroupKey(recipe);
    const seriesId = resolveRecipeSeriesIdForBackfill({
      recipe,
      groupKey,
      existingSeriesIdByGroupKey,
      seriesByGroupKey,
    });
    const stages = inferSeriesLifeStagesFromRecipe(recipe);
    const canonicalStage = stages[0];

    if (
      recipe.seriesId !== seriesId ||
      recipe.seriesLifeStage !== canonicalStage
    ) {
      recipeUpdates.push({
        recipeId: recipe.recipeId,
        version: recipe.version,
        seriesId,
        seriesLifeStage: canonicalStage,
      });
    }

    if (stages.length <= 1) {
      continue;
    }

    for (const stage of stages.slice(1)) {
      const cloneVersionStageKey = `${groupKey}|${recipe.version}|${stage}`;
      if (
        plannedCloneVersionStageKeys.has(cloneVersionStageKey) ||
        hasExplicitRecipeForStageVersion(
          recipesByGroupKey.get(groupKey) ?? [],
          recipe.version,
          stage,
        )
      ) {
        continue;
      }

      plannedCloneVersionStageKeys.add(cloneVersionStageKey);
      const cloneStageKey = `${groupKey}|${recipe.recipeId}|${stage}`;
      let cloneRecipeId = cloneRecipeIdByStageKey.get(cloneStageKey);
      if (!cloneRecipeId) {
        cloneRecipeId = randomUUID();
        cloneRecipeIdByStageKey.set(cloneStageKey, cloneRecipeId);
      }

      recipeClones.push({
        sourceRecipeId: recipe.recipeId,
        sourceVersion: recipe.version,
        recipeId: cloneRecipeId,
        version: recipe.version,
        seriesId,
        seriesLifeStage: stage,
        sourceRecipe: recipe,
      });
    }
  }

  return {
    seriesToCreate: Array.from(seriesByGroupKey.values()),
    recipeUpdates: recipeUpdates.sort(compareRecipeMutationIdentity),
    recipeClones: recipeClones.sort(compareRecipeMutationIdentity),
  };
}

function resolveRecipeSeriesIdForBackfill({
  recipe,
  groupKey,
  existingSeriesIdByGroupKey,
  seriesByGroupKey,
}: {
  recipe: RecipeSeriesBackfillRecipe;
  groupKey: string;
  existingSeriesIdByGroupKey: Map<string, string>;
  seriesByGroupKey: Map<string, RecipeSeriesToCreate>;
}): string {
  if (recipe.seriesId) {
    return recipe.seriesId;
  }

  const existingSeriesId = existingSeriesIdByGroupKey.get(groupKey);
  if (existingSeriesId) {
    return existingSeriesId;
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

  return series.id;
}

function hasExplicitRecipeForStageVersion(
  recipes: RecipeSeriesBackfillRecipe[],
  version: number,
  stage: RecipeSeriesLifeStage,
): boolean {
  return recipes.some((recipe) => {
    const candidateStage =
      typeof recipe.seriesLifeStage === 'string'
        ? recipe.seriesLifeStage.trim().toUpperCase()
        : '';
    return (
      recipe.version === version &&
      isRecipeSeriesLifeStage(candidateStage) &&
      candidateStage === stage
    );
  });
}

function compareRecipeMutationIdentity(
  left: Pick<
    | RecipeSeriesBackfillRecipe
    | RecipeSeriesRecipeUpdate
    | RecipeSeriesRecipeClone,
    'recipeId' | 'version'
  > & { seriesLifeStage?: string | null },
  right: Pick<
    | RecipeSeriesBackfillRecipe
    | RecipeSeriesRecipeUpdate
    | RecipeSeriesRecipeClone,
    'recipeId' | 'version'
  > & { seriesLifeStage?: string | null },
): number {
  const byRecipeId = left.recipeId.localeCompare(right.recipeId);
  if (byRecipeId !== 0) return byRecipeId;

  const byVersion = left.version - right.version;
  if (byVersion !== 0) return byVersion;

  return String(left.seriesLifeStage ?? '').localeCompare(
    String(right.seriesLifeStage ?? ''),
  );
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
          OR: [{ seriesId: null }, { seriesLifeStage: null }],
        },
        data: {
          seriesId: update.seriesId,
          seriesLifeStage: update.seriesLifeStage,
        },
      });
    }

    for (const clone of plan.recipeClones) {
      await tx.recipe.create({
        data: buildRecipeCloneCreateData(clone),
      });
    }
  });
}

function buildRecipeCloneCreateData(clone: RecipeSeriesRecipeClone) {
  const source = clone.sourceRecipe;
  if (!source) {
    throw new Error(
      `Missing source recipe for ${clone.sourceRecipeId} v${clone.sourceVersion}`,
    );
  }

  return {
    recipeId: clone.recipeId,
    version: clone.version,
    name: source.name,
    status: source.status || 'DRAFT',
    energyDensityKcalPerKg: source.energyDensityKcalPerKg ?? 0,
    productionLossRate: source.productionLossRate ?? 1.07,
    batchLaborHours: source.batchLaborHours ?? 2,
    ...(source.createdAt ? { createdAt: new Date(source.createdAt) } : {}),
    applicableLifeStages: [clone.seriesLifeStage],
    coverImageUrl: source.coverImageUrl,
    coverTitle: source.coverTitle,
    description: source.description,
    detailImages: source.detailImages ?? [],
    salesCount: 0,
    diyGenCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    viewCount: 0,
    nutritionDetailedData: source.nutritionDetailedData ?? undefined,
    nutritionStandard: source.nutritionStandard || 'FEDIAF_2025',
    productionSteps: source.productionSteps,
    targetHealthTags: source.targetHealthTags ?? [],
    videoUrl: source.videoUrl,
    designSource: source.designSource,
    customOrderId: source.customOrderId,
    isCustomRecipe: source.isCustomRecipe ?? false,
    seriesId: clone.seriesId,
    seriesLifeStage: clone.seriesLifeStage,
    ...(source.items?.length
      ? {
          items: {
            create: source.items.map((item, index) =>
              buildRecipeItemCloneCreateData(item, index),
            ),
          },
        }
      : {}),
    ...(source.healthTagAssignments?.length
      ? {
          healthTagAssignments: {
            create: [
              ...new Set(
                source.healthTagAssignments
                  .map((assignment) => assignment.healthTagId?.trim())
                  .filter(Boolean),
              ),
            ].map((healthTagId) => ({ healthTagId })),
          },
        }
      : {}),
  };
}

function buildRecipeItemCloneCreateData(
  item: RecipeSeriesBackfillRecipeItem,
  index: number,
) {
  const supplementAlternatives =
    item.supplementAlternatives
      ?.filter((alternative) => alternative.isActive !== false)
      .map((alternative, alternativeIndex) => ({
        alternativeIngredientId: alternative.alternativeIngredientId,
        sortOrder: alternative.sortOrder ?? alternativeIndex,
        isActive: alternative.isActive ?? true,
      })) ?? [];

  return {
    ingredientId: item.ingredientId,
    nutritionFoodId: item.nutritionFoodId || undefined,
    preparationMethod: item.preparationMethod,
    exampleWeight: item.exampleWeight,
    ratioPercent: item.ratioPercent,
    nutrientTargetKey: item.nutrientTargetKey,
    nutrientTargetValue: item.nutrientTargetValue,
    supplementTargets: item.supplementTargets ?? undefined,
    sortOrder: item.sortOrder ?? index,
    ...(supplementAlternatives.length
      ? {
          supplementAlternatives: {
            create: supplementAlternatives,
          },
        }
      : {}),
  };
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
    const recipes = await prisma.recipe.findMany({
      where: {
        status: { in: [...BACKFILL_RECIPE_STATUSES] },
      },
      select: {
        id: true,
        recipeId: true,
        name: true,
        version: true,
        status: true,
        seriesId: true,
        seriesLifeStage: true,
        energyDensityKcalPerKg: true,
        productionLossRate: true,
        batchLaborHours: true,
        createdAt: true,
        coverImageUrl: true,
        coverTitle: true,
        description: true,
        detailImages: true,
        salesCount: true,
        diyGenCount: true,
        likeCount: true,
        favoriteCount: true,
        viewCount: true,
        applicableLifeStages: true,
        targetHealthTags: true,
        nutritionDetailedData: true,
        nutritionStandard: true,
        productionSteps: true,
        videoUrl: true,
        designSource: true,
        customOrderId: true,
        isCustomRecipe: true,
        items: {
          select: {
            ingredientId: true,
            nutritionFoodId: true,
            preparationMethod: true,
            exampleWeight: true,
            ratioPercent: true,
            nutrientTargetKey: true,
            nutrientTargetValue: true,
            supplementTargets: true,
            sortOrder: true,
            supplementAlternatives: {
              select: {
                alternativeIngredientId: true,
                sortOrder: true,
                isActive: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        healthTagAssignments: {
          select: {
            healthTagId: true,
          },
        },
      },
      orderBy: [{ recipeId: 'asc' }, { version: 'asc' }],
    });

    const plan = buildRecipeSeriesBackfillPlan(recipes);
    logger.info(
      JSON.stringify(
        {
          apply,
          seriesToCreate: plan.seriesToCreate.length,
          recipeUpdates: plan.recipeUpdates.length,
          recipeClones: plan.recipeClones.length,
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
