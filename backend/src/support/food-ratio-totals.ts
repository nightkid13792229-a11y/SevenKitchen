import {
  FOOD_RATIO_TOTAL_TARGET,
  isFoodRatioTotalNormalized,
  normalizeFoodRatioPercent,
  sumFoodRatioPercent,
} from '../domain/recipe/food-ratio-normalization';

export type FoodRatioAuditItem = {
  id: string;
  ratioPercent?: number | null;
  ingredient?: {
    name?: string | null;
    type?: string | null;
  } | null;
};

export type FoodRatioAuditRecipe = {
  id: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  seriesLifeStage?: string | null;
  items: FoodRatioAuditItem[];
};

export type FoodRatioAuditReport = {
  internalId: string;
  recipeId: string;
  version: number;
  name: string;
  status: string;
  seriesLifeStage: string | null;
  foodItemCount: number;
  foodRatioTotalPercent: number;
  deltaPercent: number;
  isNormalized: boolean;
};

export type FoodRatioRepairUpdate = {
  recipeItemId: string;
  recipeId: string;
  version: number;
  ingredientName: string | null;
  fromRatioPercent: number | null;
  toRatioPercent: number;
};

export type FoodRatioRepairPlan = {
  report: FoodRatioAuditReport;
  updates: FoodRatioRepairUpdate[];
  skippedReason: string | null;
};

export function buildFoodRatioAuditReports(
  recipes: FoodRatioAuditRecipe[],
  options: { includeOk?: boolean } = {},
): FoodRatioAuditReport[] {
  const reports = recipes.map(buildFoodRatioAuditReport).sort(compareReports);

  if (options.includeOk) {
    return reports;
  }

  return reports.filter((report) => !report.isNormalized);
}

export function buildFoodRatioRepairPlans(
  recipes: FoodRatioAuditRecipe[],
): FoodRatioRepairPlan[] {
  return recipes.map((recipe) => {
    const report = buildFoodRatioAuditReport(recipe);

    if (report.isNormalized) {
      return {
        report,
        updates: [],
        skippedReason: null,
      };
    }

    if (report.foodRatioTotalPercent <= 0) {
      return {
        report,
        updates: [],
        skippedReason: 'FOOD ratio total is zero or missing',
      };
    }

    return {
      report,
      updates: recipe.items
        .filter(isFoodItem)
        .filter((item) => toPositiveRatio(item.ratioPercent) > 0)
        .map((item) => ({
          recipeItemId: item.id,
          recipeId: recipe.recipeId,
          version: recipe.version,
          ingredientName: item.ingredient?.name ?? null,
          fromRatioPercent: item.ratioPercent ?? null,
          toRatioPercent: normalizeFoodRatioPercent(
            item.ratioPercent,
            report.foodRatioTotalPercent,
          ),
        })),
      skippedReason: null,
    };
  });
}

function buildFoodRatioAuditReport(
  recipe: FoodRatioAuditRecipe,
): FoodRatioAuditReport {
  const foodRatioTotalPercent = sumFoodRatioPercent(recipe.items);

  return {
    internalId: recipe.id,
    recipeId: recipe.recipeId,
    version: recipe.version,
    name: recipe.name,
    status: recipe.status,
    seriesLifeStage: recipe.seriesLifeStage ?? null,
    foodItemCount: recipe.items.filter(isFoodItem).length,
    foodRatioTotalPercent,
    deltaPercent: foodRatioTotalPercent - FOOD_RATIO_TOTAL_TARGET,
    isNormalized: isFoodRatioTotalNormalized(foodRatioTotalPercent),
  };
}

function compareReports(
  left: FoodRatioAuditReport,
  right: FoodRatioAuditReport,
): number {
  const riskDiff = Math.abs(right.deltaPercent) - Math.abs(left.deltaPercent);
  if (riskDiff !== 0) return riskDiff;

  const recipeDiff = left.recipeId.localeCompare(right.recipeId);
  if (recipeDiff !== 0) return recipeDiff;

  return right.version - left.version;
}

function isFoodItem(item: FoodRatioAuditItem): boolean {
  return item.ingredient?.type === 'FOOD';
}

function toPositiveRatio(value: number | null | undefined): number {
  const ratio = Number(value);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}
