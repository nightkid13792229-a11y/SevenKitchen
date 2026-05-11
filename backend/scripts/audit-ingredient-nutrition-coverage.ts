import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionCandidateStatus,
  PrismaClient,
  SupplementNutritionDraftStatus,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  buildIngredientNutritionCoverageRows,
  ingredientNutritionCoverageRowsToCsv,
  type AuditedIngredientNutritionInput,
  type AuditedIngredientType,
} from '../src/domain/nutrition-governance/ingredient-nutrition-coverage-audit';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。可使用 ENV_FILE=.env.production npm run audit:ingredient-nutrition-coverage',
    );
  }

  const outputPath = resolveOutputPath(process.argv.slice(2));
  const ingredients = await prisma.ingredient.findMany({
    where: {
      type: {
        in: [IngredientType.FOOD, IngredientType.SUPPLEMENT],
      },
    },
    select: {
      id: true,
      name: true,
      type: true,
      nutritionProfile: true,
      nutritionCandidates: {
        where: { status: NutritionCandidateStatus.CANDIDATE },
        select: {
          confidence: true,
          score: true,
          sourceRecord: {
            select: {
              sourceType: true,
              foodName: true,
              sourceKey: true,
            },
          },
        },
      },
      supplementNutritionDrafts: {
        where: { status: SupplementNutritionDraftStatus.DRAFT },
        select: {
          status: true,
          missingFields: true,
        },
      },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  const rows = buildIngredientNutritionCoverageRows(
    ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      type: toAuditedIngredientType(ingredient.type),
      nutritionProfile: ingredient.nutritionProfile,
      nutritionCandidates: ingredient.nutritionCandidates,
      supplementNutritionDrafts: ingredient.supplementNutritionDrafts,
    })) satisfies AuditedIngredientNutritionInput[],
  );
  const csv = ingredientNutritionCoverageRowsToCsv(rows);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${csv}\n`, 'utf8');

  const highPriorityCount = rows.filter((row) => row.priority === 'HIGH').length;
  const mediumPriorityCount = rows.filter((row) => row.priority === 'MEDIUM').length;
  const lowPriorityCount = rows.filter((row) => row.priority === 'LOW').length;

  console.log('Ingredient nutrition coverage audit');
  console.log(`扫描原料数: ${rows.length}`);
  console.log(`高优先级: ${highPriorityCount}`);
  console.log(`中优先级: ${mediumPriorityCount}`);
  console.log(`低优先级: ${lowPriorityCount}`);
  console.log(`报告已写入: ${outputPath}`);
}

function toAuditedIngredientType(type: IngredientType): AuditedIngredientType {
  if (type === IngredientType.FOOD || type === IngredientType.SUPPLEMENT) {
    return type;
  }

  throw new Error(`Unsupported ingredient type in nutrition coverage audit: ${type}`);
}

function resolveOutputPath(args: string[]): string {
  const outIndex = args.indexOf('--out');
  const explicitOutputPath =
    outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : null;

  return resolve(
    process.cwd(),
    explicitOutputPath ||
      process.env.INGREDIENT_NUTRITION_COVERAGE_REPORT ||
      'reports/ingredient-nutrition-coverage.csv',
  );
}

main()
  .catch((error) => {
    console.error('[audit] Failed to audit ingredient nutrition coverage:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
