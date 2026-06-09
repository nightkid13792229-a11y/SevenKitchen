import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { PrismaFediafTargetProvider } from '../src/application/recipe-designer/fediaf-target-provider';
import { RecipeDesignerService } from '../src/application/recipe-designer/recipe-designer.service';

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type RecipeRecord = {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  nutritionDetailedData: unknown;
};

type DesignRecipeRecord = {
  id: string;
  name: string;
  publishedRecipeId: string | null;
  publishedRecipeVersion: number | null;
};

type RecipeNutritionReportBackfillPrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<RecipeRecord[]>;
    update: (args: unknown) => Promise<unknown>;
  };
  designRecipe: {
    findMany: (args: unknown) => Promise<DesignRecipeRecord[]>;
  };
};

type RecipeNutritionReportBuilder = {
  buildNutritionDetailedData: (
    designRecipe: DesignRecipeRecord,
  ) => Promise<Record<string, unknown>>;
};

export type RecipeNutritionReportBackfillArgs = {
  apply: boolean;
  recipeId: string | null;
};

export type RecipeNutritionReportBackfillCounters = {
  scanned: number;
  alreadyComplete: number;
  eligible: number;
  applied: number;
  blocked: number;
  errors: number;
};

const DESIGN_RECIPE_REPORT_INCLUDE = {
  items: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          type: true,
          unitDisplayLabel: true,
          purchaseUnit: true,
          properties: true,
          brand: true,
          productModel: true,
        },
      },
      nutritionFood: {
        include: {
          mappings: {
            include: {
              ingredient: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  unitDisplayLabel: true,
                  purchaseUnit: true,
                  properties: true,
                  brand: true,
                  productModel: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function reportKey(recipeId: string | null, version: number | null) {
  return `${recipeId || ''}#${version || ''}`;
}

function selectLatestRecipeVersions<T extends { recipeId: string; version: number }>(
  recipes: T[],
): T[] {
  const latestByRecipeId = new Map<string, T>();

  for (const recipe of recipes) {
    const existing = latestByRecipeId.get(recipe.recipeId);
    if (!existing || recipe.version > existing.version) {
      latestByRecipeId.set(recipe.recipeId, recipe);
    }
  }

  return [...latestByRecipeId.values()].sort((left, right) =>
    left.recipeId.localeCompare(right.recipeId),
  );
}

export function hasStructuredNutritionReport(value: unknown): boolean {
  if (!isPlainObject(value) || !isPlainObject(value.report)) {
    return false;
  }

  const report = value.report;
  if (Array.isArray(report.macroRows) && report.macroRows.length > 0) {
    return true;
  }

  if (!isPlainObject(report.nutrientSections)) {
    return false;
  }

  return Object.values(report.nutrientSections).some(
    (section) =>
      isPlainObject(section) &&
      Array.isArray(section.rows) &&
      section.rows.length > 0,
  );
}

export function parseRecipeNutritionReportBackfillArgs(
  argv: string[],
): RecipeNutritionReportBackfillArgs {
  let apply = false;
  let recipeId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--recipe-id') {
      recipeId = argv[index + 1]?.trim() || null;
      index += 1;
    }
  }

  return { apply, recipeId };
}

export async function runRecipeNutritionReportBackfill({
  prisma,
  reportBuilder,
  apply,
  logger,
  recipeId,
}: {
  prisma: RecipeNutritionReportBackfillPrisma;
  reportBuilder: RecipeNutritionReportBuilder;
  apply: boolean;
  logger: Logger;
  recipeId?: string | null;
}): Promise<RecipeNutritionReportBackfillCounters> {
  logger.info(
    apply
      ? 'Applying recipe nutrition report backfill...'
      : 'Dry run: recipe nutrition report backfill...',
  );

  const publicRecipes = await prisma.recipe.findMany({
    where: {
      isCustomRecipe: false,
      status: { in: ['PUBLIC'] },
      ...(recipeId ? { recipeId } : {}),
    },
    select: {
      id: true,
      recipeId: true,
      version: true,
      name: true,
      nutritionDetailedData: true,
    },
    orderBy: [{ recipeId: 'asc' }, { version: 'desc' }],
  });
  const latestRecipes = selectLatestRecipeVersions(publicRecipes);
  const counters: RecipeNutritionReportBackfillCounters = {
    scanned: latestRecipes.length,
    alreadyComplete: 0,
    eligible: 0,
    applied: 0,
    blocked: 0,
    errors: 0,
  };

  if (latestRecipes.length === 0) {
    logger.info('No public recipes matched the backfill criteria.');
    return counters;
  }

  const designRecipes = await prisma.designRecipe.findMany({
    where: {
      status: 'PUBLISHED',
      OR: latestRecipes.map((recipe) => ({
        publishedRecipeId: recipe.recipeId,
        publishedRecipeVersion: recipe.version,
      })),
    },
    include: DESIGN_RECIPE_REPORT_INCLUDE,
    orderBy: [{ publishedRecipeId: 'asc' }, { updatedAt: 'desc' }],
  });
  const designByRecipeVersion = new Map<string, DesignRecipeRecord>();
  for (const designRecipe of designRecipes) {
    const key = reportKey(
      designRecipe.publishedRecipeId,
      designRecipe.publishedRecipeVersion,
    );
    if (!designByRecipeVersion.has(key)) {
      designByRecipeVersion.set(key, designRecipe);
    }
  }

  for (const recipe of latestRecipes) {
    if (hasStructuredNutritionReport(recipe.nutritionDetailedData)) {
      counters.alreadyComplete += 1;
      continue;
    }

    const designRecipe = designByRecipeVersion.get(
      reportKey(recipe.recipeId, recipe.version),
    );
    if (!designRecipe) {
      counters.blocked += 1;
      logger.error(
        `${recipe.name} (${recipe.recipeId} v${recipe.version}) missing exact published design source`,
      );
      continue;
    }

    counters.eligible += 1;
    logger.info(
      `${apply ? 'Applying' : 'Would backfill'} ${recipe.name} (${recipe.recipeId} v${recipe.version}) from design ${designRecipe.id}`,
    );

    if (!apply) {
      continue;
    }

    try {
      const nutritionDetailedData =
        await reportBuilder.buildNutritionDetailedData(designRecipe);
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          nutritionDetailedData,
          nutritionStandard: 'FEDIAF_2025',
        },
      });
      counters.applied += 1;
    } catch (error) {
      counters.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        `${recipe.name} (${recipe.recipeId} v${recipe.version}) failed: ${message}`,
      );
    }
  }

  logger.info(
    `Summary: scanned=${counters.scanned}, alreadyComplete=${counters.alreadyComplete}, eligible=${counters.eligible}, applied=${counters.applied}, blocked=${counters.blocked}, errors=${counters.errors}`,
  );
  return counters;
}

async function main() {
  loadEnv({ path: process.env.ENV_FILE || '.env' });
  const args = parseRecipeNutritionReportBackfillArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const targetProvider = new PrismaFediafTargetProvider(prisma as any);
  const recipeDesignerService = new RecipeDesignerService(
    prisma as any,
    targetProvider,
  );

  try {
    const counters = await runRecipeNutritionReportBackfill({
      prisma: prisma as unknown as RecipeNutritionReportBackfillPrisma,
      reportBuilder: {
        buildNutritionDetailedData: (designRecipe) =>
          recipeDesignerService.buildPublishedNutritionDetailedDataForDraft(
            designRecipe as any,
          ),
      },
      apply: args.apply,
      recipeId: args.recipeId,
      logger: console,
    });

    if (counters.blocked > 0 || counters.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
