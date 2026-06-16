import {
  collectDatabaseAlignmentSnapshot,
  compareDatabaseAlignmentSnapshots,
  type DatabaseAlignmentPrismaClient,
  type DatabaseAlignmentSnapshot,
} from 'src/application/standard-ingredient-import/db-alignment';

type SnapshotOverrides = Partial<
  Omit<DatabaseAlignmentSnapshot, 'migrations' | 'criticalDataHashes'>
> & {
  migrations?: string[];
  criticalDataHashes?: Partial<DatabaseAlignmentSnapshot['criticalDataHashes']>;
};

const makeSnapshot = (
  overrides: SnapshotOverrides = {},
): DatabaseAlignmentSnapshot => ({
  databaseLabel: overrides.databaseLabel ?? 'local-dev',
  collectedAt: overrides.collectedAt ?? '2026-06-16T00:00:00.000Z',
  migrations: (
    overrides.migrations ?? ['202606010001_a', '202606020001_b']
  ).map((migrationName) => ({
    migrationName,
    checksum: `${migrationName}:checksum`,
    finishedAt: '2026-06-16T00:00:00.000Z',
  })),
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
  it('includes DB nutrient definitions in the critical nutrient alias hash', async () => {
    const firstPrisma = makePrismaFixtureWithNutrientDefinitions([
      nutrientDefinition({ code: 'calcium', sortOrder: 10 }),
    ]);
    const secondPrisma = makePrismaFixtureWithNutrientDefinitions([
      nutrientDefinition({ code: 'calcium', sortOrder: 10 }),
      nutrientDefinition({ code: 'phosphorus', sortOrder: 20 }),
    ]);

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

function makePrismaFixtureWithNutrientDefinitions(
  nutrientDefinitions: unknown[],
): {
  client: DatabaseAlignmentPrismaClient;
  nutrientDefinitionFindMany: jest.Mock;
  writeSpies: {
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    nutritionNutrientDefinitionCreate: jest.Mock;
  };
} {
  const nutrientDefinitionFindMany = jest
    .fn()
    .mockResolvedValue(nutrientDefinitions);
  const writeSpies = {
    $executeRaw: jest.fn(),
    $executeRawUnsafe: jest.fn(),
    nutritionNutrientDefinitionCreate: jest.fn(),
  };
  const clientWithWriteSpies = {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        migration_name: '202606010001_a',
        checksum: 'migration:checksum',
        finished_at: '2026-06-16T00:00:00.000Z',
      },
    ]),
    $executeRaw: writeSpies.$executeRaw,
    $executeRawUnsafe: writeSpies.$executeRawUnsafe,
    nutritionStandardVersion: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    nutritionStandardEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    nutritionNutrientDefinition: {
      findMany: nutrientDefinitionFindMany,
      create: writeSpies.nutritionNutrientDefinitionCreate,
    },
    ingredientTag: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const client: DatabaseAlignmentPrismaClient = clientWithWriteSpies;

  return {
    client,
    nutrientDefinitionFindMany,
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
