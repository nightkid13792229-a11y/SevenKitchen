interface PricingPreviewLike {
  pricingBreakdown?: {
    ingredientDetails?: Array<{
      type?: string
      ingredientId?: string
    }>
  }
}

interface RecipeItemLike {
  ingredientId?: string
  ingredientType?: string
  ratioPercent?: number
  ratio?: number
  nutritionState?: string
  nutritionStateLabel?: string
  nutrition_state?: string
  nutrition_state_label?: string
  nutritionFood?: {
    preparationState?: string
    preparationStateLabel?: string
  }
  preparationMethod?: string
  name?: string
  ingredient?: {
    id?: string
    name?: string
    type?: string
    brand?: string
    productModel?: string
    purchaseChannel?: string
    displayUnit?: string
    properties?: Record<string, any>
  }
}

function isFoodRecipeItem(item: RecipeItemLike): boolean {
  return item.ingredientType === 'FOOD' || item.ingredient?.type === 'FOOD'
}

function getNutritionStateLabel(item: RecipeItemLike): string | null {
  return (
    item.nutritionStateLabel ||
    item.nutrition_state_label ||
    item.nutritionFood?.preparationStateLabel ||
    item.nutritionState ||
    item.nutrition_state ||
    item.nutritionFood?.preparationState ||
    null
  )
}

function toUniqueIds(ids: Array<string | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
}

export function buildFallbackFoodIngredientItems(
  recipeItems: RecipeItemLike[],
  totalFoodNetWeightG: number,
) {
  return (recipeItems || [])
    .filter(isFoodRecipeItem)
    .map((item) => {
      const ratioPercent = item.ratioPercent ?? item.ratio ?? 0
      const ingredientName = item.ingredient?.name || item.name || '未知食材'
      const netAmountKg = (totalFoodNetWeightG * ratioPercent) / 100 / 1000

      return {
        ingredientId: item.ingredientId || item.ingredient?.id,
        ingredientName,
        name: ingredientName,
        type: 'FOOD',
        nutritionStateLabel: getNutritionStateLabel(item),
        preparationMethod: item.preparationMethod || null,
        netAmount: netAmountKg,
        displayUnit: item.ingredient?.displayUnit || 'g',
        brand: item.ingredient?.brand,
        productModel: item.ingredient?.productModel,
        purchaseChannel: item.ingredient?.purchaseChannel,
        properties: item.ingredient?.properties,
      }
    })
}

export function collectFoodIngredientIdsForRecommendations(
  pricePreview: PricingPreviewLike | null | undefined,
  recipeItems: RecipeItemLike[],
): string[] {
  const pricedIngredientIds = toUniqueIds(
    (pricePreview?.pricingBreakdown?.ingredientDetails || [])
      .filter((item) => item.type === 'FOOD')
      .map((item) => item.ingredientId),
  )

  if (pricedIngredientIds.length > 0) {
    return pricedIngredientIds
  }

  return toUniqueIds(
    (recipeItems || [])
      .filter(isFoodRecipeItem)
      .map((item) => item.ingredientId || item.ingredient?.id),
  )
}

export function getDiySheetPricePreviewWarning(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')

  if (message.includes('Missing concentration for supplement target')) {
    return '当前食谱的补剂营养浓度未配置完整，暂时仅展示食材清单。'
  }

  return '补剂和精确采购量暂时无法计算，当前先展示食材清单。'
}
