import type {
  NutritionDetailedData,
  RecipeForm,
  RecipeItem,
  SupplementTarget,
} from '../types/recipe';

const LEGACY_LIFE_STAGE_MAP: Record<string, string> = {
  PUPPY: 'PUPPY_14_WEEKS_PLUS',
  ADULT: 'HIGH_ACTIVITY_ADULT',
  SENIOR: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
  PREGNANCY: 'REPRODUCTION',
  LACTATION: 'REPRODUCTION',
};

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}

export function normalizeRecipeLifeStagesForSubmit(
  lifeStages?: string[],
  availableLifeStages?: string[],
): string[] {
  const availableSet = new Set(availableLifeStages || []);

  return uniqueStrings(
    (lifeStages || []).map((stage) => {
      const mappedStage = LEGACY_LIFE_STAGE_MAP[stage] || stage;
      if (availableSet.size === 0 || availableSet.has(mappedStage)) {
        return mappedStage;
      }
      return availableSet.has(stage) ? stage : mappedStage;
    }),
  );
}

function sanitizeSupplementTargets(targets?: SupplementTarget[]): SupplementTarget[] {
  if (!Array.isArray(targets)) {
    return [];
  }

  return targets
    .filter((target) => target.fieldPath && target.label && target.unit)
    .map((target) => ({
      fieldPath: target.fieldPath,
      label: target.label,
      targetValuePerKg: target.targetValuePerKg,
      unit: target.unit,
    }));
}

function isSupplementRecipeItem(item: RecipeItem): boolean {
  return (item.ingredientType || item.ingredient?.type) === 'SUPPLEMENT';
}

export function sanitizeRecipeItemsForSubmit(items?: RecipeItem[]): RecipeItem[] {
  return (items || []).map((item) => {
    const isSupplement = isSupplementRecipeItem(item);
    const supplementTargets = isSupplement
      ? sanitizeSupplementTargets(item.supplementTargets)
      : [];

    return stripUndefined({
      ingredientId: item.ingredientId,
      nutritionFoodId: item.nutritionFoodId || undefined,
      preparationMethod: item.preparationMethod,
      exampleWeight: item.exampleWeight,
      ratioPercent: item.ratioPercent,
      nutrientTargetKey: isSupplement ? item.nutrientTargetKey : undefined,
      nutrientTargetValue: isSupplement ? item.nutrientTargetValue : undefined,
      supplementTargets:
        supplementTargets.length > 0 ? supplementTargets : undefined,
      supplementAlternativeIngredientIds: uniqueStrings(
        item.supplementAlternativeIngredientIds || [],
      ),
    }) as RecipeItem;
  });
}

export function buildRecipeSubmitData(
  form: RecipeForm,
  nutritionData: NutritionDetailedData,
  overrides: Partial<RecipeForm> = {},
  availableLifeStages?: string[],
): RecipeForm {
  return stripUndefined({
    name: form.name,
    coverImageUrl: form.coverImageUrl,
    coverTitle: form.coverTitle,
    detailImages: form.detailImages || [],
    videoUrl: form.videoUrl,
    description: form.description,
    designSource: form.designSource,
    nutritionStandard: form.nutritionStandard,
    energyDensityKcalPerKg: form.energyDensityKcalPerKg,
    items: sanitizeRecipeItemsForSubmit(form.items),
    nutritionDetailedData: { ...nutritionData },
    targetHealthTags: uniqueStrings(form.targetHealthTags || []),
    applicableLifeStages: normalizeRecipeLifeStagesForSubmit(
      form.applicableLifeStages as string[] | undefined,
      availableLifeStages,
    ) as any,
    productionSteps: form.productionSteps,
    productionLossRate: form.productionLossRate,
    batchLaborHours: form.batchLaborHours,
    status: overrides.status ?? form.status,
  }) as RecipeForm;
}
