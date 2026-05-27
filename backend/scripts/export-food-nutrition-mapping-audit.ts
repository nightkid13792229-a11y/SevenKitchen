import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { IngredientType, PrismaClient } from '@prisma/client';

import { buildFoodNutritionMappingAudit } from '../src/domain/nutrition-governance/food-nutrition-mapping-audit';

const DEFAULT_OUTPUT_PATH = 'reports/food-nutrition-mapping-audit.json';

interface ParsedArgs {
  outputPath: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const ingredients = await prisma.ingredient.findMany({
      where: { type: IngredientType.FOOD },
      select: {
        id: true,
        name: true,
        nutritionFoodMappings: {
          select: {
            isPrimary: true,
            yieldRate: true,
            notes: true,
            nutritionFood: {
              select: {
                id: true,
                name: true,
                nameEn: true,
                displayNameZh: true,
                dataSource: true,
                externalId: true,
                status: true,
                preparationState: true,
                preparationStateLabel: true,
                ediblePortionLabel: true,
                processingLabel: true,
                nutritionData: true,
                verifiedAt: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { nutritionFood: { name: 'asc' } }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const audit = buildFoodNutritionMappingAudit(
      ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        mappings: ingredient.nutritionFoodMappings.map((mapping) => ({
          isPrimary: mapping.isPrimary,
          yieldRate: mapping.yieldRate,
          notes: mapping.notes,
          nutritionFood: mapping.nutritionFood,
        })),
      })),
    );
    const output = {
      generatedAt: new Date().toISOString(),
      scope: 'IngredientType.FOOD',
      ingredientCount: ingredients.length,
      mappingCount: audit.mappingRows.length,
      nutritionFoodCount: audit.completenessRows.length,
      highRiskIngredientCount: audit.ingredientOverviewRows.filter(
        (row) => row.overallRiskLevel === 'HIGH',
      ).length,
      mediumRiskIngredientCount: audit.ingredientOverviewRows.filter(
        (row) => row.overallRiskLevel === 'MEDIUM',
      ).length,
      sharedProfileCount: audit.sharedProfileRows.length,
      sheets: {
        ingredientOverviewRows: audit.ingredientOverviewRows,
        mappingRows: audit.mappingRows,
        completenessRows: audit.completenessRows,
        sharedProfileRows: audit.sharedProfileRows,
        candidateReviewRows: audit.candidateReviewRows,
        guideRows: audit.guideRows,
      },
    };

    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`);

    console.log('Food nutrition mapping audit');
    console.log(`Output: ${args.outputPath}`);
    console.log(`Ingredients: ${output.ingredientCount}`);
    console.log(`Mappings: ${output.mappingCount}`);
    console.log(`Nutrition foods: ${output.nutritionFoodCount}`);
    console.log(`High-risk ingredients: ${output.highRiskIngredientCount}`);
    console.log(`Medium-risk ingredients: ${output.mediumRiskIngredientCount}`);
    console.log(`Shared profiles: ${output.sharedProfileCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const outIndex = argv.indexOf('--out');
  const outputPath = outIndex >= 0 ? argv[outIndex + 1] : DEFAULT_OUTPUT_PATH;

  if (!outputPath) {
    throw new Error('Missing output path after --out');
  }

  return {
    outputPath: resolve(process.cwd(), outputPath),
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to export food nutrition mapping audit:', error);
    process.exit(1);
  });
}
