/**
 * PurchaseList Entity
 * 采购清单实体
 */

import { v4 as uuidv4 } from 'uuid';
import {
  PurchaseListStatus,
  PurchaseListKind,
  PURCHASE_LIST_STATUS_TRANSITIONS,
} from './enums';
import { PurchaseItem } from './purchase-item.entity';
import { InvalidStateTransitionError } from '../common/errors';

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export interface PurchaseListConstructor {
  id?: string;
  targetDate: Date;
  kind?: PurchaseListKind;
  status?: PurchaseListStatus;
  totalEstimatedCost: number;
  itemCount: number;
  createdById: string;
  createdBy?: any; // User object with id, nickname, phone
  sourceOrderIds: string[];
  /** 备货采购单的来源备货生产单（订单采购单为 null） */
  sourceTastingPackPlanId?: string | null;
  orderDateSnapshot?: Record<
    string,
    { originalDate: string; hasChanged: boolean }
  >;
  reimbursementId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  /** 补货记录：识别阶段的草稿（无明细、列表不可见） */
  isDraft?: boolean;
  orderNo?: string | null;
  channel?: string | null;
  orderPlacedAt?: Date | null;
  expectedDeliveryAt?: Date | null;
  arrivedAt?: Date | null;
  subtotalAmount?: number | null;
  shippingFee?: number | null;
  packagingFee?: number | null;
  discountAmount?: number | null;
  paidAmount?: number | null;
  personalAmount?: number | null;
  reimbursementAmount?: number | null;
  voidedAt?: Date | null;
  voidedById?: string | null;
  updatedById?: string | null;
  arrivedById?: string | null;
  items?: PurchaseItem[];
  records?: any[]; // PurchaseRecord array for calculating aggregates
  recordsCount?: number; // Computed field: number of purchase records
  totalActualCost?: number; // Computed field: total actual cost from records
}

export class PurchaseList {
  public readonly id: string;
  public readonly targetDate: Date;
  public readonly kind: PurchaseListKind;
  public status: PurchaseListStatus;
  public totalEstimatedCost: number; // 可写，用于动态更新
  public itemCount: number; // 可写，用于动态更新
  public readonly createdById: string;
  public readonly createdBy?: any; // User object with id, nickname, phone
  public sourceOrderIds: string[]; // 可写，用于动态更新
  public sourceTastingPackPlanId?: string | null;
  public orderDateSnapshot?: Record<
    string,
    { originalDate: string; hasChanged: boolean }
  >;
  public reimbursementId?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public startedAt?: Date;
  public completedAt?: Date;
  public isDraft: boolean;
  public orderNo?: string | null;
  public channel?: string | null;
  public orderPlacedAt?: Date | null;
  public expectedDeliveryAt?: Date | null;
  public arrivedAt?: Date | null;
  public subtotalAmount?: number | null;
  public shippingFee?: number | null;
  public packagingFee?: number | null;
  public discountAmount?: number | null;
  public paidAmount?: number | null;
  public personalAmount?: number | null;
  public reimbursementAmount?: number | null;
  public voidedAt?: Date | null;
  public voidedById?: string | null;
  public updatedById?: string | null;
  public arrivedById?: string | null;
  public items: PurchaseItem[];
  public recordsCount?: number; // Computed field: number of purchase records
  public totalActualCost?: number; // Computed field: total actual cost from records
  /** 列表接口附加：这张清单已导入几笔订单截图（非持久化） */
  public orderImportCount?: number;

  constructor(data: PurchaseListConstructor) {
    this.id = data.id || uuidv4();
    this.targetDate = data.targetDate;
    this.kind = data.kind || PurchaseListKind.ORDER_DEMAND;
    this.status = data.status || PurchaseListStatus.PENDING;
    this.totalEstimatedCost = data.totalEstimatedCost;
    this.itemCount = data.itemCount;
    this.createdById = data.createdById;
    this.createdBy = data.createdBy;
    this.sourceOrderIds = data.sourceOrderIds;
    this.sourceTastingPackPlanId = data.sourceTastingPackPlanId ?? null;
    this.orderDateSnapshot = data.orderDateSnapshot;
    this.reimbursementId = data.reimbursementId;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || this.createdAt;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.isDraft = data.isDraft === true;
    this.orderNo = data.orderNo ?? null;
    this.channel = data.channel ?? null;
    this.orderPlacedAt = data.orderPlacedAt ?? null;
    this.expectedDeliveryAt = data.expectedDeliveryAt ?? null;
    this.arrivedAt = data.arrivedAt ?? null;
    this.subtotalAmount = data.subtotalAmount ?? null;
    this.shippingFee = data.shippingFee ?? null;
    this.packagingFee = data.packagingFee ?? null;
    this.discountAmount = data.discountAmount ?? null;
    this.paidAmount = data.paidAmount ?? null;
    this.personalAmount = data.personalAmount ?? null;
    this.reimbursementAmount = data.reimbursementAmount ?? null;
    this.voidedAt = data.voidedAt ?? null;
    this.voidedById = data.voidedById ?? null;
    this.updatedById = data.updatedById ?? null;
    this.arrivedById = data.arrivedById ?? null;
    this.items = data.items || [];
    this.recordsCount = data.recordsCount;
    this.totalActualCost = data.totalActualCost;

    this.validateInvariants();
  }

  /**
   * 验证领域不变式
   */
  private validateInvariants(): void {
    // 补货草稿在识别阶段本来就没有明细，允许 0 项；正式记录仍要求明细数一致。
    if (!this.isDraft) {
      if (this.items.length !== this.itemCount) {
        throw new Error(
          `Item count mismatch: expected ${this.itemCount}, got ${this.items.length}`,
        );
      }

      if (this.itemCount <= 0) {
        throw new Error('Item count must be positive');
      }
    }

    if (this.totalEstimatedCost < 0) {
      throw new Error('Total estimated cost cannot be negative');
    }

    // 订单需求采购单必须有来源订单；但**备货采购单**本来就没有顾客订单，
    // 它的来源是备货生产单（sourceTastingPackPlanId），因此放行这一种情况。
    // 放开的同时要求两者至少有一个，避免出现既没有订单也没有备货单的孤儿采购单。
    if (
      this.kind === PurchaseListKind.ORDER_DEMAND &&
      this.sourceOrderIds.length === 0 &&
      !this.sourceTastingPackPlanId
    ) {
      throw new Error(
        'Purchase list must have at least one source order or a source tasting-pack production plan',
      );
    }

    // 如果已关联报销单，状态必须是COMPLETED
    if (this.reimbursementId && this.status !== PurchaseListStatus.COMPLETED) {
      throw new Error(
        'Purchase list with reimbursement must be in COMPLETED status',
      );
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
        `Cannot complete purchase list in ${this.status} status`,
      );
    }

    this.status = PurchaseListStatus.COMPLETED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 开始采购
   * 记录开始采购的时间
   */
  start(): void {
    if (this.status !== PurchaseListStatus.PENDING) {
      throw new InvalidStateTransitionError(
        `Cannot start purchase list in ${this.status} status. Only PENDING status can be started.`,
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
        `Cannot confirm purchase list in ${this.status} status`,
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
      throw new Error(
        'Only completed purchase lists can be associated with reimbursement',
      );
    }

    this.reimbursementId = reimbursementId;
    this.updatedAt = new Date();
  }

  /**
   * 撤回采购完成。仅用于报销/生产使用前的现场纠错。
   */
  reopen(): void {
    if (this.status !== PurchaseListStatus.COMPLETED) {
      throw new InvalidStateTransitionError(
        `Cannot reopen purchase list in ${this.status} status`,
      );
    }

    if (this.reimbursementId) {
      throw new Error('Purchase list with reimbursement cannot be reopened');
    }

    this.status = PurchaseListStatus.PENDING;
    this.completedAt = undefined;
    this.updatedAt = new Date();
  }

  /**
   * 转换为Prisma格式
   */
  toPrisma() {
    return {
      id: this.id,
      targetDate: this.targetDate,
      kind: this.kind,
      status: this.status,
      totalEstimatedCost: this.totalEstimatedCost,
      itemCount: this.itemCount,
      createdById: this.createdById,
      sourceOrderIds: this.sourceOrderIds,
      sourceTastingPackPlanId: this.sourceTastingPackPlanId,
      orderDateSnapshot: this.orderDateSnapshot,
      reimbursementId: this.reimbursementId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      isDraft: this.isDraft,
      orderNo: this.orderNo,
      channel: this.channel,
      orderPlacedAt: this.orderPlacedAt,
      expectedDeliveryAt: this.expectedDeliveryAt,
      arrivedAt: this.arrivedAt,
      subtotalAmount: this.subtotalAmount,
      shippingFee: this.shippingFee,
      packagingFee: this.packagingFee,
      discountAmount: this.discountAmount,
      paidAmount: this.paidAmount,
      personalAmount: this.personalAmount,
      reimbursementAmount: this.reimbursementAmount,
      voidedAt: this.voidedAt,
      voidedById: this.voidedById,
      updatedById: this.updatedById,
      arrivedById: this.arrivedById,
      items: this.items.map((item) => item.toPrisma()),
    };
  }

  /**
   * 从Prisma格式创建实体
   */
  static fromPrisma(data: any): PurchaseList {
    const items =
      data.items?.map((item: any) => PurchaseItem.fromPrisma(item)) || [];

    // Calculate purchase record aggregates if records are included
    let recordsCount: number | undefined;
    let totalActualCost: number | undefined;

    if (data.records && Array.isArray(data.records)) {
      recordsCount = data.records.length;
      totalActualCost = data.records.reduce((sum: number, record: any) => {
        return sum + Number(record.actualCost);
      }, 0);
    }

    return new PurchaseList({
      id: data.id,
      targetDate: data.targetDate,
      kind: data.kind,
      status: data.status,
      totalEstimatedCost: Number(data.totalEstimatedCost),
      itemCount: data.itemCount,
      createdById: data.createdById,
      createdBy: data.createdBy, // ✅ 包含User对象 {id, nickname, phone}
      sourceOrderIds: data.sourceOrderIds,
      sourceTastingPackPlanId: data.sourceTastingPackPlanId ?? null,
      orderDateSnapshot: data.orderDateSnapshot,
      reimbursementId: data.reimbursementId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      isDraft: data.isDraft === true,
      orderNo: data.orderNo ?? null,
      channel: data.channel ?? null,
      orderPlacedAt: data.orderPlacedAt ?? null,
      expectedDeliveryAt: data.expectedDeliveryAt ?? null,
      arrivedAt: data.arrivedAt ?? null,
      subtotalAmount: toNullableNumber(data.subtotalAmount),
      shippingFee: toNullableNumber(data.shippingFee),
      packagingFee: toNullableNumber(data.packagingFee),
      discountAmount: toNullableNumber(data.discountAmount),
      paidAmount: toNullableNumber(data.paidAmount),
      personalAmount: toNullableNumber(data.personalAmount),
      reimbursementAmount: toNullableNumber(data.reimbursementAmount),
      voidedAt: data.voidedAt ?? null,
      voidedById: data.voidedById ?? null,
      updatedById: data.updatedById ?? null,
      arrivedById: data.arrivedById ?? null,
      items,
      recordsCount,
      totalActualCost,
    });
  }
}
