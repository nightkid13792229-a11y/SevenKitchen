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
  procurementSkuId?: string;
  procurementSkuName?: string;
  ingredientName: string;
  purchaseChannel: string;
  actualQuantity: number; // 归一化后的实际采购数量（按采购单位）
  actualPackageCount?: number; // 原始录入：买了几件
  actualPackageSize?: number; // 原始录入：单件规格数值
  actualPackageUnit?: string; // 原始录入：单件规格单位
  actualBaseQuantity?: number; // 归一化后的基础单位数量
  actualBaseUnit?: string; // G / ML / PCS
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
  public readonly procurementSkuId?: string;
  public readonly procurementSkuName?: string;
  public readonly ingredientName: string;
  public purchaseChannel: string;
  public actualQuantity: number; // 归一化后的实际采购数量（按采购单位）
  public actualPackageCount?: number;
  public actualPackageSize?: number;
  public actualPackageUnit?: string;
  public actualBaseQuantity?: number;
  public actualBaseUnit?: string;
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
    this.procurementSkuId = data.procurementSkuId;
    this.procurementSkuName = data.procurementSkuName;
    this.ingredientName = data.ingredientName;
    this.purchaseChannel = data.purchaseChannel;
    this.actualQuantity = data.actualQuantity;
    this.actualPackageCount = data.actualPackageCount;
    this.actualPackageSize = data.actualPackageSize;
    this.actualPackageUnit = data.actualPackageUnit;
    this.actualBaseQuantity = data.actualBaseQuantity;
    this.actualBaseUnit = data.actualBaseUnit;
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
    // 验证归一化后的实际采购数量必须是正数，且最多保留6位小数
    if (!Number.isFinite(this.actualQuantity) || this.actualQuantity <= 0) {
      throw new Error('Actual quantity must be a positive number');
    }

    if (!this.hasMaxDecimalPlaces(this.actualQuantity, 6)) {
      throw new Error('Actual quantity can have at most 6 decimal places');
    }

    const hasAnyPackageFact =
      this.actualPackageCount !== undefined ||
      this.actualPackageSize !== undefined ||
      this.actualPackageUnit !== undefined;

    if (hasAnyPackageFact) {
      if (
        !Number.isFinite(this.actualPackageCount) ||
        (this.actualPackageCount || 0) <= 0
      ) {
        throw new Error('Actual package count must be a positive number');
      }

      if (
        !Number.isFinite(this.actualPackageSize) ||
        (this.actualPackageSize || 0) <= 0
      ) {
        throw new Error('Actual package size must be a positive number');
      }

      if (!this.hasMaxDecimalPlaces(this.actualPackageCount!, 3)) {
        throw new Error(
          'Actual package count can have at most 3 decimal places',
        );
      }

      if (!this.hasMaxDecimalPlaces(this.actualPackageSize!, 3)) {
        throw new Error(
          'Actual package size can have at most 3 decimal places',
        );
      }

      if (
        !this.actualPackageUnit ||
        this.actualPackageUnit.trim().length === 0
      ) {
        throw new Error('Actual package unit cannot be empty');
      }
    }

    if (this.actualBaseQuantity !== undefined) {
      if (
        !Number.isFinite(this.actualBaseQuantity) ||
        this.actualBaseQuantity <= 0
      ) {
        throw new Error('Actual base quantity must be a positive number');
      }

      if (!this.hasMaxDecimalPlaces(this.actualBaseQuantity, 6)) {
        throw new Error(
          'Actual base quantity can have at most 6 decimal places',
        );
      }

      if (!this.actualBaseUnit || this.actualBaseUnit.trim().length === 0) {
        throw new Error('Actual base unit cannot be empty');
      }
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
  update(
    data: Partial<
      Pick<
        PurchaseRecordConstructor,
        | 'purchaseChannel'
        | 'actualQuantity'
        | 'actualPackageCount'
        | 'actualPackageSize'
        | 'actualPackageUnit'
        | 'actualBaseQuantity'
        | 'actualBaseUnit'
        | 'actualCost'
        | 'productModel'
        | 'notes'
      >
    >,
  ): void {
    if (data.purchaseChannel !== undefined) {
      this.purchaseChannel = data.purchaseChannel;
    }
    if (data.actualQuantity !== undefined) {
      this.actualQuantity = data.actualQuantity;
    }
    if (data.actualPackageCount !== undefined) {
      this.actualPackageCount = data.actualPackageCount;
    }
    if (data.actualPackageSize !== undefined) {
      this.actualPackageSize = data.actualPackageSize;
    }
    if (data.actualPackageUnit !== undefined) {
      this.actualPackageUnit = data.actualPackageUnit;
    }
    if (data.actualBaseQuantity !== undefined) {
      this.actualBaseQuantity = data.actualBaseQuantity;
    }
    if (data.actualBaseUnit !== undefined) {
      this.actualBaseUnit = data.actualBaseUnit;
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

  private hasMaxDecimalPlaces(value: number, maxDecimalPlaces: number): boolean {
    const normalized = value.toString();
    const decimalPart = normalized.split('.')[1];
    return !decimalPart || decimalPart.length <= maxDecimalPlaces;
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
      procurementSkuId: this.procurementSkuId || null,
      procurementSkuName: this.procurementSkuName || null,
      ingredientName: this.ingredientName,
      purchaseChannel: this.purchaseChannel,
      actualQuantity: this.actualQuantity,
      actualPackageCount: this.actualPackageCount ?? null,
      actualPackageSize: this.actualPackageSize ?? null,
      actualPackageUnit: this.actualPackageUnit || null,
      actualBaseQuantity: this.actualBaseQuantity ?? null,
      actualBaseUnit: this.actualBaseUnit || null,
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
      procurementSkuId: data.procurementSkuId || undefined,
      procurementSkuName: data.procurementSkuName || undefined,
      ingredientName: data.ingredientName,
      purchaseChannel: data.purchaseChannel,
      actualQuantity: Number(data.actualQuantity),
      actualPackageCount:
        data.actualPackageCount !== undefined && data.actualPackageCount !== null
          ? Number(data.actualPackageCount)
          : undefined,
      actualPackageSize:
        data.actualPackageSize !== undefined && data.actualPackageSize !== null
          ? Number(data.actualPackageSize)
          : undefined,
      actualPackageUnit: data.actualPackageUnit || undefined,
      actualBaseQuantity:
        data.actualBaseQuantity !== undefined && data.actualBaseQuantity !== null
          ? Number(data.actualBaseQuantity)
          : undefined,
      actualBaseUnit: data.actualBaseUnit || undefined,
      actualCost: Number(data.actualCost),
      productModel: data.productModel || undefined,
      notes: data.notes || undefined,
      purchasedAt: new Date(data.purchasedAt),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  }
}
