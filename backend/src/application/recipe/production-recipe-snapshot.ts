/**
 * 生产用食谱快照 · 共享构建器
 *
 * 订单生产与试吃装备货都要把"一份食谱"冻成快照存进生产批次 ——
 * 车间按快照投料、按快照录入实际用量、原料库存也按快照扣减。
 *
 * 两处各写一遍最大的风险是**形状漂移**：车间录入实际用量时按 `ingredient_id`
 * 与 `ratio` 取值（`kitchen.service.ts`），任一处少写一个字段，
 * 现场就会在录重量那一步直接报错。因此这里只保留一份实现。
 *
 * 从 `OrderService.createOrderFromSnapshot` 原样抽出，行为不变。
 */

import { IngredientType } from '../../domain/ingredient/enums';
import type { Ingredient } from '../../domain/ingredient/ingredient.entity';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import {
  resolvePreparationMethodTokens,
} from './preparation-method-text.util';

/** 与订单侧共用的最小食谱结构（不依赖具体仓储实现） */
export interface RecipeForSnapshot {
  id: string;
  version: number;
  name: string;
  productionLossRate: number;
  energyDensityKcalPerKg: number;
  nutritionDetailedData?: unknown;
  items?: Array<{
    ingredientId: string;
    ratioPercent?: number | null;
    exampleWeight?: number | null;
    preparationMethod?: string | null;
    nutritionFoodId?: string | null;
    nutritionFood?: {
      name?: string | null;
      preparationState?: string | null;
      preparationStateLabel?: string | null;
    } | null;
    nutritionState?: string | null;
    nutritionStateLabel?: string | null;
    nutrientTargetKey?: string | null;
    nutrientTargetValue?: number | null;
    supplementTargets?: unknown;
  }>;
}

export interface BuildProductionRecipeSnapshotParams {
  recipe: RecipeForSnapshot;
  /** 已解析好的原料（key = 食谱行的 ingredientId） */
  ingredientMap: Map<string, Ingredient>;
  /** 制备方法 ID → 名称 */
  prepMethodMap: Map<string, string>;
  /** 营养标准口径，默认 FEDIAF_2021 */
  nutritionStandard?: string;
}

/** 荤素食材的示例重量合计（补剂按比例换算时要用） */
export function getRecipeSnapshotFoodExampleWeightG(
  recipeItems: NonNullable<RecipeForSnapshot['items']>,
  ingredientMap: Map<string, Ingredient>,
): number {
  return recipeItems.reduce((sum, item) => {
    const ingredient = ingredientMap.get(item.ingredientId);
    if (ingredient?.type !== IngredientType.FOOD) {
      return sum;
    }
    const exampleWeight = toPositiveNumber(item.exampleWeight);
    return exampleWeight ? sum + exampleWeight : sum;
  }, 0);
}

/**
 * 计算快照里的 `ratio`（百分比）。
 *
 * 食材直接用配方比例；补剂若没填比例，则按"示例重量 ÷ 食材示例重量合计"反推 ——
 * 车间录入实际用量时按这个比例乘总产量，所以补剂也必须有比例。
 */
export function resolveRecipeSnapshotItemRatio(
  item: NonNullable<RecipeForSnapshot['items']>[number],
  ingredient: Ingredient | undefined,
  foodExampleWeightG: number,
): number {
  if (ingredient?.type !== IngredientType.SUPPLEMENT) {
    return item.ratioPercent ?? 0;
  }

  const ratioPercent = toPositiveNumber(item.ratioPercent);
  if (ratioPercent) {
    return ratioPercent;
  }

  const exampleWeight = toPositiveNumber(item.exampleWeight);
  return exampleWeight && foodExampleWeightG > 0
    ? (exampleWeight / foodExampleWeightG) * 100
    : 0;
}

export function buildProductionRecipeSnapshot(
  params: BuildProductionRecipeSnapshotParams,
): RecipeSnapshot {
  const { recipe, ingredientMap, prepMethodMap } = params;
  const recipeItems = recipe.items ?? [];
  const snapshotFoodExampleWeightG = getRecipeSnapshotFoodExampleWeightG(
    recipeItems,
    ingredientMap,
  );

  return {
    id: recipe.id,
    version: recipe.version,
    name: recipe.name,
    production_loss_rate: recipe.productionLossRate,
    energy_density_kcal_per_kg: recipe.energyDensityKcalPerKg,
    nutrition_standard: params.nutritionStandard ?? 'FEDIAF_2021',
    nutrition_detailed_data: recipe.nutritionDetailedData,
    items: recipeItems.map((ri) => {
      const ingredient = ingredientMap.get(ri.ingredientId);
      const preparationMethodNames = resolvePreparationMethodTokens(
        ri.preparationMethod,
        prepMethodMap,
        { preserveUnresolvedLegacy: false },
      );

      return {
        ingredient_id: ingredient?.id || ri.ingredientId,
        name: ingredient?.name || 'Unknown',
        ratio: resolveRecipeSnapshotItemRatio(
          ri,
          ingredient,
          snapshotFoodExampleWeightG,
        ),
        example_weight: ri.exampleWeight ?? undefined,
        nutrition_food_id: ri.nutritionFoodId ?? undefined,
        nutrition_food_name: ri.nutritionFood?.name ?? undefined,
        nutrition_state:
          ri.nutritionState ?? ri.nutritionFood?.preparationState ?? undefined,
        nutrition_state_label:
          ri.nutritionStateLabel ??
          ri.nutritionFood?.preparationStateLabel ??
          ri.nutritionFood?.preparationState ??
          undefined,
        ingredient_type: ingredient?.type,
        nutrient_target_key: ri.nutrientTargetKey ?? undefined,
        nutrient_target_value: ri.nutrientTargetValue ?? undefined,
        supplement_targets: ri.supplementTargets ?? undefined,
        nutrition_profile_snapshot:
          ingredient?.type === 'SUPPLEMENT'
            ? ingredient?.nutritionProfile ?? null
            : undefined,
        properties: ingredient?.properties,
        preparation_methods:
          preparationMethodNames.length > 0 ? preparationMethodNames : undefined,
        unit_display_label: ingredient?.unitDisplayLabel ?? undefined,
      };
    }),
  } as RecipeSnapshot;
}

function toPositiveNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}
