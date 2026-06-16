import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  validateIngredientImportManifest,
  type IngredientImportManifest,
} from './ingredient-import-manifest';
import type { LocalIngredientImportAudit } from './local-ingredient-import';

export type ProductionPackageErrorCode =
  | 'LOCAL_IMPORT_AUDIT_REQUIRED'
  | ReturnType<typeof validateIngredientImportManifest>['errors'][number]['code'];

export class ProductionPackageError extends Error {
  constructor(
    public readonly code: ProductionPackageErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProductionPackageError';
  }
}

export interface ProductionMigrationPackageFiles {
  manifestJson: string;
  reviewSummary: string;
  upSql: string;
  downSql: string;
  sourceAuditJson: string;
  unitAuditJson: string;
  'manifest.json': string;
  'review-summary.md': string;
  'up.sql': string;
  'down.sql': string;
  'source-audit.json': string;
  'unit-audit.json': string;
}

export type ProductionMigrationPackageFileName =
  | 'manifest.json'
  | 'review-summary.md'
  | 'up.sql'
  | 'down.sql'
  | 'source-audit.json'
  | 'unit-audit.json';

export interface ProductionMigrationPackageResult {
  outputDir: string;
  files: ProductionMigrationPackageFiles;
}

export interface ProductionPackageFindManyDelegate {
  findMany(args: unknown): Promise<Array<Record<string, unknown>>>;
}

export interface ProductionPackagePrismaClient {
  ingredient: ProductionPackageFindManyDelegate;
  nutritionFood: ProductionPackageFindManyDelegate;
  nutritionFoodMapping: ProductionPackageFindManyDelegate;
  ingredientTagAssignment: ProductionPackageFindManyDelegate;
  procurementSku: ProductionPackageFindManyDelegate;
}

export interface BuildProductionMigrationPackageInput {
  prisma: ProductionPackagePrismaClient;
  manifest: IngredientImportManifest;
  localImportAudit: LocalIngredientImportAudit | null;
  outputDir: string;
  writePackageFile?: (
    outputDir: string,
    fileName: ProductionMigrationPackageFileName,
    body: string,
  ) => Promise<void>;
}

interface PackageRows {
  ingredients: Array<Record<string, unknown>>;
  nutritionFoods: Array<Record<string, unknown>>;
  nutritionFoodMappings: Array<Record<string, unknown>>;
  ingredientTagAssignments: Array<Record<string, unknown>>;
  procurementSkus: Array<Record<string, unknown>>;
}

const PACKAGE_TABLES: Array<{
  key: keyof PackageRows;
  tableName: string;
  auditKey: keyof Pick<
    LocalIngredientImportAudit,
    | 'ingredientIds'
    | 'nutritionFoodIds'
    | 'nutritionFoodMappingIds'
    | 'ingredientTagAssignmentIds'
    | 'procurementSkuIds'
  >;
}> = [
  { key: 'ingredients', tableName: 'ingredient', auditKey: 'ingredientIds' },
  {
    key: 'nutritionFoods',
    tableName: 'nutrition_food',
    auditKey: 'nutritionFoodIds',
  },
  {
    key: 'nutritionFoodMappings',
    tableName: 'nutrition_food_mapping',
    auditKey: 'nutritionFoodMappingIds',
  },
  {
    key: 'ingredientTagAssignments',
    tableName: 'ingredient_tag_assignment',
    auditKey: 'ingredientTagAssignmentIds',
  },
  {
    key: 'procurementSkus',
    tableName: 'procurement_sku',
    auditKey: 'procurementSkuIds',
  },
];

export async function buildProductionMigrationPackage(
  input: BuildProductionMigrationPackageInput,
): Promise<ProductionMigrationPackageResult> {
  assertLocalAudit(input.localImportAudit);
  assertManifestValid(input.manifest);

  const rows = await collectPackageRows(input.prisma, input.localImportAudit);
  const fileBodies = buildPackageFiles(input.manifest, input.localImportAudit, rows);
  const writePackageFile = input.writePackageFile ?? writeFileToOutputDir;

  await Promise.all(
    ([
      ['manifest.json', fileBodies.manifestJson],
      ['review-summary.md', fileBodies.reviewSummary],
      ['up.sql', fileBodies.upSql],
      ['down.sql', fileBodies.downSql],
      ['source-audit.json', fileBodies.sourceAuditJson],
      ['unit-audit.json', fileBodies.unitAuditJson],
    ] as Array<[ProductionMigrationPackageFileName, string]>).map(
      ([fileName, body]) => writePackageFile(input.outputDir, fileName, body),
    ),
  );

  return {
    outputDir: input.outputDir,
    files: fileBodies,
  };
}

function assertLocalAudit(
  localImportAudit: LocalIngredientImportAudit | null,
): asserts localImportAudit is LocalIngredientImportAudit {
  if (localImportAudit) {
    return;
  }

  throw new ProductionPackageError(
    'LOCAL_IMPORT_AUDIT_REQUIRED',
    'Production package export requires a local import audit.',
  );
}

function assertManifestValid(manifest: IngredientImportManifest): void {
  const validation = validateIngredientImportManifest(manifest);
  if (validation.ok) {
    return;
  }

  const firstError = validation.errors[0];
  throw new ProductionPackageError(
    firstError.code,
    firstError.message,
    validation.errors,
  );
}

async function collectPackageRows(
  prisma: ProductionPackagePrismaClient,
  audit: LocalIngredientImportAudit,
): Promise<PackageRows> {
  const [
    ingredients,
    nutritionFoods,
    nutritionFoodMappings,
    ingredientTagAssignments,
    procurementSkus,
  ] = await Promise.all([
    findRowsByIds(prisma.ingredient, audit.ingredientIds),
    findRowsByIds(prisma.nutritionFood, audit.nutritionFoodIds),
    findRowsByIds(prisma.nutritionFoodMapping, audit.nutritionFoodMappingIds),
    findRowsByIds(
      prisma.ingredientTagAssignment,
      audit.ingredientTagAssignmentIds,
    ),
    findRowsByIds(prisma.procurementSku, audit.procurementSkuIds),
  ]);

  return {
    ingredients,
    nutritionFoods,
    nutritionFoodMappings,
    ingredientTagAssignments,
    procurementSkus,
  };
}

async function findRowsByIds(
  delegate: ProductionPackageFindManyDelegate,
  ids: string[],
): Promise<Array<Record<string, unknown>>> {
  if (ids.length === 0) {
    return [];
  }

  const idSet = new Set(ids);
  const rows = await delegate.findMany({
    where: {
      id: { in: ids },
    },
    orderBy: {
      id: 'asc',
    },
  });

  return rows
    .filter((row) => typeof row.id === 'string' && idSet.has(row.id))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function buildPackageFiles(
  manifest: IngredientImportManifest,
  audit: LocalIngredientImportAudit,
  rows: PackageRows,
): ProductionMigrationPackageFiles {
  const manifestJson = json({
    packageVersion: 1,
    scope: 'new-standard-ingredient-records-only',
    wholeDatabaseMigration: false,
    ingredientType: manifest.ingredient.type,
    ingredientName: manifest.ingredient.name,
    localImportAudit: {
      createdAt: audit.createdAt,
      alignmentId: audit.alignmentId,
      manifestHash: audit.manifestHash,
    },
    recordCounts: recordCounts(rows),
    ids: {
      ingredientIds: audit.ingredientIds,
      nutritionFoodIds: audit.nutritionFoodIds,
      nutritionFoodMappingIds: audit.nutritionFoodMappingIds,
      ingredientTagAssignmentIds: audit.ingredientTagAssignmentIds,
      procurementSkuIds: audit.procurementSkuIds,
    },
  });
  const reviewSummary = buildReviewSummary(manifest, audit, rows);
  const upSql = buildUpSql(rows);
  const downSql = buildDownSql(audit);
  const sourceAuditJson = json({
    sourceCandidates: manifest.sourceCandidates ?? [],
    nutritionAudits: audit.nutritionAudits.map((nutritionAudit) => ({
      profileId: nutritionAudit.profileId,
      essentialCoveragePercent: nutritionAudit.essentialCoveragePercent,
    })),
  });
  const unitAuditJson = json({
    nutritionAudits: audit.nutritionAudits.map((nutritionAudit) => ({
      profileId: nutritionAudit.profileId,
      blockingIssues: nutritionAudit.blockingIssues,
      reviewIssues: nutritionAudit.reviewIssues,
    })),
  });

  return {
    manifestJson,
    reviewSummary,
    upSql,
    downSql,
    sourceAuditJson,
    unitAuditJson,
    'manifest.json': manifestJson,
    'review-summary.md': reviewSummary,
    'up.sql': upSql,
    'down.sql': downSql,
    'source-audit.json': sourceAuditJson,
    'unit-audit.json': unitAuditJson,
  };
}

function recordCounts(rows: PackageRows): Record<string, number> {
  return Object.fromEntries(
    PACKAGE_TABLES.map((table) => [table.tableName, rows[table.key].length]),
  );
}

function buildReviewSummary(
  manifest: IngredientImportManifest,
  audit: LocalIngredientImportAudit,
  rows: PackageRows,
): string {
  const coverage = audit.nutritionAudits.length
    ? audit.nutritionAudits
        .map(
          (nutritionAudit) =>
            `${nutritionAudit.profileId}: ${round(
              nutritionAudit.essentialCoveragePercent,
            )}%`,
        )
        .join(', ')
    : 'not applicable';
  const states = new Set(
    (manifest.nutritionProfiles ?? [])
      .map((profile) => profile.preparationState)
      .filter((state): state is string => Boolean(state)),
  );
  const rawCookedPair =
    states.has('raw') && states.has('cooked') ? 'present' : 'not complete';
  const unitAudit = audit.nutritionAudits.some(
    (nutritionAudit) =>
      nutritionAudit.blockingIssues.length > 0 ||
      nutritionAudit.reviewIssues.length > 0,
  )
    ? 'review issues present'
    : 'passed';
  const supplementEvidence =
    manifest.ingredient.type === 'SUPPLEMENT'
      ? hasSupplementEvidence(manifest)
        ? 'present'
        : 'missing'
      : 'not applicable';

  return [
    `# Standard Ingredient Production Package`,
    ``,
    `Ingredient: ${manifest.ingredient.name}`,
    `Type: ${manifest.ingredient.type}`,
    `Scope: newly added ingredient-related records only`,
    `Whole database migration: forbidden`,
    `Record counts: ${JSON.stringify(recordCounts(rows))}`,
    `Essential coverage: ${coverage}`,
    `Raw/cooked pair: ${rawCookedPair}`,
    `Unit audit: ${unitAudit}`,
    `Supplement evidence: ${supplementEvidence}`,
    ``,
  ].join('\n');
}

function hasSupplementEvidence(manifest: IngredientImportManifest): boolean {
  return (
    (manifest.packageEvidence?.packageImages?.length ?? 0) > 0 ||
    (manifest.packageEvidence?.labelSources?.length ?? 0) > 0
  );
}

function buildUpSql(rows: PackageRows): string {
  const statements = [
    '-- SevenKitchen standard ingredient package',
    '-- Scope: newly added ingredient-related records only',
    '-- Whole database migration: forbidden',
    '',
  ];

  for (const table of PACKAGE_TABLES) {
    for (const row of rows[table.key]) {
      statements.push(insertSql(table.tableName, row));
    }
  }

  return `${statements.join('\n')}\n`;
}

function buildDownSql(audit: LocalIngredientImportAudit): string {
  const statements = [
    '-- SevenKitchen standard ingredient package rollback',
    '-- Scope: records listed in the package manifest only',
    '',
  ];

  for (const table of [...PACKAGE_TABLES].reverse()) {
    const ids = audit[table.auditKey];
    if (ids.length === 0) {
      continue;
    }

    statements.push(
      `DELETE FROM ${table.tableName} WHERE id IN (${ids
        .map((id) => sqlLiteral(id))
        .join(', ')});`,
    );
  }

  return `${statements.join('\n')}\n`;
}

function insertSql(tableName: string, row: Record<string, unknown>): string {
  const columns = Object.keys(row).sort();
  return `INSERT INTO ${tableName} (${columns
    .map((column) => snakeCase(column))
    .join(', ')}) VALUES (${columns.map((column) => sqlLiteral(row[column])).join(', ')});`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (value instanceof Date) {
    return sqlLiteral(value.toISOString());
  }
  if (typeof value === 'object') {
    return sqlLiteral(JSON.stringify(value));
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

async function writeFileToOutputDir(
  outputDir: string,
  fileName: ProductionMigrationPackageFileName,
  body: string,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, fileName), body, 'utf8');
}
