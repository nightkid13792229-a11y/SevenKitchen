/**
 * Reimbursement Repository Interface
 * 报销单仓储接口
 */

import { Reimbursement, ReimbursementStatus } from './index';

export interface ReimbursementRepository {
  /**
   * 创建报销单
   *
   * 传 client（事务）时所有写入都走同一个事务，用于「状态 + 价格」必须一起成功/失败的场景。
   */
  save(reimbursement: Reimbursement, client?: unknown): Promise<Reimbursement>;

  /**
   * 保存报销单并在同一事务中替换关联采购清单
   */
  saveWithPurchaseListReplacement(
    reimbursement: Reimbursement,
    /** 传了事务客户端就复用它，便于把价格同步并进同一个事务（2026-11-14） */
    client?: unknown,
  ): Promise<Reimbursement>;

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
   * 列出某天已用过的报销单号（按单号前缀匹配）。
   *
   * 用于生成流水号：必须看「当天用过的最大号」，不能看「当天还剩几张」——
   * 删掉中间或最早的一张会让计数倒退，重新生成已存在的单号撞唯一约束
   * （2026-11-14 事故）。
   */
  findClaimNumbersByPrefix(prefix: string): Promise<string[]>;

  /**
   * 根据审核人查找报销单
   */
  findByReviewedBy(reviewedById: string): Promise<Reimbursement[]>;

  /**
   * 删除报销单
   */
  delete(id: string): Promise<void>;
}
