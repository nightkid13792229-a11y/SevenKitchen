import {
  collectDatabaseAlignmentSnapshot,
  compareDatabaseAlignmentSnapshots,
  type DatabaseAlignmentPrismaClient,
  type DatabaseMigrationSnapshot,
  type DatabaseAlignmentSnapshot,
} from 'src/application/standard-ingredient-import/db-alignment';

type MigrationInput = string | DatabaseMigrationSnapshot;

type SnapshotOverrides = Partial<
  Omit<DatabaseAlignmentSnapshot, 'migrations' | 'criticalDataHashes'>
> & {
  migrations?: MigrationInput[];
  criticalDataHashes?: Partial<DatabaseAlignmentSnapshot['criticalDataHashes']>;
};

const makeSnapshot = (
  overrides: SnapshotOverrides = {},
): DatabaseAlignmentSnapshot => ({
  databaseLabel: overrides.databaseLabel ?? 'local-dev',
  collectedAt: overrides.collectedAt ?? '2026-06-16T00:00:00.000Z',
  migrations: (
    overrides.migrations ?? ['202606010001_a', '202606020001_b']
  ).map(toMigrationSnapshot),
  schemaHash: overrides.schemaHash ?? 'schema:v1',
  criticalDataHashes: {
    nutritionStandards:
      overrides.criticalDataHashes?.nutritionStandards ?? 'standards:v1',
    ingredientTags: overrides.criticalDataHashes?.ingredientTags ?? 'tags:v1',
    nutrientAliases:
      overrides.criticalDataHashes?.nutrientAliases ?? 'aliases:v1',
  },
  rowCounts: overrides.rowCounts ?? {
    order: 42,
    inventory_ledger_entry: 13,
  },
});

const toMigrationSnapshot = (
  migration: MigrationInput,
): DatabaseMigrationSnapshot => {
  if (typeof migration === 'string') {
    return {
      migrationName: migration,
      checksum: `${migration}:checksum`,
      finishedAt: '2026-06-16T00:00:00.000Z',
    };
  }

  return migration;
};

describe('compareDatabaseAlignmentSnapshots', () => {
  it('passes identical Prisma migration history and reference snapshots', () => {
    const local = makeSnapshot({ databaseLabel: 'local' });
    const production = makeSnapshot({ databaseLabel: 'production' });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.localDatabaseLabel).toBe('local');
    expect(result.productionDatabaseLabel).toBe('production');
    expect(result.id).toMatch(/^[a-f0-9]{12}$/);
  });

  it('fails when production does not have the same migration history', () => {
    const local = makeSnapshot({
      migrations: ['202606010001_a', '202606020001_b'],
    });
    const production = makeSnapshot({
      migrations: ['202606010001_a'],
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'PRODUCTION_MISSING_LOCAL_MIGRATION',
        subject: '202606020001_b',
      }),
    );
  });

  it('fails when local does not have a production migration', () => {
    const local = makeSnapshot({
      migrations: ['202606010001_a'],
    });
    const production = makeSnapshot({
      migrations: ['202606010001_a', '202606020001_b'],
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'LOCAL_MISSING_PRODUCTION_MIGRATION',
        subject: '202606020001_b',
      }),
    );
  });

  it('fails when schema hashes differ', () => {
    const local = makeSnapshot({ schemaHash: 'schema:v2' });
    const production = makeSnapshot({ schemaHash: 'schema:v1' });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'SCHEMA_HASH_MISMATCH',
        subject: 'schema.prisma',
      }),
    );
  });

  it('fails when matching migrations have different non-null checksums', () => {
    const local = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: 'local-checksum',
          finishedAt: '2026-06-16T00:00:00.000Z',
        },
      ],
    });
    const production = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: 'production-checksum',
          finishedAt: '2026-06-16T00:00:00.000Z',
        },
      ],
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'MIGRATION_CHECKSUM_MISMATCH',
        subject: '202606010001_a',
      }),
    );
  });

  it('fails when either matching migration checksum is missing', () => {
    const local = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: 'local-checksum',
          finishedAt: '2026-06-16T00:00:00.000Z',
        },
      ],
    });
    const production = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: null,
          finishedAt: '2026-06-16T00:00:00.000Z',
        },
      ],
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toContainEqual(
      expect.objectContaining({
        code: 'MIGRATION_CHECKSUM_MISSING',
        subject: '202606010001_a',
        localValue: 'local-checksum',
        productionValue: null,
      }),
    );
  });

  it('fails when any local or production migration is unfinished', () => {
    const local = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: 'checksum-a',
          finishedAt: null,
        },
      ],
    });
    const production = makeSnapshot({
      migrations: [
        {
          migrationName: '202606010001_a',
          checksum: 'checksum-a',
          finishedAt: '2026-06-16T00:00:00.000Z',
        },
        {
          migrationName: '202606020001_b',
          checksum: 'checksum-b',
          finishedAt: null,
        },
      ],
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'MIGRATION_NOT_FINISHED',
          subject: '202606010001_a',
        }),
        expect.objectContaining({
          code: 'LOCAL_MISSING_PRODUCTION_MIGRATION',
          subject: '202606020001_b',
        }),
        expect.objectContaining({
          code: 'MIGRATION_NOT_FINISHED',
          subject: '202606020001_b',
        }),
      ]),
    );
  });

  it('fails for critical reference data hash differences', () => {
    const local = makeSnapshot({
      criticalDataHashes: {
        nutritionStandards: 'standards:v2',
        ingredientTags: 'tags:v2',
        nutrientAliases: 'aliases:v2',
      },
    });
    const production = makeSnapshot();

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(false);
    expect(result.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NUTRITION_STANDARDS_MISMATCH',
          subject: 'nutritionStandards',
        }),
        expect.objectContaining({
          code: 'INGREDIENT_TAGS_MISMATCH',
          subject: 'ingredientTags',
        }),
        expect.objectContaining({
          code: 'NUTRIENT_ALIASES_MISMATCH',
          subject: 'nutrientAliases',
        }),
      ]),
    );
  });

  it('warns without blocking for non-critical transaction row count differences', () => {
    const local = makeSnapshot({
      rowCounts: {
        order: 42,
        inventory_ledger_entry: 13,
      },
    });
    const production = makeSnapshot({
      rowCounts: {
        order: 40,
        inventory_ledger_entry: 15,
      },
    });

    const result = compareDatabaseAlignmentSnapshots({ local, production });

    expect(result.ok).toBe(true);
    expect(result.blockingIssues).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'NON_CRITICAL_ROW_COUNT_MISMATCH',
          subject: 'order',
        }),
        expect.objectContaining({
          code: 'NON_CRITICAL_ROW_COUNT_MISMATCH',
          subject: 'inventory_ledger_entry',
        }),
      ]),
    );
  });

  it('generates the same id for the same compared snapshot contents', () => {
    const local = makeSnapshot();
    const production = makeSnapshot({ databaseLabel: 'production' });

    const first = compareDatabaseAlignmentSnapshots({ local, production });
    const second = compareDatabaseAlignmentSnapshots({ local, production });

    expect(first.id).toBe(second.id);
  });
});

describe('collectDatabaseAlignmentSnapshot', () => {
  it('normalizes migration rows from the raw query and hashes schema contents', async () => {
    const firstPrisma = makePrismaFixture({
      migrations: [
        {
          migration_name: '202606010001_a',
          checksum: 'checksum-a',
          finished_at: new Date('2026-06-16T00:00:00.000Z'),
        },
        {
          migration_name: '202606020001_b',
          checksum: 'checksum-b',
          finished_at: '2026-06-17T00:00:00.000Z',
        },
      ],
    });
    const secondPrisma = makePrismaFixture();

    const first = await collectDatabaseAlignmentSnapshot(firstPrisma.client, {
      databaseLabel: 'local',
      collectedAt: '2026-06-16T00:00:00.000Z',
      readSchemaFile: async () => 'schema-v1',
    });
    const second = await collectDatabaseAlignmentSnapshot(secondPrisma.client, {
      databaseLabel: 'local',
      collectedAt: '2026-06-16T00:00:00.000Z',
      readSchemaFile: async () => 'schema-v2',
    });

    expect(firstPrisma.queryRaw).toHaveBeenCalledTimes(1);
    expect(first.migrations).toEqual([
      {
        migrationName: '202606010001_a',
        checksum: 'checksum-a',
        finishedAt: '2026-06-16T00:00:00.000Z',
      },
      {
        migrationName: '202606020001_b',
        checksum: 'checksum-b',
        finishedAt: '2026-06-17T00:00:00.000Z',
      },
    ]);
    expect(first.schemaHash).not.toBe(second.schemaHash);
  });

  it('calls reference data selectors and optional row count delegates', async () => {
    const prisma = makePrismaFixture({
      includeRowCountDelegates: true,
    });

    const snapshot = await collectDatabaseAlignmentSnapshot(prisma.client, {
      databaseLabel: 'local',
      collectedAt: '2026-06-16T00:00:00.000Z',
      readSchemaFile: async () => 'schema',
    });

    expect(prisma.nutritionStandardVersionFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.nutritionStandardEntryFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.nutrientDefinitionFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.ingredientTagFindMany).toHaveBeenCalledTimes(1);
    expect(prisma.orderCount).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryLedgerEntryCount).toHaveBeenCalledTimes(1);
    expect(snapshot.rowCounts).toEqual({
      order: 42,
      inventory_ledger_entry: 7,
    });
  });

  it('includes DB nutrient definitions in the critical nutrient alias hash', async () => {
    const firstPrisma = makePrismaFixture({
      nutrientDefinitions: [
        nutrientDefinition({ code: 'calcium', sortOrder: 10 }),
      ],
    });
    const secondPrisma = makePrismaFixture({
      nutrientDefinitions: [
        nutrientDefinition({ code: 'calcium', sortOrder: 10 }),
        nutrientDefinition({ code: 'phosphorus', sortOrder: 20 }),
      ],
    });

    const first = await collectDatabaseAlignmentSnapshot(firstPrisma.client, {
      databaseLabel: 'local',
      collectedAt: '2026-06-16T00:00:00.000Z',
      readSchemaFile: async () => 'schema',
    });
    const second = await collectDatabaseAlignmentSnapshot(secondPrisma.client, {
      databaseLabel: 'local',
      collectedAt: '2026-06-16T00:00:00.000Z',
      readSchemaFile: async () => 'schema',
    });

    expect(firstPrisma.nutrientDefinitionFindMany).toHaveBeenCalledWith({
      select: {
        code: true,
        fieldPath: true,
        name: true,
        nameEn: true,
        category: true,
        defaultIngredientUnit: true,
        defaultStandardUnit: true,
        isDirect: true,
        isDerived: true,
        expression: true,
        sortOrder: true,
        isActive: true,
      },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
    expect(first.criticalDataHashes.nutrientAliases).not.toBe(
      second.criticalDataHashes.nutrientAliases,
    );
    expect(firstPrisma.writeSpies.$executeRaw).not.toHaveBeenCalled();
    expect(firstPrisma.writeSpies.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(
      firstPrisma.writeSpies.nutritionNutrientDefinitionCreate,
    ).not.toHaveBeenCalled();
  });
});

function makePrismaFixture(
  overrides: Partial<{
    migrations: Array<{
      migration_name: string;
      checksum: string | null;
      finished_at: Date | string | null;
    }>;
    nutrientDefinitions: unknown[];
    includeRowCountDelegates: boolean;
  }> = {},
): {
  client: DatabaseAlignmentPrismaClient;
  queryRaw: jest.Mock;
  nutritionStandardVersionFindMany: jest.Mock;
  nutritionStandardEntryFindMany: jest.Mock;
  nutrientDefinitionFindMany: jest.Mock;
  ingredientTagFindMany: jest.Mock;
  orderCount: jest.Mock;
  inventoryLedgerEntryCount: jest.Mock;
  writeSpies: {
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    nutritionNutrientDefinitionCreate: jest.Mock;
  };
} {
  const queryRaw = jest.fn().mockResolvedValue(
    overrides.migrations ?? [
      {
        migration_name: '202606010001_a',
        checksum: 'migration:checksum',
        finished_at: '2026-06-16T00:00:00.000Z',
      },
    ],
  );
  const nutritionStandardVersionFindMany = jest.fn().mockResolvedValue([]);
  const nutritionStandardEntryFindMany = jest.fn().mockResolvedValue([]);
  const nutrientDefinitionFindMany = jest
    .fn()
    .mockResolvedValue(overrides.nutrientDefinitions ?? []);
  const ingredientTagFindMany = jest.fn().mockResolvedValue([]);
  const orderCount = jest.fn().mockResolvedValue(42);
  const inventoryLedgerEntryCount = jest.fn().mockResolvedValue(7);
  const writeSpies = {
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    nutritionNutrientDefinitionCreate: jest.fn(),
  };
  const clientWithWriteSpies = {
    $queryRaw: queryRaw,
    $executeRaw: writeSpies.$executeRaw,
    $executeRawUnsafe: writeSpies.$executeRawUnsafe,
    nutritionStandardVersion: {
      findMany: nutritionStandardVersionFindMany,
    },
    nutritionStandardEntry: {
      findMany: nutritionStandardEntryFindMany,
    },
    nutritionNutrientDefinition: {
      findMany: nutrientDefinitionFindMany,
      create: writeSpies.nutritionNutrientDefinitionCreate,
    },
    ingredientTag: {
      findMany: ingredientTagFindMany,
    },
    ...(overrides.includeRowCountDelegates
      ? {
          order: {
            count: orderCount,
          },
          inventoryLedgerEntry: {
            count: inventoryLedgerEntryCount,
          },
        }
      : {}),
  };
  const client: DatabaseAlignmentPrismaClient = clientWithWriteSpies;

  return {
    client,
    queryRaw,
    nutritionStandardVersionFindMany,
    nutritionStandardEntryFindMany,
    nutrientDefinitionFindMany,
    ingredientTagFindMany,
    orderCount,
    inventoryLedgerEntryCount,
    writeSpies,
  };
}

function nutrientDefinition(
  overrides: Partial<{
    code: string;
    sortOrder: number;
  }> = {},
) {
  return {
    code: overrides.code ?? 'calcium',
    fieldPath: 'minerals.calcium',
    name: 'Calcium',
    nameEn: 'Calcium',
    category: 'MINERAL',
    defaultIngredientUnit: 'mg',
    defaultStandardUnit: 'g/1000kcal',
    isDirect: true,
    isDerived: false,
    expression: null,
    sortOrder: overrides.sortOrder ?? 10,
    isActive: true,
  };
}
