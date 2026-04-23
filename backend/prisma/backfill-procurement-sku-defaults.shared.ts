type NullableText = string | null | undefined;
type NullableNumber = number | null | undefined;

export interface LegacyProcurementSkuSnapshot {
  id: string;
  name: string;
  brand?: NullableText;
  productModel?: NullableText;
  purchaseChannel?: NullableText;
  supplierName?: NullableText;
  purchaseUnit?: NullableText;
  purchaseToBaseRatio?: NullableNumber;
  currentPurchasePrice?: NullableNumber;
  referencePurchasePrice?: NullableNumber;
  referencePricePerPurchaseUnit?: NullableNumber;
  notes?: NullableText;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  safetyStock?: NullableNumber;
  reorderPoint?: NullableNumber;
  targetStock?: NullableNumber;
}

export interface LegacyIngredientProcurementSnapshot {
  id: string;
  name: string;
  baseUnit: string;
  brand?: NullableText;
  productModel?: NullableText;
  purchaseChannel?: NullableText;
  unitDisplayLabel?: NullableText;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  effectivePricePerPurchaseUnit?: NullableNumber;
  safetyStock?: NullableNumber;
  reorderPoint?: NullableNumber;
  targetStock?: NullableNumber;
  procurementSkus: LegacyProcurementSkuSnapshot[];
}

export interface ProcurementSkuBackfillPayload {
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  supplierName: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  currentPurchasePrice: number | null;
  referencePurchasePrice: number | null;
  referencePricePerPurchaseUnit: number | null;
  notes: string | null;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  safetyStock: number | null;
  reorderPoint: number | null;
  targetStock: number | null;
}

export type ProcurementSkuBackfillDecision =
  | {
      action: 'create';
      ingredientId: string;
      reason: string;
      payload: ProcurementSkuBackfillPayload;
    }
  | {
      action: 'update';
      ingredientId: string;
      skuId: string;
      reason: string;
      payload: Partial<ProcurementSkuBackfillPayload>;
    }
  | {
      action: 'skip';
      ingredientId: string;
      reason: string;
    };

const normalizeText = (value: NullableText): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (
  value: NullableNumber,
  options?: { allowZero?: boolean },
): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return null;
  }

  if (!options?.allowZero && value === 0) {
    return null;
  }

  return value;
};

const normalizeComparableText = (value: NullableText): string | null => {
  const normalized = normalizeText(value);
  return normalized ? normalized.toLowerCase() : null;
};

const buildBackfillNote = () =>
  'Backfilled from legacy ingredient procurement fields';

const buildProcurementSkuName = (
  ingredient: LegacyIngredientProcurementSnapshot,
): string => {
  const productModel = normalizeText(ingredient.productModel);
  if (!productModel) {
    return ingredient.name;
  }

  if (ingredient.name.includes(productModel)) {
    return ingredient.name;
  }

  return `${ingredient.name} ${productModel}`;
};

export const hasLegacyProcurementFootprint = (
  ingredient: LegacyIngredientProcurementSnapshot,
): boolean => {
  const baseUnit = normalizeComparableText(ingredient.baseUnit);
  const purchaseUnit = normalizeComparableText(ingredient.purchaseUnit);

  return Boolean(
    normalizeText(ingredient.brand) ||
      normalizeText(ingredient.productModel) ||
      normalizeText(ingredient.purchaseChannel) ||
      normalizeNumber(ingredient.currentPricePerPurchaseUnit) ||
      normalizeNumber(ingredient.effectivePricePerPurchaseUnit) ||
      normalizeNumber(ingredient.safetyStock, { allowZero: true }) !== null ||
      normalizeNumber(ingredient.reorderPoint, { allowZero: true }) !== null ||
      normalizeNumber(ingredient.targetStock, { allowZero: true }) !== null ||
      (typeof ingredient.purchaseToBaseRatio === 'number' &&
        Number.isFinite(ingredient.purchaseToBaseRatio) &&
        Math.abs(ingredient.purchaseToBaseRatio - 1) > 0.0001) ||
      (purchaseUnit && baseUnit && purchaseUnit !== baseUnit),
  );
};

const buildLegacyProcurementPayload = (
  ingredient: LegacyIngredientProcurementSnapshot,
): ProcurementSkuBackfillPayload => {
  const currentPurchasePrice = normalizeNumber(
    ingredient.currentPricePerPurchaseUnit,
  );
  const referencePurchasePrice =
    normalizeNumber(ingredient.effectivePricePerPurchaseUnit) ??
    currentPurchasePrice;
  const purchaseUnit = normalizeText(ingredient.purchaseUnit);
  const purchaseToBaseRatio =
    typeof ingredient.purchaseToBaseRatio === 'number' &&
    Number.isFinite(ingredient.purchaseToBaseRatio) &&
    ingredient.purchaseToBaseRatio > 0
      ? ingredient.purchaseToBaseRatio
      : null;

  return {
    name: buildProcurementSkuName(ingredient),
    brand: normalizeText(ingredient.brand),
    productModel: normalizeText(ingredient.productModel),
    purchaseChannel: normalizeText(ingredient.purchaseChannel),
    supplierName: null,
    purchaseUnit,
    purchaseToBaseRatio,
    currentPurchasePrice,
    referencePurchasePrice,
    referencePricePerPurchaseUnit: referencePurchasePrice,
    notes: buildBackfillNote(),
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    safetyStock: normalizeNumber(ingredient.safetyStock, { allowZero: true }),
    reorderPoint: normalizeNumber(ingredient.reorderPoint, { allowZero: true }),
    targetStock: normalizeNumber(ingredient.targetStock, { allowZero: true }),
  };
};

const fillMissingText = (
  current: NullableText,
  next: NullableText,
): string | null | undefined => {
  return normalizeText(current) ? undefined : normalizeText(next);
};

const fillMissingNumber = (
  current: NullableNumber,
  next: NullableNumber,
  options?: { allowZero?: boolean },
): number | null | undefined => {
  return normalizeNumber(current, options) !== null
    ? undefined
    : normalizeNumber(next, options);
};

const buildUpdatePatch = (
  sku: LegacyProcurementSkuSnapshot,
  legacy: ProcurementSkuBackfillPayload,
): Partial<ProcurementSkuBackfillPayload> => {
  const patch: Partial<ProcurementSkuBackfillPayload> = {};
  const assignIfPresent = <K extends keyof ProcurementSkuBackfillPayload>(
    key: K,
    value: ProcurementSkuBackfillPayload[K] | null | undefined,
  ) => {
    if (value !== undefined && value !== null) {
      patch[key] = value;
    }
  };

  const name = fillMissingText(sku.name, legacy.name);
  assignIfPresent('name', name);

  const brand = fillMissingText(sku.brand, legacy.brand);
  assignIfPresent('brand', brand);

  const productModel = fillMissingText(sku.productModel, legacy.productModel);
  assignIfPresent('productModel', productModel);

  const purchaseChannel = fillMissingText(
    sku.purchaseChannel,
    legacy.purchaseChannel,
  );
  assignIfPresent('purchaseChannel', purchaseChannel);

  const purchaseUnit = fillMissingText(sku.purchaseUnit, legacy.purchaseUnit);
  assignIfPresent('purchaseUnit', purchaseUnit);

  const purchaseToBaseRatio = fillMissingNumber(
    sku.purchaseToBaseRatio,
    legacy.purchaseToBaseRatio,
  );
  assignIfPresent('purchaseToBaseRatio', purchaseToBaseRatio);

  const currentPurchasePrice = fillMissingNumber(
    sku.currentPurchasePrice,
    legacy.currentPurchasePrice,
  );
  assignIfPresent('currentPurchasePrice', currentPurchasePrice);

  const referencePurchasePrice = fillMissingNumber(
    sku.referencePurchasePrice ?? sku.referencePricePerPurchaseUnit,
    legacy.referencePurchasePrice,
  );
  if (referencePurchasePrice !== undefined && referencePurchasePrice !== null) {
    patch.referencePurchasePrice = referencePurchasePrice;
    patch.referencePricePerPurchaseUnit = referencePurchasePrice;
  }

  const notes = fillMissingText(sku.notes, legacy.notes);
  assignIfPresent('notes', notes);

  const safetyStock = fillMissingNumber(
    sku.safetyStock,
    legacy.safetyStock,
    { allowZero: true },
  );
  assignIfPresent('safetyStock', safetyStock);

  const reorderPoint = fillMissingNumber(
    sku.reorderPoint,
    legacy.reorderPoint,
    { allowZero: true },
  );
  assignIfPresent('reorderPoint', reorderPoint);

  const targetStock = fillMissingNumber(
    sku.targetStock,
    legacy.targetStock,
    { allowZero: true },
  );
  assignIfPresent('targetStock', targetStock);

  if (!sku.isDefault) {
    patch.isDefault = true;
  }

  if (sku.isActive === false) {
    patch.isActive = true;
  }

  return patch;
};

const chooseUniqueMatch = (
  ingredient: LegacyIngredientProcurementSnapshot,
  skus: LegacyProcurementSkuSnapshot[],
): LegacyProcurementSkuSnapshot | null => {
  const normalizedChannel = normalizeComparableText(ingredient.purchaseChannel);
  const normalizedModel = normalizeComparableText(ingredient.productModel);

  const exactMatches = skus.filter((sku) => {
    return (
      normalizedChannel &&
      normalizedModel &&
      normalizeComparableText(sku.purchaseChannel) === normalizedChannel &&
      normalizeComparableText(sku.productModel) === normalizedModel
    );
  });
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const modelMatches = skus.filter(
    (sku) =>
      normalizedModel &&
      normalizeComparableText(sku.productModel) === normalizedModel,
  );
  if (modelMatches.length === 1) {
    return modelMatches[0];
  }

  const channelMatches = skus.filter(
    (sku) =>
      normalizedChannel &&
      normalizeComparableText(sku.purchaseChannel) === normalizedChannel,
  );
  if (channelMatches.length === 1) {
    return channelMatches[0];
  }

  return null;
};

export const planProcurementSkuBackfill = (
  ingredient: LegacyIngredientProcurementSnapshot,
): ProcurementSkuBackfillDecision => {
  if (!hasLegacyProcurementFootprint(ingredient)) {
    return {
      action: 'skip',
      ingredientId: ingredient.id,
      reason: 'no legacy procurement footprint',
    };
  }

  const legacyPayload = buildLegacyProcurementPayload(ingredient);
  const procurementSkus = ingredient.procurementSkus || [];

  if (procurementSkus.length === 0) {
    return {
      action: 'create',
      ingredientId: ingredient.id,
      reason: 'create default procurement sku from legacy ingredient fields',
      payload: legacyPayload,
    };
  }

  if (procurementSkus.length === 1) {
    const patch = buildUpdatePatch(procurementSkus[0], legacyPayload);
    return Object.keys(patch).length === 0
      ? {
          action: 'skip',
          ingredientId: ingredient.id,
          reason: 'single procurement sku already complete',
        }
      : {
          action: 'update',
          ingredientId: ingredient.id,
          skuId: procurementSkus[0].id,
          reason: 'fill missing fields on the single procurement sku and mark as default',
          payload: patch,
        };
  }

  const defaultSkus = procurementSkus.filter((sku) => sku.isDefault);
  if (defaultSkus.length > 1) {
    return {
      action: 'skip',
      ingredientId: ingredient.id,
      reason: 'multiple default procurement skus already exist',
    };
  }

  if (defaultSkus.length === 1) {
    const patch = buildUpdatePatch(defaultSkus[0], legacyPayload);
    return Object.keys(patch).length === 0
      ? {
          action: 'skip',
          ingredientId: ingredient.id,
          reason: 'default procurement sku already complete',
        }
      : {
          action: 'update',
          ingredientId: ingredient.id,
          skuId: defaultSkus[0].id,
          reason: 'fill missing fields on the existing default procurement sku',
          payload: patch,
        };
  }

  const matchedSku = chooseUniqueMatch(ingredient, procurementSkus);
  if (!matchedSku) {
    return {
      action: 'skip',
      ingredientId: ingredient.id,
      reason: 'multiple procurement skus exist and no safe default candidate could be inferred',
    };
  }

  const patch = buildUpdatePatch(matchedSku, legacyPayload);
  return Object.keys(patch).length === 0
    ? {
        action: 'skip',
        ingredientId: ingredient.id,
        reason: 'matched procurement sku already complete',
      }
    : {
        action: 'update',
        ingredientId: ingredient.id,
        skuId: matchedSku.id,
        reason: 'match legacy fields to an existing procurement sku and mark it as default',
        payload: patch,
      };
};
