/**
 * Pricing Service
 * Domain service for calculating order prices based on cost and margin
 * Based on 07_Core_Architecture.md Section 3.5 "Order Price & Shipping Cost"
 */

import { Ingredient } from '../ingredient/ingredient.entity';
import { IngredientType } from '../ingredient/enums';
import { ValidationError } from '../common/errors';

export interface GlobalConfig {
  laborHourlyRate: number;
  minOrderWeightG: number;
  defaultBatchCapacityG: number;
  targetMargin: number;
  overheadCostPerKg: number;
  targetBatchUtilization: number;
  supplementLossRate: number;
  defaultVacuumBagId: string | null;
  defaultProductLabelId: string | null;
  defaultShippingLabelId: string | null;
  defaultIcePackId: string | null;
}

export interface RecipeItem {
  ingredientId: string;
  ingredient: Ingredient;
  ratioPercent?: number | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
}

export interface Recipe {
  id: string;
  productionLossRate: number;
  batchLaborHours: number;
  items: RecipeItem[];
}

export interface DogProfile {
  mealsPerDay: number;
}

export interface PricingCalculationInput {
  dog: DogProfile;
  recipe: Recipe;
  dailyG: number;
  days: number;
  discountRate?: number;
  globalConfig: GlobalConfig;
}

export interface PricingBreakdown {
  costIngredients: number;
  costPackaging: number;
  costLabor: number;
  costOverhead: number;
  totalProductCost: number;
  productPrice: number;
  shippingFee: number;
  totalPrice: number;
}

/**
 * Helper: Round up to nearest 5g (for package spec)
 */
function ceilTo5g(amount: number): number {
  return Math.ceil(amount / 5) * 5;
}

export class PricingService {
  /**
   * Calculate order price details
   * Implements algorithm from 07_Core_Architecture.md Section 3.5
   */
  calculateOrderPrice(
    input: PricingCalculationInput,
  ): PricingBreakdown {
    const {
      dog,
      recipe,
      dailyG,
      days,
      discountRate = 1.0,
      globalConfig,
    } = input;

    // ==========================================
    // 0. 起订量检查 (Minimum Order Check)
    // ==========================================
    const totalNetFoodWeightG = dailyG * days;
    if (totalNetFoodWeightG < globalConfig.minOrderWeightG) {
      throw new ValidationError(
        `订单净重不足 ${globalConfig.minOrderWeightG}g (当前 ${totalNetFoodWeightG}g)`,
      );
    }

    // ==========================================
    // 1. 基础物理量 (Basic Physical Quantities)
    // ==========================================
    const mealsPerDay = dog.mealsPerDay;
    // 向上取整到 5g (分装规格)
    const singlePackSpecG = ceilTo5g(dailyG / mealsPerDay);
    const totalPacks = mealsPerDay * days;

    // 生产投料净重 (Net production input weight)
    const totalNetWeightKg = (singlePackSpecG * totalPacks) / 1000.0;

    // 生产投料毛重 (含烹饪损耗) (Gross input weight with production loss)
    const rawInputWeightKg =
      totalNetWeightKg * recipe.productionLossRate;

    // ==========================================
    // 2. 核心成本计算 (Product Cost)
    // ==========================================
    let costIngredients = 0;

    for (const item of recipe.items) {
      const ingredient = item.ingredient;

      // --- A. 食材 (Food - Yield Rate Logic) ---
      if (ingredient.type === IngredientType.FOOD) {
        if (!item.ratioPercent) {
          throw new ValidationError(
            `ratio_percent is required for FOOD ingredient: ${ingredient.name}`,
          );
        }

        const itemNetNeededKg =
          rawInputWeightKg * (item.ratioPercent / 100.0);

        // 出肉率校准 (Yield rate adjustment)
        const yieldRate = ingredient.getEdibleYieldRate();
        const itemGrossPurchaseKg = itemNetNeededKg / yieldRate;

        const unitCost = ingredient.getUnitCost();
        // Convert kg to g, then multiply by unit cost (per g)
        costIngredients += itemGrossPurchaseKg * 1000 * unitCost;
      }

      // --- B. 补剂 (Supplement - Custom Loss Logic) ---
      else if (ingredient.type === IngredientType.SUPPLEMENT) {
        if (!item.nutrientTargetKey || !item.nutrientTargetValue) {
          throw new ValidationError(
            `nutrient_target_key and nutrient_target_value are required for SUPPLEMENT ingredient: ${ingredient.name}`,
          );
        }

        const targetKey = item.nutrientTargetKey;
        const targetVal = item.nutrientTargetValue;
        const suppProps = ingredient.properties as any;
        const activeNutrients = suppProps.active_nutrients || {};
        const concentration = activeNutrients[targetKey] || 0;

        if (concentration <= 0) {
          throw new ValidationError(
            `Missing or zero concentration for ${targetKey} in ingredient ${ingredient.name}`,
          );
        }

        // Total nutrient needed: target_val * raw_input_weight_kg
        const totalNutrientNeeded = targetVal * rawInputWeightKg;
        const unitsTheoretical = totalNutrientNeeded / concentration;

        // Read ingredient-specific loss rate (default to global)
        const customLoss =
          ingredient.getProductionLossRate() ??
          globalConfig.supplementLossRate;
        const unitsNeeded = unitsTheoretical * customLoss;

        const unitCost = ingredient.getUnitCost();
        costIngredients += unitsNeeded * unitCost;
      }
      // Note: PACKAGING is handled separately below
    }

    // --- C. 人工与制造费用 (Labor & Overhead - Standard Costing) ---
    // Standard batch output (kg)
    const standardBatchOutputKg =
      (globalConfig.defaultBatchCapacityG / 1000.0) *
      globalConfig.targetBatchUtilization;
    const standardLaborCostPerKg =
      (globalConfig.laborHourlyRate * recipe.batchLaborHours) /
      standardBatchOutputKg;

    const costLabor = rawInputWeightKg * standardLaborCostPerKg;

    // Manufacturing Overhead
    const costOverhead =
      rawInputWeightKg * globalConfig.overheadCostPerKg;

    // --- D. 包材成本与重量 (Packaging Cost & Weight) ---
    let costPackaging = 0;
    let weightPackagingG = 0;

    // For MVP, we'll use simplified packaging logic
    // Get default packaging ingredients (if available)
    // Note: In a real implementation, these would be fetched from repository
    // For now, we'll calculate based on the ingredients provided in recipe.items
    // that are of type PACKAGING

    const packagingItems = recipe.items.filter(
      (item) => item.ingredient.type === IngredientType.PACKAGING,
    );

    // D1. 随餐耗材 (Per-pack consumables)
    for (const item of packagingItems) {
      const ingredient = item.ingredient;
      if (ingredient.isConsumablePackaging()) {
        const unitCost = ingredient.getUnitCost();
        const weightG = ingredient.weightG || 0;

        // Each pack uses one unit of packaging
        costPackaging += totalPacks * unitCost;
        weightPackagingG += totalPacks * weightG;
      }
    }

    // D2. 物流耗材 (Shipping consumables)
    // For MVP, we'll use a simplified calculation
    // TODO: Implement smart bin packing algorithm (calculate_shipping_containers)
    // For now, shipping packaging cost is handled separately or included in shipping fee

    // If shipping packaging ingredients are in the items, use them
    // Otherwise, add a placeholder cost (will be handled by shipping fee later)
    // For now, we'll skip detailed shipping packaging calculation in MVP

    const totalProductCost =
      costIngredients + costLabor + costOverhead + costPackaging;

    // ==========================================
    // 3. 产品定价 (Product Pricing)
    // ==========================================
    // Apply margin only to product cost, not shipping
    const baseProductPrice =
      totalProductCost / (1 - globalConfig.targetMargin);

    // ==========================================
    // 4. 运费计算 (Shipping Fee)
    // ==========================================
    // For MVP, shipping fee is stubbed to 0 or calculated separately
    // Per doc: "can return 0 with clear TODO, but keep the interface consistent"
    const shippingFee = 0; // TODO: Implement shipping fee calculation

    // ==========================================
    // 5. 最终总价 (Final Total)
    // ==========================================
    // Product discount, shipping usually not discounted
    const finalTotal = baseProductPrice * discountRate + shippingFee;

    return {
      costIngredients,
      costPackaging,
      costLabor,
      costOverhead,
      totalProductCost,
      productPrice: baseProductPrice * discountRate,
      shippingFee,
      totalPrice: finalTotal,
    };
  }
}
