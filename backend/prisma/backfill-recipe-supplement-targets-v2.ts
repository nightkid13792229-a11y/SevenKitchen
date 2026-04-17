import { PrismaClient } from '@prisma/client';

export interface SupplementTargetV2 {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}

const LEGACY_TARGET_MAPPING: Record<
  string,
  { fieldPath: string; label: string; unit: string }
> = {
  碘: { fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' },
  钙: { fieldPath: 'minerals.calcium', label: '钙', unit: 'mg' },
  锌: { fieldPath: 'minerals.zinc', label: '锌', unit: 'mg' },
  维生素E: { fieldPath: 'vitamins.vitaminE', label: '维生素 E', unit: 'IU' },
  维生素D: { fieldPath: 'vitamins.vitaminD', label: '维生素 D', unit: 'IU' },
  胆碱: { fieldPath: 'vitamins.choline', label: '胆碱', unit: 'mg' },
};

function normalizeLegacyKey(key: string): string {
  return key.replace(/\s+/g, '');
}

export function mapLegacySupplementTarget(
  key: string | null | undefined,
  value: number | null | undefined,
): SupplementTargetV2 | null {
  if (!key || !(value && value > 0)) {
    return null;
  }

  const mapped = LEGACY_TARGET_MAPPING[normalizeLegacyKey(key)];
  return mapped ? { ...mapped, targetValuePerKg: value } : null;
}

function hasExistingTargets(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  try {
    const recipeItems = await (prisma as any).recipeItem.findMany({
      where: {
        ingredient: { type: 'SUPPLEMENT' },
        nutrientTargetKey: { not: null },
      },
      include: {
        ingredient: { select: { name: true } },
        recipe: { select: { recipeId: true, version: true, name: true } },
      },
      orderBy: [{ recipeId: 'asc' }, { recipeVersion: 'asc' }, { sortOrder: 'asc' }],
    });

    const plannedUpdates: Array<{ id: string; target: SupplementTargetV2 }> = [];
    const manualReview: any[] = [];
    let skippedExisting = 0;

    for (const item of recipeItems) {
      if (hasExistingTargets(item.supplementTargets)) {
        skippedExisting += 1;
        continue;
      }

      const target = mapLegacySupplementTarget(
        item.nutrientTargetKey,
        item.nutrientTargetValue,
      );

      if (!target) {
        manualReview.push({
          recipeItemId: item.id,
          recipeId: item.recipe?.recipeId,
          recipeVersion: item.recipe?.version,
          recipeName: item.recipe?.name,
          ingredientName: item.ingredient?.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
        });
        continue;
      }

      plannedUpdates.push({ id: item.id, target });
    }

    console.log(
      apply
        ? 'Applying recipe supplement target v2 backfill...'
        : 'Dry run: recipe supplement target v2 backfill...',
    );
    console.log(`Scanned supplement recipe items: ${recipeItems.length}`);
    console.log(`Planned updates: ${plannedUpdates.length}`);
    console.log(`Skipped items already having v2 targets: ${skippedExisting}`);
    console.log(`Manual review items: ${manualReview.length}`);

    if (manualReview.length > 0) {
      console.log('Manual review required:');
      console.log(JSON.stringify(manualReview, null, 2));
    }

    if (apply) {
      for (const update of plannedUpdates) {
        await (prisma as any).recipeItem.update({
          where: { id: update.id },
          data: { supplementTargets: [update.target] },
        });
      }
      console.log('Backfill applied successfully.');
    } else {
      console.log('No data changed. Re-run with --apply to update mapped rows.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to backfill recipe supplement targets v2:', error);
    process.exit(1);
  });
}
