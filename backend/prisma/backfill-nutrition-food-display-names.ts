import { PrismaClient } from '@prisma/client';

import {
  normalizeChineseDisplayName,
  resolveNutritionProfileDisplayName,
} from '../src/application/nutrition-food/nutrition-food-display-name';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const shouldCsv = process.argv.includes('--csv');
const shouldIncludeExisting = process.argv.includes('--all');
const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

async function main() {
  const foods = await prisma.nutritionFood.findMany({
    where: shouldIncludeExisting ? undefined : { displayNameZh: null },
    orderBy: [{ dataSource: 'asc' }, { name: 'asc' }],
    include: {
      mappings: {
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        include: {
          ingredient: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (shouldCsv) {
    console.log(
      [
        'id',
        'dataSource',
        'sourceName',
        'nameEn',
        'ingredientName',
        'currentDisplayNameZh',
        'suggestedDisplayNameZh',
        'displayNameZhSource',
      ].join(','),
    );
  } else {
    console.log(
      shouldApply
        ? 'Applying nutrition food Chinese display-name backfill...'
        : 'Dry run: nutrition food Chinese display-name backfill...',
    );
  }

  let changed = 0;
  let skipped = 0;

  for (const food of foods) {
    const mapping =
      food.mappings.find((candidate) => candidate.isPrimary) ??
      food.mappings[0] ??
      null;
    const ingredientName = mapping?.ingredient?.name ?? null;
    const suggested = normalizeChineseDisplayName(
      resolveNutritionProfileDisplayName(ingredientName, food),
    );

    if (!suggested || !CJK_TEXT_PATTERN.test(suggested)) {
      skipped += 1;
      continue;
    }

    if (
      normalizeChineseDisplayName(food.displayNameZh) === suggested &&
      food.displayNameZhSource
    ) {
      skipped += 1;
      continue;
    }

    if (shouldCsv) {
      console.log(
        [
          food.id,
          food.dataSource,
          food.name,
          food.nameEn,
          ingredientName,
          food.displayNameZh,
          suggested,
          'AUTO_RULE',
        ]
          .map(csvEscape)
          .join(','),
      );
    } else {
      console.log(`- ${food.id} ${food.name} -> ${suggested}`);
    }

    if (shouldApply) {
      await prisma.nutritionFood.update({
        where: { id: food.id },
        data: {
          displayNameZh: suggested,
          displayNameZhSource: 'AUTO_RULE',
          displayNameZhReviewedAt: null,
          displayNameZhReviewedBy: null,
        },
      });
    }

    changed += 1;
  }

  if (!shouldCsv) {
    console.log('');
    console.log(`Changed candidates: ${changed}`);
    console.log(`Skipped: ${skipped}`);
    if (!shouldApply) {
      console.log('Re-run with --apply to persist these display names.');
      console.log('Add --csv to print a review queue in CSV format.');
    }
  }
}

main()
  .catch((error) => {
    console.error('Failed to backfill nutrition food display names:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
