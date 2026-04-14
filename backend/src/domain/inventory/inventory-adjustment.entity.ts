import { ValidationError } from '../common/errors';
import { InventoryAdjustmentMode } from './enums';

export class InventoryAdjustment {
  constructor(
    public readonly id: string,
    public readonly ingredientId: string,
    public readonly procurementSkuId: string | null,
    public readonly adjustmentMode: InventoryAdjustmentMode,
    public readonly quantityBeforeG: number,
    public readonly quantityAfterG: number,
    public readonly deltaG: number,
    public readonly reason: string,
    public readonly note: string | null,
    public readonly createdAt: Date,
  ) {
    this.validateInvariants();
  }

  private validateInvariants(): void {
    if (!this.ingredientId.trim()) {
      throw new ValidationError('ingredientId cannot be empty');
    }

    if (this.procurementSkuId !== null && !this.procurementSkuId.trim()) {
      throw new ValidationError('procurementSkuId cannot be blank');
    }

    if (this.quantityBeforeG < 0) {
      throw new ValidationError(
        `quantityBeforeG must be non-negative, got: ${this.quantityBeforeG}`,
      );
    }

    if (this.quantityAfterG < 0) {
      throw new ValidationError(
        `quantityAfterG must be non-negative, got: ${this.quantityAfterG}`,
      );
    }

    if (this.deltaG === 0) {
      throw new ValidationError('deltaG cannot be zero');
    }

    if (
      Math.abs(this.quantityBeforeG + this.deltaG - this.quantityAfterG) > 0.0001
    ) {
      throw new ValidationError(
        'quantityAfterG must equal quantityBeforeG plus deltaG',
      );
    }

    if (!this.reason.trim()) {
      throw new ValidationError('reason cannot be empty');
    }
  }
}
