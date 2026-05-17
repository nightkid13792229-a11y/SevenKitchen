import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';

import {
  BREED_HEALTH_RISK_FIXTURE_SET,
  assertBreedHealthRiskImportTarget,
  buildBreedHealthRiskImportPlan,
  resolveBreedHealthRiskDatabaseUrl,
  validateBreedHealthRiskFixtureSet,
} from './import-breed-health-risks.shared';

loadEnv();
process.env.DATABASE_URL = resolveBreedHealthRiskDatabaseUrl(
  process.env.DATABASE_URL,
);

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const allowRemote = process.argv.includes('--allow-remote');

function printPlan(plan: ReturnType<typeof buildBreedHealthRiskImportPlan>) {
  console.log('');
  console.log('Breed health risk import plan');
  console.log(`- conditions: ${plan.conditions.length}`);
  console.log(`- risks: ${plan.risks.length}`);
  console.log(`- sources: ${plan.sources}`);

  if (plan.missingBreeds.length > 0) {
    console.log('');
    console.log('Missing dog breeds:');
    plan.missingBreeds.forEach((missing) => {
      console.log(`- ${missing.breedKey}: ${missing.breedNames.join(', ')}`);
    });
  }
}

async function applyImport(
  plan: ReturnType<typeof buildBreedHealthRiskImportPlan>,
) {
  await prisma.$transaction(async (tx) => {
    for (const condition of plan.conditions) {
      await tx.breedHealthCondition.upsert({
        where: { id: condition.id },
        create: {
          id: condition.id,
          nameCn: condition.nameCn,
          nameEn: condition.nameEn,
          aliases: condition.aliases,
          category: condition.category,
          summary: condition.summary,
          commonSigns: condition.commonSigns,
          screeningAdvice: condition.screeningAdvice,
          careAdvice: condition.careAdvice,
          isActive: condition.isActive,
        },
        update: {
          nameCn: condition.nameCn,
          nameEn: condition.nameEn,
          aliases: condition.aliases,
          category: condition.category,
          summary: condition.summary,
          commonSigns: condition.commonSigns,
          screeningAdvice: condition.screeningAdvice,
          careAdvice: condition.careAdvice,
          isActive: condition.isActive,
        },
      });
    }

    for (const risk of plan.risks) {
      const savedRisk = await tx.breedHealthRisk.upsert({
        where: {
          breedId_conditionId: {
            breedId: risk.breedId,
            conditionId: risk.conditionId,
          },
        },
        create: {
          id: risk.id,
          breedId: risk.breedId,
          conditionId: risk.conditionId,
          attentionPriority: risk.attentionPriority as any,
          oneLineSummary: risk.oneLineSummary,
          breedSpecificReason: risk.breedSpecificReason,
          displayOrder: risk.displayOrder,
          isPublished: risk.isPublished,
        },
        update: {
          attentionPriority: risk.attentionPriority as any,
          oneLineSummary: risk.oneLineSummary,
          breedSpecificReason: risk.breedSpecificReason,
          displayOrder: risk.displayOrder,
          isPublished: risk.isPublished,
        },
      });

      await tx.breedHealthRiskSource.deleteMany({
        where: { riskId: savedRisk.id },
      });

      await tx.breedHealthRiskSource.createMany({
        data: risk.sources.map((riskSource, index) => ({
          id: `${savedRisk.id}-source-${index + 1}`,
          riskId: savedRisk.id,
          sourceType: riskSource.sourceType as any,
          sourceName: riskSource.sourceName,
          publisher: riskSource.publisher,
          title: riskSource.title,
          url: riskSource.url,
          accessedAt: new Date(riskSource.accessedAt),
          note: riskSource.note,
        })),
      });
    }
  });
}

async function main() {
  console.log(
    shouldApply
      ? 'Applying breed health risk import...'
      : 'Dry run: breed health risk import...',
  );

  assertBreedHealthRiskImportTarget({
    shouldApply,
    allowRemote,
    databaseUrl: process.env.DATABASE_URL,
  });

  const fixtureErrors = validateBreedHealthRiskFixtureSet(
    BREED_HEALTH_RISK_FIXTURE_SET,
  );
  if (fixtureErrors.length > 0) {
    console.error('Breed health risk fixture validation failed:');
    fixtureErrors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  const breeds = await prisma.dogBreed.findMany({
    select: {
      id: true,
      name: true,
      aliases: true,
    },
  });
  const plan = buildBreedHealthRiskImportPlan(
    BREED_HEALTH_RISK_FIXTURE_SET,
    breeds,
  );

  printPlan(plan);

  if (plan.missingBreeds.length > 0) {
    console.error('');
    console.error('Import stopped because required dog breeds are missing.');
    console.error(
      'Run the dog breed seed/backfill first, then retry this import.',
    );
    process.exitCode = 1;
    return;
  }

  if (!shouldApply) {
    console.log('');
    console.log('Dry run complete. Re-run with --apply to persist changes.');
    return;
  }

  await applyImport(plan);
  console.log('');
  console.log('Breed health risk import applied successfully.');
}

main()
  .catch((error) => {
    console.error('Failed to import breed health risks:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
