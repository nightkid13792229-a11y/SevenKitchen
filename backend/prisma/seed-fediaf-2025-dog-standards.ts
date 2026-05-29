import { Prisma, PrismaClient } from '@prisma/client';
import { NUTRITION_FIELD_CATALOG } from '../src/domain/ingredient/nutrition-field-catalog';
import {
  FEDIAF_2025_DOG_NUTRIENTS,
  FEDIAF_2025_DOG_STANDARD_ENTRIES,
  FEDIAF_2025_DOG_STANDARD_VERSION,
  type FediafStandardEntrySeed,
} from '../src/application/nutrition-standard/fediaf-2025-dog.data';

const prisma = new PrismaClient();

type StandardEntryIdentityParts = {
  nutrientId: string;
  sourceTable: string;
  lifeStage: string;
  basis: string;
  unit: string;
};

const EXPECTED_SOURCE_PAGES: Record<
  FediafStandardEntrySeed['sourceTable'],
  number
> = {
  'III-3a': 15,
  'III-3b': 16,
  'III-3c': 17,
  'VII-17a': 73,
  'VII-17b': 74,
  'VII-17c': 75,
  'VII-17d': 76,
};

const EXPECTED_SOURCE_TYPES: Record<
  FediafStandardEntrySeed['sourceTable'],
  FediafStandardEntrySeed['sourceType']
> = {
  'III-3a': 'CORE_RECOMMENDATION',
  'III-3b': 'CORE_RECOMMENDATION',
  'III-3c': 'CORE_RECOMMENDATION',
  'VII-17a': 'ANNEX_7_8',
  'VII-17b': 'ANNEX_7_8',
  'VII-17c': 'ANNEX_7_8',
  'VII-17d': 'ANNEX_7_8',
};

const EXPECTED_BASES: Record<
  FediafStandardEntrySeed['sourceTable'],
  ReadonlyArray<FediafStandardEntrySeed['basis']>
> = {
  'III-3a': ['PER_100G_DRY_MATTER'],
  'III-3b': ['PER_1000_KCAL_ME'],
  'III-3c': ['PER_MJ_ME'],
  'VII-17a': ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME'],
  'VII-17b': ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME'],
  'VII-17c': ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME'],
  'VII-17d': ['PER_100G_DRY_MATTER', 'PER_1000_KCAL_ME', 'PER_MJ_ME'],
};

function standardEntryIdentity(parts: StandardEntryIdentityParts): string {
  return [
    parts.nutrientId,
    parts.sourceTable,
    parts.lifeStage,
    parts.basis,
    parts.unit,
  ].join('|');
}

function validateSeedData() {
  const errors: string[] = [];
  const nutrientCodes = new Set(
    FEDIAF_2025_DOG_NUTRIENTS.map((nutrient) => nutrient.code),
  );
  const fieldPaths = new Set<string>(
    NUTRITION_FIELD_CATALOG.map((field) => field.fieldPath),
  );

  for (const nutrient of FEDIAF_2025_DOG_NUTRIENTS) {
    if (nutrient.isDirect && !nutrient.fieldPath) {
      errors.push(`Direct nutrient is missing fieldPath: ${nutrient.code}`);
    }
    if (nutrient.fieldPath && !fieldPaths.has(nutrient.fieldPath)) {
      errors.push(
        `Nutrient ${nutrient.code} uses unknown fieldPath ${nutrient.fieldPath}`,
      );
    }
    if (nutrient.isDerived && !nutrient.expression) {
      errors.push(`Derived nutrient is missing expression: ${nutrient.code}`);
    }
  }

  const identities = new Set<string>();
  for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
    if (!nutrientCodes.has(entry.nutrientCode)) {
      errors.push(`Unknown nutrient code: ${entry.nutrientCode}`);
    }

    if (entry.species !== FEDIAF_2025_DOG_STANDARD_VERSION.species) {
      errors.push(
        `Entry species ${entry.species} does not match version species for ${entry.nutrientCode}`,
      );
    }

    if (entry.pdfPage !== EXPECTED_SOURCE_PAGES[entry.sourceTable]) {
      errors.push(
        `Wrong source page for ${entry.sourceTable}/${entry.nutrientCode}: ${entry.pdfPage}`,
      );
    }

    if (entry.sourceType !== EXPECTED_SOURCE_TYPES[entry.sourceTable]) {
      errors.push(
        `Wrong source type for ${entry.sourceTable}/${entry.nutrientCode}: ${entry.sourceType}`,
      );
    }

    if (!EXPECTED_BASES[entry.sourceTable].includes(entry.basis)) {
      errors.push(
        `Wrong basis ${entry.basis} for ${entry.sourceTable}/${entry.nutrientCode}`,
      );
    }

    const identity = [
      entry.nutrientCode,
      entry.sourceTable,
      entry.lifeStage,
      entry.basis,
      entry.unit,
    ].join('|');
    if (identities.has(identity)) {
      errors.push(`Duplicate standard entry identity: ${identity}`);
    }
    identities.add(identity);

    const hasAnyNumericValue =
      entry.minValue !== null ||
      entry.maxValue !== null ||
      entry.recommendedValue !== null;
    if (!hasAnyNumericValue && !entry.notes) {
      errors.push(
        `Entry has no numeric value and no explanatory note: ${identity}`,
      );
    }

    if (
      entry.maxType !== 'UNSPECIFIED' &&
      entry.maxValue === null &&
      !entry.notes
    ) {
      errors.push(`Entry marks maxType without maxValue or note: ${identity}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid FEDIAF 2025 dog seed data:\n${errors.join('\n')}`);
  }
}

async function main() {
  console.log('Seeding FEDIAF 2025 dog nutrition standards');
  validateSeedData();

  const result = await prisma.$transaction(
    async (tx) => {
      const version = await tx.nutritionStandardVersion.upsert({
        where: { code: FEDIAF_2025_DOG_STANDARD_VERSION.code },
        update: {
          standardCode: FEDIAF_2025_DOG_STANDARD_VERSION.standardCode,
          name: FEDIAF_2025_DOG_STANDARD_VERSION.name,
          species: FEDIAF_2025_DOG_STANDARD_VERSION.species,
          publicationMonth: FEDIAF_2025_DOG_STANDARD_VERSION.publicationMonth,
          sourceTitle: FEDIAF_2025_DOG_STANDARD_VERSION.sourceTitle,
          sourceUrl: FEDIAF_2025_DOG_STANDARD_VERSION.sourceUrl,
          pdfUrl: FEDIAF_2025_DOG_STANDARD_VERSION.pdfUrl,
          importBatch: FEDIAF_2025_DOG_STANDARD_VERSION.importBatch,
          importStatus: FEDIAF_2025_DOG_STANDARD_VERSION.importStatus,
          isActive: FEDIAF_2025_DOG_STANDARD_VERSION.isActive,
          importedAt: new Date(),
        },
        create: FEDIAF_2025_DOG_STANDARD_VERSION,
      });

      const nutrientLookup = new Map<string, string>();
      for (const nutrient of FEDIAF_2025_DOG_NUTRIENTS) {
        const expression =
          nutrient.expression === null
            ? Prisma.DbNull
            : (nutrient.expression as Prisma.InputJsonValue);
        const nutrientData = {
          ...nutrient,
          expression,
        };
        const record = await tx.nutritionNutrientDefinition.upsert({
          where: { code: nutrient.code },
          update: nutrientData,
          create: nutrientData,
        });
        nutrientLookup.set(nutrient.code, record.id);
      }

      const desiredIdentities = new Set<string>();
      for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
        const nutrientId = nutrientLookup.get(entry.nutrientCode);
        if (!nutrientId) {
          throw new Error(`Missing nutrient definition: ${entry.nutrientCode}`);
        }
        desiredIdentities.add(standardEntryIdentity({ ...entry, nutrientId }));
      }

      const existingEntries = await tx.nutritionStandardEntry.findMany({
        where: { versionId: version.id },
        select: {
          id: true,
          nutrientId: true,
          sourceTable: true,
          lifeStage: true,
          basis: true,
          unit: true,
          _count: {
            select: { reviewEvents: true },
          },
        },
      });

      const obsoleteEntries = existingEntries.filter(
        (entry) => !desiredIdentities.has(standardEntryIdentity(entry)),
      );
      const reviewedObsoleteEntries = obsoleteEntries.filter(
        (entry) => entry._count.reviewEvents > 0,
      );

      if (reviewedObsoleteEntries.length > 0) {
        throw new Error(
          [
            'Refusing to delete obsolete FEDIAF 2025 dog entries that already have review history.',
            'Create a new standard version/import batch instead of overwriting reviewed official data.',
            `Reviewed obsolete entry ids: ${reviewedObsoleteEntries
              .map((entry) => entry.id)
              .join(', ')}`,
          ].join('\n'),
        );
      }

      if (obsoleteEntries.length > 0) {
        await tx.nutritionStandardEntry.deleteMany({
          where: {
            id: { in: obsoleteEntries.map((entry) => entry.id) },
          },
        });
      }

      const tableCounts = new Map<string, number>();
      for (const entry of FEDIAF_2025_DOG_STANDARD_ENTRIES) {
        const nutrientId = nutrientLookup.get(entry.nutrientCode);
        if (!nutrientId) {
          throw new Error(`Missing nutrient definition: ${entry.nutrientCode}`);
        }

        await tx.nutritionStandardEntry.upsert({
          where: {
            versionId_nutrientId_sourceTable_lifeStage_basis_unit: {
              versionId: version.id,
              nutrientId,
              sourceTable: entry.sourceTable,
              lifeStage: entry.lifeStage,
              basis: entry.basis,
              unit: entry.unit,
            },
          },
          update: {
            fediafName: entry.fediafName,
            category: entry.category,
            sourceType: entry.sourceType,
            pdfPage: entry.pdfPage,
            species: entry.species,
            minValue: entry.minValue,
            maxValue: entry.maxValue,
            recommendedValue: entry.recommendedValue,
            maxType: entry.maxType,
            footnoteRefs: entry.footnoteRefs,
            notes: entry.notes,
            sortOrder: entry.sortOrder,
          },
          create: {
            versionId: version.id,
            nutrientId,
            fediafName: entry.fediafName,
            category: entry.category,
            sourceTable: entry.sourceTable,
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
            footnoteRefs: entry.footnoteRefs,
            notes: entry.notes,
            sortOrder: entry.sortOrder,
          },
        });

        tableCounts.set(
          entry.sourceTable,
          (tableCounts.get(entry.sourceTable) ?? 0) + 1,
        );
      }

      return {
        obsoleteDeletedCount: obsoleteEntries.length,
        existingPreservedCount: existingEntries.length - obsoleteEntries.length,
        tableCounts,
      };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  console.log(
    `Upserted ${FEDIAF_2025_DOG_STANDARD_ENTRIES.length} standard entries`,
  );
  console.log(
    `Preserved ${result.existingPreservedCount} existing entries by natural key`,
  );
  console.log(
    `Deleted ${result.obsoleteDeletedCount} obsolete unreviewed entries`,
  );
  for (const [table, count] of [...result.tableCounts.entries()].sort()) {
    console.log(`${table}: ${count}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
