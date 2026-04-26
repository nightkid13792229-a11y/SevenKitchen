/**
 * PurchaseItem Entity
 * 采购明细实体
 */

import { v4 as uuidv4 } from 'uuid';

const toNullableNumber = (value: any): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value?.toNumber === 'function') {
    return value.toNumber();
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export interface PurchaseItemConstructor {
  id?: string;
  purchaseListId: string;
  ingredientId: string;
  procurementSkuId?: string;
  procurementSkuName?: string;
  suggestedProductId?: string;
  suggestedProductName?: string;
  ingredientName: string;
  type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'; // 原料类型
  quantityNeeded: number;
  quantityUnit: string;
  estimatedCost: number;
  grossQuantityNeeded?: number;
  stockDeductedQuantity?: number;
  purchaseShortageQuantity?: number;
  onHandQuantity?: number;
  allocatedQuantity?: number;
  availableQuantity?: number;
  usesInventory?: boolean;
  noPurchaseNeeded?: boolean;
  noPurchaseReason?: string | null;
  noPurchaseMarkedAt?: Date | null;
  noPurchaseMarkedById?: string | null;
  purchaseChannel?: string;
  productModel?: string;
  displayUnit?: string; // 显示单位标签
  notes?: string;
  ingredient?: {
    brand?: string | null;
    productModel?: string | null;
    purchaseChannel?: string | null;
    purchaseUnit?: string | null;
    baseUnit?: string | null;
    unitDisplayLabel?: string | null;
    purchaseToBaseRatio?: number | null;
    properties?: any;
    procurementSkus?: Array<{
      id: string;
      name: string;
      brand?: string | null;
      purchaseChannel?: string | null;
      productModel?: string | null;
      purchaseUnit?: string | null;
      purchaseToBaseRatio?: number | null;
      currentPurchasePrice?: number | null;
      referencePricePerPurchaseUnit?: number | null;
      sourceTier?: string | null;
      isActive: boolean;
    }>;
  };
  createdAt?: Date;
}

export class PurchaseItem {
  public readonly id: string;
  public readonly purchaseListId: string;
  public readonly ingredientId: string;
  public readonly procurementSkuId?: string;
  public readonly procurementSkuName?: string;
  public readonly suggestedProductId?: string;
  public readonly suggestedProductName?: string;
  public readonly ingredientName: string;
  public readonly type?: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING'; // 原料类型
  public quantityNeeded: number; // 可写，用于动态更新
  public readonly quantityUnit: string;
  public estimatedCost: number; // 可写，用于动态更新
  public readonly grossQuantityNeeded?: number;
  public readonly stockDeductedQuantity?: number;
  public readonly purchaseShortageQuantity?: number;
  public readonly onHandQuantity?: number;
  public readonly allocatedQuantity?: number;
  public readonly availableQuantity?: number;
  public readonly usesInventory: boolean;
  public noPurchaseNeeded: boolean;
  public noPurchaseReason?: string | null;
  public noPurchaseMarkedAt?: Date | null;
  public noPurchaseMarkedById?: string | null;
  public readonly purchaseChannel?: string;
  public readonly productModel?: string;
  public readonly displayUnit?: string; // 显示单位标签
  public readonly notes?: string;
  public readonly ingredient?: PurchaseItemConstructor['ingredient'];
  public readonly createdAt: Date;

  constructor(data: PurchaseItemConstructor) {
    this.id = data.id || uuidv4();
    this.purchaseListId = data.purchaseListId;
    this.ingredientId = data.ingredientId;
    this.procurementSkuId = data.procurementSkuId;
    this.procurementSkuName = data.procurementSkuName;
    this.suggestedProductId =
      data.suggestedProductId ?? data.procurementSkuId;
    this.suggestedProductName =
      data.suggestedProductName ?? data.procurementSkuName;
    this.ingredientName = data.ingredientName || '';
    this.type = data.type;
    this.quantityNeeded = data.quantityNeeded;
    this.quantityUnit = data.quantityUnit;
    this.estimatedCost = data.estimatedCost;
    this.grossQuantityNeeded = data.grossQuantityNeeded;
    this.stockDeductedQuantity = data.stockDeductedQuantity;
    this.purchaseShortageQuantity = data.purchaseShortageQuantity;
    this.onHandQuantity = data.onHandQuantity;
    this.allocatedQuantity = data.allocatedQuantity;
    this.availableQuantity = data.availableQuantity;
    this.usesInventory = data.usesInventory ?? false;
    this.noPurchaseNeeded = data.noPurchaseNeeded ?? false;
    this.noPurchaseReason = data.noPurchaseReason ?? null;
    this.noPurchaseMarkedAt = data.noPurchaseMarkedAt ?? null;
    this.noPurchaseMarkedById = data.noPurchaseMarkedById ?? null;
    this.purchaseChannel = data.purchaseChannel;
    this.productModel = data.productModel;
    this.displayUnit = data.displayUnit;
    this.notes = data.notes;
    this.ingredient = data.ingredient;
    this.createdAt = data.createdAt || new Date();

    this.validateInvariants();
  }

  markNoPurchaseNeeded(reason: string | null | undefined, userId: string): void {
    this.noPurchaseNeeded = true;
    this.noPurchaseReason = reason?.trim() || null;
    this.noPurchaseMarkedAt = new Date();
    this.noPurchaseMarkedById = userId;
  }

  clearNoPurchaseNeeded(): void {
    this.noPurchaseNeeded = false;
    this.noPurchaseReason = null;
    this.noPurchaseMarkedAt = null;
    this.noPurchaseMarkedById = null;
  }

  /**
   * 验证领域不变式
   */
  private validateInvariants(): void {
    if (this.quantityNeeded < 0) {
      throw new Error('Quantity needed cannot be negative');
    }

    if (this.estimatedCost < 0) {
      throw new Error('Estimated cost cannot be negative');
    }
  }

  /**
   * 转换为Prisma格式
   */
  toPrisma() {
    return {
      id: this.id,
      // purchaseListId 由Prisma自动设置（嵌套创建时不需要传递）
      ingredientId: this.ingredientId,
      procurementSkuId: this.procurementSkuId,
      procurementSkuName: this.procurementSkuName,
      suggestedProductId: this.suggestedProductId,
      suggestedProductName: this.suggestedProductName,
      ingredientName: this.ingredientName,
      type: this.type,
      quantityNeeded: this.quantityNeeded,
      quantityUnit: this.quantityUnit,
      estimatedCost: this.estimatedCost,
      grossQuantityNeeded: this.grossQuantityNeeded,
      stockDeductedQuantity: this.stockDeductedQuantity,
      purchaseShortageQuantity: this.purchaseShortageQuantity,
      onHandQuantity: this.onHandQuantity,
      allocatedQuantity: this.allocatedQuantity,
      availableQuantity: this.availableQuantity,
      usesInventory: this.usesInventory,
      noPurchaseNeeded: this.noPurchaseNeeded,
      noPurchaseReason: this.noPurchaseReason,
      noPurchaseMarkedAt: this.noPurchaseMarkedAt,
      noPurchaseMarkedById: this.noPurchaseMarkedById,
      purchaseChannel: this.purchaseChannel,
      productModel: this.productModel,
      displayUnit: this.displayUnit,
      notes: this.notes,
      createdAt: this.createdAt,
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): PurchaseItem {
    return new PurchaseItem({
      id: data.id,
      purchaseListId: data.purchaseListId,
      ingredientId: data.ingredientId,
      procurementSkuId: data.procurementSkuId || undefined,
      procurementSkuName: data.procurementSkuName || undefined,
      suggestedProductId: data.suggestedProductId || undefined,
      suggestedProductName: data.suggestedProductName || undefined,
      ingredientName: data.ingredientName || '',
      type: data.type,
      quantityNeeded: data.quantityNeeded,
      quantityUnit: data.quantityUnit,
      estimatedCost: Number(data.estimatedCost),
      grossQuantityNeeded:
        data.grossQuantityNeeded !== undefined &&
        data.grossQuantityNeeded !== null
          ? Number(data.grossQuantityNeeded)
          : undefined,
      stockDeductedQuantity:
        data.stockDeductedQuantity !== undefined &&
        data.stockDeductedQuantity !== null
          ? Number(data.stockDeductedQuantity)
          : undefined,
      purchaseShortageQuantity:
        data.purchaseShortageQuantity !== undefined &&
        data.purchaseShortageQuantity !== null
          ? Number(data.purchaseShortageQuantity)
          : undefined,
      onHandQuantity:
        data.onHandQuantity !== undefined && data.onHandQuantity !== null
          ? Number(data.onHandQuantity)
          : undefined,
      allocatedQuantity:
        data.allocatedQuantity !== undefined &&
        data.allocatedQuantity !== null
          ? Number(data.allocatedQuantity)
          : undefined,
      availableQuantity:
        data.availableQuantity !== undefined && data.availableQuantity !== null
          ? Number(data.availableQuantity)
          : undefined,
      usesInventory: data.usesInventory ?? false,
      noPurchaseNeeded: data.noPurchaseNeeded ?? false,
      noPurchaseReason: data.noPurchaseReason ?? null,
      noPurchaseMarkedAt: data.noPurchaseMarkedAt ?? null,
      noPurchaseMarkedById: data.noPurchaseMarkedById ?? null,
      purchaseChannel: data.purchaseChannel,
      productModel: data.productModel,
      displayUnit: data.displayUnit,
      notes: data.notes,
      ingredient: data.ingredient
        ? {
            brand: data.ingredient.brand ?? null,
            productModel: data.ingredient.productModel ?? null,
            purchaseChannel: data.ingredient.purchaseChannel ?? null,
            purchaseUnit: data.ingredient.purchaseUnit ?? null,
            baseUnit: data.ingredient.baseUnit ?? null,
            unitDisplayLabel: data.ingredient.unitDisplayLabel ?? null,
            purchaseToBaseRatio:
              data.ingredient.purchaseToBaseRatio !== undefined &&
              data.ingredient.purchaseToBaseRatio !== null
                ? Number(data.ingredient.purchaseToBaseRatio)
                : null,
            properties: data.ingredient.properties ?? undefined,
            procurementSkus: (data.ingredient.procurementSkus || []).map(
              (sku: any) => ({
                id: sku.id,
                name: sku.name,
                brand: sku.brand ?? null,
                purchaseChannel: sku.purchaseChannel ?? null,
                productModel: sku.productModel ?? null,
                purchaseUnit: sku.purchaseUnit ?? null,
                purchaseToBaseRatio: toNullableNumber(
                  sku.purchaseToBaseRatio,
                ),
                currentPurchasePrice: toNullableNumber(
                  sku.currentPurchasePrice,
                ),
                referencePricePerPurchaseUnit: toNullableNumber(
                  sku.referencePricePerPurchaseUnit,
                ),
                sourceTier: sku.sourceTier ?? null,
                isActive: sku.isActive,
              }),
            ),
          }
        : undefined,
      createdAt: data.createdAt,
    });
  }
}
