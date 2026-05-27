import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  IngredientType,
  NutritionFoodCategory,
  NutritionFoodStatus,
  PrismaClient,
} from '@prisma/client';
import { calculateDogAtwaterEnergyPer100g } from '../src/domain/recipe-designer/dog-atwater-energy';

const DEFAULT_JSON_PATH = 'reports/dog-atwater-food-mapping-audit.json';
const DEFAULT_MARKDOWN_PATH =
  '../docs/reports/2026-05-26-dog-atwater-food-mapping-audit.md';

interface AuditRow {
  ingredientId: string;
  ingredientName: string;
  mappingId: string;
  nutritionFoodId: string;
  nutritionFoodName: string;
  displayNameZh: string | null;
  dataSource: string;
  category: string;
  status: string;
  isPrimary: boolean;
  energyKcalPer100g: number | null;
  nfeGPer100g: number | null;
  missingFields: string[];
  invalidReasons: string[];
  issueCodes: string[];
}

function parseArgs(argv: string[]) {
  const args = new Set(argv);
  return {
    check: args.has('--check'),
    jsonPath: getFlagValue(argv, '--json') ?? DEFAULT_JSON_PATH,
    markdownPath: getFlagValue(argv, '--md') ?? DEFAULT_MARKDOWN_PATH,
  };
}

function getFlagValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1 || index + 1 >= argv.length) {
    return null;
  }
  return argv[index + 1];
}

function ensureParentDirectory(filePath: string) {
  mkdirSync(dirname(resolve(filePath)), { recursive: true });
}

function formatNumber(value: number | null) {
  return value === null ? '' : value.toFixed(4);
}

function buildMarkdown(rows: AuditRow[]) {
  const failedRows = rows.filter((row) => row.issueCodes.length > 0);
  const lines = [
    '# Dog Atwater Food Mapping Audit',
    '',
    `Generated: 2026-05-26`,
    '',
    `Mapped FOOD profiles: ${rows.length}`,
    `Profiles requiring action: ${failedRows.length}`,
    '',
    '## Gate',
    '',
    'A FOOD ingredient mapping passes only when its nutrition profile is VERIFIED, not categorized as SUPPLEMENT, and has moisture, crude protein, crude fat, ash, and fiber values that produce a valid unmodified Atwater ME value: 4 * protein + 9 * fat + 4 * NFE.',
    '',
  ];

  if (failedRows.length === 0) {
    lines.push('No action items found.');
    return lines.join('\n');
  }

  lines.push('## Action Items', '');
  lines.push(
    [
      '| Ingredient | Profile | Source | Primary | Issues | Missing Fields | Invalid Reasons | Dog Atwater kcal/100g |',
      '| --- | --- | --- | --- | --- | --- | --- | ---: |',
    ].join('\n'),
  );

  for (const row of failedRows) {
    lines.push(
      [
        escapeMarkdown(row.ingredientName),
        escapeMarkdown(row.displayNameZh ?? row.nutritionFoodName),
        escapeMarkdown(row.dataSource),
        row.isPrimary ? 'yes' : 'no',
        row.issueCodes.join(', '),
        row.missingFields.join(', '),
        row.invalidReasons.join(', '),
        formatNumber(row.energyKcalPer100g),
      ]
        .map((cell) => ` ${cell} `)
        .join('|')
        .replace(/^/, '|')
        .replace(/$/, '|'),
    );
  }

  return lines.join('\n');
}

function escapeMarkdown(value: string) {
  return value.replace(/\|/g, '\\|');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const mappings = await prisma.nutritionFoodMapping.findMany({
      where: {
        ingredient: {
          type: IngredientType.FOOD,
        },
      },
      include: {
        ingredient: {
          select: {
            id: true,
            name: true,
          },
        },
        nutritionFood: {
          select: {
            id: true,
            name: true,
            displayNameZh: true,
            dataSource: true,
            category: true,
            status: true,
            nutritionData: true,
          },
        },
      },
      orderBy: [
        { ingredient: { name: 'asc' } },
        { isPrimary: 'desc' },
        { nutritionFood: { displayNameZh: 'asc' } },
      ],
    });

    const rows: AuditRow[] = mappings.map((mapping) => {
      const calculation = calculateDogAtwaterEnergyPer100g(
        mapping.nutritionFood.nutritionData as any,
      );
      const issueCodes: string[] = [];

      if (mapping.nutritionFood.status !== NutritionFoodStatus.VERIFIED) {
        issueCodes.push('NUTRITION_PROFILE_NOT_VERIFIED');
      }

      if (mapping.nutritionFood.category === NutritionFoodCategory.SUPPLEMENT) {
        issueCodes.push('FOOD_INGREDIENT_MAPPED_TO_SUPPLEMENT_PROFILE');
      }

      if (calculation.energyKcalPer100g === null) {
        issueCodes.push('DOG_ATWATER_ENERGY_UNAVAILABLE');
      }

      return {
        ingredientId: mapping.ingredient.id,
        ingredientName: mapping.ingredient.name,
        mappingId: mapping.id,
        nutritionFoodId: mapping.nutritionFood.id,
        nutritionFoodName: mapping.nutritionFood.name,
        displayNameZh: mapping.nutritionFood.displayNameZh,
        dataSource: mapping.nutritionFood.dataSource,
        category: mapping.nutritionFood.category,
        status: mapping.nutritionFood.status,
        isPrimary: mapping.isPrimary,
        energyKcalPer100g: calculation.energyKcalPer100g,
        nfeGPer100g: calculation.nfeGPer100g,
        missingFields: calculation.missingFields,
        invalidReasons: calculation.invalidReasons,
        issueCodes,
      };
    });

    const failedRows = rows.filter((row) => row.issueCodes.length > 0);
    const jsonReport = {
      generatedAt: '2026-05-26',
      totalMappedFoodProfiles: rows.length,
      actionItemCount: failedRows.length,
      actionItems: failedRows,
      rows,
    };

    ensureParentDirectory(args.jsonPath);
    writeFileSync(args.jsonPath, `${JSON.stringify(jsonReport, null, 2)}\n`);

    ensureParentDirectory(args.markdownPath);
    writeFileSync(args.markdownPath, `${buildMarkdown(rows)}\n`);

    console.log(
      `Dog Atwater FOOD mapping audit: ${failedRows.length}/${rows.length} profiles require action.`,
    );
    console.log(`JSON report: ${resolve(args.jsonPath)}`);
    console.log(`Markdown report: ${resolve(args.markdownPath)}`);

    if (args.check && failedRows.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
