/**
 * PurchaseList Repository Interface
 * 采购清单仓储接口
 */

import { PurchaseList, PurchaseListStatus } from './index';

export interface PurchaseListRepository {
  /**
   * 创建采购清单
   */
  save(purchaseList: PurchaseList): Promise<PurchaseList>;

  /**
   * 根据ID查找采购清单
   */
  findById(id: string): Promise<PurchaseList | null>;

  /**
   * 根据日期范围查找采购清单
   */
  findByDateRange(startDate: Date, endDate: Date): Promise<PurchaseList[]>;

  /**
   * 根据状态查找采购清单
   */
  findByStatus(status: PurchaseListStatus): Promise<PurchaseList[]>;

  /**
   * 根据创建人查找采购清单
   */
  findByCreatedBy(createdById: string): Promise<PurchaseList[]>;

  /**
   * 查询采购清单列表（带分页和筛选）
   */
  findMany(params: {
    status?: PurchaseListStatus;
    createdById?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
    excludeReimbursed?: boolean;
  }): Promise<{ list: PurchaseList[]; total: number }>;

  /**
   * 根据ID删除采购清单
   */
  delete(id: string): Promise<void>;

  /**
   * 统计指定日期的采购清单数量
   */
  countByDate(date: Date): Promise<number>;

  /**
   * 根据报销单ID查找采购清单
   */
  findByReimbursementId(reimbursementId: string): Promise<PurchaseList[]>;

  /**
   * 检查指定日期范围是否已存在采购清单
   */
  existsByDateRange(startDate: Date, endDate: Date): Promise<boolean>;

  /**
   * 清空报销单ID（删除报销单时调用）
   */
  clearReimbursementId(reimbursementId: string): Promise<void>;
}
