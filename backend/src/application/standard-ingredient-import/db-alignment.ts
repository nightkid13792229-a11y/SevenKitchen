import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';

export interface DatabaseMigrationSnapshot {
  migrationName: string;
  checksum?: string | null;
  finishedAt?: string | null;
}

export interface DatabaseAlignmentCriticalDataHashes {
  nutritionStandards: string;
  ingredientTags: string;
  nutrientAliases: string;
}

export interface DatabaseAlignmentSnapshot {
  databaseLabel: string;
  collectedAt: string;
  migrations: DatabaseMigrationSnapshot[];
  schemaHash: string;
  criticalDataHashes: DatabaseAlignmentCriticalDataHashes;
  rowCounts: Record<string, number>;
}

export type DatabaseAlignmentIssueCode =
  | 'PRODUCTION_MISSING_LOCAL_MIGRATION'
  | 'LOCAL_MISSING_PRODUCTION_MIGRATION'
  | 'MIGRATION_CHECKSUM_MISSING'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'MIGRATION_NOT_FINISHED'
  | 'SCHEMA_HASH_MISMATCH'
  | 'NUTRITION_STANDARDS_MISMATCH'
  | 'INGREDIENT_TAGS_MISMATCH'
  | 'NUTRIENT_ALIASES_MISMATCH'
  | 'NON_CRITICAL_ROW_COUNT_MISMATCH';

export interface DatabaseAlignmentIssue {
  code: DatabaseAlignmentIssueCode;
  message: string;
  subject: string;
  localValue?: string | number | null;
  productionValue?: string | number | null;
}

export interface DatabaseAlignmentResult {
  id: string;
  checkedAt: string;
  ok: boolean;
  localDatabaseLabel: string;
  productionDatabaseLabel: string;
  blockingIssues: DatabaseAlignmentIssue[];
  warnings: DatabaseAlignmentIssue[];
}

export interface CompareDatabaseAlignmentSnapshotsInput {
  local: DatabaseAlignmentSnapshot;
  production: DatabaseAlignmentSnapshot;
  checkedAt?: string;
}

export interface DatabaseAlignmentQueryRaw {
  <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
}

export interface DatabaseAlignmentFindManyDelegate<TRecord = unknown> {
  findMany(args: unknown): Promise<TRecord[]>;
}

export interface DatabaseAlignmentCountDelegate {
  count(): Promise<number>;
}

export interface DatabaseAlignmentPrismaClient {
  $queryRaw: DatabaseAlignmentQueryRaw;
  nutritionStandardVersion: DatabaseAlignmentFindManyDelegate;
  nutritionStandardEntry: DatabaseAlignmentFindManyDelegate;
  nutritionNutrientDefinition: DatabaseAlignmentFindManyDelegate;
  ingredientTag: DatabaseAlignmentFindManyDelegate;
  order?: DatabaseAlignmentCountDelegate;
  inventoryLedgerEntry?: DatabaseAlignmentCountDelegate;
}

export interface CollectDatabaseAlignmentSnapshotOptions {
  databaseLabel: string;
  collectedAt?: string;
  schemaPrismaPath?: string;
  readSchemaFile?: (schemaPrismaPath: string) => Promise<string>;
}

interface RawPrismaMigrationRow {
  migration_name: string;
  checksum: string | null;
  finished_at: Date | string | null;
  rolled_back_at?: Date | string | null;
}

type CriticalHashKey = keyof DatabaseAlignmentCriticalDataHashes;

const CRITICAL_HASH_COMPARISONS: Array<{
  key: CriticalHashKey;
  code: DatabaseAlignmentIssueCode;
}> = [
  {
    key: 'nutritionStandards',
    code: 'NUTRITION_STANDARDS_MISMATCH',
  },
  {
    key: 'ingredientTags',
    code: 'INGREDIENT_TAGS_MISMATCH',
  },
  {
    key: 'nutrientAliases',
    code: 'NUTRIENT_ALIASES_MISMATCH',
  },
];

const NON_CRITICAL_ROW_COUNT_DELEGATES: Array<{
  tableName: string;
  delegateName: 'order' | 'inventoryLedgerEntry';
}> = [
  { tableName: 'order', delegateName: 'order' },
  {
    tableName: 'inventory_ledger_entry',
    delegateName: 'inventoryLedgerEntry',
  },
];

export function compareDatabaseAlignmentSnapshots(
  input: CompareDatabaseAlignmentSnapshotsInput,
): DatabaseAlignmentResult {
  const blockingIssues: DatabaseAlignmentIssue[] = [];
  const warnings: DatabaseAlignmentIssue[] = [];

  compareMigrationHistories(input.local, input.production, blockingIssues);
  compareSchemaHashes(input.local, input.production, blockingIssues);
  compareCriticalDataHashes(input.local, input.production, blockingIssues);
  compareRowCounts(input.local, input.production, warnings);

  return {
    id: buildAlignmentResultId(input.local, input.production),
    checkedAt:
      input.checkedAt ?? latestCollectedAt(input.local, input.production),
    ok: blockingIssues.length === 0,
    localDatabaseLabel: input.local.databaseLabel,
    productionDatabaseLabel: input.production.databaseLabel,
    blockingIssues,
    warnings,
  };
}

export async function collectDatabaseAlignmentSnapshot(
  prisma: DatabaseAlignmentPrismaClient,
  options: CollectDatabaseAlignmentSnapshotOptions,
): Promise<DatabaseAlignmentSnapshot> {
  const schemaPrismaPath =
    options.schemaPrismaPath ?? defaultSchemaPrismaPath();
  const readSchemaFile = options.readSchemaFile ?? readSchemaPrismaFile;

  const [
    migrations,
    schemaPrisma,
    nutritionStandardVersions,
    nutritionStandardEntries,
    nutritionNutrientDefinitions,
    ingredientTags,
    rowCounts,
  ] = await Promise.all([
    collectMigrationHistory(prisma),
    readSchemaFile(schemaPrismaPath),
    collectNutritionStandardVersions(prisma),
    collectNutritionStandardEntries(prisma),
    collectNutritionNutrientDefinitions(prisma),
    collectIngredientTags(prisma),
    collectNonCriticalRowCounts(prisma),
  ]);

  return {
    databaseLabel: options.databaseLabel,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
    migrations,
    schemaHash: sha256Hex(schemaPrisma),
    criticalDataHashes: {
      nutritionStandards: hashComparableValue({
        versions: nutritionStandardVersions,
        entries: nutritionStandardEntries,
      }),
      ingredientTags: hashComparableValue(ingredientTags),
      nutrientAliases: hashComparableValue({
        fieldCatalog: NUTRITION_FIELD_CATALOG,
        nutrientDefinitions: nutritionNutrientDefinitions,
      }),
    },
    rowCounts,
  };
}

export function hashDatabaseAlignmentValue(value: unknown): string {
  return hashComparableValue(value);
}

function compareMigrationHistories(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
  blockingIssues: DatabaseAlignmentIssue[],
): void {
  const localByName = migrationsByName(local.migrations);
  const productionByName = migrationsByName(production.migrations);

  compareMigrationCompletion(localByName, productionByName, blockingIssues);

  for (const migration of local.migrations) {
    const productionMigration = productionByName.get(migration.migrationName);
    if (!productionMigration) {
      blockingIssues.push({
        code: 'PRODUCTION_MISSING_LOCAL_MIGRATION',
        subject: migration.migrationName,
        message: `Production is missing local migration ${migration.migrationName}.`,
        localValue: migration.migrationName,
        productionValue: null,
      });
      continue;
    }

    if (
      !hasMigrationValue(migration.checksum) ||
      !hasMigrationValue(productionMigration.checksum)
    ) {
      blockingIssues.push({
        code: 'MIGRATION_CHECKSUM_MISSING',
        subject: migration.migrationName,
        message: `Migration ${migration.migrationName} is missing a checksum.`,
        localValue: migration.checksum ?? null,
        productionValue: productionMigration.checksum ?? null,
      });
      continue;
    }

    if (migration.checksum !== productionMigration.checksum) {
      blockingIssues.push({
        code: 'MIGRATION_CHECKSUM_MISMATCH',
        subject: migration.migrationName,
        message: `Migration ${migration.migrationName} has different checksums.`,
        localValue: migration.checksum,
        productionValue: productionMigration.checksum,
      });
    }
  }

  for (const migration of production.migrations) {
    if (!localByName.has(migration.migrationName)) {
      blockingIssues.push({
        code: 'LOCAL_MISSING_PRODUCTION_MIGRATION',
        subject: migration.migrationName,
        message: `Local is missing production migration ${migration.migrationName}.`,
        localValue: null,
        productionValue: migration.migrationName,
      });
    }
  }
}

function compareMigrationCompletion(
  localByName: Map<string, DatabaseMigrationSnapshot>,
  productionByName: Map<string, DatabaseMigrationSnapshot>,
  blockingIssues: DatabaseAlignmentIssue[],
): void {
  const migrationNames = new Set([
    ...localByName.keys(),
    ...productionByName.keys(),
  ]);

  for (const migrationName of [...migrationNames].sort()) {
    const localMigration = localByName.get(migrationName);
    const productionMigration = productionByName.get(migrationName);

    const localUnfinished =
      localMigration !== undefined &&
      !hasMigrationValue(localMigration.finishedAt);
    const productionUnfinished =
      productionMigration !== undefined &&
      !hasMigrationValue(productionMigration.finishedAt);

    if (!localUnfinished && !productionUnfinished) {
      continue;
    }

    blockingIssues.push({
      code: 'MIGRATION_NOT_FINISHED',
      subject: migrationName,
      message: `Migration ${migrationName} is not finished in local or production.`,
      localValue: localMigration?.finishedAt ?? null,
      productionValue: productionMigration?.finishedAt ?? null,
    });
  }
}

function hasMigrationValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function compareSchemaHashes(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
  blockingIssues: DatabaseAlignmentIssue[],
): void {
  if (local.schemaHash === production.schemaHash) {
    return;
  }

  blockingIssues.push({
    code: 'SCHEMA_HASH_MISMATCH',
    subject: 'schema.prisma',
    message: 'Local and production Prisma schema hashes differ.',
    localValue: local.schemaHash,
    productionValue: production.schemaHash,
  });
}

function compareCriticalDataHashes(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
  blockingIssues: DatabaseAlignmentIssue[],
): void {
  for (const comparison of CRITICAL_HASH_COMPARISONS) {
    const localValue = local.criticalDataHashes[comparison.key];
    const productionValue = production.criticalDataHashes[comparison.key];

    if (localValue === productionValue) {
      continue;
    }

    blockingIssues.push({
      code: comparison.code,
      subject: comparison.key,
      message: `Critical reference data hash differs for ${comparison.key}.`,
      localValue,
      productionValue,
    });
  }
}

function compareRowCounts(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
  warnings: DatabaseAlignmentIssue[],
): void {
  const tableNames = new Set([
    ...Object.keys(local.rowCounts),
    ...Object.keys(production.rowCounts),
  ]);

  for (const tableName of [...tableNames].sort()) {
    const localCount = local.rowCounts[tableName] ?? null;
    const productionCount = production.rowCounts[tableName] ?? null;

    if (localCount === productionCount) {
      continue;
    }

    warnings.push({
      code: 'NON_CRITICAL_ROW_COUNT_MISMATCH',
      subject: tableName,
      message: `Non-critical row count differs for ${tableName}.`,
      localValue: localCount,
      productionValue: productionCount,
    });
  }
}

async function collectMigrationHistory(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<DatabaseMigrationSnapshot[]> {
  const rows = await prisma.$queryRaw<RawPrismaMigrationRow[]>`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE rolled_back_at IS NULL
    ORDER BY migration_name ASC
  `;

  return rows
    .filter(
      (row) =>
        !hasMigrationValue(normalizeTimestamp(row.rolled_back_at ?? null)),
    )
    .map((row) => ({
      migrationName: row.migration_name,
      checksum: row.checksum,
      finishedAt: normalizeTimestamp(row.finished_at),
    }));
}

async function collectNutritionStandardVersions(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<unknown[]> {
  return prisma.nutritionStandardVersion.findMany({
    select: {
      code: true,
      standardCode: true,
      name: true,
      species: true,
      publicationMonth: true,
      sourceTitle: true,
      sourceUrl: true,
      pdfUrl: true,
      importBatch: true,
      importStatus: true,
      isActive: true,
    },
    orderBy: [{ standardCode: 'asc' }, { species: 'asc' }, { code: 'asc' }],
  });
}

async function collectNutritionStandardEntries(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<unknown[]> {
  return prisma.nutritionStandardEntry.findMany({
    select: {
      fediafName: true,
      category: true,
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
      footnoteRefs: true,
      notes: true,
      sortOrder: true,
      version: {
        select: {
          code: true,
          standardCode: true,
          species: true,
        },
      },
      nutrient: {
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
      },
    },
    orderBy: [
      { version: { code: 'asc' } },
      { nutrient: { code: 'asc' } },
      { sourceTable: 'asc' },
      { lifeStage: 'asc' },
      { basis: 'asc' },
      { unit: 'asc' },
    ],
  });
}

async function collectNutritionNutrientDefinitions(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<unknown[]> {
  return prisma.nutritionNutrientDefinition.findMany({
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
}

async function collectIngredientTags(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<unknown[]> {
  return prisma.ingredientTag.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      parentId: true,
      sort: true,
      color: true,
    },
    orderBy: [{ parentId: 'asc' }, { sort: 'asc' }, { name: 'asc' }],
  });
}

async function collectNonCriticalRowCounts(
  prisma: DatabaseAlignmentPrismaClient,
): Promise<Record<string, number>> {
  const rowCounts: Record<string, number> = {};

  await Promise.all(
    NON_CRITICAL_ROW_COUNT_DELEGATES.map(async (table) => {
      const delegate = prisma[table.delegateName];
      if (!delegate) {
        return;
      }

      rowCounts[table.tableName] = await delegate.count();
    }),
  );

  return rowCounts;
}

async function readSchemaPrismaFile(schemaPrismaPath: string): Promise<string> {
  return readFile(schemaPrismaPath, 'utf8');
}

function migrationsByName(
  migrations: DatabaseMigrationSnapshot[],
): Map<string, DatabaseMigrationSnapshot> {
  return new Map(
    migrations.map((migration) => [migration.migrationName, migration]),
  );
}

function buildAlignmentResultId(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
): string {
  return sha256Hex(
    stableStringify({
      local: comparableSnapshot(local),
      production: comparableSnapshot(production),
    }),
  ).slice(0, 12);
}

function comparableSnapshot(
  snapshot: DatabaseAlignmentSnapshot,
): Omit<DatabaseAlignmentSnapshot, 'collectedAt'> {
  return {
    databaseLabel: snapshot.databaseLabel,
    migrations: snapshot.migrations,
    schemaHash: snapshot.schemaHash,
    criticalDataHashes: snapshot.criticalDataHashes,
    rowCounts: snapshot.rowCounts,
  };
}

function hashComparableValue(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return '"__undefined__"';
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function latestCollectedAt(
  local: DatabaseAlignmentSnapshot,
  production: DatabaseAlignmentSnapshot,
): string {
  return [local.collectedAt, production.collectedAt].sort()[1];
}

function normalizeTimestamp(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function defaultSchemaPrismaPath(): string {
  const cwd = process.cwd();
  if (basename(cwd) === 'backend') {
    return join(cwd, 'prisma/schema.prisma');
  }

  return join(cwd, 'backend/prisma/schema.prisma');
}
