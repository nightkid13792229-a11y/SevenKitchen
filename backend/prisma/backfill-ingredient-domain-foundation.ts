import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

type LegacyActiveNutrientValue = {
  value?: number;
  unit?: string;
};

const inferBasisType = (baseUnit: string) => {
  switch (baseUnit) {
    case 'ML':
      return 'PER_100_ML';
    case 'PCS':
      return 'PER_1_PCS';
    case 'G':
    default:
      return 'PER_100_G';
  }
};

async function main() {
  console.log(
    shouldApply
      ? 'Applying ingredient domain foundation backfill...'
      : 'Dry run: ingredient domain foundation backfill...',
  );

  const ingredients = await prisma.ingredient.findMany({
    select: {
      id: true,
      name: true,
      baseUnit: true,
      nutritionProfile: true,
      properties: true,
    },
    orderBy: { name: 'asc' },
  });

  let updatedCount = 0;

  for (const ingredient of ingredients) {
    const currentProfile =
      ingredient.nutritionProfile &&
      typeof ingredient.nutritionProfile === 'object' &&
      !Array.isArray(ingredient.nutritionProfile)
        ? (ingredient.nutritionProfile as Record<string, unknown>)
        : null;

    const properties =
      ingredient.properties &&
      typeof ingredient.properties === 'object' &&
      !Array.isArray(ingredient.properties)
        ? (ingredient.properties as Record<string, unknown>)
        : {};

    const legacyActiveNutrients =
      properties.active_nutrients &&
      typeof properties.active_nutrients === 'object' &&
      !Array.isArray(properties.active_nutrients)
        ? (properties.active_nutrients as Record<string, LegacyActiveNutrientValue>)
        : null;

    if (currentProfile?.items || !legacyActiveNutrients) {
      continue;
    }

    const nextItems = Object.entries(legacyActiveNutrients)
      .filter(([name, value]) => name.trim().length > 0 && typeof value?.value === 'number')
      .map(([name, value]) => ({
        nutrientCode: null,
        nutrientName: name,
        value: Number(value?.value || 0),
        unit: value?.unit || 'mg',
        basisType: inferBasisType(ingredient.baseUnit),
        basisQuantity: inferBasisType(ingredient.baseUnit).startsWith('PER_100') ? 100 : 1,
        sourceType: 'MANUAL',
        sourceName: 'legacy supplement active_nutrients',
        confidenceLevel: 'MEDIUM',
        isKeyNutrient: true,
        notes: 'Backfilled from legacy supplement properties',
      }));

    if (nextItems.length === 0) {
      continue;
    }

    console.log(`- ${ingredient.name}`);
    console.log(`  items: ${nextItems.length}`);

    if (shouldApply) {
      await prisma.ingredient.update({
        where: { id: ingredient.id },
        data: {
          nutritionProfile: {
            items: nextItems,
          } as any,
        },
      });
      updatedCount += 1;
    }
  }

  console.log(
    shouldApply
      ? `Ingredient domain backfill applied. Updated ${updatedCount} ingredient records.`
      : 'Dry run complete. Re-run with --apply to persist changes.',
  );
}

main()
  .catch((error) => {
    console.error('Failed to backfill ingredient domain foundation:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
