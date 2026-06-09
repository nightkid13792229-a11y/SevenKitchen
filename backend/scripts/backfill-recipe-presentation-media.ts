import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type RecipePresentationMediaRecord = {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  seriesId: string | null;
  seriesLifeStage: string | null;
  coverImageUrl: string | null;
  coverTitle: string | null;
  detailImages: unknown;
  videoUrl: string | null;
  updatedAt: Date | string | null;
};

type RecipePresentationMediaPrisma = {
  recipe: {
    findMany: (args: unknown) => Promise<RecipePresentationMediaRecord[]>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export type RecipePresentationMediaBackfillArgs = {
  apply: boolean;
  seriesId: string | null;
};

export type RecipePresentationMediaBackfillCounters = {
  scanned: number;
  eligible: number;
  applied: number;
  skipped: number;
  blocked: number;
  errors: number;
};

type RecipePresentationMediaPatch = {
  coverImageUrl?: string;
  coverTitle?: string;
  detailImages?: unknown;
  videoUrl?: string;
};

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function hasCoverImage(recipe: RecipePresentationMediaRecord): boolean {
  return Boolean(normalizeOptionalText(recipe.coverImageUrl));
}

function hasDetailImages(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function getUpdatedTime(value: Date | string | null): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareNewestRecipe(
  left: RecipePresentationMediaRecord,
  right: RecipePresentationMediaRecord,
) {
  const timeDiff = getUpdatedTime(right.updatedAt) - getUpdatedTime(left.updatedAt);
  if (timeDiff !== 0) return timeDiff;
  return (right.version ?? 0) - (left.version ?? 0);
}

function compactPatch(
  patch: RecipePresentationMediaPatch,
): RecipePresentationMediaPatch {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as RecipePresentationMediaPatch;
}

export function parseRecipePresentationMediaBackfillArgs(
  argv: string[],
): RecipePresentationMediaBackfillArgs {
  let apply = false;
  let seriesId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--series-id') {
      seriesId = argv[index + 1]?.trim() || null;
      index += 1;
    }
  }

  return { apply, seriesId };
}

export function buildRecipePresentationMediaPatch(
  target: RecipePresentationMediaRecord,
  source: RecipePresentationMediaRecord,
): RecipePresentationMediaPatch {
  return {
    coverImageUrl: normalizeOptionalText(target.coverImageUrl)
      ? undefined
      : normalizeOptionalText(source.coverImageUrl),
    coverTitle: normalizeOptionalText(target.coverTitle)
      ? undefined
      : normalizeOptionalText(source.coverTitle),
    detailImages: hasDetailImages(target.detailImages)
      ? undefined
      : hasDetailImages(source.detailImages)
        ? source.detailImages
        : undefined,
    videoUrl: normalizeOptionalText(target.videoUrl)
      ? undefined
      : normalizeOptionalText(source.videoUrl),
  };
}

export async function runRecipePresentationMediaBackfill({
  prisma,
  apply,
  seriesId,
  logger,
}: {
  prisma: RecipePresentationMediaPrisma;
  apply: boolean;
  seriesId?: string | null;
  logger: Logger;
}): Promise<RecipePresentationMediaBackfillCounters> {
  logger.info(
    apply
      ? 'Applying recipe presentation media backfill...'
      : 'Dry run: recipe presentation media backfill...',
  );

  const recipes = await prisma.recipe.findMany({
    where: {
      isCustomRecipe: false,
      seriesId: seriesId ? seriesId : { not: null },
    },
    select: {
      id: true,
      recipeId: true,
      version: true,
      name: true,
      status: true,
      seriesId: true,
      seriesLifeStage: true,
      coverImageUrl: true,
      coverTitle: true,
      detailImages: true,
      videoUrl: true,
      updatedAt: true,
    },
    orderBy: [{ seriesId: 'asc' }, { updatedAt: 'desc' }, { version: 'desc' }],
  });

  const groups = new Map<string, RecipePresentationMediaRecord[]>();
  for (const recipe of recipes) {
    if (!recipe.seriesId) continue;
    groups.set(recipe.seriesId, [...(groups.get(recipe.seriesId) ?? []), recipe]);
  }

  const counters: RecipePresentationMediaBackfillCounters = {
    scanned: recipes.length,
    eligible: 0,
    applied: 0,
    skipped: 0,
    blocked: 0,
    errors: 0,
  };

  for (const [groupSeriesId, groupRecipes] of groups) {
    const source = [...groupRecipes]
      .filter(hasCoverImage)
      .sort(compareNewestRecipe)[0];

    for (const target of groupRecipes.sort(compareNewestRecipe)) {
      if (hasCoverImage(target)) {
        counters.skipped += 1;
        continue;
      }

      if (!source) {
        counters.blocked += 1;
        logger.error(
          `[BLOCKED] series=${groupSeriesId} recipe=${target.name} v${target.version}: no same-series cover source`,
        );
        continue;
      }

      const patch = compactPatch(buildRecipePresentationMediaPatch(target, source));
      if (!patch.coverImageUrl) {
        counters.blocked += 1;
        logger.error(
          `[BLOCKED] series=${groupSeriesId} recipe=${target.name} v${target.version}: source has no cover image`,
        );
        continue;
      }

      counters.eligible += 1;
      logger.info(
        `${apply ? '[APPLY]' : '[DRY-RUN]'} ${target.name} v${target.version} (${target.seriesLifeStage ?? 'unknown-stage'}) <- ${source.name} v${source.version}`,
      );

      if (!apply) {
        continue;
      }

      try {
        await prisma.recipe.update({
          where: { id: target.id },
          data: patch,
        });
        counters.applied += 1;
      } catch (error) {
        counters.errors += 1;
        logger.error(
          `[ERROR] recipe=${target.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  logger.info(`Backfill counters: ${JSON.stringify(counters)}`);
  return counters;
}

async function main() {
  loadEnv({ path: '.env' });

  const args = parseRecipePresentationMediaBackfillArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    await runRecipePresentationMediaBackfill({
      prisma: prisma as unknown as RecipePresentationMediaPrisma,
      apply: args.apply,
      seriesId: args.seriesId,
      logger: console,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
