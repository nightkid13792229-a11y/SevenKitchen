/**
 * OrderItem Entity
 * Value object containing immutable recipe snapshot
 */

import { RecipeSnapshot } from '../recipe/types';
import { ValidationError } from '../common/errors';

export class OrderItem {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly recipeSnapshot: RecipeSnapshot, // Immutable snapshot
    public readonly quantityG: number,
    public readonly packageCount: number,
    public readonly packageSpecG: number,
    public readonly customRequirements: string | null,
    public readonly dailyIntakeG: number, // Daily intake in grams, calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg
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

    // TODO: Add more validation rules
  }
}
