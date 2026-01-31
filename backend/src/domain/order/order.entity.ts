/**
 * Order Entity
 * Aggregate root for Order domain
 */

import { OrderStatus, OrderType, AftersaleType } from '../index';
import { OrderItem } from './order-item.entity';
import { InvalidStateTransitionError, ValidationError } from '../common/errors';
import { PricingBreakdownSnapshot } from './pricing-breakdown-snapshot';

export class Order {
  private skipValidation?: boolean;

  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public status: OrderStatus,
    public readonly type: OrderType,
    public readonly createdAt: Date,
    public targetProductionDate: Date | null,
    public originalTargetProductionDate: Date | null,
    public amountProduct: number,
    public amountShipping: number,
    public amountTotal: number,
    public readonly items: OrderItem[],
    // Legacy field for backward compatibility (computed from amountTotal)
    public totalAmount?: number,
    // Phase 7.1: Pricing breakdown snapshot (immutable, set at order creation)
    public readonly pricingBreakdownSnapshot?: PricingBreakdownSnapshot,
    // Cross-domain references
    public readonly dogId?: string,
    public readonly addressId?: string,
    // 🔧 添加：关联对象（用于生产管理页面显示狗狗名称和收货人信息）
    public readonly dog?: {
      id: string;
      name: string;
    },
    public readonly address?: {
      id: string;
      recipientName: string;
      phone: string;
      region: {
        province: string;
        city: string;
        district?: string;
      },
      detail: string;
    },
    // Phase 8.14: Shipping tracking fields
    public trackingNumber?: string | null,
    public carrierCode?: string | null,
    public shippedAt?: Date | null,
    // Phase 8.15: Order completion
    public completedAt?: Date | null,
    // Phase 8.16: Order cancellation
    public cancelledAt?: Date | null,
    public cancellationReason?: string | null,
    public cancelledBy?: 'customer' | 'admin' | 'system' | null,
    // Phase 8.17: Payment transaction tracking
    public paymentMethod?: string | null,
    public transactionId?: string | null,
    public paidAt?: Date | null,
    public paymentStatus?: 'PENDING' | 'SUCCESS' | 'FAILED' | null,
    // Phase 9.1: Freezing and Aftersale fields
    public aftersaleType?: AftersaleType | null,
    public freezingSince?: Date | null,
    public aftersaleSince?: Date | null,
    public aftersaleReason?: string | null,
    public aftersalePhotos?: string[],
    skipValidation?: boolean, // Internal: skip validation for admin updates
  ) {
    // Compute totalAmount from amountTotal if not provided
    if (this.totalAmount === undefined) {
      this.totalAmount = this.amountTotal;
    }
    this.skipValidation = skipValidation;
    if (!skipValidation) {
      this.validateInvariants();
    }
  }

  /**
   * Create Order entity from database data without validation
   * Used when loading orders that may have been manually adjusted (e.g., admin amount changes)
   */
  static fromPrismaData(data: any, items: OrderItem[] = []): Order {
    return new Order(
      data.id,
      data.customerId,
      data.status,
      data.type,
      data.createdAt,
      data.targetProductionDate,
      data.originalTargetProductionDate,
      Number(data.amountProduct),
      Number(data.amountShipping),
      Number(data.amountTotal),
      items,
      Number(data.totalAmount ?? data.amountTotal),
      data.pricingBreakdownSnapshot,
      data.dogId || undefined,
      data.addressId || undefined,
      undefined, // dog
      undefined, // address
      data.trackingNumber,
      data.carrierCode,
      data.shippedAt,
      data.completedAt,
      data.cancelledAt,
      data.cancellationReason,
      data.cancelledBy,
      data.paymentMethod,
      data.transactionId,
      data.paidAt,
      data.paymentStatus,
      data.aftersaleType,
      data.freezingSince,
      data.aftersaleSince,
      data.aftersaleReason,
      data.aftersalePhotos,
      true, // skip validation
    );
  }

  /**
   * Validate domain invariants
   */
  private validateInvariants(): void {
    if (this.items.length === 0) {
      throw new ValidationError('Order must have at least one item');
    }

    if (this.amountProduct < 0) {
      throw new ValidationError(
        `Product amount must be non-negative, got: ${this.amountProduct}`,
      );
    }

    if (this.amountShipping < 0) {
      throw new ValidationError(
        `Shipping amount must be non-negative, got: ${this.amountShipping}`,
      );
    }

    if (this.amountTotal < 0) {
      throw new ValidationError(
        `Total amount must be non-negative, got: ${this.amountTotal}`,
      );
    }

    // Validate that amountTotal = amountProduct + amountShipping (with small tolerance for rounding)
    const expectedTotal = this.amountProduct + this.amountShipping;
    if (Math.abs(this.amountTotal - expectedTotal) > 0.01) {
      throw new ValidationError(
        `Total amount (${this.amountTotal}) must equal product (${this.amountProduct}) + shipping (${this.amountShipping})`,
      );
    }
  }

  /**
   * Check if order can be modified
   * Based on Doc 02: Only INIT and PENDING_PAYMENT can be modified
   */
  canBeModified(): boolean {
    return (
      this.status === OrderStatus.INIT ||
      this.status === OrderStatus.PENDING_PAYMENT
    );
  }

  /**
   * Transition order status
   * Implements state machine from Doc 02 Section 3.1
   */
  transitionTo(newStatus: OrderStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStateTransitionError(
        `Cannot transition from ${this.status} to ${newStatus}`,
      );
    }

    this.status = newStatus;
  }

  /**
   * Check if transition is allowed
   * Phase 9: E-commerce Standard State Machine
   *
   * Standard Flow (aligned with JD.com, Meituan, Standard ERP):
   * INIT → PENDING_PAYMENT → PAID → PURCHASING → IN_PRODUCTION → FREEZING → SHIPPED → COMPLETED
   *
   * Cancellation Rules:
   * - Customer can cancel: INIT, PENDING_PAYMENT
   * - Admin can cancel: Any state except SHIPPED, COMPLETED, CANCELLED
   *
   * State Definitions:
   * - INIT: Order draft, not yet submitted
   * - PENDING_PAYMENT: Waiting for payment
   * - PAID: Payment confirmed, ready for purchasing
   * - PURCHASING: Purchase list generated, procuring ingredients
   * - IN_PRODUCTION: Being prepared, cooked, and packaged
   * - FREEZING: Production completed, freezing before shipment
   * - SHIPPED: Shipped with tracking (cannot be cancelled)
   * - COMPLETED: Completed (terminal state)
   * - CANCELLED: Cancelled (terminal state)
   * - AFTERSALE: After-sale request submitted
   */
  private canTransitionTo(newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.INIT]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
      [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.PURCHASING, OrderStatus.CANCELLED],
      [OrderStatus.PURCHASING]: [OrderStatus.PAID, OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
      // Allow IN_PRODUCTION → PURCHASING for batch deletion (undo production)
      [OrderStatus.IN_PRODUCTION]: [OrderStatus.PURCHASING, OrderStatus.FREEZING, OrderStatus.CANCELLED],
      [OrderStatus.FREEZING]: [OrderStatus.SHIPPED, OrderStatus.AFTERSALE],
      [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.AFTERSALE],
      [OrderStatus.COMPLETED]: [OrderStatus.AFTERSALE],
      [OrderStatus.AFTERSALE]: [OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
      [OrderStatus.CANCELLED]: [],
    };

    const allowedNextStates = validTransitions[this.status] || [];
    return allowedNextStates.includes(newStatus);
  }

  /**
   * Add item to order
   * Only allowed when order is in INIT or PENDING_PAYMENT status
   */
  addItem(item: OrderItem): void {
    if (!this.canBeModified()) {
      throw new InvalidStateTransitionError(
        `Cannot add items to order in status: ${this.status}`,
      );
    }

    // TODO: Recalculate total amount
    this.items.push(item);
  }

  /**
   * Remove item from order
   * Only allowed when order is in INIT or PENDING_PAYMENT status
   */
  removeItem(itemId: string): void {
    if (!this.canBeModified()) {
      throw new InvalidStateTransitionError(
        `Cannot remove items from order in status: ${this.status}`,
      );
    }

    const index = this.items.findIndex((item) => item.id === itemId);
    if (index === -1) {
      throw new ValidationError(`Item ${itemId} not found in order`);
    }

    this.items.splice(index, 1);
    // TODO: Recalculate total amount
  }

  /**
   * Check if order snapshots are immutable
   * Phase 9: Snapshots become immutable once order is PAID or beyond
   * Based on Doc 02/03: Immutable after payment confirmation
   */
  areSnapshotsImmutable(): boolean {
    return (
      this.status === OrderStatus.PAID ||
      this.status === OrderStatus.IN_PRODUCTION ||
      this.status === OrderStatus.SHIPPED ||
      this.status === OrderStatus.COMPLETED
    );
  }

  /**
   * Mark order as shipped with tracking information
   * Phase 9: Shipping fulfillment (simplified from READY_FOR_SHIPMENT to IN_PRODUCTION)
   * @param trackingNumber Shipping tracking number
   * @param carrierCode Shipping carrier code (e.g., "SF", "YTO", "ZTO")
   */
  markAsShipped(trackingNumber: string, carrierCode: string): void {
    // Phase 9: Changed from READY_FOR_SHIPMENT to IN_PRODUCTION
    if (this.status !== OrderStatus.IN_PRODUCTION) {
      throw new InvalidStateTransitionError(
        `Cannot mark order as shipped from status: ${this.status}. Order must be in IN_PRODUCTION status.`,
      );
    }

    if (!trackingNumber || !trackingNumber.trim()) {
      throw new ValidationError('Tracking number is required');
    }

    if (!carrierCode || !carrierCode.trim()) {
      throw new ValidationError('Carrier code is required');
    }

    this.trackingNumber = trackingNumber.trim();
    this.carrierCode = carrierCode.trim();
    this.shippedAt = new Date();
    this.transitionTo(OrderStatus.SHIPPED);
  }

  /**
   * Mark order as completed
   * Phase 8.15: Order Completion & Delivery Closure MVP
   * Allowed only when order.status === SHIPPED
   */
  markAsCompleted(): void {
    if (this.status !== OrderStatus.SHIPPED) {
      throw new InvalidStateTransitionError(
        `Cannot mark order as completed from status: ${this.status}. Order must be in SHIPPED status.`,
      );
    }

    this.completedAt = new Date();
    this.transitionTo(OrderStatus.COMPLETED);
  }

  /**
   * Cancel order
   * Phase 8.16: Order Cancellation Workflow
   * @param reason Cancellation reason
   * @param cancelledBy Who cancelled the order: "customer" | "admin" | "system"
   * @throws InvalidStateTransitionError if order cannot be cancelled from current status
   * @throws ValidationError if order is already cancelled
   */
  cancelOrder(reason: string, cancelledBy: 'customer' | 'admin' | 'system'): void {
    // Idempotency: if already cancelled, reject clearly
    if (this.status === OrderStatus.CANCELLED) {
      throw new ValidationError('Order is already cancelled');
    }

    // Validate cancellation permissions based on who is cancelling
    if (cancelledBy === 'customer') {
      // Customer can only cancel INIT or PENDING_PAYMENT
      if (
        this.status !== OrderStatus.INIT &&
        this.status !== OrderStatus.PENDING_PAYMENT
      ) {
        throw new InvalidStateTransitionError(
          `Customer cannot cancel order in status: ${this.status}. Only INIT or PENDING_PAYMENT orders can be cancelled by customer.`,
        );
      }
    } else {
      // Admin or system can cancel any status except SHIPPED, COMPLETED, and CANCELLED
      // (CANCELLED already checked above, but include for clarity)
      if (
        this.status === OrderStatus.SHIPPED ||
        this.status === OrderStatus.COMPLETED
      ) {
        throw new InvalidStateTransitionError(
          `Admin/system cannot cancel order in status: ${this.status}. SHIPPED and COMPLETED orders cannot be cancelled.`,
        );
      }
    }

    // Validate reason is provided
    if (!reason || !reason.trim()) {
      throw new ValidationError('Cancellation reason is required');
    }

    // Set cancellation fields
    this.cancelledAt = new Date();
    this.cancellationReason = reason.trim();
    this.cancelledBy = cancelledBy;

    // Transition to CANCELLED status
    this.transitionTo(OrderStatus.CANCELLED);
  }

  /**
   * Record payment transaction
   * Phase 8.17: Payment Transaction Tracking
   * @param paymentMethod Payment method (e.g., "WECHAT", "ALIPAY")
   * @param transactionId Transaction ID (generated or from payment gateway)
   * @throws ValidationError if paymentStatus is not SUCCESS but paidAt/transactionId are set
   */
  recordPayment(
    paymentMethod: string,
    transactionId: string,
  ): void {
    if (this.status !== OrderStatus.PENDING_PAYMENT) {
      throw new InvalidStateTransitionError(
        `Cannot record payment for order in status: ${this.status}. Order must be in PENDING_PAYMENT status.`,
      );
    }

    // Check if order is already cancelled (race condition prevention)
    if (this.cancelledAt) {
      const reason = this.cancellationReason || 'N/A';
      throw new InvalidStateTransitionError(
        `Cannot record payment for cancelled order. Order was cancelled at ${this.cancelledAt.toISOString()}. Reason: ${reason}`,
      );
    }

    if (!paymentMethod || !paymentMethod.trim()) {
      throw new ValidationError('Payment method is required');
    }

    if (!transactionId || !transactionId.trim()) {
      throw new ValidationError('Transaction ID is required');
    }

    // Set payment tracking fields
    this.paymentMethod = paymentMethod.trim();
    this.transactionId = transactionId.trim();
    this.paidAt = new Date();
    this.paymentStatus = 'SUCCESS';

    // Transition to PAID status
    this.transitionTo(OrderStatus.PAID);
  }

  /**
   * Mark order as freezing (急冻中待发货)
   * Phase 9.1: Freezing status after production photos uploaded
   * @throws InvalidStateTransitionError if order is not in IN_PRODUCTION status
   */
  markAsFreezing(): void {
    if (this.status !== OrderStatus.IN_PRODUCTION) {
      throw new InvalidStateTransitionError(
        `Cannot mark order as freezing from status: ${this.status}. Order must be in IN_PRODUCTION status.`,
      );
    }

    this.freezingSince = new Date();
    this.transitionTo(OrderStatus.FREEZING);
  }

  /**
   * Apply for aftersale (申请售后)
   * Phase 9.1: Aftersale request from customer
   * @param type Type of aftersale (REFUND, REMAKE, COMPLAINT)
   * @param reason Customer reason for aftersale
   * @param photos Optional array of photo URLs
   * @throws InvalidStateTransitionError if order is not in eligible status
   * @throws ValidationError if reason is not provided
   */
  applyForAftersale(type: AftersaleType, reason: string, photos: string[] = []): void {
    const allowedStatuses = [
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      OrderStatus.COMPLETED,
    ];

    if (!allowedStatuses.includes(this.status)) {
      throw new InvalidStateTransitionError(
        `Cannot apply for aftersale from status: ${this.status}. Order must be in FREEZING, SHIPPED, or COMPLETED status.`,
      );
    }

    if (!reason || !reason.trim()) {
      throw new ValidationError('Aftersale reason is required');
    }

    this.aftersaleType = type;
    this.aftersaleReason = reason.trim();
    this.aftersalePhotos = photos;
    this.aftersaleSince = new Date();
    this.transitionTo(OrderStatus.AFTERSALE);
  }

  /**
   * Resolve aftersale (解决售后)
   * Phase 9.1: Admin/staff resolves aftersale request
   * @param resolutionType Type of resolution (refunded, remade, resolved)
   * @throws InvalidStateTransitionError if order is not in AFTERSALE status
   */
  resolveAftersale(resolutionType: 'refunded' | 'remade' | 'resolved'): void {
    if (this.status !== OrderStatus.AFTERSALE) {
      throw new InvalidStateTransitionError(
        `Cannot resolve aftersale from status: ${this.status}. Order must be in AFTERSALE status.`,
      );
    }

    this.aftersaleType = AftersaleType.RESOLVED;

    switch (resolutionType) {
      case 'refunded':
        // Transition to CANCELLED status for refund
        this.transitionTo(OrderStatus.CANCELLED);
        break;
      case 'remade':
        // Transition back to IN_PRODUCTION for remake
        this.transitionTo(OrderStatus.IN_PRODUCTION);
        break;
      case 'resolved':
        // Mark as completed (complaint resolved)
        if (!this.completedAt) {
          this.completedAt = new Date();
        }
        this.transitionTo(OrderStatus.COMPLETED);
        break;
    }
  }

  /**
   * Update order address
   * Allowed when order.status < SHIPPED
   * @param addressId New address ID
   * @param address Full address object (for validation)
   * @throws InvalidStateTransitionError if order is already shipped
   */
  updateAddress(addressId: string, address: {
    id: string;
    recipientName: string;
    phone: string;
    region: { province: string; city: string; district?: string };
    detail: string;
  }): void {
    // Cannot change address after shipping
    if (
      this.status === OrderStatus.SHIPPED ||
      this.status === OrderStatus.COMPLETED ||
      this.status === OrderStatus.CANCELLED
    ) {
      throw new InvalidStateTransitionError(
        `Cannot update address for order in status: ${this.status}`
      );
    }

    // Validate address data
    if (!address.recipientName || !address.phone || !address.region || !address.detail) {
      throw new ValidationError('Address information is incomplete');
    }

    // Update address reference
    (this as any).addressId = addressId;
    (this as any).address = address;
  }

  /**
   * Update target production date
   * Allowed when order.status < PURCHASING
   * Date must be >= current target date (only forward or keep same)
   * @param newDate New target production date
   * @throws InvalidStateTransitionError if order is already in purchasing
   * @throws ValidationError if date is invalid or earlier than current date
   */
  updateTargetProductionDate(newDate: Date): void {
    // Cannot change date after purchasing started
    if (
      this.status === OrderStatus.PURCHASING ||
      this.status === OrderStatus.IN_PRODUCTION ||
      this.status === OrderStatus.FREEZING ||
      this.status === OrderStatus.SHIPPED ||
      this.status === OrderStatus.COMPLETED ||
      this.status === OrderStatus.CANCELLED
    ) {
      throw new InvalidStateTransitionError(
        `Cannot update target production date for order in status: ${this.status}`
      );
    }

    // IMPORTANT: Save original target date BEFORE first update
    // This must happen before validation, so we can use the original date as the baseline
    if (!this.originalTargetProductionDate && this.targetProductionDate) {
      (this as any).originalTargetProductionDate = new Date(this.targetProductionDate);
    }

    // Validate date is not in the past (compared to ORIGINAL target date)
    // This allows users to correct mistakes (e.g., changing from Jan 29 back to Jan 28)
    // as long as it's not earlier than the original date (e.g., Jan 27)
    const baseDate = this.originalTargetProductionDate;
    if (baseDate) {
      const baseDateOnly = new Date(baseDate);
      baseDateOnly.setHours(0, 0, 0, 0);

      const newDateOnly = new Date(newDate);
      newDateOnly.setHours(0, 0, 0, 0);

      if (newDateOnly < baseDateOnly) {
        throw new ValidationError(
          'Target production date cannot be earlier than the original target date'
        );
      }
    }

    this.targetProductionDate = newDate;
  }
}

