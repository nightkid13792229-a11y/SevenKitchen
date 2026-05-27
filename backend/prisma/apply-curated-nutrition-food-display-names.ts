import {
  IngredientType,
  NutritionFoodStatus,
  PrismaClient,
} from '@prisma/client';

import {
  CURATED_DISPLAY_NAME_SOURCE,
  CURATED_NUTRITION_FOOD_DISPLAY_NAMES,
} from './curated-nutrition-food-display-names';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const reviewedBy = 'codex';

async function main() {
  const mappings = await prisma.nutritionFoodMapping.findMany({
    where: {
      ingredient: { type: IngredientType.FOOD },
      nutritionFood: { status: NutritionFoodStatus.VERIFIED },
    },
    select: {
      nutritionFoodId: true,
      nutritionFood: {
        select: {
          name: true,
          displayNameZh: true,
          displayNameZhSource: true,
        },
      },
    },
  });

  const standardProfileIds = new Set(
    mappings.map((mapping) => mapping.nutritionFoodId),
  );
  const curatedEntries = Object.entries(CURATED_NUTRITION_FOOD_DISPLAY_NAMES);
  const curatedIds = new Set(curatedEntries.map(([id]) => id));
  const missingIds = Array.from(standardProfileIds).filter(
    (id) => !curatedIds.has(id),
  );

  if (missingIds.length > 0) {
    throw new Error(
      `Missing curated display names for ${missingIds.length} standard nutrition profiles: ${missingIds.join(
        ', ',
      )}`,
    );
  }

  const currentById = new Map(
    mappings.map((mapping) => [mapping.nutritionFoodId, mapping.nutritionFood]),
  );
  const updates = curatedEntries
    .filter(([id]) => standardProfileIds.has(id))
    .map(([id, displayNameZh]) => ({
      id,
      displayNameZh,
      current: currentById.get(id),
    }))
    .filter(
      (entry) =>
        entry.current?.displayNameZh !== entry.displayNameZh ||
        entry.current?.displayNameZhSource !== CURATED_DISPLAY_NAME_SOURCE,
    );

  console.log(
    shouldApply
      ? 'Applying curated nutrition food display names...'
      : 'Dry run: curated nutrition food display names...',
  );
  console.log(`Standard nutrition profile ids: ${standardProfileIds.size}`);
  console.log(`Curated names available: ${curatedEntries.length}`);
  console.log(`Rows needing update: ${updates.length}`);

  for (const update of updates) {
    console.log(
      `- ${update.id} ${update.current?.name ?? ''}: ${
        update.current?.displayNameZh ?? ''
      } -> ${update.displayNameZh}`,
    );
  }

  if (!shouldApply) {
    console.log('Re-run with --apply to persist these curated names.');
    return;
  }

  const reviewedAt = new Date();
  await prisma.$transaction(
    updates.map((update) =>
      prisma.nutritionFood.update({
        where: { id: update.id },
        data: {
          displayNameZh: update.displayNameZh,
          displayNameZhSource: CURATED_DISPLAY_NAME_SOURCE,
          displayNameZhReviewedAt: reviewedAt,
          displayNameZhReviewedBy: reviewedBy,
        },
      }),
    ),
  );

  console.log(`Applied curated display names: ${updates.length}`);
}

main()
  .catch((error) => {
    console.error(
      'Failed to apply curated nutrition food display names:',
      error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
