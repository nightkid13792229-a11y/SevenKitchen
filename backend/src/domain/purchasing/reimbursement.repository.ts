/**
 * Reimbursement Repository Interface
 * 报销单仓储接口
 */

import { Reimbursement, ReimbursementStatus } from './index';

export interface ReimbursementRepository {
  /**
   * 创建报销单
   */
  save(reimbursement: Reimbursement): Promise<Reimbursement>;

  /**
   * 根据ID查找报销单
   */
  findById(id: string): Promise<Reimbursement | null>;

  /**
   * 根据报销单号查找
   */
  findByClaimNumber(claimNumber: string): Promise<Reimbursement | null>;

  /**
   * 根据状态查找报销单
   */
  findByStatus(status: ReimbursementStatus): Promise<Reimbursement[]>;

  /**
   * 根据提交人查找报销单
   */
  findBySubmittedBy(submittedById: string): Promise<Reimbursement[]>;

  /**
   * 查询报销单列表（带分页和筛选）
   */
  findMany(params: {
    status?: ReimbursementStatus;
    submittedById?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Reimbursement[]; total: number }>;

  /**
   * 统计指定日期的报销单数量
   */
  countByDate(date: string): Promise<number>;

  /**
   * 根据审核人查找报销单
   */
  findByReviewedBy(reviewedById: string): Promise<Reimbursement[]>;

  /**
   * 删除报销单
   */
  delete(id: string): Promise<void>;
}
