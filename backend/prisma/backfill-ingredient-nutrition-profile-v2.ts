import { PrismaClient } from '@prisma/client';

import {
  ensureProfileDefaults,
  isLegacyNutritionProfile,
  normalizeNutritionProfile,
} from '../src/domain/ingredient/nutrition-profile.utils';
import type {
  LegacyNutritionProfile,
  NutritionProfile,
  NutritionProfileV2,
} from '../src/domain/ingredient/types';

const shouldApply = process.argv.includes('--apply');

type JsonRecord = Record<string, unknown>;

export type BackfillCounters = {
  apply: number;
  update: number;
  skip: number;
  error: number;
};

type BackfillLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type IngredientRecord = {
  id: string;
  name: string;
  nutritionProfile: unknown;
};

type BackfillPrisma = {
  ingredient: {
    findMany: (args: {
      select: { id: true; name: true; nutritionProfile: true };
      orderBy: { name: 'asc' };
    }) => Promise<IngredientRecord[]>;
    update: (args: {
      where: { id: string };
      data: { nutritionProfile: NutritionProfileV2 };
    }) => Promise<unknown>;
  };
};

function isPlainObject(input: unknown): input is JsonRecord {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as JsonRecord).sort(([left], [right]) =>
      left.localeCompare(right),
    );

    return `{${entries
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function isEquivalentProfile(
  left: NutritionProfile | NutritionProfileV2 | null,
  right: NutritionProfile | NutritionProfileV2 | null,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function buildNormalizedNutritionProfile(
  input: NutritionProfile | null | undefined,
): NutritionProfileV2 | null {
  if (!input) return null;
  if (isLegacyNutritionProfile(input)) {
    return normalizeNutritionProfile(input);
  }

  return ensureProfileDefaults(input);
}

function formatAction(
  action: keyof BackfillCounters,
  ingredientName: string,
  detail: string,
): string {
  return `${action} ${ingredientName}: ${detail}`;
}

function resolveLegacyItemRawBasisType(
  item: LegacyNutritionProfile['items'][number],
): string {
  const normalized = normalizeNutritionProfile({ items: [item] } as NutritionProfile);
  return normalized?.meta.rawBasisType ?? 'PER_100_G';
}

function resolveLegacyItemKnownTarget(
  item: LegacyNutritionProfile['items'][number],
): string | null {
  const normalized = normalizeNutritionProfile({ items: [item] } as NutritionProfile);
  if (!normalized) {
    return null;
  }

  const tabs = [
    ['macros', normalized.macros],
    ['minerals', normalized.minerals],
    ['vitamins', normalized.vitamins],
    ['fattyAcids', normalized.fattyAcids],
    ['aminoAcids', normalized.aminoAcids],
  ] as const;

  for (const [tabKey, tab] of tabs) {
    for (const [key, value] of Object.entries(tab)) {
      if (value !== null) {
        return `${tabKey}.${key}`;
      }
    }
  }

  return null;
}

function findLegacyMigrationIssue(input: LegacyNutritionProfile): string | null {
  if (!isLegacyNutritionProfile(input)) {
    return null;
  }

  const basisTypes = new Set(
    input.items.map((item) => resolveLegacyItemRawBasisType(item)),
  );
  if (basisTypes.size > 1) {
    return 'mixed legacy basis types';
  }

  const seenTargets = new Set<string>();
  for (const item of input.items) {
    const knownTarget = resolveLegacyItemKnownTarget(item);
    if (!knownTarget) {
      continue;
    }

    if (seenTargets.has(knownTarget)) {
      return 'duplicate mapped nutrients';
    }

    seenTargets.add(knownTarget);
  }

  return null;
}

export async function runIngredientNutritionProfileV2Backfill({
  prisma,
  apply,
  logger,
}: {
  prisma: BackfillPrisma;
  apply: boolean;
  logger: BackfillLogger;
}): Promise<BackfillCounters> {
  const counters: BackfillCounters = {
    apply: 0,
    update: 0,
    skip: 0,
    error: 0,
  };

  logger.info(
    apply
      ? 'Applying ingredient nutrition profile v2 backfill...'
      : 'Dry run: ingredient nutrition profile v2 backfill...',
  );

  const ingredients = await prisma.ingredient.findMany({
    select: {
      id: true,
      name: true,
      nutritionProfile: true,
    },
    orderBy: { name: 'asc' },
  });

  for (const ingredient of ingredients) {
    try {
      const currentProfile = ingredient.nutritionProfile;

      if (currentProfile == null) {
        counters.skip += 1;
        logger.info(
          formatAction('skip', ingredient.name, 'nutrition profile is null'),
        );
        continue;
      }

      if (!isPlainObject(currentProfile)) {
        counters.error += 1;
        logger.error(
          formatAction(
            'error',
            ingredient.name,
            'nutrition profile is not a JSON object',
          ),
        );
        continue;
      }

      if (!isLegacyNutritionProfile(currentProfile)) {
        counters.skip += 1;
        logger.info(
          formatAction('skip', ingredient.name, 'already uses v2 profile shape'),
        );
        continue;
      }

      const legacyProfile = currentProfile as LegacyNutritionProfile;
      const legacyMigrationIssue = findLegacyMigrationIssue(legacyProfile);
      if (legacyMigrationIssue) {
        counters.error += 1;
        logger.error(formatAction('error', ingredient.name, legacyMigrationIssue));
        continue;
      }

      const nextProfile = buildNormalizedNutritionProfile(legacyProfile);

      if (
        !nextProfile ||
        isEquivalentProfile(legacyProfile, nextProfile)
      ) {
        counters.skip += 1;
        logger.info(
          formatAction('skip', ingredient.name, 'no migration changes required'),
        );
        continue;
      }

      counters.update += 1;
      logger.info(
        formatAction(
          'update',
          ingredient.name,
          'legacy items[] will be migrated to v2',
        ),
      );

      if (!apply) {
        continue;
      }

      await prisma.ingredient.update({
        where: { id: ingredient.id },
        data: {
          nutritionProfile: nextProfile,
        },
      });

      counters.apply += 1;
      logger.info(
        formatAction('apply', ingredient.name, 'persisted migrated v2 profile'),
      );
    } catch (error) {
      counters.error += 1;
      logger.error(
        formatAction(
          'error',
          ingredient.name,
          error instanceof Error ? error.message : 'unknown error',
        ),
      );
    }
  }

  logger.info('');
  logger.info('Summary');
  logger.info(`- apply: ${counters.apply}`);
  logger.info(`- update: ${counters.update}`);
  logger.info(`- skip: ${counters.skip}`);
  logger.info(`- error: ${counters.error}`);
  if (!apply) {
    logger.info('Dry run complete. Re-run with --apply to persist changes.');
  }

  return counters;
}

async function main() {
  const prisma = new PrismaClient();

  try {
    await runIngredientNutritionProfileV2Backfill({
      prisma: prisma as unknown as BackfillPrisma,
      apply: shouldApply,
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
    console.error('Failed to backfill ingredient nutrition profile v2:', error);
    process.exit(1);
  });
}
