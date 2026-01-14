/**
 * PurchaseList Entity
 * 采购清单实体
 */

import { v4 as uuidv4 } from 'uuid';
import { PurchaseListStatus, PURCHASE_LIST_STATUS_TRANSITIONS } from './enums';
import { PurchaseItem } from './purchase-item.entity';
import { InvalidStateTransitionError } from '../common/errors';

export interface PurchaseListConstructor {
  id?: string;
  targetDate: Date;
  status?: PurchaseListStatus;
  totalEstimatedCost: number;
  itemCount: number;
  createdById: string;
  createdBy?: any; // User object with id, nickname, phone
  sourceOrderIds: string[];
  reimbursementId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  items?: PurchaseItem[];
}

export class PurchaseList {
  public readonly id: string;
  public readonly targetDate: Date;
  public status: PurchaseListStatus;
  public readonly totalEstimatedCost: number;
  public readonly itemCount: number;
  public readonly createdById: string;
  public readonly createdBy?: any; // User object with id, nickname, phone
  public readonly sourceOrderIds: string[];
  public reimbursementId?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public startedAt?: Date;
  public completedAt?: Date;
  public items: PurchaseItem[];

  constructor(data: PurchaseListConstructor) {
    this.id = data.id || uuidv4();
    this.targetDate = data.targetDate;
    this.status = data.status || PurchaseListStatus.DRAFT;
    this.totalEstimatedCost = data.totalEstimatedCost;
    this.itemCount = data.itemCount;
    this.createdById = data.createdById;
    this.createdBy = data.createdBy;
    this.sourceOrderIds = data.sourceOrderIds;
    this.reimbursementId = data.reimbursementId;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.items = data.items || [];

    this.validateInvariants();
  }

  /**
   * 验证领域不变式
   */
  private validateInvariants(): void {
    if (this.items.length !== this.itemCount) {
      throw new Error(`Item count mismatch: expected ${this.itemCount}, got ${this.items.length}`);
    }

    if (this.totalEstimatedCost < 0) {
      throw new Error('Total estimated cost cannot be negative');
    }

    if (this.itemCount <= 0) {
      throw new Error('Item count must be positive');
    }

    if (this.sourceOrderIds.length === 0) {
      throw new Error('Purchase list must have at least one source order');
    }

    // 如果已关联报销单，状态必须是COMPLETED
    if (this.reimbursementId && this.status !== PurchaseListStatus.COMPLETED) {
      throw new Error('Purchase list with reimbursement must be in COMPLETED status');
    }
  }

  /**
   * 确认采购完成
   * 状态转换: DRAFT/PENDING → COMPLETED
   */
  complete(): void {
    const allowedTransitions = PURCHASE_LIST_STATUS_TRANSITIONS[this.status];
    if (!allowedTransitions.includes(PurchaseListStatus.COMPLETED)) {
      throw new InvalidStateTransitionError(
        `Cannot complete purchase list in ${this.status} status`
      );
    }

    this.status = PurchaseListStatus.COMPLETED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 取消采购清单
   * 状态转换: DRAFT/PENDING → CANCELLED
   */
  cancel(): void {
    const allowedTransitions = PURCHASE_LIST_STATUS_TRANSITIONS[this.status];
    if (!allowedTransitions.includes(PurchaseListStatus.CANCELLED)) {
      throw new InvalidStateTransitionError(
        `Cannot cancel purchase list in ${this.status} status`
      );
    }

    this.status = PurchaseListStatus.CANCELLED;
    this.updatedAt = new Date();
  }

  /**
   * 开始采购
   * 记录开始采购的时间
   */
  start(): void {
    if (this.status !== PurchaseListStatus.PENDING) {
      throw new InvalidStateTransitionError(
        `Cannot start purchase list in ${this.status} status. Only PENDING status can be started.`
      );
    }

    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 将状态改为待采购
   * 状态转换: DRAFT → PENDING
   */
  confirm(): void {
    const allowedTransitions = PURCHASE_LIST_STATUS_TRANSITIONS[this.status];
    if (!allowedTransitions.includes(PurchaseListStatus.PENDING)) {
      throw new InvalidStateTransitionError(
        `Cannot confirm purchase list in ${this.status} status`
      );
    }

    this.status = PurchaseListStatus.PENDING;
    this.updatedAt = new Date();
  }

  /**
   * 关联报销单
   */
  associateReimbursement(reimbursementId: string): void {
    if (this.status !== PurchaseListStatus.COMPLETED) {
      throw new Error('Only completed purchase lists can be associated with reimbursement');
    }

    this.reimbursementId = reimbursementId;
    this.updatedAt = new Date();
  }

  /**
   * 转换为Prisma格式
   */
  toPrisma() {
    return {
      id: this.id,
      targetDate: this.targetDate,
      status: this.status,
      totalEstimatedCost: this.totalEstimatedCost,
      itemCount: this.itemCount,
      createdById: this.createdById,
      sourceOrderIds: this.sourceOrderIds,
      reimbursementId: this.reimbursementId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      items: this.items.map(item => item.toPrisma()),
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): PurchaseList {
    const items = data.items?.map((item: any) => PurchaseItem.fromPrisma(item)) || [];

    return new PurchaseList({
      id: data.id,
      targetDate: data.targetDate,
      status: data.status,
      totalEstimatedCost: Number(data.totalEstimatedCost),
      itemCount: data.itemCount,
      createdById: data.createdById,
      createdBy: data.createdBy, // ✅ 包含User对象 {id, nickname, phone}
      sourceOrderIds: data.sourceOrderIds,
      reimbursementId: data.reimbursementId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      completedAt: data.completedAt,
      items,
    });
  }
}
