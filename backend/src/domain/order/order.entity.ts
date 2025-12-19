/**
 * Order Entity
 * Aggregate root for Order domain
 */

import { OrderStatus, OrderType } from '../index';
import { OrderItem } from './order-item.entity';
import { InvalidStateTransitionError, ValidationError } from '../common/errors';
import { PricingBreakdownSnapshot } from './pricing-breakdown-snapshot';

export class Order {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public status: OrderStatus,
    public readonly type: OrderType,
    public targetProductionDate: Date | null,
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
    // Phase 8.14: Shipping tracking fields
    public trackingNumber?: string | null,
    public carrierCode?: string | null,
    public shippedAt?: Date | null,
    // Phase 8.15: Order completion
    public completedAt?: Date | null,
  ) {
    // Compute totalAmount from amountTotal if not provided
    if (this.totalAmount === undefined) {
      this.totalAmount = this.amountTotal;
    }
    this.validateInvariants();
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
   * State machine rules from Doc 02 Section 3.1:
   * INIT → PENDING_PAYMENT
   * PENDING_PAYMENT → PAID (success) or CANCELLED (failure)
   * PAID → WAITING_FOR_PRODUCTION
   * WAITING_FOR_PRODUCTION → IN_PRODUCTION
   * IN_PRODUCTION → READY_FOR_PACKAGING (when all items portioned)
   * READY_FOR_PACKAGING → READY_FOR_SHIPMENT
   * READY_FOR_SHIPMENT → SHIPPED
   * SHIPPED → COMPLETED
   */
  private canTransitionTo(newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.INIT]: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
      [OrderStatus.PENDING_PAYMENT]: [OrderStatus.PAID, OrderStatus.CANCELLED],
      [OrderStatus.PAID]: [OrderStatus.WAITING_FOR_PRODUCTION],
      [OrderStatus.WAITING_FOR_PRODUCTION]: [OrderStatus.IN_PRODUCTION],
      [OrderStatus.IN_PRODUCTION]: [OrderStatus.READY_FOR_PACKAGING],
      [OrderStatus.READY_FOR_PACKAGING]: [OrderStatus.READY_FOR_SHIPMENT],
      [OrderStatus.READY_FOR_SHIPMENT]: [OrderStatus.SHIPPED],
      [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED]: [], // Terminal state
      [OrderStatus.CANCELLED]: [], // Terminal state
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
   * Based on Doc 02/03: Snapshots become immutable once order is PAID or beyond
   */
  areSnapshotsImmutable(): boolean {
    return (
      this.status === OrderStatus.PAID ||
      this.status === OrderStatus.WAITING_FOR_PRODUCTION ||
      this.status === OrderStatus.IN_PRODUCTION ||
      this.status === OrderStatus.READY_FOR_PACKAGING ||
      this.status === OrderStatus.READY_FOR_SHIPMENT ||
      this.status === OrderStatus.SHIPPED ||
      this.status === OrderStatus.COMPLETED
    );
  }

  /**
   * Mark order as shipped with tracking information
   * Phase 8.14: Shipping fulfillment
   * @param trackingNumber Shipping tracking number
   * @param carrierCode Shipping carrier code (e.g., "SF", "YTO", "ZTO")
   */
  markAsShipped(trackingNumber: string, carrierCode: string): void {
    if (this.status !== OrderStatus.READY_FOR_SHIPMENT) {
      throw new InvalidStateTransitionError(
        `Cannot mark order as shipped from status: ${this.status}. Order must be in READY_FOR_SHIPMENT status.`,
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
}
