import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

const CREATED_BY = 'recipe-designer-backfill';
const SCRIPT_NAME = 'latest-recipe-designer-backfill';

type JsonRecord = Record<string, unknown>;

export type LatestRecipeDesignerBackfillArgs = {
  apply: boolean;
  recipeId: string | null;
  includeDraftStatus: boolean;
  privateCustomOnly: boolean;
};

export type LatestRecipeBackfillCounters = {
  scanned: number;
  eligible: number;
  applied: number;
  skipped: number;
  blocked: number;
  errors: number;
};

export type LatestRecipeItemRecord = {
  id: string;
  ingredientId: string;
  nutritionFoodId: string | null;
  ingredient?: {
    id: string;
    name: string;
    type: string;
    brand?: string | null;
    productModel?: string | null;
    unitDisplayLabel?: string | null;
    nutritionProfile?: unknown;
    nutritionFoodMappings?: Array<{
      nutritionFoodId: string;
      isPrimary: boolean;
    }>;
  } | null;
  preparationMethod: string | null;
  ratioPercent: number | null;
  nutrientTargetKey: string | null;
  nutrientTargetValue: number | null;
  supplementTargets: unknown;
  sortOrder: number;
  exampleWeight: number | null;
};

export type LatestRecipeRecord = {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  energyDensityKcalPerKg: number | null;
  applicableLifeStages: unknown;
  targetHealthTags: unknown;
  description: string | null;
  nutritionDetailedData: unknown;
  nutritionStandard: string | null;
  seriesId?: string | null;
  seriesLifeStage?: string | null;
  customerDogId?: string | null;
  updatedAt?: Date | string | null;
  items: LatestRecipeItemRecord[];
};

type ExistingDesignerBackfill = {
  id: string;
  publishedRecipeId: string | null;
  publishedRecipeVersion: number | null;
};

export type LatestRecipeDesignerBackfillPlan =
  | {
      action: 'create';
      recipe: LatestRecipeRecord;
      scenario: string;
      totalWeightG: number;
    }
  | {
      action: 'skip';
      recipe: LatestRecipeRecord;
      reason: string;
    }
  | {
      action: 'block';
      recipe: LatestRecipeRecord;
      issues: string[];
    };

type LatestRecipeDesignerBackfillPrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<LatestRecipeRecord[]>;
  };
  designRecipe: {
    findMany: (args: unknown) => Promise<ExistingDesignerBackfill[]>;
    aggregate: (args: unknown) => Promise<{ _max: { version: number | null } }>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  designRecipePublishSnapshot: {
    create: (args: unknown) => Promise<unknown>;
  };
  nutritionFood: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  nutritionFoodMapping: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(
    callback: (tx: LatestRecipeDesignerBackfillPrisma) => Promise<T>,
  ) => Promise<T>;
};

type BackfillLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

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
      const parsed = JSON.parse(trimmed);
      return normalizeStringArray(parsed);
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function isFinitePositiveNumber(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

function hasLegacyNutritionProfile(item: LatestRecipeItemRecord) {
  return isPlainObject(item.ingredient?.nutritionProfile);
}

function resolveExistingNutritionFoodId(item: LatestRecipeItemRecord) {
  if (item.nutritionFoodId) return item.nutritionFoodId;

  const mappings = item.ingredient?.nutritionFoodMappings ?? [];
  const primaryMapping = mappings.find((mapping) => mapping.isPrimary);
  return primaryMapping?.nutritionFoodId ?? mappings[0]?.nutritionFoodId ?? null;
}

function resolveBackfillWeightG(item: LatestRecipeItemRecord) {
  if (isFinitePositiveNumber(item.exampleWeight)) {
    return item.exampleWeight;
  }

  if (item.ingredient?.type === 'SUPPLEMENT') {
    return 0;
  }

  return null;
}

function shouldIncludeItemInAssessment(item: LatestRecipeItemRecord) {
  return isFinitePositiveNumber(item.exampleWeight);
}

function normalizeDesignPreparationMethod(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > 100 ? null : trimmed;
}

function inferFediafDogScenario(recipe: LatestRecipeRecord): string {
  const stages = normalizeStringArray(recipe.applicableLifeStages).map((stage) =>
    stage.toUpperCase(),
  );

  if (
    stages.some((stage) =>
      ['REPRODUCTION', 'PREGNANCY', 'LACTATION'].includes(stage),
    )
  ) {
    return 'REPRODUCTION';
  }

  if (
    stages.some((stage) =>
      ['PUPPY_UNDER_14_WEEKS', 'EARLY_GROWTH_REPRODUCTION'].includes(stage),
    )
  ) {
    return 'EARLY_GROWTH_REPRODUCTION';
  }

  if (stages.some((stage) => ['PUPPY_14_WEEKS_PLUS', 'PUPPY'].includes(stage))) {
    return 'LATE_GROWTH';
  }

  if (
    stages.some((stage) =>
      ['LOW_ACTIVITY_ADULT_OR_SENIOR', 'SENIOR', 'ADULT_MER_95'].includes(
        stage,
      ),
    )
  ) {
    return 'ADULT_MER_95';
  }

  return 'ADULT_MER_110';
}

function existingBackfillKey(recipeId: string, version: number) {
  return `${recipeId}#${version}`;
}

export function selectLatestRecipeVersions<T extends { recipeId: string; version: number }>(
  recipes: T[],
): T[] {
  const latestByRecipeId = new Map<string, T>();

  for (const recipe of recipes) {
    const existing = latestByRecipeId.get(recipe.recipeId);
    if (!existing || recipe.version > existing.version) {
      latestByRecipeId.set(recipe.recipeId, recipe);
    }
  }

  return Array.from(latestByRecipeId.values()).sort((left, right) =>
    left.recipeId.localeCompare(right.recipeId),
  );
}

export function buildLatestRecipeDesignerBackfillPlan(
  recipe: LatestRecipeRecord,
  existingBackfill: ExistingDesignerBackfill | null,
): LatestRecipeDesignerBackfillPlan {
  if (existingBackfill) {
    return {
      action: 'skip',
      recipe,
      reason: `already backfilled as ${existingBackfill.id}`,
    };
  }

  const issues: string[] = [];

  if (!isFinitePositiveNumber(recipe.energyDensityKcalPerKg)) {
    issues.push('缺少有效 energyDensityKcalPerKg');
  }

  if (!Array.isArray(recipe.items) || recipe.items.length === 0) {
    issues.push('缺少食谱明细');
  }

  for (const recipeItem of recipe.items ?? []) {
    if (!resolveExistingNutritionFoodId(recipeItem) && !hasLegacyNutritionProfile(recipeItem)) {
      issues.push(
        `item ${recipeItem.id} 缺少 nutritionFoodId 且原料没有可回填营养档案`,
      );
    }
    if (resolveBackfillWeightG(recipeItem) === null) {
      issues.push(`item ${recipeItem.id} 缺少有效 exampleWeight`);
    }
  }

  if (issues.length > 0) {
    return { action: 'block', recipe, issues };
  }

  return {
    action: 'create',
    recipe,
    scenario: inferFediafDogScenario(recipe),
    totalWeightG: recipe.items.reduce(
      (sum, recipeItem) => sum + Math.max(0, Number(recipeItem.exampleWeight || 0)),
      0,
    ),
  };
}

function buildCompatibilityNutritionFoodPayload(item: LatestRecipeItemRecord) {
  const ingredient = item.ingredient;
  if (!ingredient || !isPlainObject(ingredient.nutritionProfile)) {
    throw new Error(`item ${item.id} missing legacy ingredient nutrition profile`);
  }

  const now = new Date();
  const name = `Legacy ingredient profile ${ingredient.id}`;
  const preparationState = isPlainObject(ingredient.nutritionProfile.meta)
    ? String(ingredient.nutritionProfile.meta.sampleState || '').trim() || null
    : null;

  return {
    name,
    nameEn: null,
    displayNameZh: [ingredient.name, ingredient.brand, ingredient.productModel]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' · ')
      .slice(0, 200),
    displayNameZhSource: 'BACKFILL',
    displayNameZhReviewedAt: now,
    displayNameZhReviewedBy: CREATED_BY,
    category: ingredient.type === 'SUPPLEMENT' ? 'SUPPLEMENT' : 'OTHER',
    dataSource: 'LEGACY_INGREDIENT_PROFILE',
    externalId: `LEGACY_INGREDIENT_PROFILE:${ingredient.id}`,
    version: 1,
    status: 'VERIFIED',
    preparationState,
    preparationStateLabel: preparationState,
    ediblePortionLabel: ingredient.unitDisplayLabel
      ? `每${ingredient.unitDisplayLabel}`
      : null,
    processingLabel: '旧原料营养档案回填',
    nutritionData: jsonClone(ingredient.nutritionProfile),
    notes: '由生产旧 Ingredient.nutritionProfile 回填生成，用于食谱设计器来源稿迁移。',
    createdBy: CREATED_BY,
    verifiedBy: CREATED_BY,
    verifiedAt: now,
  };
}

async function resolveNutritionFoodIdForApply({
  tx,
  item,
}: {
  tx: LatestRecipeDesignerBackfillPrisma;
  item: LatestRecipeItemRecord;
}) {
  const existingNutritionFoodId = resolveExistingNutritionFoodId(item);
  if (existingNutritionFoodId) {
    return existingNutritionFoodId;
  }

  const payload = buildCompatibilityNutritionFoodPayload(item);
  const existingFood = await tx.nutritionFood.findUnique({
    where: {
      name_dataSource_version: {
        name: payload.name,
        dataSource: payload.dataSource,
        version: payload.version,
      },
    },
    select: { id: true },
  });
  const nutritionFoodId =
    existingFood?.id ??
    (
      await tx.nutritionFood.create({
        data: payload,
        select: { id: true },
      })
    ).id;

  const existingMapping = await tx.nutritionFoodMapping.findUnique({
    where: {
      nutritionFoodId_ingredientId: {
        nutritionFoodId,
        ingredientId: item.ingredientId,
      },
    },
    select: { id: true },
  });

  if (!existingMapping) {
    await tx.nutritionFoodMapping.create({
      data: {
        nutritionFoodId,
        ingredientId: item.ingredientId,
        yieldRate: 1,
        isPrimary: true,
        notes: '由生产旧食谱回填设计器来源稿时生成的主映射。',
      },
    });
  }

  return nutritionFoodId;
}

async function resolveRecipeForDesignCreate({
  tx,
  recipe,
}: {
  tx: LatestRecipeDesignerBackfillPrisma;
  recipe: LatestRecipeRecord;
}): Promise<LatestRecipeRecord> {
  const items: LatestRecipeItemRecord[] = [];

  for (const item of recipe.items) {
    const nutritionFoodId = await resolveNutritionFoodIdForApply({ tx, item });
    items.push({ ...item, nutritionFoodId });
  }

  return { ...recipe, items };
}

function buildDesignRecipeCreateData({
  plan,
  version,
}: {
  plan: Extract<LatestRecipeDesignerBackfillPlan, { action: 'create' }>;
  version: number;
}) {
  const { recipe } = plan;
  const publishedAt = recipe.updatedAt ? new Date(recipe.updatedAt) : new Date();
  const nutritionDetailedData = isPlainObject(recipe.nutritionDetailedData)
    ? recipe.nutritionDetailedData
    : {};

  return {
    name: recipe.name,
    version,
    status: 'PUBLISHED',
    fediafDogScenario: plan.scenario,
    energyDensityKcalPerKg: recipe.energyDensityKcalPerKg,
    totalWeightG: plan.totalWeightG,
    nutritionStandard: recipe.nutritionStandard || 'FEDIAF_2025',
    calculatedNutrition: jsonClone(nutritionDetailedData),
    complianceStatus: {},
    assessmentSummary: {
      source: SCRIPT_NAME,
      recipeId: recipe.recipeId,
      recipeVersion: recipe.version,
    },
    missingDataReport: [],
    complianceScore: 0,
    isCompliant: true,
    reviewStatus: 'NONE',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    targetHealthTags: normalizeStringArray(recipe.targetHealthTags),
    applicableLifeStages: normalizeStringArray(recipe.applicableLifeStages),
    notes: recipe.description,
    createdBy: CREATED_BY,
    publishedAt,
    publishedRecipeId: recipe.recipeId,
    publishedRecipeVersion: recipe.version,
    revisionOfDesignRecipeId: null,
    revisionBaseRecipeId: null,
    ...(recipe.seriesId ? { seriesId: recipe.seriesId } : {}),
    ...(recipe.seriesLifeStage ? { seriesLifeStage: recipe.seriesLifeStage } : {}),
    ...(recipe.customerDogId ? { customerDogId: recipe.customerDogId } : {}),
    items: {
      create: recipe.items.map((recipeItem) => ({
        ingredientId: recipeItem.ingredientId,
        nutritionFoodId: recipeItem.nutritionFoodId!,
        weightG: resolveBackfillWeightG(recipeItem)!,
        includeInAssessment: shouldIncludeItemInAssessment(recipeItem),
        ratioPercent: recipeItem.ratioPercent,
        preparationMethod: normalizeDesignPreparationMethod(
          recipeItem.preparationMethod,
        ),
        nutrientTargetKey: recipeItem.nutrientTargetKey,
        nutrientTargetValue: recipeItem.nutrientTargetValue,
        sortOrder: recipeItem.sortOrder,
      })),
    },
  };
}

async function loadExistingBackfills({
  prisma,
  recipes,
}: {
  prisma: LatestRecipeDesignerBackfillPrisma;
  recipes: LatestRecipeRecord[];
}) {
  if (recipes.length === 0) return new Map<string, ExistingDesignerBackfill>();

  const existingRecords = await prisma.designRecipe.findMany({
    where: {
      status: 'PUBLISHED',
      OR: recipes.map((recipe) => ({
        publishedRecipeId: recipe.recipeId,
        publishedRecipeVersion: recipe.version,
      })),
    },
    select: {
      id: true,
      publishedRecipeId: true,
      publishedRecipeVersion: true,
    },
  });

  return new Map(
    existingRecords
      .filter(
        (entry) => entry.publishedRecipeId && entry.publishedRecipeVersion,
      )
      .map((entry) => [
        existingBackfillKey(
          entry.publishedRecipeId!,
          entry.publishedRecipeVersion!,
        ),
        entry,
      ]),
  );
}

async function applyBackfillPlan({
  prisma,
  plan,
}: {
  prisma: LatestRecipeDesignerBackfillPrisma;
  plan: Extract<LatestRecipeDesignerBackfillPlan, { action: 'create' }>;
}) {
  const latestDesignVersion = await prisma.designRecipe.aggregate({
    where: { name: plan.recipe.name },
    _max: { version: true },
  });
  const nextDesignVersion = (latestDesignVersion._max.version ?? 0) + 1;
  const snapshotData = jsonClone({
    source: SCRIPT_NAME,
    recipe: plan.recipe,
    scenario: plan.scenario,
    totalWeightG: plan.totalWeightG,
  });

  await prisma.$transaction(async (tx) => {
    const resolvedRecipe = await resolveRecipeForDesignCreate({
      tx,
      recipe: plan.recipe,
    });
    const designRecipe = await tx.designRecipe.create({
      data: buildDesignRecipeCreateData({
        plan: { ...plan, recipe: resolvedRecipe },
        version: nextDesignVersion,
      }),
      select: { id: true },
    });

    await tx.designRecipePublishSnapshot.create({
      data: {
        designRecipeId: designRecipe.id,
        recipeId: plan.recipe.recipeId,
        recipeVersion: plan.recipe.version,
        snapshotData,
        reviewStatus: 'NONE',
        reviewNote: '由生产最新版正式食谱回填生成设计器来源稿',
        publishedBy: CREATED_BY,
        publishedAt: plan.recipe.updatedAt
          ? new Date(plan.recipe.updatedAt)
          : new Date(),
      },
    });
  });
}

export async function runLatestRecipeDesignerBackfill({
  prisma,
  apply,
  logger,
  recipeId,
  includeDraftStatus = false,
  privateCustomOnly = false,
}: {
  prisma: LatestRecipeDesignerBackfillPrisma;
  apply: boolean;
  logger: BackfillLogger;
  recipeId?: string | null;
  includeDraftStatus?: boolean;
  privateCustomOnly?: boolean;
}): Promise<LatestRecipeBackfillCounters> {
  logger.info(
    apply
      ? 'Applying latest recipe designer backfill...'
      : 'Dry run: latest recipe designer backfill...',
  );

  const statuses = privateCustomOnly
    ? ['PRIVATE_CUSTOM']
    : includeDraftStatus
      ? ['PUBLIC', 'DRAFT']
      : ['PUBLIC'];
  const recipes = await prisma.recipe.findMany({
    where: {
      status: { in: statuses },
      ...(privateCustomOnly ? {} : { isCustomRecipe: false }),
      ...(recipeId ? { recipeId } : {}),
    },
    include: {
      items: {
        orderBy: [{ sortOrder: 'asc' }],
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              type: true,
              brand: true,
              productModel: true,
              unitDisplayLabel: true,
              nutritionProfile: true,
              nutritionFoodMappings: {
                select: {
                  nutritionFoodId: true,
                  isPrimary: true,
                },
                orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              },
            },
          },
        },
      },
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
  });
  const latestRecipes = selectLatestRecipeVersions(recipes);
  const existingBackfills = await loadExistingBackfills({
    prisma,
    recipes: latestRecipes,
  });

  const counters: LatestRecipeBackfillCounters = {
    scanned: latestRecipes.length,
    eligible: 0,
    applied: 0,
    skipped: 0,
    blocked: 0,
    errors: 0,
  };

  for (const latestRecipe of latestRecipes) {
    const plan = buildLatestRecipeDesignerBackfillPlan(
      latestRecipe,
      existingBackfills.get(
        existingBackfillKey(latestRecipe.recipeId, latestRecipe.version),
      ) ?? null,
    );

    if (plan.action === 'skip') {
      counters.skipped += 1;
      logger.info(
        `skip ${latestRecipe.recipeId} v${latestRecipe.version}: ${plan.reason}`,
      );
      continue;
    }

    if (plan.action === 'block') {
      counters.blocked += 1;
      logger.error(
        `block ${latestRecipe.recipeId} v${latestRecipe.version}: ${plan.issues.join('; ')}`,
      );
      continue;
    }

    counters.eligible += 1;
    logger.info(
      `${apply ? 'apply' : 'plan'} ${latestRecipe.recipeId} v${latestRecipe.version}: ${latestRecipe.name}`,
    );

    if (!apply) continue;

    try {
      await applyBackfillPlan({ prisma, plan });
      counters.applied += 1;
    } catch (error) {
      counters.errors += 1;
      logger.error(
        `error ${latestRecipe.recipeId} v${latestRecipe.version}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  logger.info('');
  logger.info('Summary');
  logger.info(`- scanned: ${counters.scanned}`);
  logger.info(`- eligible: ${counters.eligible}`);
  logger.info(`- applied: ${counters.applied}`);
  logger.info(`- skipped: ${counters.skipped}`);
  logger.info(`- blocked: ${counters.blocked}`);
  logger.info(`- errors: ${counters.errors}`);
  if (!apply) {
    logger.info('Dry run complete. Re-run with --apply to persist changes.');
  }

  return counters;
}

export function parseLatestRecipeDesignerBackfillArgs(
  argv: string[],
): LatestRecipeDesignerBackfillArgs {
  const args: LatestRecipeDesignerBackfillArgs = {
    apply: false,
    recipeId: null,
    includeDraftStatus: false,
    privateCustomOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--apply') {
      args.apply = true;
      continue;
    }
    if (value === '--include-draft-status') {
      args.includeDraftStatus = true;
      continue;
    }
    if (value === '--private-custom-only') {
      args.privateCustomOnly = true;
      continue;
    }
    if (value === '--recipe-id') {
      args.recipeId = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (value.startsWith('--recipe-id=')) {
      args.recipeId = value.slice('--recipe-id='.length) || null;
      continue;
    }
  }

  return args;
}

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 未设置，无法执行食谱设计器回填脚本');
  }

  const args = parseLatestRecipeDesignerBackfillArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    await runLatestRecipeDesignerBackfill({
      prisma: prisma as unknown as LatestRecipeDesignerBackfillPrisma,
      apply: args.apply,
      recipeId: args.recipeId,
      includeDraftStatus: args.includeDraftStatus,
      privateCustomOnly: args.privateCustomOnly,
      logger: {
        info: (message) => console.log(message),
        error: (message) => console.error(message),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to backfill latest recipes to designer:', error);
    process.exit(1);
  });
}
