/**
 * PurchaseRecord Entity
 * 采购记录实体
 *
 * 记录员工实际采购的原料详情
 */

import { v4 as uuidv4 } from 'uuid';

export interface PurchaseRecordConstructor {
  id?: string;
  purchaseListId: string;
  purchaseItemId: string;
  ingredientId: string;
  ingredientName: string;
  purchaseChannel: string;
  actualQuantity: number; // 实际采购重量（克）
  actualCost: number; // 实际采购金额（元）
  productModel?: string; // 产品型号（选填）
  notes?: string; // 备注信息（选填）
  purchasedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class PurchaseRecord {
  public readonly id: string;
  public readonly purchaseListId: string;
  public readonly purchaseItemId: string;
  public readonly ingredientId: string;
  public readonly ingredientName: string;
  public purchaseChannel: string;
  public actualQuantity: number; // 实际采购重量（克），整数
  public actualCost: number; // 实际采购金额（元），两位小数
  public productModel?: string;
  public notes?: string;
  public readonly purchasedAt: Date;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(data: PurchaseRecordConstructor) {
    this.id = data.id || uuidv4();
    this.purchaseListId = data.purchaseListId;
    this.purchaseItemId = data.purchaseItemId;
    this.ingredientId = data.ingredientId;
    this.ingredientName = data.ingredientName;
    this.purchaseChannel = data.purchaseChannel;
    this.actualQuantity = data.actualQuantity;
    this.actualCost = data.actualCost;
    this.productModel = data.productModel;
    this.notes = data.notes;
    this.purchasedAt = data.purchasedAt || new Date();
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || this.createdAt;

    this.validateInvariants();
  }

  /**
   * 验证领域不变式
   */
  private validateInvariants(): void {
    // 验证实际采购重量必须是正整数
    if (!Number.isInteger(this.actualQuantity) || this.actualQuantity <= 0) {
      throw new Error('Actual quantity must be a positive integer');
    }

    // 验证实际采购金额必须为正数
    if (this.actualCost < 0) {
      throw new Error('Actual cost cannot be negative');
    }

    // 验证采购渠道不能为空
    if (!this.purchaseChannel || this.purchaseChannel.trim().length === 0) {
      throw new Error('Purchase channel cannot be empty');
    }

    // 验证原料名称不能为空
    if (!this.ingredientName || this.ingredientName.trim().length === 0) {
      throw new Error('Ingredient name cannot be empty');
    }
  }

  /**
   * 更新采购记录
   */
  update(data: Partial<Pick<PurchaseRecordConstructor, 'purchaseChannel' | 'actualQuantity' | 'actualCost' | 'productModel' | 'notes'>>): void {
    if (data.purchaseChannel !== undefined) {
      this.purchaseChannel = data.purchaseChannel;
    }
    if (data.actualQuantity !== undefined) {
      this.actualQuantity = data.actualQuantity;
    }
    if (data.actualCost !== undefined) {
      this.actualCost = data.actualCost;
    }
    if (data.productModel !== undefined) {
      this.productModel = data.productModel;
    }
    if (data.notes !== undefined) {
      this.notes = data.notes;
    }
    this.updatedAt = new Date();

    // 重新验证不变式
    this.validateInvariants();
  }

  /**
   * 转换为Prisma格式
   */
  toPrisma() {
    return {
      id: this.id,
      purchaseListId: this.purchaseListId,
      purchaseItemId: this.purchaseItemId,
      ingredientId: this.ingredientId,
      ingredientName: this.ingredientName,
      purchaseChannel: this.purchaseChannel,
      actualQuantity: this.actualQuantity,
      actualCost: this.actualCost,
      productModel: this.productModel || null,
      notes: this.notes || null,
      purchasedAt: this.purchasedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): PurchaseRecord {
    return new PurchaseRecord({
      id: data.id,
      purchaseListId: data.purchaseListId,
      purchaseItemId: data.purchaseItemId,
      ingredientId: data.ingredientId,
      ingredientName: data.ingredientName,
      purchaseChannel: data.purchaseChannel,
      actualQuantity: Number(data.actualQuantity),
      actualCost: Number(data.actualCost),
      productModel: data.productModel || undefined,
      notes: data.notes || undefined,
      purchasedAt: new Date(data.purchasedAt),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  }
}
