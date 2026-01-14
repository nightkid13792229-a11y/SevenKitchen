/**
 * PurchaseRecord Repository Interface
 * 采购记录仓储接口
 */

import { PurchaseRecord } from './purchase-record.entity';

export interface PurchaseRecordRepository {
  /**
   * 创建采购记录
   */
  save(purchaseRecord: PurchaseRecord): Promise<PurchaseRecord>;

  /**
   * 根据ID查找采购记录
   */
  findById(id: string): Promise<PurchaseRecord | null>;

  /**
   * 根据采购清单ID查找所有采购记录
   */
  findByPurchaseListId(purchaseListId: string): Promise<PurchaseRecord[]>;

  /**
   * 根据采购项目ID查找所有采购记录
   */
  findByPurchaseItemId(purchaseItemId: string): Promise<PurchaseRecord[]>;

  /**
   * 根据原料ID查找所有采购记录
   */
  findByIngredientId(ingredientId: string): Promise<PurchaseRecord[]>;

  /**
   * 计算采购清单的实际采购总额
   */
  calculateTotalActualCost(purchaseListId: string): Promise<number>;

  /**
   * 统计采购清单的采购记录数量
   */
  countByPurchaseListId(purchaseListId: string): Promise<number>;

  /**
   * 删除采购记录
   */
  delete(id: string): Promise<void>;

  /**
   * 删除采购清单的所有采购记录
   */
  deleteByPurchaseListId(purchaseListId: string): Promise<void>;
}
