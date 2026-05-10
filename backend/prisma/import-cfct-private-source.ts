import { readFileSync } from 'fs';
import { isAbsolute } from 'path';

import { Prisma, PrismaClient } from '@prisma/client';

import { createEmptyNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from '../src/domain/ingredient/types';
import type { NutritionSourceInput } from '../src/domain/nutrition-governance/nutrition-governance.types';
import { buildNutritionSourceKey } from '../src/domain/nutrition-governance/nutrition-governance.utils';

const CFCT_SOURCE_TYPE = 'CFCT' as const;
const CFCT_SOURCE_PROVIDER = '中国食物成分表';

const CFCT_MACRO_NUTRIENTS = [
  'energyKcal',
  'moisture',
  'crudeProtein',
  'crudeFat',
  'ash',
  'carbohydrate',
  'fiber',
] as const satisfies readonly (keyof NutritionProfileV2['macros'])[];

const CFCT_MINERAL_NUTRIENTS = [
  'calcium',
  'phosphorus',
  'potassium',
  'sodium',
  'magnesium',
  'iron',
  'zinc',
  'copper',
  'manganese',
  'selenium',
] as const satisfies readonly (keyof NutritionProfileV2['minerals'])[];

type CfctMacroNutrient = (typeof CFCT_MACRO_NUTRIENTS)[number];
type CfctMineralNutrient = (typeof CFCT_MINERAL_NUTRIENTS)[number];

export type ReviewedCfctNutrients = Partial<
  Record<CfctMacroNutrient | CfctMineralNutrient, number | null | undefined>
>;

export interface ReviewedCfctRow {
  volume: string;
  page: string | number;
  row: string | number;
  foodName: string;
  category?: string | null;
  nutrients: ReviewedCfctNutrients;
}

type ImportLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export type CfctPrivateImportCounters = {
  apply: number;
  upsert: number;
  skip: number;
};

function assignNumericNutrients(profile: NutritionProfileV2, row: ReviewedCfctRow) {
  const nutrients = row.nutrients ?? {};

  for (const key of CFCT_MACRO_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.macros[key] = value;
    }
  }

  for (const key of CFCT_MINERAL_NUTRIENTS) {
    const value = nutrients[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      profile.minerals[key] = value;
    }
  }
}

export function mapCfctRowToSourceInput(
  row: ReviewedCfctRow,
): NutritionSourceInput {
  const profile = createEmptyNutritionProfile();
  const sourceTitle = `${CFCT_SOURCE_PROVIDER} ${row.volume}`;

  profile.meta.rawBasisType = 'PER_100_G';
  profile.meta.sourceType = CFCT_SOURCE_TYPE;
  profile.meta.sourceTitle = sourceTitle;
  profile.meta.sourceProvider = CFCT_SOURCE_PROVIDER;
  profile.meta.confidenceLevel = 'MEDIUM';
  assignNumericNutrients(profile, row);

  return {
    sourceType: CFCT_SOURCE_TYPE,
    externalId: `${row.volume}:p${row.page}:r${row.row}`,
    sourceTitle,
    foodName: row.foodName,
    category: row.category ?? null,
    sourceDetail: {
      volume: row.volume,
      page: row.page,
      row: row.row,
      privateLocalSource: true,
    },
    rawData: row as unknown as Record<string, unknown>,
    normalizedNutrition: profile,
  };
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }

  return toJsonInput(value);
}

function getInputPath(argv: string[]): string {
  const inputArg = argv.find((arg) => arg.startsWith('--input='));
  if (!inputArg) {
    throw new Error(
      'Missing required --input=/absolute/path/to/reviewed-cfct.json argument',
    );
  }

  const inputPath = inputArg.slice('--input='.length);
  if (!isAbsolute(inputPath)) {
    throw new Error('--input must be an absolute path');
  }

  return inputPath;
}

function parseReviewedCfctRows(inputPath: string): ReviewedCfctRow[] {
  const parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as ReviewedCfctRow[];
  }

  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { rows?: unknown }).rows)
  ) {
    return (parsed as { rows: ReviewedCfctRow[] }).rows;
  }

  throw new Error('Reviewed CFCT input must be a JSON array or an object with rows');
}

export async function importCfctPrivateSourceRows({
  prisma,
  rows,
  apply,
  logger,
}: {
  prisma: PrismaClient;
  rows: ReviewedCfctRow[];
  apply: boolean;
  logger: ImportLogger;
}): Promise<CfctPrivateImportCounters> {
  const counters: CfctPrivateImportCounters = {
    apply: 0,
    upsert: 0,
    skip: 0,
  };

  logger.info(
    apply
      ? 'Applying private CFCT source import...'
      : 'Dry run: private CFCT source import...',
  );

  for (const row of rows) {
    const input = mapCfctRowToSourceInput(row);
    const sourceKey = buildNutritionSourceKey(input.sourceType, input.externalId);
    counters.upsert += 1;

    logger.info(`- ${apply ? 'upsert' : 'dry-run'} ${sourceKey} ${input.foodName}`);

    if (!apply) {
      continue;
    }

    await prisma.nutritionSourceRecord.upsert({
      where: {
        sourceType_sourceKey: {
          sourceType: input.sourceType,
          sourceKey,
        },
      },
      create: {
        sourceType: input.sourceType,
        sourceKey,
        sourceTitle: input.sourceTitle,
        sourceDetail: toNullableJsonInput(input.sourceDetail),
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? null,
        dataType: input.dataType ?? null,
        category: input.category ?? null,
        rawData: toJsonInput(input.rawData),
        normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
        status: 'ACTIVE',
      },
      update: {
        sourceTitle: input.sourceTitle,
        sourceDetail: toNullableJsonInput(input.sourceDetail),
        foodName: input.foodName,
        foodNameEn: input.foodNameEn ?? null,
        dataType: input.dataType ?? null,
        category: input.category ?? null,
        rawData: toJsonInput(input.rawData),
        normalizedNutrition: toNullableJsonInput(input.normalizedNutrition),
      },
    });

    counters.apply += 1;
  }

  logger.info('');
  logger.info('Summary');
  logger.info(`- apply: ${counters.apply}`);
  logger.info(`- upsert: ${counters.upsert}`);
  logger.info(`- skip: ${counters.skip}`);
  if (!apply) {
    logger.info('Dry run complete. Re-run with --apply to persist changes.');
  }

  return counters;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const inputPath = getInputPath(argv);
  const apply = argv.includes('--apply');
  const rows = parseReviewedCfctRows(inputPath);
  const prisma = new PrismaClient();

  try {
    await importCfctPrivateSourceRows({
      prisma,
      rows,
      apply,
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
    console.error('Failed to import private CFCT source rows:', error);
    process.exit(1);
  });
}
