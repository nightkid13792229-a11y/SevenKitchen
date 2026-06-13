export const FOOD_RATIO_TOTAL_TARGET = 100;
export const FOOD_RATIO_TOTAL_TOLERANCE = 0.001;

type RatioItem = {
  ratioPercent?: number | null;
  ingredient?: {
    type?: string | null;
  } | null;
  type?: string | null;
};

type FoodWeightRatioItem = RatioItem & {
  id: string;
  effectiveWeightG?: number | null;
};

function isFoodItem(item: RatioItem): boolean {
  return (item.ingredient?.type ?? item.type) === 'FOOD';
}

function normalizePositiveRatio(value: number | null | undefined): number {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}

export function sumFoodRatioPercent(items: RatioItem[]): number {
  return items
    .filter(isFoodItem)
    .reduce((sum, item) => sum + normalizePositiveRatio(item.ratioPercent), 0);
}

export function normalizeFoodRatioPercent(
  ratioPercent: number | null | undefined,
  foodRatioTotalPercent: number,
): number {
  const ratio = normalizePositiveRatio(ratioPercent);
  const total = Number(foodRatioTotalPercent);

  if (!Number.isFinite(total) || total <= 0) {
    return ratio;
  }

  return (ratio / total) * FOOD_RATIO_TOTAL_TARGET;
}

export function isFoodRatioTotalNormalized(
  total: number,
  tolerance = FOOD_RATIO_TOTAL_TOLERANCE,
): boolean {
  return Math.abs(total - FOOD_RATIO_TOTAL_TARGET) <= tolerance;
}

export function buildFoodWeightRatioMap(
  items: FoodWeightRatioItem[],
): Map<string, number> {
  const foodItems = items.filter(isFoodItem);
  const totalFoodWeightG = foodItems.reduce((sum, item) => {
    const weight = Number(item.effectiveWeightG);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);

  if (totalFoodWeightG <= 0) {
    return new Map();
  }

  return new Map(
    foodItems.map((item) => {
      const weight = Number(item.effectiveWeightG);
      const positiveWeight = Number.isFinite(weight) && weight > 0 ? weight : 0;
      return [
        item.id,
        (positiveWeight / totalFoodWeightG) * FOOD_RATIO_TOTAL_TARGET,
      ];
    }),
  );
}
