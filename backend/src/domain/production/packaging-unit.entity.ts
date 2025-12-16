/**
 * PackagingUnit Entity
 * Represents what is actually produced in a production batch
 * Phase 8.10: Production & Packaging MVP
 */

import { ValidationError } from '../common/errors';
import type { RecipeSnapshot } from '../recipe/types';

export class PackagingUnit {
  constructor(
    public readonly id: string,
    public readonly productionBatchId: string,
    public readonly recipeSnapshot: RecipeSnapshot, // Immutable reference
    public readonly totalProductionG: number, // Aggregated grams from all contributing OrderItems
    public readonly sourceOrderItemIds: string[], // Traceability: which OrderItems contributed
    public readonly createdAt: Date,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.totalProductionG <= 0) {
      throw new ValidationError(
        `Total production grams must be positive, got: ${this.totalProductionG}`,
      );
    }

    if (this.sourceOrderItemIds.length === 0) {
      throw new ValidationError(
        'PackagingUnit must have at least one source OrderItem',
      );
    }

    // RecipeSnapshot must be immutable (read-only after creation)
    // This is enforced by using readonly property and not providing update methods
  }
}
