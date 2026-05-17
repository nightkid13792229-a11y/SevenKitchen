import { PrismaClient } from '@prisma/client';
import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_VERSION,
} from '../src/application/nutrition-standard/fediaf-2025-dog.data';
import {
  auditFediaf2025DogStandardSnapshot,
  type Fediaf2025DogAuditEntry,
} from '../src/application/nutrition-standard/fediaf-2025-dog-audit';

const prisma = new PrismaClient();

async function buildSnapshot() {
  const version = await prisma.nutritionStandardVersion.findUnique({
    where: { code: FEDIAF_2025_DOG_STANDARD_VERSION.code },
    select: {
      code: true,
      standardCode: true,
      species: true,
      importBatch: true,
      importStatus: true,
      isActive: true,
      entries: {
        select: {
          sourceTable: true,
          sourceType: true,
          pdfPage: true,
          species: true,
          lifeStage: true,
          basis: true,
          unit: true,
          minValue: true,
          maxValue: true,
          recommendedValue: true,
          maxType: true,
          nutrient: {
            select: { code: true },
          },
        },
        orderBy: [
          { sourceTable: 'asc' },
          { lifeStage: 'asc' },
          { basis: 'asc' },
          { nutrient: { sortOrder: 'asc' } },
        ],
      },
    },
  });

  const nutrientCount = await prisma.nutritionNutrientDefinition.count({
    where: {
      code: {
        in: FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => nutrient.code),
      },
    },
  });

  return {
    version: version
      ? {
          code: version.code,
          standardCode: version.standardCode,
          species: version.species,
          importBatch: version.importBatch,
          importStatus: version.importStatus,
          isActive: version.isActive,
        }
      : null,
    nutrientCount,
    entries:
      version?.entries.map(
        (entry): Fediaf2025DogAuditEntry => ({
          nutrientCode: entry.nutrient.code,
          sourceTable:
            entry.sourceTable as Fediaf2025DogAuditEntry['sourceTable'],
          sourceType: entry.sourceType,
          pdfPage: entry.pdfPage,
          species: entry.species,
          lifeStage: entry.lifeStage,
          basis: entry.basis,
          unit: entry.unit,
          minValue: entry.minValue,
          maxValue: entry.maxValue,
          recommendedValue: entry.recommendedValue,
          maxType: entry.maxType,
        }),
      ) ?? [],
  };
}

async function main() {
  console.log('[audit] FEDIAF 2025 dog standard import audit');
  console.log(`[audit] Version code: ${FEDIAF_2025_DOG_STANDARD_VERSION.code}`);

  const snapshot = await buildSnapshot();
  const report = auditFediaf2025DogStandardSnapshot(snapshot);

  console.log(
    `[audit] Version: ${snapshot.version ? 'found' : 'missing'}, nutrients: ${
      snapshot.nutrientCount
    }/${report.summary.nutrientCount}, entries: ${snapshot.entries.length}/${
      report.summary.entryCount
    }`,
  );
  console.table(report.summary.tableCounts);

  if (report.ok) {
    console.log(
      '[audit] PASS: FEDIAF 2025 dog standard import matches the approved seed summary and spot checks.',
    );
    return;
  }

  console.error('[audit] FAIL: FEDIAF 2025 dog standard import did not pass.');
  for (const failure of report.failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    if (error && typeof error === 'object' && error.code === 'P2021') {
      console.error(
        '[audit] FAIL: nutrition standard tables are missing. Run Prisma migrations before seeding and auditing FEDIAF 2025 dog standards.',
      );
      process.exitCode = 1;
      return;
    }

    console.error(
      '[audit] Failed to audit FEDIAF 2025 dog standard import. Make sure Prisma migrations have been applied before running the seed and audit scripts.',
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
