import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');
const shouldVerbose = process.argv.includes('--verbose');

type IngredientType = 'SUPPLEMENT' | 'PACKAGING';

type PurchaseLinkConfig = Record<string, unknown> | null;
type NutritionProfile = Record<string, unknown> | null;
type JsonRecord = Record<string, any>;

export interface LegacyRecommendedProductSnapshot {
  id: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  purchaseLink?: PurchaseLinkConfig;
  imageUrl?: string | null;
  activeNutrients?: JsonRecord | null;
  displayUnit?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export interface LegacyProcurementSkuSnapshot {
  id: string;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  supplierName?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPurchasePrice?: number | null;
  referencePurchasePrice?: number | null;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface LegacySingleLayerIngredientSnapshot {
  id: string;
  name: string;
  type: IngredientType;
  baseUnit: string;
  unitDisplayLabel?: string | null;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  notes?: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit?: number | null;
  procurementStrategy?: string;
  weightG?: number | null;
  maxCapacityG?: number | null;
  safetyStock?: number | null;
  reorderPoint?: number | null;
  targetStock?: number | null;
  diyEnabled?: boolean;
  procurementEnabled?: boolean;
  properties: JsonRecord;
  nutritionProfile: NutritionProfile;
  recipeItems?: Array<{ id: string; ingredientId: string }>;
  recommendedProducts: LegacyRecommendedProductSnapshot[];
  procurementSkus: LegacyProcurementSkuSnapshot[];
  tagIds?: string[];
}

type VariantSourceType = 'ingredient' | 'recommended_product' | 'procurement_sku';

interface ProductVariant {
  identityKey: string;
  sourceKey: string;
  sourceType: VariantSourceType;
  sourceId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  displayUnit: string | null;
  purchaseLink: PurchaseLinkConfig;
  imageUrl: string | null;
  activeNutrients: JsonRecord | null;
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  referencePurchasePrice: number | null;
  hasRecommendedSource: boolean;
  hasProcurementSource: boolean;
  hasIngredientSource: boolean;
  procurementDefault: boolean;
  recommendedSortOrder: number;
}

export interface FlattenIngredientUpdatePlan {
  ingredientId: string;
  type: IngredientType;
  sourceKey: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit: number | null;
  notes: string | null;
  properties: JsonRecord;
}

export interface CreateIngredientPlan
  extends Omit<FlattenIngredientUpdatePlan, 'ingredientId'> {
  legacyIngredientId: string;
  baseUnit: string;
  unitDisplayLabel: string | null;
  procurementStrategy: string;
  nutritionProfile: NutritionProfile;
  weightG: number | null;
  maxCapacityG: number | null;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
  tagIds: string[];
}

export interface AlternativeSeedPlan {
  legacyIngredientId: string;
  recipeItemId: string;
  defaultSourceKey: string;
  alternativeSourceKeys: string[];
}

export interface SingleLayerBackfillPlanResult {
  flattenIngredientUpdates: FlattenIngredientUpdatePlan[];
  createIngredients: CreateIngredientPlan[];
  archiveRecommendedProducts: string[];
  archiveProcurementSkus: string[];
  alternativeSeeds: AlternativeSeedPlan[];
}

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

type RunResult = {
  apply: number;
  update: number;
  create: number;
  skip: number;
  archiveRecommendedProducts: number;
  archiveProcurementSkus: number;
};

const ARCHIVE_NOTE = 'Archived by supplement/packaging single-layer backfill';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { toNumber?: () => number }).toNumber === 'function'
  ) {
    const converted = (value as { toNumber?: () => number }).toNumber?.();
    return typeof converted === 'number' && Number.isFinite(converted)
      ? converted
      : null;
  }

  return null;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

const hasOwnProductFootprint = (ingredient: LegacySingleLayerIngredientSnapshot) => {
  return Boolean(
    normalizeText(ingredient.brand) ||
      normalizeText(ingredient.productModel) ||
      normalizeText(ingredient.purchaseChannel) ||
      normalizeText(ingredient.properties?.display_unit) ||
      normalizeText(ingredient.properties?.supplier_name) ||
      ingredient.properties?.purchase_link ||
      normalizeText(ingredient.properties?.image_url),
  );
};

const buildIdentityKey = (seed: {
  name?: string | null;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  displayUnit?: string | null;
}) => {
  // Align variant merging with Ingredient's unique constraint so a legacy
  // procurement SKU cannot be split into a duplicate concrete ingredient.
  const parts = [
    normalizeText(seed.name)?.toLowerCase(),
    normalizeText(seed.brand)?.toLowerCase(),
    normalizeText(seed.productModel)?.toLowerCase(),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('|') : Math.random().toString(36);
};

const buildBaseVariant = (
  ingredient: LegacySingleLayerIngredientSnapshot,
): ProductVariant | null => {
  if (
    !hasOwnProductFootprint(ingredient) &&
    (ingredient.recommendedProducts.some((item) => item.isActive !== false) ||
      ingredient.procurementSkus.some((item) => item.isActive !== false))
  ) {
    return null;
  }

  return {
    identityKey: buildIdentityKey({
      name: ingredient.name,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      displayUnit:
        normalizeText(ingredient.properties?.display_unit) ||
        normalizeText(ingredient.unitDisplayLabel),
    }),
    sourceKey: `ingredient:${ingredient.id}`,
    sourceType: 'ingredient',
    sourceId: ingredient.id,
    name: ingredient.name,
    brand: normalizeText(ingredient.brand),
    productModel: normalizeText(ingredient.productModel),
    purchaseChannel: normalizeText(ingredient.purchaseChannel),
    displayUnit:
      normalizeText(ingredient.properties?.display_unit) ||
      normalizeText(ingredient.unitDisplayLabel),
    purchaseLink: ingredient.properties?.purchase_link || null,
    imageUrl: normalizeText(ingredient.properties?.image_url),
    activeNutrients:
      ingredient.type === 'SUPPLEMENT'
        ? deepClone(ingredient.properties?.active_nutrients || null)
        : null,
    supplierName: normalizeText(ingredient.properties?.supplier_name),
    purchaseUnit: normalizeText(ingredient.purchaseUnit),
    purchaseToBaseRatio: normalizeNumber(ingredient.purchaseToBaseRatio),
    currentPurchasePrice: normalizeNumber(ingredient.currentPricePerPurchaseUnit),
    referencePurchasePrice: normalizeNumber(
      ingredient.effectivePricePerPurchaseUnit,
    ),
    hasRecommendedSource: false,
    hasProcurementSource: false,
    hasIngredientSource: true,
    procurementDefault: false,
    recommendedSortOrder: Number.MAX_SAFE_INTEGER,
  };
};

const buildRecommendedVariants = (
  ingredient: LegacySingleLayerIngredientSnapshot,
): ProductVariant[] => {
  if (ingredient.type !== 'SUPPLEMENT') {
    return [];
  }

  return ingredient.recommendedProducts
    .filter((item) => item.isActive !== false)
    .map((item) => ({
      identityKey: buildIdentityKey({
        name: item.name,
        brand: item.brand,
        productModel: item.productModel,
        purchaseChannel: item.purchaseChannel,
        displayUnit: item.displayUnit,
      }),
      sourceKey: `recommended_product:${item.id}`,
      sourceType: 'recommended_product' as const,
      sourceId: item.id,
      name: item.name,
      brand: normalizeText(item.brand),
      productModel: normalizeText(item.productModel),
      purchaseChannel: normalizeText(item.purchaseChannel),
      displayUnit: normalizeText(item.displayUnit),
      purchaseLink: item.purchaseLink || null,
      imageUrl: normalizeText(item.imageUrl),
      activeNutrients: deepClone(item.activeNutrients || null),
      supplierName: null,
      purchaseUnit: null,
      purchaseToBaseRatio: null,
      currentPurchasePrice: null,
      referencePurchasePrice: null,
      hasRecommendedSource: true,
      hasProcurementSource: false,
      hasIngredientSource: false,
      procurementDefault: false,
      recommendedSortOrder: item.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }));
};

const buildProcurementVariants = (
  ingredient: LegacySingleLayerIngredientSnapshot,
): ProductVariant[] =>
  ingredient.procurementSkus
    .filter((item) => item.isActive !== false)
    .map((item) => ({
      identityKey: buildIdentityKey({
        name: item.name,
        brand: item.brand,
        productModel: item.productModel,
        purchaseChannel: item.purchaseChannel,
        displayUnit: item.purchaseUnit,
      }),
      sourceKey: `procurement_sku:${item.id}`,
      sourceType: 'procurement_sku' as const,
      sourceId: item.id,
      name: item.name,
      brand: normalizeText(item.brand),
      productModel: normalizeText(item.productModel),
      purchaseChannel: normalizeText(item.purchaseChannel),
      displayUnit: normalizeText(item.purchaseUnit),
      purchaseLink: null,
      imageUrl: null,
      activeNutrients: null,
      supplierName: normalizeText(item.supplierName),
      purchaseUnit: normalizeText(item.purchaseUnit),
      purchaseToBaseRatio: normalizeNumber(item.purchaseToBaseRatio),
      currentPurchasePrice: normalizeNumber(item.currentPurchasePrice),
      referencePurchasePrice: normalizeNumber(item.referencePurchasePrice),
      hasRecommendedSource: false,
      hasProcurementSource: true,
      hasIngredientSource: false,
      procurementDefault: Boolean(item.isDefault),
      recommendedSortOrder: Number.MAX_SAFE_INTEGER,
    }));

const mergeVariants = (variants: ProductVariant[]): ProductVariant[] => {
  const merged = new Map<string, ProductVariant>();

  variants.forEach((variant) => {
    const existing = merged.get(variant.identityKey);
    if (!existing) {
      merged.set(variant.identityKey, { ...variant });
      return;
    }

    merged.set(variant.identityKey, {
      ...existing,
      name: existing.name || variant.name,
      brand: existing.brand || variant.brand,
      productModel: existing.productModel || variant.productModel,
      purchaseChannel: existing.purchaseChannel || variant.purchaseChannel,
      displayUnit: existing.displayUnit || variant.displayUnit,
      purchaseLink: existing.purchaseLink || variant.purchaseLink,
      imageUrl: existing.imageUrl || variant.imageUrl,
      activeNutrients: existing.activeNutrients || variant.activeNutrients,
      supplierName: existing.supplierName || variant.supplierName,
      purchaseUnit: existing.purchaseUnit || variant.purchaseUnit,
      purchaseToBaseRatio:
        existing.purchaseToBaseRatio || variant.purchaseToBaseRatio,
      currentPurchasePrice:
        existing.currentPurchasePrice || variant.currentPurchasePrice,
      referencePurchasePrice:
        existing.referencePurchasePrice || variant.referencePurchasePrice,
      hasRecommendedSource:
        existing.hasRecommendedSource || variant.hasRecommendedSource,
      hasProcurementSource:
        existing.hasProcurementSource || variant.hasProcurementSource,
      hasIngredientSource:
        existing.hasIngredientSource || variant.hasIngredientSource,
      procurementDefault:
        existing.procurementDefault || variant.procurementDefault,
      recommendedSortOrder: Math.min(
        existing.recommendedSortOrder,
        variant.recommendedSortOrder,
      ),
    });
  });

  return Array.from(merged.values());
};

const sortVariants = (variants: ProductVariant[]) =>
  [...variants].sort((left, right) => {
    if (left.hasIngredientSource !== right.hasIngredientSource) {
      return left.hasIngredientSource ? -1 : 1;
    }
    if (left.procurementDefault !== right.procurementDefault) {
      return left.procurementDefault ? -1 : 1;
    }
    if (left.recommendedSortOrder !== right.recommendedSortOrder) {
      return left.recommendedSortOrder - right.recommendedSortOrder;
    }
    return left.sourceKey.localeCompare(right.sourceKey);
  });

const resolveDiyEnabled = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
) =>
  ingredient.type === 'SUPPLEMENT' &&
  Boolean(
    variant.hasRecommendedSource ||
      variant.purchaseLink ||
      variant.imageUrl ||
      ingredient.diyEnabled,
  );

const resolveProcurementEnabled = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
) =>
  Boolean(
    variant.hasProcurementSource ||
      variant.purchaseUnit ||
      variant.currentPurchasePrice ||
      ingredient.procurementEnabled,
  );

const buildSingleLayerOrigin = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
) => ({
  legacy_ingredient_id: ingredient.id,
  source_type: variant.sourceType,
  source_id: variant.sourceId,
});

const buildIngredientProperties = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
): JsonRecord => {
  const next = deepClone(ingredient.properties || {});

  if (ingredient.type === 'SUPPLEMENT') {
    next.display_unit = variant.displayUnit || next.display_unit || ingredient.unitDisplayLabel || '';
    next.supplier_name = variant.supplierName || next.supplier_name || null;
    next.purchase_link = variant.purchaseLink || next.purchase_link || null;
    next.image_url = variant.imageUrl || next.image_url || null;
    next.marketing_highlights =
      next.marketing_highlights ||
      deepClone(variant.activeNutrients || null) ||
      {};
    next.active_nutrients =
      deepClone(variant.activeNutrients || null) || next.active_nutrients || {};
  }

  if (ingredient.type === 'PACKAGING') {
    next.supplier_name = variant.supplierName || next.supplier_name || null;
  }

  next.single_layer_origin = buildSingleLayerOrigin(ingredient, variant);
  return next;
};

const buildConcreteIngredientName = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
) => {
  const variantName = normalizeText(variant.name);
  if (variantName && variantName !== ingredient.name) {
    return variantName;
  }
  if (
    normalizeText(variant.productModel) &&
    !ingredient.name.includes(variant.productModel as string)
  ) {
    return `${ingredient.name} ${variant.productModel}`;
  }
  return ingredient.name;
};

const buildFinalIngredientIdentityKey = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
) =>
  buildIdentityKey({
    name: buildConcreteIngredientName(ingredient, variant),
    brand: variant.brand || normalizeText(ingredient.brand),
    productModel: variant.productModel || normalizeText(ingredient.productModel),
  });

const buildFlattenUpdate = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
): FlattenIngredientUpdatePlan => ({
  ingredientId: ingredient.id,
  type: ingredient.type,
  sourceKey: variant.sourceKey,
  name: buildConcreteIngredientName(ingredient, variant),
  brand: variant.brand || normalizeText(ingredient.brand),
  productModel: variant.productModel || normalizeText(ingredient.productModel),
  purchaseChannel:
    variant.purchaseChannel || normalizeText(ingredient.purchaseChannel),
  diyEnabled: resolveDiyEnabled(ingredient, variant),
  procurementEnabled: resolveProcurementEnabled(ingredient, variant),
  purchaseUnit: variant.purchaseUnit || ingredient.purchaseUnit,
  purchaseToBaseRatio: variant.purchaseToBaseRatio || ingredient.purchaseToBaseRatio,
  currentPricePerPurchaseUnit:
    variant.currentPurchasePrice || ingredient.currentPricePerPurchaseUnit,
  effectivePricePerPurchaseUnit:
    variant.referencePurchasePrice || ingredient.effectivePricePerPurchaseUnit || null,
  notes: ingredient.notes || null,
  properties: buildIngredientProperties(ingredient, variant),
});

const buildCreateIngredientPlan = (
  ingredient: LegacySingleLayerIngredientSnapshot,
  variant: ProductVariant,
): CreateIngredientPlan => ({
  legacyIngredientId: ingredient.id,
  sourceKey: variant.sourceKey,
  type: ingredient.type,
  name: buildConcreteIngredientName(ingredient, variant),
  brand: variant.brand || normalizeText(ingredient.brand),
  productModel: variant.productModel || normalizeText(ingredient.productModel),
  purchaseChannel:
    variant.purchaseChannel || normalizeText(ingredient.purchaseChannel),
  diyEnabled: resolveDiyEnabled(ingredient, variant),
  procurementEnabled: resolveProcurementEnabled(ingredient, variant),
  purchaseUnit: variant.purchaseUnit || ingredient.purchaseUnit,
  purchaseToBaseRatio: variant.purchaseToBaseRatio || ingredient.purchaseToBaseRatio,
  currentPricePerPurchaseUnit:
    variant.currentPurchasePrice || ingredient.currentPricePerPurchaseUnit,
  effectivePricePerPurchaseUnit:
    variant.referencePurchasePrice || ingredient.effectivePricePerPurchaseUnit || null,
  notes:
    normalizeText(ingredient.notes) || 'Backfilled from supplement/packaging single-layer split',
  properties: buildIngredientProperties(ingredient, variant),
  baseUnit: ingredient.baseUnit,
  unitDisplayLabel:
    variant.displayUnit || normalizeText(ingredient.unitDisplayLabel),
  procurementStrategy: ingredient.procurementStrategy || 'DAILY_PURCHASE',
  nutritionProfile: deepClone(ingredient.nutritionProfile),
  weightG: ingredient.weightG || null,
  maxCapacityG: ingredient.maxCapacityG || null,
  safetyStock: ingredient.safetyStock || null,
  reorderPoint: ingredient.reorderPoint || null,
  targetStock: ingredient.targetStock || null,
  tagIds: ingredient.tagIds || [],
});

export function planSupplementPackagingSingleLayerBackfill(
  ingredients: LegacySingleLayerIngredientSnapshot[],
): SingleLayerBackfillPlanResult {
  const result: SingleLayerBackfillPlanResult = {
    flattenIngredientUpdates: [],
    createIngredients: [],
    archiveRecommendedProducts: [],
    archiveProcurementSkus: [],
    alternativeSeeds: [],
  };

  ingredients.forEach((ingredient) => {
    if (ingredient.type !== 'SUPPLEMENT' && ingredient.type !== 'PACKAGING') {
      return;
    }

    const variants = [
        ...(buildBaseVariant(ingredient) ? [buildBaseVariant(ingredient)!] : []),
        ...buildRecommendedVariants(ingredient),
        ...buildProcurementVariants(ingredient),
      ].map((variant) => ({
        ...variant,
        identityKey: buildFinalIngredientIdentityKey(ingredient, variant),
      }));

    const mergedVariants = sortVariants(
      mergeVariants(variants),
    );

    if (mergedVariants.length === 0) {
      return;
    }

    const [defaultVariant, ...alternativeVariants] = mergedVariants;
    result.flattenIngredientUpdates.push(
      buildFlattenUpdate(ingredient, defaultVariant),
    );

    alternativeVariants.forEach((variant) => {
      result.createIngredients.push(buildCreateIngredientPlan(ingredient, variant));
    });

    if (ingredient.type === 'SUPPLEMENT' && alternativeVariants.length > 0) {
      ingredient.recipeItems?.forEach((recipeItem) => {
        result.alternativeSeeds.push({
          legacyIngredientId: ingredient.id,
          recipeItemId: recipeItem.id,
          defaultSourceKey: defaultVariant.sourceKey,
          alternativeSourceKeys: alternativeVariants.map((item) => item.sourceKey),
        });
      });
    }

    result.archiveRecommendedProducts.push(
      ...ingredient.recommendedProducts
        .filter((item) => item.isActive !== false)
        .map((item) => item.id),
    );
    result.archiveProcurementSkus.push(
      ...ingredient.procurementSkus
        .filter((item) => item.isActive !== false)
        .map((item) => item.id),
    );
  });

  return result;
}

export async function runSupplementPackagingSingleLayerBackfill(options?: {
  prisma?: PrismaClient;
  apply?: boolean;
  logger?: Logger;
}) {
  const client = options?.prisma || prisma;
  const apply = options?.apply ?? shouldApply;
  const logger = options?.logger || console;

  const ingredients = await client.ingredient.findMany({
    where: {
      type: {
        in: ['SUPPLEMENT', 'PACKAGING'],
      },
    },
    select: {
      id: true,
      name: true,
      type: true,
      baseUnit: true,
      unitDisplayLabel: true,
      brand: true,
      productModel: true,
      purchaseChannel: true,
      notes: true,
      purchaseUnit: true,
      purchaseToBaseRatio: true,
      currentPricePerPurchaseUnit: true,
      effectivePricePerPurchaseUnit: true,
      procurementStrategy: true,
      weightG: true,
      maxCapacityG: true,
      safetyStock: true,
      reorderPoint: true,
      targetStock: true,
      diyEnabled: true,
      procurementEnabled: true,
      properties: true,
      nutritionProfile: true,
      recipeItems: {
        select: {
          id: true,
          ingredientId: true,
        },
      },
      recommendedProducts: {
        select: {
          id: true,
          name: true,
          brand: true,
          productModel: true,
          purchaseChannel: true,
          purchaseLink: true,
          imageUrl: true,
          activeNutrients: true,
          displayUnit: true,
          isActive: true,
          sortOrder: true,
        },
      },
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
          isActive: true,
          isDefault: true,
          sortOrder: true,
        },
      },
      tags: {
        select: {
          tagId: true,
        },
      },
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  const normalized = ingredients.map((ingredient) => ({
    ...ingredient,
    currentPricePerPurchaseUnit:
      normalizeNumber(ingredient.currentPricePerPurchaseUnit) || 0,
    effectivePricePerPurchaseUnit: normalizeNumber(
      ingredient.effectivePricePerPurchaseUnit,
    ),
    tagIds: ingredient.tags.map((tag) => tag.tagId),
    procurementSkus: ingredient.procurementSkus.map((sku) => ({
      ...sku,
      currentPurchasePrice: normalizeNumber(sku.currentPurchasePrice),
      referencePurchasePrice: normalizeNumber(sku.referencePurchasePrice),
    })),
  })) as LegacySingleLayerIngredientSnapshot[];

  const plan = planSupplementPackagingSingleLayerBackfill(normalized);

  const summary: RunResult = {
    apply: 0,
    update: plan.flattenIngredientUpdates.length,
    create: plan.createIngredients.length,
    skip: Math.max(0, normalized.length - plan.flattenIngredientUpdates.length),
    archiveRecommendedProducts: plan.archiveRecommendedProducts.length,
    archiveProcurementSkus: plan.archiveProcurementSkus.length,
  };

  if (!apply) {
    logger.info(
      `Dry run summary: update=${summary.update}, create=${summary.create}, archiveRecommendedProducts=${summary.archiveRecommendedProducts}, archiveProcurementSkus=${summary.archiveProcurementSkus}`,
    );
    return { ...summary, plan };
  }

  const createdIngredientIds = new Map<string, string>();

  await client.$transaction(async (tx) => {
    for (const update of plan.flattenIngredientUpdates) {
      await tx.ingredient.update({
        where: { id: update.ingredientId },
        data: {
          name: update.name,
          brand: update.brand,
          productModel: update.productModel,
          purchaseChannel: update.purchaseChannel,
          diyEnabled: update.diyEnabled,
          procurementEnabled: update.procurementEnabled,
          purchaseUnit: update.purchaseUnit,
          purchaseToBaseRatio: update.purchaseToBaseRatio,
          currentPricePerPurchaseUnit: update.currentPricePerPurchaseUnit,
          effectivePricePerPurchaseUnit: update.effectivePricePerPurchaseUnit,
          notes: update.notes,
          properties: update.properties as any,
        },
      });
    }

    for (const create of plan.createIngredients) {
      const created = await tx.ingredient.create({
        data: {
          name: create.name,
          type: create.type as any,
          procurementStrategy: create.procurementStrategy as any,
          diyEnabled: create.diyEnabled,
          procurementEnabled: create.procurementEnabled,
          brand: create.brand,
          productModel: create.productModel,
          purchaseChannel: create.purchaseChannel,
          notes: create.notes,
          baseUnit: create.baseUnit as any,
          unitDisplayLabel: create.unitDisplayLabel,
          nutritionProfile: create.nutritionProfile as any,
          purchaseUnit: create.purchaseUnit,
          purchaseToBaseRatio: create.purchaseToBaseRatio,
          currentPricePerPurchaseUnit: create.currentPricePerPurchaseUnit,
          effectivePricePerPurchaseUnit: create.effectivePricePerPurchaseUnit,
          weightG: create.weightG,
          maxCapacityG: create.maxCapacityG,
          safetyStock: create.safetyStock,
          reorderPoint: create.reorderPoint,
          targetStock: create.targetStock,
          properties: create.properties as any,
        },
      });

      if (create.tagIds.length > 0) {
        await tx.ingredientTagAssignment.createMany({
          data: create.tagIds.map((tagId) => ({
            ingredientId: created.id,
            tagId,
          })),
          skipDuplicates: true,
        });
      }

      createdIngredientIds.set(create.sourceKey, created.id);
    }

    if (plan.archiveRecommendedProducts.length > 0) {
      await tx.recommendedProduct.updateMany({
        where: { id: { in: plan.archiveRecommendedProducts } },
        data: { isActive: false },
      });
    }

    if (plan.archiveProcurementSkus.length > 0) {
      await tx.procurementSku.updateMany({
        where: { id: { in: plan.archiveProcurementSkus } },
        data: {
          isActive: false,
          isDefault: false,
          notes: ARCHIVE_NOTE,
        },
      });
    }
  });

  logger.info(
    `Applied supplement/package single-layer backfill: update=${summary.update}, create=${summary.create}`,
  );

  return { ...summary, apply: summary.update + summary.create, createdIngredientIds };
}

async function main() {
  const result = await runSupplementPackagingSingleLayerBackfill();
  if (shouldVerbose) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          apply: result.apply,
          update: result.update,
          create: result.create,
          skip: result.skip,
          archiveRecommendedProducts: result.archiveRecommendedProducts,
          archiveProcurementSkus: result.archiveProcurementSkus,
        },
        null,
        2,
      ),
    );
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Failed to backfill supplement/package single-layer model:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
