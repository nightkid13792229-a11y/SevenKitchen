import { ValidationError } from '../common/errors';

export enum InventoryAllocationStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  CONSUMED = 'CONSUMED',
}

export interface InventoryAllocationLineConstructor {
  id: string;
  allocationId: string;
  ingredientId: string;
  procurementSkuId?: string | null;
  quantityG: number;
  createdAt?: Date;
}

export class InventoryAllocationLine {
  public readonly id: string;
  public readonly allocationId: string;
  public readonly ingredientId: string;
  public readonly procurementSkuId?: string | null;
  public readonly quantityG: number;
  public readonly createdAt: Date;

  constructor(data: InventoryAllocationLineConstructor) {
    this.id = data.id;
    this.allocationId = data.allocationId;
    this.ingredientId = data.ingredientId;
    this.procurementSkuId = data.procurementSkuId ?? null;
    this.quantityG = data.quantityG;
    this.createdAt = data.createdAt ?? new Date();
    this.validate();
  }

  private validate(): void {
    if (!this.id.trim()) {
      throw new ValidationError('allocation line id cannot be empty');
    }
    if (!this.allocationId.trim()) {
      throw new ValidationError('allocationId cannot be empty');
    }
    if (!this.ingredientId.trim()) {
      throw new ValidationError('ingredientId cannot be empty');
    }
    if (!Number.isFinite(this.quantityG) || this.quantityG <= 0) {
      throw new ValidationError('allocation quantityG must be positive');
    }
  }
}

export interface InventoryAllocationConstructor {
  id: string;
  targetDate: Date;
  status?: InventoryAllocationStatus;
  purchaseListId?: string | null;
  sourceOrderIds?: string[];
  createdById?: string | null;
  createdAt?: Date;
  releasedAt?: Date | null;
  consumedAt?: Date | null;
  lines?: InventoryAllocationLine[];
}

export class InventoryAllocation {
  public readonly id: string;
  public readonly targetDate: Date;
  public readonly status: InventoryAllocationStatus;
  public readonly purchaseListId?: string | null;
  public readonly sourceOrderIds: string[];
  public readonly createdById?: string | null;
  public readonly createdAt: Date;
  public readonly releasedAt?: Date | null;
  public readonly consumedAt?: Date | null;
  public readonly lines: InventoryAllocationLine[];

  constructor(data: InventoryAllocationConstructor) {
    this.id = data.id;
    this.targetDate = data.targetDate;
    this.status = data.status ?? InventoryAllocationStatus.ACTIVE;
    this.purchaseListId = data.purchaseListId ?? null;
    this.sourceOrderIds = data.sourceOrderIds ?? [];
    this.createdById = data.createdById ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.releasedAt = data.releasedAt ?? null;
    this.consumedAt = data.consumedAt ?? null;
    this.lines = data.lines ?? [];
    this.validate();
  }

  private validate(): void {
    if (!this.id.trim()) {
      throw new ValidationError('allocation id cannot be empty');
    }
    if (Number.isNaN(this.targetDate.getTime())) {
      throw new ValidationError('targetDate must be valid');
    }
    if (
      this.status === InventoryAllocationStatus.ACTIVE &&
      this.lines.length === 0
    ) {
      throw new ValidationError('active allocation must contain at least one line');
    }
  }
}
