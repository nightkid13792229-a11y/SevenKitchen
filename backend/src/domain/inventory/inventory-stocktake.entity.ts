import { ValidationError } from '../common/errors';
import { InventoryStocktakeStatus } from './enums';

export class InventoryStocktakeLine {
  constructor(
    public readonly id: string,
    public readonly stocktakeId: string,
    public readonly ingredientId: string,
    public readonly procurementSkuId: string | null,
    public readonly expectedQuantityG: number,
    public readonly countedQuantityG: number,
    public readonly deltaG: number,
  ) {
    this.validateInvariants();
  }

  private validateInvariants(): void {
    if (!this.stocktakeId.trim()) {
      throw new ValidationError('stocktakeId cannot be empty');
    }

    if (!this.ingredientId.trim()) {
      throw new ValidationError('ingredientId cannot be empty');
    }

    if (this.procurementSkuId !== null && !this.procurementSkuId.trim()) {
      throw new ValidationError('procurementSkuId cannot be blank');
    }

    if (this.expectedQuantityG < 0) {
      throw new ValidationError(
        `expectedQuantityG must be non-negative, got: ${this.expectedQuantityG}`,
      );
    }

    if (this.countedQuantityG < 0) {
      throw new ValidationError(
        `countedQuantityG must be non-negative, got: ${this.countedQuantityG}`,
      );
    }

    if (
      Math.abs(this.countedQuantityG - this.expectedQuantityG - this.deltaG) >
      0.0001
    ) {
      throw new ValidationError(
        'deltaG must equal countedQuantityG minus expectedQuantityG',
      );
    }
  }
}

export class InventoryStocktake {
  constructor(
    public readonly id: string,
    public readonly status: InventoryStocktakeStatus,
    public readonly note: string | null,
    public readonly createdAt: Date,
    public readonly appliedAt: Date | null,
    public readonly lines: InventoryStocktakeLine[],
  ) {
    this.validateInvariants();
  }

  private validateInvariants(): void {
    if (this.lines.length === 0) {
      throw new ValidationError('stocktake must contain at least one line');
    }

    const ingredientIds = new Set<string>();
    for (const line of this.lines) {
      if (ingredientIds.has(line.ingredientId)) {
        throw new ValidationError(
          `duplicate ingredient in stocktake: ${line.ingredientId}`,
        );
      }
      ingredientIds.add(line.ingredientId);
    }

    if (
      this.status === InventoryStocktakeStatus.APPLIED &&
      this.appliedAt === null
    ) {
      throw new ValidationError(
        'appliedAt is required when stocktake status is APPLIED',
      );
    }
  }
}
