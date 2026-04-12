/**
 * Ingredient Entity
 * Domain entity for Ingredient aggregate root
 * Based on 07_Core_Architecture.md Section 2.3
 */

import {
  IngredientType,
  BaseUnit,
  IngredientProcurementStrategy,
} from './enums';
import {
  FoodProperties,
  NutritionProfile,
  SupplementProperties,
  PackagingProperties,
} from './types';
import { ValidationError } from '../common/errors';

export interface IngredientProperties
  extends
    Partial<FoodProperties>,
    Partial<SupplementProperties>,
    Partial<PackagingProperties> {}

export class Ingredient {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: IngredientType,
    public readonly procurementStrategy: IngredientProcurementStrategy,
    public readonly brand: string | null,
    public readonly productModel: string | null,
    public readonly purchaseChannel: string | null,
    public readonly notes: string | null,
    public readonly baseUnit: BaseUnit,
    public readonly unitDisplayLabel: string | null,
    public readonly purchaseUnit: string,
    public readonly purchaseToBaseRatio: number,
    public readonly currentPricePerPurchaseUnit: number,
    public readonly effectivePricePerPurchaseUnit: number | null,
    public readonly weightG: number | null,
    public readonly maxCapacityG: number | null,
    public readonly safetyStock: number | null,
    public readonly reorderPoint: number | null,
    public readonly targetStock: number | null,
    public readonly properties: IngredientProperties,
    public readonly nutritionProfile: NutritionProfile | null = null,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.purchaseToBaseRatio <= 0) {
      throw new ValidationError(
        `purchase_to_base_ratio must be positive, got: ${this.purchaseToBaseRatio}`,
      );
    }

    if (this.currentPricePerPurchaseUnit < 0) {
      throw new ValidationError(
        `current_price_per_purchase_unit must be non-negative, got: ${this.currentPricePerPurchaseUnit}`,
      );
    }

    if (
      this.effectivePricePerPurchaseUnit !== null &&
      this.effectivePricePerPurchaseUnit < 0
    ) {
      throw new ValidationError(
        `effective_price_per_purchase_unit must be non-negative, got: ${this.effectivePricePerPurchaseUnit}`,
      );
    }

    if (this.safetyStock !== null && this.safetyStock < 0) {
      throw new ValidationError(
        `safety_stock must be non-negative, got: ${this.safetyStock}`,
      );
    }

    if (this.reorderPoint !== null && this.reorderPoint < 0) {
      throw new ValidationError(
        `reorder_point must be non-negative, got: ${this.reorderPoint}`,
      );
    }

    if (this.targetStock !== null && this.targetStock < 0) {
      throw new ValidationError(
        `target_stock must be non-negative, got: ${this.targetStock}`,
      );
    }

    if (
      this.safetyStock !== null &&
      this.reorderPoint !== null &&
      this.reorderPoint < this.safetyStock
    ) {
      throw new ValidationError(
        `reorder_point must be greater than or equal to safety_stock, got: ${this.reorderPoint} < ${this.safetyStock}`,
      );
    }

    if (
      this.reorderPoint !== null &&
      this.targetStock !== null &&
      this.targetStock < this.reorderPoint
    ) {
      throw new ValidationError(
        `target_stock must be greater than or equal to reorder_point, got: ${this.targetStock} < ${this.reorderPoint}`,
      );
    }

    // Validate type-specific properties
    if (this.type === IngredientType.FOOD) {
      const foodProps = this.properties as FoodProperties;
      if (foodProps.edible_yield_rate !== undefined) {
        if (
          foodProps.edible_yield_rate <= 0 ||
          foodProps.edible_yield_rate > 1
        ) {
          throw new ValidationError(
            `edible_yield_rate must be between 0 and 1, got: ${foodProps.edible_yield_rate}`,
          );
        }
      }
      if (this.baseUnit === BaseUnit.ML && !foodProps.density_g_per_ml) {
        throw new ValidationError(
          `density_g_per_ml is required when base_unit is ML`,
        );
      }
    }

    if (this.type === IngredientType.PACKAGING) {
      const packagingProps = this.properties as PackagingProperties;
      if (packagingProps.is_consumable === undefined) {
        throw new ValidationError(
          `is_consumable is required for PACKAGING type`,
        );
      }
      if (packagingProps.is_consumable && !this.weightG) {
        throw new ValidationError(
          `weight_g is required for consumable PACKAGING`,
        );
      }
    }
  }

  /**
   * Get effective price
   */
  getEffectivePricePerPurchaseUnit(): number {
    return (
      this.effectivePricePerPurchaseUnit ?? this.currentPricePerPurchaseUnit
    );
  }

  /**
   * Compatibility alias for the refactored standard unit display name.
   */
  get baseUnitDisplayName(): string | null {
    return this.unitDisplayLabel;
  }

  /**
   * Calculate unit cost (per base unit)
   * Formula: effective_price_per_purchase_unit / purchase_to_base_ratio
   */
  getUnitCost(): number {
    return this.getEffectivePricePerPurchaseUnit() / this.purchaseToBaseRatio;
  }

  /**
   * Get edible yield rate (for FOOD type)
   * Defaults to 1.0 if not specified
   */
  getEdibleYieldRate(): number {
    if (this.type !== IngredientType.FOOD) {
      return 1.0; // Not applicable, return neutral value
    }
    const foodProps = this.properties as FoodProperties;
    return foodProps.edible_yield_rate ?? 1.0;
  }

  /**
   * Get production loss rate (for SUPPLEMENT type)
   * Returns ingredient-specific rate if set, otherwise null (to use global default)
   */
  getProductionLossRate(): number | null {
    if (this.type !== IngredientType.SUPPLEMENT) {
      return null; // Not applicable
    }
    const suppProps = this.properties as SupplementProperties;
    return suppProps.production_loss_rate ?? null;
  }

  /**
   * Check if ingredient is consumable packaging
   */
  isConsumablePackaging(): boolean {
    if (this.type !== IngredientType.PACKAGING) {
      return false;
    }
    const packagingProps = this.properties as PackagingProperties;
    return packagingProps.is_consumable ?? false;
  }
}
