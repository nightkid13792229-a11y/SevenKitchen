/**
 * InventoryLedgerEntry Entity
 * Phase 8.13: Inventory Deduction
 * 
 * Represents an immutable ledger entry for inventory changes.
 * Follows append-only accounting pattern.
 */

import { ValidationError } from '../common/errors';
import { InventorySourceType } from './enums';

export class InventoryLedgerEntry {
  constructor(
    public readonly id: string,
    public readonly ingredientId: string,
    public readonly deltaG: number, // negative for deduction, positive for addition
    public readonly sourceType: InventorySourceType,
    public readonly sourceId: string, // PackagingUnit.id for KITCHEN_TASK
    public readonly createdAt: Date,
  ) {
    this.validateInvariants();
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.deltaG === 0) {
      throw new ValidationError('deltaG cannot be zero');
    }

    // For KITCHEN_TASK, deltaG must be negative (deduction)
    if (this.sourceType === InventorySourceType.KITCHEN_TASK && this.deltaG > 0) {
      throw new ValidationError(
        `Kitchen task deductions must be negative, got: ${this.deltaG}`,
      );
    }

    if (!this.ingredientId || this.ingredientId.trim() === '') {
      throw new ValidationError('ingredientId cannot be empty');
    }

    if (!this.sourceId || this.sourceId.trim() === '') {
      throw new ValidationError('sourceId cannot be empty');
    }
  }
}

