import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  auditNutritionProfileForImport,
  type NutritionImportAuditResult,
} from './nutrition-audit';
import {
  validateIngredientImportManifest,
  type IngredientImportManifest,
  type IngredientImportNutritionProfile,
  type ProcurementSkuManifest,
} from './ingredient-import-manifest';
import type { DatabaseAlignmentResult } from './db-alignment';

export type LocalIngredientImportErrorCode =
  | 'DB_ALIGNMENT_NOT_OK'
  | 'DB_ALIGNMENT_REPORT_MISMATCH'
  | 'INGREDIENT_ALREADY_EXISTS'
  | 'NUTRITION_AUDIT_BLOCKING'
  | ReturnType<typeof validateIngredientImportManifest>['errors'][number]['code'];

export class LocalIngredientImportError extends Error {
  constructor(
    public readonly code: LocalIngredientImportErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'LocalIngredientImportError';
  }
}

export interface LocalIngredientImportAudit {
  version: 1;
  createdAt: string;
  alignmentId: string;
  manifestHash: string;
  ingredientIds: string[];
  nutritionFoodIds: string[];
  nutritionFoodMappingIds: string[];
  ingredientTagAssignmentIds: string[];
  procurementSkuIds: string[];
  nutritionAudits: Array<{
    profileId: string;
    essentialCoveragePercent: number;
    blockingIssues: NutritionImportAuditResult['blockingIssues'];
    reviewIssues: NutritionImportAuditResult['reviewIssues'];
  }>;
}

export interface LocalIngredientImportResult {
  auditPath: string;
  audit: LocalIngredientImportAudit;
}

export interface StandardIngredientImportTransaction {
  ingredient: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
    update(args: unknown): Promise<{ id: string }>;
  };
  nutritionFood: {
    create(args: unknown): Promise<{ id: string }>;
  };
  nutritionFoodMapping: {
    create(args: unknown): Promise<{ id: string }>;
  };
  ingredientTagAssignment: {
    create(args: unknown): Promise<{ id: string }>;
  };
  procurementSku: {
    create(args: unknown): Promise<{ id: string }>;
  };
}

export interface StandardIngredientImportPrismaClient
  extends StandardIngredientImportTransaction {
  $transaction<T>(
    callback: (tx: StandardIngredientImportTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ApplyLocalIngredientImportInput {
  prisma: StandardIngredientImportPrismaClient;
  manifest: IngredientImportManifest;
  alignment: DatabaseAlignmentResult;
  auditOutputPath: string;
  now?: Date;
  writeAuditFile?: (
    auditOutputPath: string,
    audit: LocalIngredientImportAudit,
  ) => Promise<void>;
}

interface TransactionResult {
  ingredientIds: string[];
  nutritionFoodIds: string[];
  nutritionFoodMappingIds: string[];
  ingredientTagAssignmentIds: string[];
  procurementSkuIds: string[];
}

export async function applyLocalIngredientImport(
  input: ApplyLocalIngredientImportInput,
): Promise<LocalIngredientImportResult> {
  assertAlignment(input.manifest, input.alignment);
  assertManifestValid(input.manifest);

  const nutritionAudits = buildNutritionAudits(input.manifest);
  const existingIngredient = input.manifest.updateExistingIngredientId
    ? null
    : await input.prisma.ingredient.findFirst({
        where: {
          name: input.manifest.ingredient.name,
          brand: input.manifest.ingredient.brand ?? null,
          productModel: input.manifest.ingredient.productModel ?? null,
        },
        select: { id: true },
      });
  if (existingIngredient) {
    throw new LocalIngredientImportError(
      'INGREDIENT_ALREADY_EXISTS',
      `Ingredient ${input.manifest.ingredient.name} already exists.`,
      { ingredientId: existingIngredient.id },
    );
  }

  const transactionResult = await input.prisma.$transaction((tx) =>
    applyManifestInTransaction(tx, input.manifest),
  );
  const audit: LocalIngredientImportAudit = {
    version: 1,
    createdAt: (input.now ?? new Date()).toISOString(),
    alignmentId: input.alignment.id,
    manifestHash: sha256Stable(input.manifest),
    ...transactionResult,
    nutritionAudits,
  };

  await (input.writeAuditFile ?? writeAuditJson)(input.auditOutputPath, audit);

  return {
    auditPath: input.auditOutputPath,
    audit,
  };
}

function assertAlignment(
  manifest: IngredientImportManifest,
  alignment: DatabaseAlignmentResult,
): void {
  if (!alignment.ok) {
    throw new LocalIngredientImportError(
      'DB_ALIGNMENT_NOT_OK',
      'Local ingredient import requires passing local/production DB alignment.',
      alignment.blockingIssues,
    );
  }

  if (manifest.dbAlignmentReport?.id !== alignment.id) {
    throw new LocalIngredientImportError(
      'DB_ALIGNMENT_REPORT_MISMATCH',
      'Manifest DB alignment report id does not match the checked alignment result.',
      {
        manifestAlignmentId: manifest.dbAlignmentReport?.id ?? null,
        alignmentId: alignment.id,
      },
    );
  }
}

function assertManifestValid(manifest: IngredientImportManifest): void {
  const validation = validateIngredientImportManifest(manifest);
  if (validation.ok) {
    return;
  }

  const firstError = validation.errors[0];
  throw new LocalIngredientImportError(
    firstError.code,
    firstError.message,
    validation.errors,
  );
}

function buildNutritionAudits(
  manifest: IngredientImportManifest,
): LocalIngredientImportAudit['nutritionAudits'] {
  if (manifest.ingredient.type !== 'FOOD') {
    return [];
  }

  return (manifest.nutritionProfiles ?? []).map((profile) => {
    const audit = auditNutritionProfileForImport({
      profileName: profile.name ?? profile.id,
      nutrients: profile.nutrients,
      sourceForms: {},
    });
    if (audit.blockingIssues.length > 0) {
      throw new LocalIngredientImportError(
        'NUTRITION_AUDIT_BLOCKING',
        `Nutrition profile ${profile.id} has blocking audit issues.`,
        audit.blockingIssues,
      );
    }

    return {
      profileId: profile.id,
      essentialCoveragePercent: audit.essentialCoveragePercent,
      blockingIssues: audit.blockingIssues,
      reviewIssues: audit.reviewIssues,
    };
  });
}

async function applyManifestInTransaction(
  tx: StandardIngredientImportTransaction,
  manifest: IngredientImportManifest,
): Promise<TransactionResult> {
  const ingredient =
    manifest.updateExistingIngredientId !== undefined
      ? await tx.ingredient.update({
          where: { id: manifest.updateExistingIngredientId },
          data: buildIngredientData(manifest),
        })
      : await tx.ingredient.create({
          data: buildIngredientData(manifest),
        });

  const result: TransactionResult = {
    ingredientIds: [ingredient.id],
    nutritionFoodIds: [],
    nutritionFoodMappingIds: [],
    ingredientTagAssignmentIds: [],
    procurementSkuIds: [],
  };

  for (const tagId of manifest.ingredient.tagIds ?? []) {
    const tagAssignment = await tx.ingredientTagAssignment.create({
      data: {
        ingredientId: ingredient.id,
        tagId,
      },
    });
    result.ingredientTagAssignmentIds.push(tagAssignment.id);
  }

  if (manifest.ingredient.type === 'FOOD') {
    await applyFoodNutrition(tx, manifest, ingredient.id, result);
    await applyFoodProcurementSkus(tx, manifest, ingredient.id, result);
  }

  return result;
}

function buildIngredientData(manifest: IngredientImportManifest): Record<string, unknown> {
  const ingredient = manifest.ingredient;
  const isSupplement = ingredient.type === 'SUPPLEMENT';

  return {
    name: ingredient.name,
    type: ingredient.type,
    procurementStrategy: 'DAILY_PURCHASE',
    diyEnabled: ingredient.type === 'FOOD',
    procurementEnabled:
      ingredient.type === 'FOOD' && (ingredient.procurementSkus?.length ?? 0) > 0,
    brand: ingredient.brand ?? null,
    productModel: ingredient.productModel ?? null,
    purchaseChannel: null,
    notes: ingredient.notes ?? null,
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    nutritionProfile:
      ingredient.type === 'FOOD'
        ? (manifest.nutritionProfiles?.find((profile) => profile.isPrimary)
            ?.nutrients ??
          manifest.nutritionProfiles?.[0]?.nutrients ??
          null)
        : null,
    purchaseUnit: 'g',
    purchaseToBaseRatio: 1,
    currentPricePerPurchaseUnit: 0,
    properties: {
      importSource: 'standard-ingredient-import',
      manifestVersion: manifest.version,
      ...(isSupplement
        ? {
            packageEvidence: manifest.packageEvidence ?? null,
            supplementLabel: manifest.supplementLabel ?? null,
          }
        : {}),
    },
  };
}

async function applyFoodNutrition(
  tx: StandardIngredientImportTransaction,
  manifest: IngredientImportManifest,
  ingredientId: string,
  result: TransactionResult,
): Promise<void> {
  const profiles = manifest.nutritionProfiles ?? [];
  const primaryProfile = profiles.find((profile) => profile.isPrimary) ?? profiles[0];

  for (const profile of profiles) {
    const nutritionFood = await tx.nutritionFood.create({
      data: buildNutritionFoodData(profile, manifest.ingredient.name),
    });
    result.nutritionFoodIds.push(nutritionFood.id);

    const mapping = await tx.nutritionFoodMapping.create({
      data: {
        ingredientId,
        nutritionFoodId: nutritionFood.id,
        yieldRate: profile.yieldRate ?? 1,
        isPrimary: profile === primaryProfile,
        notes: `Created by standard ingredient import from profile ${profile.id}.`,
      },
    });
    result.nutritionFoodMappingIds.push(mapping.id);
  }
}

function buildNutritionFoodData(
  profile: IngredientImportNutritionProfile,
  ingredientName: string,
): Record<string, unknown> {
  return {
    name: profile.name ?? `${ingredientName} ${profile.preparationState ?? profile.id}`,
    nameEn: profile.nameEn ?? null,
    category: profile.category ?? 'OTHER',
    dataSource: profile.dataSource ?? 'MANUAL',
    externalId: profile.externalId ?? profile.id,
    status: 'VERIFIED',
    preparationState: profile.preparationState ?? null,
    preparationStateLabel: profile.preparationStateLabel ?? null,
    ediblePortionLabel: profile.ediblePortionLabel ?? null,
    processingLabel: profile.processingLabel ?? null,
    nutritionData: profile.nutrients,
    notes: profile.notes ?? `Created by standard ingredient import (${profile.basis}).`,
    createdBy: 'standard-ingredient-import',
    verifiedBy: 'standard-ingredient-import',
    verifiedAt: new Date(),
  };
}

async function applyFoodProcurementSkus(
  tx: StandardIngredientImportTransaction,
  manifest: IngredientImportManifest,
  ingredientId: string,
  result: TransactionResult,
): Promise<void> {
  for (const sku of manifest.ingredient.procurementSkus ?? []) {
    const procurementSku = await tx.procurementSku.create({
      data: buildProcurementSkuData(sku, ingredientId),
    });
    result.procurementSkuIds.push(procurementSku.id);
  }
}

function buildProcurementSkuData(
  sku: ProcurementSkuManifest,
  ingredientId: string,
): Record<string, unknown> {
  return {
    ingredientId,
    name: sku.name ?? sku.sku,
    brand: sku.brand ?? null,
    productModel: sku.productModel ?? null,
    purchaseChannel: sku.purchaseChannel ?? null,
    supplierName: sku.supplierName ?? sku.supplier ?? null,
    purchaseUnit: sku.purchaseUnit ?? null,
    purchaseToBaseRatio: sku.purchaseToBaseRatio ?? null,
    currentPurchasePrice: sku.currentPurchasePrice ?? null,
    referencePurchasePrice: sku.referencePurchasePrice ?? null,
    sourceTier: sku.sourceTier ?? null,
    notes: sku.notes ?? null,
    isDefault: false,
    isActive: true,
    sortOrder: 0,
  };
}

async function writeAuditJson(
  auditOutputPath: string,
  audit: LocalIngredientImportAudit,
): Promise<void> {
  await mkdir(dirname(auditOutputPath), { recursive: true });
  await writeFile(auditOutputPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
}

function sha256Stable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return '"__undefined__"';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
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
