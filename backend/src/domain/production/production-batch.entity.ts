/**
 * ProductionBatch Entity
 * Aggregate root for Production domain
 * Phase 8.10: Production & Packaging MVP
 */

import { ProductionBatchStatus, PackagingUnitStatus } from './enums';
import { PackagingUnit } from './packaging-unit.entity';
import { ValidationError, InvalidStateTransitionError } from '../common/errors';

export class ProductionBatch {
  constructor(
    public readonly id: string,
    public readonly productionDate: Date, // YYYY-MM-DD (date only, no time)
    public status: ProductionBatchStatus,
    public readonly packagingUnits: PackagingUnit[],
    public readonly createdAt: Date,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    // Production date must be valid
    if (isNaN(this.productionDate.getTime())) {
      throw new ValidationError('Production date must be a valid date');
    }

    // PackagingUnits array can be empty initially, but should be populated before use
    // This is a business rule, not a strict invariant
  }

  /**
   * Check if batch can be modified
   * Immutable once status >= IN_PRODUCTION
   */
  canBeModified(): boolean {
    return this.status === ProductionBatchStatus.PLANNED;
  }

  /**
   * Transition batch status
   */
  transitionTo(newStatus: ProductionBatchStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition from ${this.status} to ${newStatus}`,
      );
    }

    this.status = newStatus;
  }

  /**
   * Check if transition is allowed
   */
  private canTransitionTo(newStatus: ProductionBatchStatus): boolean {
    const validTransitions: Record<ProductionBatchStatus, ProductionBatchStatus[]> = {
      [ProductionBatchStatus.PLANNED]: [
        ProductionBatchStatus.IN_PRODUCTION,
      ],
      [ProductionBatchStatus.IN_PRODUCTION]: [
        ProductionBatchStatus.COMPLETED,
      ],
      [ProductionBatchStatus.COMPLETED]: [], // Terminal state
    };

    const allowedNextStates = validTransitions[this.status] || [];
    return allowedNextStates.includes(newStatus);
  }

  /**
   * Get total production grams across all packaging units
   */
  getTotalProductionG(): number {
    return this.packagingUnits.reduce(
      (sum, unit) => sum + unit.totalProductionG,
      0,
    );
  }

  /**
   * Get count of unique recipes in this batch
   */
  getUniqueRecipeCount(): number {
    return this.packagingUnits.length;
  }

  /**
   * Check if all packaging units in this batch are completed
   * Phase 8.14: Used to determine if batch can be auto-completed
   */
  areAllUnitsCompleted(): boolean {
    if (this.packagingUnits.length === 0) {
      return false; // Empty batch cannot be completed
    }
    return this.packagingUnits.every(
      (unit) => unit.status === PackagingUnitStatus.COMPLETED,
    );
  }
}
