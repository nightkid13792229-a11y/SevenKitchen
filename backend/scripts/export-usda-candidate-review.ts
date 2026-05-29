import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  IngredientType,
  NutritionCandidateStatus,
  PrismaClient,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import {
  buildUsdaCandidateReviewRows,
  usdaCandidateReviewRowsToCsv,
  type UsdaCandidateReviewInput,
} from '../src/domain/nutrition-governance/usda-candidate-review';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置。示例: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sevenkitchen npm run review:usda-candidates',
    );
  }

  const outputPath = resolveOutputPath(process.argv.slice(2));
  const ingredients = await prisma.ingredient.findMany({
    where: { type: IngredientType.FOOD },
    select: {
      id: true,
      name: true,
      nutritionCandidates: {
        where: {
          status: NutritionCandidateStatus.CANDIDATE,
          sourceRecord: { sourceType: 'USDA' },
        },
        select: {
          id: true,
          confidence: true,
          score: true,
          normalizedNutrition: true,
          sourceRecord: {
            select: {
              sourceKey: true,
              foodName: true,
              foodNameEn: true,
              dataType: true,
              category: true,
            },
          },
        },
        orderBy: [{ score: 'desc' }, { confidence: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows = buildUsdaCandidateReviewRows(
    ingredients.map((ingredient) => ({
      ingredient: {
        id: ingredient.id,
        name: ingredient.name,
      },
      candidates: ingredient.nutritionCandidates,
    })) satisfies UsdaCandidateReviewInput[],
  );
  const csv = usdaCandidateReviewRowsToCsv(rows);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${csv}\n`, 'utf8');

  const lowRiskCount = rows.filter((row) => row.riskLevel === 'LOW').length;
  const mediumRiskCount = rows.filter(
    (row) => row.riskLevel === 'MEDIUM',
  ).length;
  const highRiskCount = rows.filter((row) => row.riskLevel === 'HIGH').length;
  const noCandidateCount = rows.filter((row) =>
    row.riskFlags.includes('NO_CANDIDATE'),
  ).length;

  console.log('USDA candidate review export');
  console.log(`扫描食材数: ${rows.length}`);
  console.log(`低风险可优先确认: ${lowRiskCount}`);
  console.log(`中风险需复核: ${mediumRiskCount}`);
  console.log(`高风险/需换候选或 CFCT: ${highRiskCount}`);
  console.log(`无 USDA 候选: ${noCandidateCount}`);
  console.log(`报告已写入: ${outputPath}`);
}

function resolveOutputPath(args: string[]): string {
  const outIndex = args.indexOf('--out');
  const explicitOutputPath =
    outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : null;

  return resolve(
    process.cwd(),
    explicitOutputPath ||
      process.env.USDA_CANDIDATE_REVIEW_REPORT ||
      'reports/usda-candidate-review.csv',
  );
}

main()
  .catch((error) => {
    console.error('[review] Failed to export USDA candidate review:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
