import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  auditNutritionProfileForImport,
  type NormalizedNutrientValue,
  type NutritionImportAuditResult,
} from './nutrition-audit';
import {
  validateIngredientImportManifest,
  type IngredientImportManifest,
  type IngredientImportNutritionProfile,
  type ProcurementSkuManifest,
} from './ingredient-import-manifest';
import type { DatabaseAlignmentResult } from './db-alignment';
import { createEmptyNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import {
  findNutritionField,
  type NutritionFieldTab,
} from '../../domain/ingredient/nutrition-field-catalog';
import type {
  NutritionProfileV2,
  NutritionRawBasisType,
  NutritionSourceForm,
} from '../../domain/ingredient/types';

export type LocalIngredientImportErrorCode =
  | 'DB_ALIGNMENT_NOT_OK'
  | 'DB_ALIGNMENT_REPORT_MISMATCH'
  | 'INGREDIENT_ALREADY_EXISTS'
  | 'NUTRITION_AUDIT_BLOCKING'
  | ReturnType<
      typeof validateIngredientImportManifest
    >['errors'][number]['code'];

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
  alignmentId: string | null;
  dbAlignmentStatus: 'passing' | 'not-required-for-local';
  manifestHash: string;
  packageManifestHash: string;
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

export interface StandardIngredientImportPrismaClient extends StandardIngredientImportTransaction {
  $transaction<T>(
    callback: (tx: StandardIngredientImportTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ApplyLocalIngredientImportInput {
  prisma: StandardIngredientImportPrismaClient;
  manifest: IngredientImportManifest;
  alignment?: DatabaseAlignmentResult | null;
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
    ...summarizeLocalAlignment(input.alignment),
    manifestHash: sha256Stable(input.manifest),
    packageManifestHash: buildProductionPackageManifestHash(input.manifest),
    ...transactionResult,
    nutritionAudits,
  };

  await (input.writeAuditFile ?? writeAuditJson)(input.auditOutputPath, audit);

  return {
    auditPath: input.auditOutputPath,
    audit,
  };
}

function summarizeLocalAlignment(
  alignment: DatabaseAlignmentResult | null | undefined,
): Pick<LocalIngredientImportAudit, 'alignmentId' | 'dbAlignmentStatus'> {
  if (alignment?.ok === true) {
    return {
      alignmentId: alignment.id,
      dbAlignmentStatus: 'passing',
    };
  }

  return {
    alignmentId: null,
    dbAlignmentStatus: 'not-required-for-local',
  };
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
      sourceForms: profile.sourceForms ?? {},
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
    ingredientIds:
      manifest.updateExistingIngredientId === undefined ? [ingredient.id] : [],
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

  if ((manifest.nutritionProfiles?.length ?? 0) > 0) {
    await applyNutritionProfiles(tx, manifest, ingredient.id, result);
  }

  if (manifest.ingredient.type === 'FOOD') {
    await applyFoodProcurementSkus(tx, manifest, ingredient.id, result);
  }

  return result;
}

function buildIngredientData(
  manifest: IngredientImportManifest,
): Record<string, unknown> {
  const ingredient = manifest.ingredient;
  const isSupplement = ingredient.type === 'SUPPLEMENT';
  const primaryNutritionProfile =
    ingredient.type === 'FOOD' ? findPrimaryNutritionProfile(manifest) : null;

  return {
    name: ingredient.name,
    type: ingredient.type,
    procurementStrategy: 'DAILY_PURCHASE',
    diyEnabled: ingredient.type === 'FOOD',
    procurementEnabled:
      ingredient.type === 'FOOD' &&
      (ingredient.procurementSkus?.length ?? 0) > 0,
    brand: ingredient.brand ?? null,
    productModel: ingredient.productModel ?? null,
    purchaseChannel: null,
    notes: ingredient.notes ?? null,
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    nutritionProfile:
      primaryNutritionProfile !== null
        ? buildNutritionFoodProfile(primaryNutritionProfile)
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

function findPrimaryNutritionProfile(
  manifest: IngredientImportManifest,
): IngredientImportNutritionProfile | null {
  return (
    manifest.nutritionProfiles?.find((profile) => profile.isPrimary) ??
    manifest.nutritionProfiles?.[0] ??
    null
  );
}

async function applyNutritionProfiles(
  tx: StandardIngredientImportTransaction,
  manifest: IngredientImportManifest,
  ingredientId: string,
  result: TransactionResult,
): Promise<void> {
  const profiles = manifest.nutritionProfiles ?? [];
  const primaryProfile =
    profiles.find((profile) => profile.isPrimary) ?? profiles[0];

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
    name:
      profile.name ??
      `${ingredientName} ${profile.preparationState ?? profile.id}`,
    nameEn: profile.nameEn ?? null,
    category: profile.category ?? 'OTHER',
    dataSource: profile.dataSource ?? 'MANUAL',
    externalId: profile.externalId ?? profile.id,
    status: 'VERIFIED',
    preparationState: profile.preparationState ?? null,
    preparationStateLabel: profile.preparationStateLabel ?? null,
    ediblePortionLabel: profile.ediblePortionLabel ?? null,
    processingLabel: profile.processingLabel ?? null,
    nutritionData: profile.nutritionData ?? buildNutritionFoodProfile(profile),
    notes:
      profile.notes ??
      `Created by standard ingredient import (${profile.basis}).`,
    createdBy: 'standard-ingredient-import',
    verifiedBy: 'standard-ingredient-import',
    verifiedAt: new Date(),
  };
}

export function buildNutritionFoodProfile(
  profile: IngredientImportNutritionProfile,
): NutritionProfileV2 {
  const audit = auditNutritionProfileForImport({
    profileName: profile.name ?? profile.id,
    nutrients: profile.nutrients,
    sourceForms: profile.sourceForms ?? {},
  });
  const nutritionProfile = createEmptyNutritionProfile();
  const rawBasisType = mapImportBasisToRawBasisType(profile.basis);

  nutritionProfile.meta = {
    ...nutritionProfile.meta,
    rawBasisType,
    sampleState: mapPreparationStateToSampleState(profile.preparationState),
    sourceType: mapProfileDataSourceToSourceType(profile.dataSource) as any,
    sourceKind: profile.dataSource ? 'FOOD_DATABASE' : null,
    sourceCode: profile.dataSource as any,
    externalId: profile.externalId ?? profile.id,
    sourceTitle: profile.nameEn ?? profile.name ?? profile.id,
    sourceProvider: profile.dataSource ?? null,
    confidenceLevel: 'MEDIUM',
    sourceForms: {},
  };

  for (const [field, value] of Object.entries(audit.normalizedNutrients)) {
    const fieldPath = resolveImportNutrientFieldPath(field);
    if (!fieldPath) {
      addImportCustomItem(nutritionProfile, field, value, rawBasisType);
      continue;
    }

    const fieldDefinition = findNutritionField(fieldPath);
    if (!fieldDefinition) {
      addImportCustomItem(nutritionProfile, field, value, rawBasisType);
      continue;
    }

    const convertedValue = convertImportNutrientValue(
      value.value,
      value.unit,
      fieldDefinition.unit,
    );
    if (convertedValue === null) {
      addImportCustomItem(nutritionProfile, field, value, rawBasisType);
      continue;
    }

    const tabValues = nutritionProfile[fieldDefinition.tabKey] as Record<
      string,
      number | null
    >;
    tabValues[fieldDefinition.fieldKey] = convertedValue;

    nutritionProfile.meta.sourceForms = {
      ...(nutritionProfile.meta.sourceForms ?? {}),
      [fieldDefinition.fieldPath]: buildImportSourceForm(
        value,
        convertedValue,
        fieldDefinition.unit,
      ),
    };
  }

  return nutritionProfile;
}

function buildImportSourceForm(
  value: NormalizedNutrientValue,
  convertedValue: number,
  canonicalUnit: string,
): NutritionSourceForm {
  return {
    ...(value.sourceForm ?? {}),
    originalValue: value.sourceValue,
    originalUnit: value.sourceUnit,
    canonicalValue: convertedValue,
    canonicalUnit,
    basisType: 'PER_100_G',
    measuredZero: value.measuredZero,
  };
}

function addImportCustomItem(
  profile: NutritionProfileV2,
  field: string,
  value: NormalizedNutrientValue,
  rawBasisType: NutritionRawBasisType,
): void {
  profile.customItems.push({
    name: field,
    value: value.value,
    unit: value.unit,
    rawBasisType,
    sourceNutrientName: field,
  });
}

function mapImportBasisToRawBasisType(basis: string): NutritionRawBasisType {
  const normalized = basis
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (normalized === 'PER_100ML' || normalized === 'PER_100_ML') {
    return 'PER_100_ML';
  }
  if (normalized === 'PER_1G' || normalized === 'PER_1_G') {
    return 'PER_1_G';
  }
  if (normalized === 'PER_1ML' || normalized === 'PER_1_ML') {
    return 'PER_1_ML';
  }
  if (normalized === 'PER_SERVING') {
    return 'PER_SERVING';
  }
  return 'PER_100_G';
}

function mapPreparationStateToSampleState(
  preparationState: string | null | undefined,
): NutritionProfileV2['meta']['sampleState'] {
  switch ((preparationState ?? '').trim().toLowerCase()) {
    case 'raw':
      return 'RAW';
    case 'cooked':
      return 'COOKED';
    case 'powder':
      return 'POWDER';
    case 'oil':
      return 'OIL';
    case 'freeze_dried':
    case 'freeze-dried':
      return 'FREEZE_DRIED';
    case 'air_dried':
    case 'air-dried':
      return 'AIR_DRIED';
    default:
      return undefined;
  }
}

function mapProfileDataSourceToSourceType(
  dataSource: string | null | undefined,
): string | null {
  const normalized = (dataSource ?? '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'USDA_FDC' || normalized === 'USDA') return 'USDA';
  if (normalized === 'NZFCD' || normalized === 'NZFCD_FOODFILES') {
    return 'NZFCD';
  }
  if (normalized === 'MEXT') return 'MEXT';
  if (normalized === 'CFCT') return 'CFCT';
  return 'OTHER';
}

function normalizeImportKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');
}

function resolveImportNutrientFieldPath(
  field: string,
): `${NutritionFieldTab}.${string}` | null {
  const key = normalizeImportKey(field);
  return importNutrientFieldPathByAlias[key] ?? null;
}

const importNutrientFieldPathByAlias: Record<
  string,
  `${NutritionFieldTab}.${string}`
> = {
  energykcal: 'macros.energyKcal',
  moisture: 'macros.moisture',
  moistureg: 'macros.moisture',
  water: 'macros.moisture',
  waterg: 'macros.moisture',
  protein: 'macros.crudeProtein',
  proteing: 'macros.crudeProtein',
  crudeprotein: 'macros.crudeProtein',
  crudeproteing: 'macros.crudeProtein',
  fat: 'macros.crudeFat',
  fatg: 'macros.crudeFat',
  crudefat: 'macros.crudeFat',
  crudefatg: 'macros.crudeFat',
  ash: 'macros.ash',
  ashg: 'macros.ash',
  carbohydrate: 'macros.carbohydrate',
  carbohydrates: 'macros.carbohydrate',
  carbohydrateg: 'macros.carbohydrate',
  carbs: 'macros.carbohydrate',
  carbsg: 'macros.carbohydrate',
  fiber: 'macros.fiber',
  fiberg: 'macros.fiber',

  calcium: 'minerals.calcium',
  calciummg: 'minerals.calcium',
  phosphorus: 'minerals.phosphorus',
  phosphorusmg: 'minerals.phosphorus',
  potassium: 'minerals.potassium',
  potassiummg: 'minerals.potassium',
  sodium: 'minerals.sodium',
  sodiummg: 'minerals.sodium',
  chloride: 'minerals.chloride',
  chloridemg: 'minerals.chloride',
  magnesium: 'minerals.magnesium',
  magnesiummg: 'minerals.magnesium',
  copper: 'minerals.copper',
  coppermg: 'minerals.copper',
  iodine: 'minerals.iodine',
  iodineug: 'minerals.iodine',
  iodinemcg: 'minerals.iodine',
  iron: 'minerals.iron',
  ironmg: 'minerals.iron',
  manganese: 'minerals.manganese',
  manganesemg: 'minerals.manganese',
  selenium: 'minerals.selenium',
  seleniumug: 'minerals.selenium',
  seleniummcg: 'minerals.selenium',
  zinc: 'minerals.zinc',
  zincmg: 'minerals.zinc',

  vitaminaiu: 'vitamins.vitaminA',
  vitamina: 'vitamins.vitaminA',
  vitamindiu: 'vitamins.vitaminD',
  vitamind: 'vitamins.vitaminD',
  vitamineiu: 'vitamins.vitaminE',
  vitamine: 'vitamins.vitaminE',
  vitamink: 'vitamins.vitaminK',
  vitaminkug: 'vitamins.vitaminK',
  vitaminkmcg: 'vitamins.vitaminK',
  vitaminb1: 'vitamins.vitaminB1',
  vitaminb2: 'vitamins.vitaminB2',
  vitaminb3: 'vitamins.vitaminB3',
  vitaminb5: 'vitamins.vitaminB5',
  vitaminb6: 'vitamins.vitaminB6',
  vitaminb7: 'vitamins.vitaminB7',
  vitaminb7ug: 'vitamins.vitaminB7',
  vitaminb7mcg: 'vitamins.vitaminB7',
  vitaminb9: 'vitamins.vitaminB9',
  vitaminb9ug: 'vitamins.vitaminB9',
  vitaminb9mcg: 'vitamins.vitaminB9',
  vitaminb12: 'vitamins.vitaminB12',
  vitaminb12ug: 'vitamins.vitaminB12',
  vitaminb12mcg: 'vitamins.vitaminB12',
  choline: 'vitamins.choline',
  cholinemg: 'vitamins.choline',
  vitaminc: 'vitamins.vitaminC',

  saturatedfattyacids: 'fattyAcids.saturatedFattyAcids',
  monounsaturatedfattyacids: 'fattyAcids.monounsaturatedFattyAcids',
  polyunsaturatedfattyacids: 'fattyAcids.polyunsaturatedFattyAcids',
  linoleicacid: 'fattyAcids.linoleicAcid',
  linoleicacidg: 'fattyAcids.linoleicAcid',
  alphalinolenicacid: 'fattyAcids.alphaLinolenicAcid',
  alphalinolenicacidg: 'fattyAcids.alphaLinolenicAcid',
  arachidonicacid: 'fattyAcids.arachidonicAcid',
  arachidonicacidg: 'fattyAcids.arachidonicAcid',
  arachidonicacidmg: 'fattyAcids.arachidonicAcid',
  epa: 'fattyAcids.epa',
  epamg: 'fattyAcids.epa',
  dha: 'fattyAcids.dha',
  dhamg: 'fattyAcids.dha',
  dpa: 'fattyAcids.dpa',
  dpamg: 'fattyAcids.dpa',

  arginine: 'aminoAcids.arginine',
  histidine: 'aminoAcids.histidine',
  isoleucine: 'aminoAcids.isoleucine',
  leucine: 'aminoAcids.leucine',
  lysine: 'aminoAcids.lysine',
  methionine: 'aminoAcids.methionine',
  cystine: 'aminoAcids.cystine',
  phenylalanine: 'aminoAcids.phenylalanine',
  tyrosine: 'aminoAcids.tyrosine',
  threonine: 'aminoAcids.threonine',
  tryptophan: 'aminoAcids.tryptophan',
  valine: 'aminoAcids.valine',
  taurine: 'aminoAcids.taurine',
  glutamicacid: 'aminoAcids.glutamicAcid',
  glycine: 'aminoAcids.glycine',
  proline: 'aminoAcids.proline',
};

function normalizeImportUnit(unit: string): string {
  const normalized = unit.trim();
  const compact = normalized.toLowerCase();
  if (compact === 'ug' || compact === 'mcg' || compact === 'μg') return 'μg';
  if (compact === 'iu') return 'IU';
  if (compact === 'kj') return 'kJ';
  return normalized;
}

function convertImportNutrientValue(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const normalizedFrom = normalizeImportUnit(fromUnit);
  const normalizedTo = normalizeImportUnit(toUnit);
  if (normalizedFrom === normalizedTo) {
    return value;
  }

  if (normalizedFrom === 'kJ' && normalizedTo === 'kcal') {
    return value / 4.184;
  }
  if (normalizedFrom === 'kcal' && normalizedTo === 'kJ') {
    return value * 4.184;
  }

  const gramsByUnit: Record<string, number> = {
    g: 1,
    mg: 0.001,
    μg: 0.000001,
  };
  const fromFactor = gramsByUnit[normalizedFrom];
  const toFactor = gramsByUnit[normalizedTo];
  if (fromFactor === undefined || toFactor === undefined) {
    return null;
  }

  return (value * fromFactor) / toFactor;
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
  await writeFile(
    auditOutputPath,
    `${JSON.stringify(audit, null, 2)}\n`,
    'utf8',
  );
}

function sha256Stable(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildProductionPackageManifestHash(
  manifest: IngredientImportManifest,
): string {
  return sha256Stable({
    version: manifest.version,
    updateExistingIngredientId: manifest.updateExistingIngredientId,
    ingredient: manifest.ingredient,
    nutritionProfiles: manifest.nutritionProfiles,
    sourceCandidates: manifest.sourceCandidates,
    packageEvidence: manifest.packageEvidence,
    supplementLabel: manifest.supplementLabel,
    wholeDatabaseMigration: manifest.wholeDatabaseMigration,
    migrationFlags: manifest.migrationFlags,
  });
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
