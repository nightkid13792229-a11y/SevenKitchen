/**
 * OrderItem Entity
 * Value object containing immutable recipe snapshot
 */

import { RecipeSnapshot } from '../recipe/types';
import { ValidationError } from '../common/errors';
import { PreparationMethod } from './preparation-method.enum';
import { CookingMethod } from './cooking-method.enum';
import type { IngredientSourcePlanCode, OrderPackagePlanItem } from './index';

export class OrderItem {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly dogId: string | null, // Phase 8.20: Link order item to dog for displaying dog info in order details
    public readonly recipeSnapshot: RecipeSnapshot, // Immutable snapshot
    public readonly quantityG: number,
    public readonly packageCount: number,
    public readonly packageSpecG: number,
    public readonly customRequirements: string | null,
    public readonly dailyIntakeG: number, // Daily intake in grams, calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg
    public readonly vacuumBagSpec: string | null = null, // Vacuum bag specification (e.g., "12*17cm")
    public readonly productionBatchId: string | null = null, // Phase 8.11: Allocation lock - prevents duplicate allocation
    public readonly allocatedAt: Date | null = null, // Phase 8.11: Timestamp when item was allocated to a batch
    public readonly packagePlan: OrderPackagePlanItem[] | null = null,
    public readonly ingredientSourcePlan: IngredientSourcePlanCode | null = null,
    public readonly preparationMethod: PreparationMethod | null = null,
    public readonly cookingMethod: CookingMethod | null = null,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.quantityG <= 0) {
      throw new ValidationError(
        `Quantity must be positive, got: ${this.quantityG}`,
      );
    }

    if (this.packageCount <= 0) {
      throw new ValidationError(
        `Package count must be positive, got: ${this.packageCount}`,
      );
    }

    if (this.packageSpecG <= 0) {
      throw new ValidationError(
        `Package spec must be positive, got: ${this.packageSpecG}`,
      );
    }

    if (this.dailyIntakeG <= 0) {
      throw new ValidationError(
        `Daily intake must be positive, got: ${this.dailyIntakeG}`,
      );
    }

    if (this.packagePlan) {
      if (this.packagePlan.length === 0) {
        throw new ValidationError(
          'Package plan must contain at least one row when provided',
        );
      }

      const totalQuantity = this.packagePlan.reduce(
        (sum, row) => sum + row.packageSpecG * row.packageCount,
        0,
      );
      const totalCount = this.packagePlan.reduce(
        (sum, row) => sum + row.packageCount,
        0,
      );

      if (Math.round(totalQuantity) !== Math.round(this.quantityG)) {
        throw new ValidationError(
          `Package plan total (${totalQuantity}) must equal quantityG (${this.quantityG})`,
        );
      }

      if (totalCount !== this.packageCount) {
        throw new ValidationError(
          `Package plan count (${totalCount}) must equal packageCount (${this.packageCount})`,
        );
      }
    }

    // TODO: Add more validation rules
  }
}
