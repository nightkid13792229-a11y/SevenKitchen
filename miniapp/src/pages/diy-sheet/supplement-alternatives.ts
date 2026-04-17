import {
  calculateSupplementAmountForProduction,
  getSupplementTargets,
} from '../../utils/supplement-nutrients';

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
  nutritionProfile?: any;
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
      nutritionProfile:
        defaultIngredient?.nutritionProfile ||
        baseItem.nutritionProfile ||
        baseItem.nutrition_profile_snapshot,
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
      nutritionProfile: ingredient.nutritionProfile,
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
  totalFoodInputWeightG: number,
): number {
  const result = calculateSupplementAmountForProduction(
    {
      ...baseItem,
      nutritionProfile:
        selectedOption?.nutritionProfile ||
        baseItem.nutritionProfile ||
        baseItem.nutrition_profile_snapshot,
      displayUnit: selectedOption?.displayUnit || baseItem.displayUnit,
      ingredient: {
        ...(baseItem.ingredient || {}),
        nutritionProfile:
          selectedOption?.nutritionProfile ||
          baseItem.ingredient?.nutritionProfile ||
          baseItem.nutritionProfile,
        unitDisplayLabel:
          selectedOption?.displayUnit || baseItem.ingredient?.unitDisplayLabel,
      },
    },
    totalFoodInputWeightG,
  );

  return result.amount || baseItem.amount || 0;
}

export function getSupplementNutrientUnit(
  baseItem: any,
  selectedOption: SupplementOption | undefined,
): string {
  return getSupplementTargets(baseItem)[0]?.unit || 'mg';
}
