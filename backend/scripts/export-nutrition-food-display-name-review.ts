import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  IngredientType,
  NutritionFoodStatus,
  PrismaClient,
} from '@prisma/client';

import { CURATED_NUTRITION_FOOD_DISPLAY_NAMES } from '../prisma/curated-nutrition-food-display-names';

const prisma = new PrismaClient();

const DEFAULT_OUTPUT_PATH =
  'reports/curated-nutrition-food-display-names-review.csv';

type ReviewRow = Record<string, string | number>;

function getOutputPath(): string {
  const outIndex = process.argv.indexOf('--out');
  const outputPath =
    outIndex >= 0 ? process.argv[outIndex + 1] : DEFAULT_OUTPUT_PATH;

  if (!outputPath) {
    throw new Error('Missing output path after --out');
  }

  return resolve(process.cwd(), outputPath);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(rows: ReviewRow[]): string {
  const headers = [
    'nutritionFoodId',
    'standardIngredientNames',
    'mappedIngredientCount',
    'isSharedProfile',
    'nutritionFoodName',
    'nutritionFoodNameEn',
    'dataSource',
    'externalId',
    'preparationState',
    'preparationStateLabel',
    'ediblePortionLabel',
    'processingLabel',
    'displayNameZhSource',
    'currentDisplayNameZh',
    'suggestedDisplayNameZh',
    'reviewStatus',
    'reviewNote',
  ];

  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header])).join(','),
    ),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

async function main() {
  const outputPath = getOutputPath();
  const mappings = await prisma.nutritionFoodMapping.findMany({
    where: {
      ingredient: { type: IngredientType.FOOD },
      nutritionFood: { status: NutritionFoodStatus.VERIFIED },
    },
    select: {
      isPrimary: true,
      ingredient: {
        select: {
          name: true,
        },
      },
      nutritionFoodId: true,
      nutritionFood: {
        select: {
          id: true,
          name: true,
          nameEn: true,
          dataSource: true,
          externalId: true,
          preparationState: true,
          preparationStateLabel: true,
          ediblePortionLabel: true,
          processingLabel: true,
          displayNameZh: true,
          displayNameZhSource: true,
        },
      },
    },
    orderBy: [{ ingredient: { name: 'asc' } }, { isPrimary: 'desc' }],
  });

  const grouped = new Map<
    string,
    {
      ingredientNames: Set<string>;
      nutritionFood: (typeof mappings)[number]['nutritionFood'];
    }
  >();

  for (const mapping of mappings) {
    const existing = grouped.get(mapping.nutritionFoodId);

    if (existing) {
      existing.ingredientNames.add(mapping.ingredient.name);
      continue;
    }

    grouped.set(mapping.nutritionFoodId, {
      ingredientNames: new Set([mapping.ingredient.name]),
      nutritionFood: mapping.nutritionFood,
    });
  }

  const missingCuratedIds = Array.from(grouped.keys()).filter(
    (id) => !(id in CURATED_NUTRITION_FOOD_DISPLAY_NAMES),
  );

  if (missingCuratedIds.length > 0) {
    throw new Error(
      `Missing curated names for ${missingCuratedIds.length} standard profiles: ${missingCuratedIds.join(
        ', ',
      )}`,
    );
  }

  const rows = Array.from(grouped.entries())
    .map(([nutritionFoodId, group]) => {
      const ingredientNames = Array.from(group.ingredientNames).sort((a, b) =>
        a.localeCompare(b, 'zh-Hans-CN'),
      );
      const nutritionFood = group.nutritionFood;
      const suggestedDisplayNameZh =
        CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
          nutritionFoodId as keyof typeof CURATED_NUTRITION_FOOD_DISPLAY_NAMES
        ];
      const isSharedProfile = ingredientNames.length > 1 ? 'Y' : 'N';

      return {
        nutritionFoodId,
        standardIngredientNames: ingredientNames.join(' / '),
        mappedIngredientCount: ingredientNames.length,
        isSharedProfile,
        nutritionFoodName: nutritionFood.name,
        nutritionFoodNameEn: nutritionFood.nameEn ?? '',
        dataSource: nutritionFood.dataSource,
        externalId: nutritionFood.externalId ?? '',
        preparationState: nutritionFood.preparationState ?? '',
        preparationStateLabel: nutritionFood.preparationStateLabel ?? '',
        ediblePortionLabel: nutritionFood.ediblePortionLabel ?? '',
        processingLabel: nutritionFood.processingLabel ?? '',
        displayNameZhSource: nutritionFood.displayNameZhSource ?? '',
        currentDisplayNameZh: nutritionFood.displayNameZh ?? '',
        suggestedDisplayNameZh,
        reviewStatus: 'PENDING',
        reviewNote:
          isSharedProfile === 'Y'
            ? 'Shared profile: keep the Chinese name neutral for all mapped ingredients.'
            : '',
      };
    })
    .sort((a, b) =>
      `${a.standardIngredientNames} ${a.suggestedDisplayNameZh}`.localeCompare(
        `${b.standardIngredientNames} ${b.suggestedDisplayNameZh}`,
        'zh-Hans-CN',
      ),
    );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, toCsv(rows), 'utf8');

  console.log(`Exported review CSV: ${outputPath}`);
  console.log(`Rows: ${rows.length}`);
  console.log(
    `Shared profiles: ${rows.filter((row) => row.isSharedProfile === 'Y').length}`,
  );
}

main()
  .catch((error) => {
    console.error(
      'Failed to export nutrition food display name review:',
      error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
