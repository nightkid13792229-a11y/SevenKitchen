export interface ActiveNutrientValue {
  value: number;
  unit: string;
}

export interface SupplementOption {
  id: string;
  ingredientId: string;
  name: string;
  diyEnabled?: boolean;
  brand?: string;
  productModel?: string;
  purchaseChannel?: string;
  imageUrl?: string;
  purchaseLink?: any;
  displayUnit?: string;
  activeNutrients?: Record<string, ActiveNutrientValue>;
  properties?: Record<string, any>;
  timingLabel?: string;
  addTimingLabel?: string;
}

function isDiyRecommendationEnabled(candidate: any): boolean {
  return candidate?.diyEnabled !== false;
}

export function getSupplementSelectionKey(item: {
  recipeItemId?: string;
  ingredientId: string;
}): string {
  return item.recipeItemId || item.ingredientId;
}

export function buildSupplementCandidateOptions(
  baseItem: any,
  recipeItem: any,
): SupplementOption[] {
  const defaultIngredient = recipeItem?.ingredient;
  const options: SupplementOption[] = [];

  if (isDiyRecommendationEnabled(defaultIngredient || baseItem)) {
    options.push({
      id: `default:${baseItem.ingredientId}`,
      ingredientId: baseItem.ingredientId,
      name: baseItem.name,
      diyEnabled: defaultIngredient?.diyEnabled ?? baseItem.diyEnabled,
      brand: baseItem.brand,
      productModel: baseItem.productModel,
      purchaseChannel: baseItem.purchaseChannel,
      imageUrl:
        defaultIngredient?.imageUrl ||
        baseItem.imageUrl ||
        defaultIngredient?.properties?.image_url ||
        baseItem.properties?.image_url,
      purchaseLink:
        defaultIngredient?.purchaseLink || baseItem.properties?.purchase_link,
      displayUnit:
        defaultIngredient?.displayUnit || baseItem.displayUnit || baseItem.unit,
      activeNutrients:
        defaultIngredient?.activeNutrients || baseItem.properties?.active_nutrients,
      properties: defaultIngredient?.properties || baseItem.properties,
      addTimingLabel: defaultIngredient?.addTimingLabel,
      timingLabel: defaultIngredient?.addTimingLabel || baseItem.preparationMethod,
    });
  }

  for (const alternative of recipeItem?.supplementAlternatives || []) {
    const ingredient = alternative.ingredient;
    if (!ingredient?.id) {
      continue;
    }

    if (!isDiyRecommendationEnabled(ingredient)) {
      continue;
    }

    options.push({
      id: ingredient.id,
      ingredientId: ingredient.id,
      name: ingredient.name || alternative.ingredientName,
      diyEnabled: ingredient.diyEnabled,
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      purchaseChannel: ingredient.purchaseChannel,
      imageUrl: ingredient.imageUrl || ingredient.properties?.image_url,
      purchaseLink: ingredient.purchaseLink || ingredient.properties?.purchase_link,
      displayUnit: ingredient.displayUnit,
      activeNutrients:
        ingredient.activeNutrients || ingredient.properties?.active_nutrients,
      properties: ingredient.properties,
      addTimingLabel: ingredient.addTimingLabel,
      timingLabel: ingredient.addTimingLabel,
    });
  }

  const deduped = new Map<string, SupplementOption>();
  options.forEach((option) => {
    if (!deduped.has(option.ingredientId)) {
      deduped.set(option.ingredientId, option);
    }
  });

  return Array.from(deduped.values());
}

export function calculateSupplementAmountForOption(
  baseItem: any,
  selectedOption: SupplementOption | undefined,
  totalFoodNetWeightG: number,
  supplementLossRate: number,
): number {
  let amount = baseItem.amount;
  if (selectedOption?.activeNutrients && baseItem.nutrientTargetKey) {
    const concentration =
      selectedOption.activeNutrients[baseItem.nutrientTargetKey]?.value;
    if (concentration && concentration > 0 && baseItem.nutrientTargetValue) {
      const totalNutrientNeeded =
        baseItem.nutrientTargetValue * (totalFoodNetWeightG / 1000);
      const theoretical = totalNutrientNeeded / concentration;
      amount = theoretical * (1 + supplementLossRate);
    }
  }
  return amount;
}

export function getSupplementNutrientUnit(
  baseItem: any,
  selectedOption: SupplementOption | undefined,
): string {
  return (
    selectedOption?.activeNutrients?.[baseItem.nutrientTargetKey]?.unit ||
    baseItem.properties?.active_nutrients?.[baseItem.nutrientTargetKey]?.unit ||
    'mg'
  );
}
