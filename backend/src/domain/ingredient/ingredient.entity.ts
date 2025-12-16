/**
 * Ingredient Entity
 * Domain entity for Ingredient aggregate root
 * Based on 07_Core_Architecture.md Section 2.3
 */

import { IngredientType, BaseUnit } from './enums';
import {
  FoodProperties,
  SupplementProperties,
  PackagingProperties,
} from './types';
import { ValidationError } from '../common/errors';

export interface IngredientProperties
  extends Partial<FoodProperties>,
    Partial<SupplementProperties>,
    Partial<PackagingProperties> {}

export class Ingredient {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: IngredientType,
    public readonly brand: string | null,
    public readonly productModel: string | null,
    public readonly purchaseChannel: string | null,
    public readonly notes: string | null,
    public readonly baseUnit: BaseUnit,
    public readonly unitDisplayLabel: string | null,
    public readonly purchaseUnit: string,
    public readonly purchaseToBaseRatio: number,
    public readonly currentPricePerPurchaseUnit: number,
    public readonly weightG: number | null,
    public readonly maxCapacityG: number | null,
    public readonly properties: IngredientProperties,
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

    // Validate type-specific properties
    if (this.type === IngredientType.FOOD) {
      const foodProps = this.properties as FoodProperties;
      if (foodProps.edible_yield_rate !== undefined) {
        if (foodProps.edible_yield_rate <= 0 || foodProps.edible_yield_rate > 1) {
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
   * Calculate unit cost (per base unit)
   * Formula: current_price_per_purchase_unit / purchase_to_base_ratio
   */
  getUnitCost(): number {
    return this.currentPricePerPurchaseUnit / this.purchaseToBaseRatio;
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
