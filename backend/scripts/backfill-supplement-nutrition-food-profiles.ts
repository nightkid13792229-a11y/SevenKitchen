import { PrismaClient } from '@prisma/client';

const shouldApply = process.argv.includes('--apply');
const DATA_SOURCE = 'SUPPLEMENT_LABEL';
const CREATED_BY = 'local-supplement-profile-backfill';

type JsonRecord = Record<string, any>;

type SupplementIngredientRecord = {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  unitDisplayLabel: string | null;
  nutritionProfile: unknown;
  nutritionFoodMappings: Array<{ id: string }>;
};

type SupplementNutritionFoodPlan =
  | {
      action: 'create';
      ingredientId: string;
      ingredientName: string;
      nutritionFoodName: string;
      displayNameZh: string;
      preparationState: string;
    }
  | {
      action: 'skip';
      reason: string;
      ingredientId: string;
      ingredientName: string;
    };

type BackfillCounters = {
  create: number;
  apply: number;
  skip: number;
  error: number;
};

type BackfillLogger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type BackfillPrisma = {
  ingredient: {
    findMany: (args: unknown) => Promise<SupplementIngredientRecord[]>;
  };
  nutritionFood: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
  };
  nutritionFoodMapping: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<unknown>;
  };
  $transaction: <T>(fn: (tx: BackfillPrisma) => Promise<T>) => Promise<T>;
};

function isPlainObject(input: unknown): input is JsonRecord {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function cloneJson<T>(input: T): T {
  return JSON.parse(JSON.stringify(input));
}

function compactParts(parts: Array<string | null | undefined>): string[] {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function hasNutritionValues(input: unknown): boolean {
  if (!isPlainObject(input)) return false;

  for (const groupKey of [
    'macros',
    'minerals',
    'vitamins',
    'fattyAcids',
    'aminoAcids',
  ]) {
    const group = input[groupKey];
    if (
      isPlainObject(group) &&
      Object.values(group).some(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      return true;
    }
  }

  return Array.isArray(input.customItems) && input.customItems.length > 0;
}

function resolvePreparationState(profile: unknown): string {
  const sampleState = isPlainObject(profile)
    ? profile.meta?.sampleState
    : undefined;

  return typeof sampleState === 'string' && sampleState.trim()
    ? sampleState.trim()
    : 'CONCENTRATE';
}

function resolvePreparationStateLabel(state: string): string {
  const labels: Record<string, string> = {
    RAW: '生',
    COOKED: '熟',
    FREEZE_DRIED: '冻干',
    AIR_DRIED: '风干',
    POWDER: '粉末',
    OIL: '油脂',
    CONCENTRATE: '浓缩补剂',
  };

  return labels[state] || state;
}

function resolveEdiblePortionLabel(ingredient: SupplementIngredientRecord): string {
  const displayUnit = ingredient.unitDisplayLabel?.trim();
  if (displayUnit) {
    return `每${displayUnit}标签标示量`;
  }

  return '标签标示量';
}

function buildDisplayNameZh(ingredient: SupplementIngredientRecord): string {
  return truncate(
    compactParts([
      ingredient.name,
      ingredient.brand,
      ingredient.productModel,
    ]).join(' · '),
    200,
  );
}

function buildNutritionFoodName(ingredient: SupplementIngredientRecord): string {
  return truncate(`Supplement label profile ${ingredient.id}`, 200);
}

export function buildSupplementNutritionFoodPlan(
  ingredient: SupplementIngredientRecord,
): SupplementNutritionFoodPlan {
  if (ingredient.nutritionFoodMappings.length > 0) {
    return {
      action: 'skip',
      reason: 'already has nutrition food mapping',
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
    };
  }

  if (!hasNutritionValues(ingredient.nutritionProfile)) {
    return {
      action: 'skip',
      reason: 'nutrition profile is empty',
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
    };
  }

  return {
    action: 'create',
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    nutritionFoodName: buildNutritionFoodName(ingredient),
    displayNameZh: buildDisplayNameZh(ingredient),
    preparationState: resolvePreparationState(ingredient.nutritionProfile),
  };
}

export function createSupplementNutritionFoodPayload(
  ingredient: SupplementIngredientRecord,
) {
  const preparationState = resolvePreparationState(ingredient.nutritionProfile);
  const now = new Date();

  return {
    name: buildNutritionFoodName(ingredient),
    nameEn: null,
    displayNameZh: buildDisplayNameZh(ingredient),
    displayNameZhSource: 'BACKFILL',
    displayNameZhReviewedAt: now,
    displayNameZhReviewedBy: CREATED_BY,
    category: 'SUPPLEMENT',
    dataSource: DATA_SOURCE,
    externalId: `${DATA_SOURCE}:${ingredient.id}`,
    version: 1,
    status: 'VERIFIED',
    preparationState,
    preparationStateLabel: resolvePreparationStateLabel(preparationState),
    ediblePortionLabel: resolveEdiblePortionLabel(ingredient),
    processingLabel: '补剂标签导入',
    nutritionData: cloneJson(ingredient.nutritionProfile),
    notes:
      '由本地标准原料兼容营养数据迁移生成；保留原 nutritionProfile 作为兼容数据。',
    createdBy: CREATED_BY,
    verifiedBy: CREATED_BY,
    verifiedAt: now,
  };
}

async function createProfileIfNeeded({
  prisma,
  ingredient,
}: {
  prisma: BackfillPrisma;
  ingredient: SupplementIngredientRecord;
}): Promise<string> {
  const payload = createSupplementNutritionFoodPayload(ingredient);
  const existing = await prisma.nutritionFood.findUnique({
    where: {
      name_dataSource_version: {
        name: payload.name,
        dataSource: DATA_SOURCE,
        version: 1,
      },
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const created = await prisma.nutritionFood.create({
    data: payload,
    select: { id: true },
  });

  return created.id;
}

async function createMappingIfNeeded({
  prisma,
  nutritionFoodId,
  ingredient,
}: {
  prisma: BackfillPrisma;
  nutritionFoodId: string;
  ingredient: SupplementIngredientRecord;
}) {
  const existing = await prisma.nutritionFoodMapping.findUnique({
    where: {
      nutritionFoodId_ingredientId: {
        nutritionFoodId,
        ingredientId: ingredient.id,
      },
    },
    select: { id: true },
  });

  if (existing) return;

  await prisma.nutritionFoodMapping.create({
    data: {
      nutritionFoodId,
      ingredientId: ingredient.id,
      yieldRate: 1,
      isPrimary: true,
      notes: '由标准原料兼容营养数据迁移生成的补剂主档案。',
    },
  });
}

export async function runSupplementNutritionFoodProfileBackfill({
  prisma,
  apply,
  logger,
}: {
  prisma: BackfillPrisma;
  apply: boolean;
  logger: BackfillLogger;
}): Promise<BackfillCounters> {
  const counters: BackfillCounters = {
    create: 0,
    apply: 0,
    skip: 0,
    error: 0,
  };

  logger.info(
    apply
      ? 'Applying supplement nutrition food profile backfill...'
      : 'Dry run: supplement nutrition food profile backfill...',
  );

  const supplements = await prisma.ingredient.findMany({
    where: { type: 'SUPPLEMENT' },
    select: {
      id: true,
      name: true,
      brand: true,
      productModel: true,
      unitDisplayLabel: true,
      nutritionProfile: true,
      nutritionFoodMappings: {
        select: { id: true },
      },
    },
    orderBy: [{ name: 'asc' }, { brand: 'asc' }, { productModel: 'asc' }],
  });

  for (const ingredient of supplements) {
    try {
      const plan = buildSupplementNutritionFoodPlan(ingredient);
      if (plan.action === 'skip') {
        counters.skip += 1;
        logger.info(`skip ${ingredient.name}: ${plan.reason}`);
        continue;
      }

      counters.create += 1;
      logger.info(
        `create ${ingredient.name}: ${plan.displayNameZh} -> ${plan.nutritionFoodName}`,
      );

      if (!apply) continue;

      await prisma.$transaction(async (tx) => {
        const nutritionFoodId = await createProfileIfNeeded({
          prisma: tx,
          ingredient,
        });
        await createMappingIfNeeded({
          prisma: tx,
          nutritionFoodId,
          ingredient,
        });
      });

      counters.apply += 1;
    } catch (error) {
      counters.error += 1;
      logger.error(
        `error ${ingredient.name}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  logger.info('');
  logger.info('Summary');
  logger.info(`- create: ${counters.create}`);
  logger.info(`- apply: ${counters.apply}`);
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
    await runSupplementNutritionFoodProfileBackfill({
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
    console.error(
      'Failed to backfill supplement nutrition food profiles:',
      error,
    );
    process.exit(1);
  });
}
