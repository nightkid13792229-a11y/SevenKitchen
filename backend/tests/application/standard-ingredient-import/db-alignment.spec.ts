import {
  compareDatabaseAlignmentSnapshots,
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
