import { PrismaClient } from '@prisma/client';

import {
  planProcurementSkuBackfill,
  type LegacyIngredientProcurementSnapshot,
  type LegacyProcurementSkuSnapshot,
  type ProcurementSkuBackfillDecision,
  type ProcurementSkuBackfillPayload,
} from './backfill-procurement-sku-defaults.shared';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const shouldVerbose = shouldApply || process.argv.includes('--verbose');

type PrismaDecimalLike = {
  toNumber?: () => number;
};

type BackfillCounters = {
  create: number;
  update: number;
  skip: number;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof (value as PrismaDecimalLike).toNumber === 'function'
  ) {
    const converted = (value as PrismaDecimalLike).toNumber?.();
    return typeof converted === 'number' && Number.isFinite(converted)
      ? converted
      : null;
  }

  return null;
};

const compactObject = <T extends Record<string, unknown>>(value: T) => {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  ) as T;
};

const mapProcurementSku = (sku: {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: unknown;
  referencePurchasePrice: unknown;
  referencePricePerPurchaseUnit: unknown;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
}): LegacyProcurementSkuSnapshot => ({
  id: sku.id,
  name: sku.name,
  brand: sku.brand,
  productModel: sku.productModel,
  purchaseChannel: sku.purchaseChannel,
  supplierName: sku.supplierName,
  purchaseUnit: sku.purchaseUnit,
  purchaseToBaseRatio: sku.purchaseToBaseRatio,
  currentPurchasePrice: toNullableNumber(sku.currentPurchasePrice),
  referencePurchasePrice: toNullableNumber(sku.referencePurchasePrice),
  referencePricePerPurchaseUnit: toNullableNumber(
    sku.referencePricePerPurchaseUnit,
  ),
  notes: sku.notes,
  isDefault: sku.isDefault,
  isActive: sku.isActive,
  sortOrder: sku.sortOrder,
  safetyStock: sku.safetyStock,
  reorderPoint: sku.reorderPoint,
  targetStock: sku.targetStock,
});

const mapIngredient = (ingredient: {
  id: string;
  name: string;
  baseUnit: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: unknown;
  effectivePricePerPurchaseUnit: unknown;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  procurementSkus: Array<Parameters<typeof mapProcurementSku>[0]>;
}): LegacyIngredientProcurementSnapshot => ({
  id: ingredient.id,
  name: ingredient.name,
  baseUnit: ingredient.baseUnit,
  brand: ingredient.brand,
  productModel: ingredient.productModel,
  purchaseChannel: ingredient.purchaseChannel,
  unitDisplayLabel: ingredient.unitDisplayLabel,
  purchaseUnit: ingredient.purchaseUnit,
  purchaseToBaseRatio: ingredient.purchaseToBaseRatio,
  currentPricePerPurchaseUnit:
    toNullableNumber(ingredient.currentPricePerPurchaseUnit) ?? 0,
  effectivePricePerPurchaseUnit: toNullableNumber(
    ingredient.effectivePricePerPurchaseUnit,
  ),
  safetyStock: ingredient.safetyStock,
  reorderPoint: ingredient.reorderPoint,
  targetStock: ingredient.targetStock,
  procurementSkus: ingredient.procurementSkus.map(mapProcurementSku),
});

const serializePayload = (payload: ProcurementSkuBackfillPayload) =>
  compactObject({
    name: payload.name,
    brand: payload.brand,
    productModel: payload.productModel,
    purchaseChannel: payload.purchaseChannel,
    supplierName: payload.supplierName,
    purchaseUnit: payload.purchaseUnit,
    purchaseToBaseRatio: payload.purchaseToBaseRatio,
    currentPurchasePrice: payload.currentPurchasePrice,
    referencePurchasePrice: payload.referencePurchasePrice,
    referencePricePerPurchaseUnit: payload.referencePricePerPurchaseUnit,
    notes: payload.notes,
    isDefault: payload.isDefault,
    isActive: payload.isActive,
    sortOrder: payload.sortOrder,
    safetyStock: payload.safetyStock,
    reorderPoint: payload.reorderPoint,
    targetStock: payload.targetStock,
  });

const serializePatch = (
  payload: Partial<ProcurementSkuBackfillPayload>,
): Record<string, unknown> =>
  compactObject({
    name: payload.name,
    brand: payload.brand,
    productModel: payload.productModel,
    purchaseChannel: payload.purchaseChannel,
    supplierName: payload.supplierName,
    purchaseUnit: payload.purchaseUnit,
    purchaseToBaseRatio: payload.purchaseToBaseRatio,
    currentPurchasePrice: payload.currentPurchasePrice,
    referencePurchasePrice: payload.referencePurchasePrice,
    referencePricePerPurchaseUnit: payload.referencePricePerPurchaseUnit,
    notes: payload.notes,
    isDefault: payload.isDefault,
    isActive: payload.isActive,
    sortOrder: payload.sortOrder,
    safetyStock: payload.safetyStock,
    reorderPoint: payload.reorderPoint,
    targetStock: payload.targetStock,
  });

const formatDecision = (
  ingredientName: string,
  decision: ProcurementSkuBackfillDecision,
) => {
  switch (decision.action) {
    case 'create':
      return `CREATE ${ingredientName}: ${decision.reason}`;
    case 'update':
      return `UPDATE ${ingredientName} -> ${decision.skuId}: ${decision.reason}`;
    case 'skip':
    default:
      return `SKIP ${ingredientName}: ${decision.reason}`;
  }
};

const requiresManualReview = (decision: ProcurementSkuBackfillDecision) => {
  if (decision.action !== 'skip') {
    return false;
  }

  return (
    decision.reason !== 'no legacy procurement footprint' &&
    decision.reason !== 'single procurement sku already complete' &&
    decision.reason !== 'default procurement sku already complete' &&
    decision.reason !== 'matched procurement sku already complete'
  );
};

const printSummary = (counters: BackfillCounters, skippedReasons: string[]) => {
  console.log('');
  console.log('Summary');
  console.log(`- create: ${counters.create}`);
  console.log(`- update: ${counters.update}`);
  console.log(`- skip: ${counters.skip}`);

  if (skippedReasons.length > 0) {
    console.log('');
    console.log('Skipped ingredients requiring manual review:');
    skippedReasons.forEach((reason) => console.log(`- ${reason}`));
  }
};

async function main() {
  console.log(
    shouldApply
      ? 'Applying procurement SKU default backfill...'
      : 'Dry run: procurement SKU default backfill...',
  );

  const ingredients = await prisma.ingredient.findMany({
    select: {
      id: true,
      name: true,
      baseUnit: true,
      brand: true,
      productModel: true,
      purchaseChannel: true,
      unitDisplayLabel: true,
      purchaseUnit: true,
      purchaseToBaseRatio: true,
      currentPricePerPurchaseUnit: true,
      effectivePricePerPurchaseUnit: true,
      safetyStock: true,
      reorderPoint: true,
      targetStock: true,
      procurementSkus: {
        select: {
          id: true,
          name: true,
          brand: true,
          productModel: true,
          purchaseChannel: true,
          supplierName: true,
          purchaseUnit: true,
          purchaseToBaseRatio: true,
          currentPurchasePrice: true,
          referencePurchasePrice: true,
          referencePricePerPurchaseUnit: true,
          notes: true,
          isDefault: true,
          isActive: true,
          sortOrder: true,
          safetyStock: true,
          reorderPoint: true,
          targetStock: true,
        },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });

  const counters: BackfillCounters = {
    create: 0,
    update: 0,
    skip: 0,
  };
  const skippedReasons: string[] = [];

  for (const ingredientRecord of ingredients) {
    const ingredient = mapIngredient(ingredientRecord);
    const decision = planProcurementSkuBackfill(ingredient);

    if (
      shouldVerbose ||
      (decision.action === 'skip' &&
        decision.reason !== 'no legacy procurement footprint')
    ) {
      console.log(formatDecision(ingredient.name, decision));
    }

    if (decision.action === 'skip') {
      counters.skip += 1;
      if (requiresManualReview(decision)) {
        skippedReasons.push(`${ingredient.name}: ${decision.reason}`);
      }
      continue;
    }

    if (decision.action === 'create') {
      counters.create += 1;
      if (shouldApply) {
        await prisma.procurementSku.create({
          data: {
            ingredientId: ingredient.id,
            ...serializePayload(decision.payload),
          },
        });
      }
      continue;
    }

    counters.update += 1;
    if (shouldApply) {
      await prisma.procurementSku.update({
        where: { id: decision.skuId },
        data: serializePatch(decision.payload),
      });
    }
  }

  printSummary(counters, skippedReasons);
  console.log('');
  console.log(
    shouldApply
      ? 'Procurement SKU default backfill applied successfully.'
      : 'Dry run complete. Re-run with --apply to persist changes.',
  );
}

main()
  .catch((error) => {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2022'
    ) {
      const column = (
        error as { meta?: { column?: string } | undefined }
      ).meta?.column;
      console.error(
        `Database schema is behind the current Prisma model${
          column ? ` (missing column: ${column})` : ''
        }. Apply the latest Prisma migrations before running this backfill.`,
      );
      process.exit(1);
    }

    console.error('Failed to backfill procurement SKU defaults:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
