/**
 * Order Domain Enums
 * These enums match the Prisma schema exactly.
 */

/**
 * Order Status Enum - E-commerce Standard
 *
 * Phase 9: Order Status Optimization
 * Aligned with industry standards (JD.com, Meituan, Standard ERP)
 *
 * Status Flow:
 * INIT → PENDING_PAYMENT → PAID → PURCHASING → IN_PRODUCTION → FREEZING → SHIPPED → COMPLETED
 * Any state (except SHIPPED/COMPLETED) → CANCELLED
 *
 * States:
 * - INIT: Order draft created, not yet submitted
 * - PENDING_PAYMENT: Order submitted, waiting for payment
 * - PAID: Payment confirmed, ready for purchasing
 * - PURCHASING: Purchase list generated, procuring ingredients
 * - IN_PRODUCTION: Order is being prepared, cooked, and packaged
 * - FREEZING: Production completed, freezing before shipment
 * - SHIPPED: Order shipped with tracking number
 * - COMPLETED: Order completed (customer confirmed or auto-complete after 7 days)
 * - CANCELLED: Order cancelled (by customer, admin, or system)
 * - AFTERSALE: After-sale request submitted
 */
export enum OrderStatus {
  INIT = 'INIT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  PURCHASING = 'PURCHASING',
  IN_PRODUCTION = 'IN_PRODUCTION',
  FREEZING = 'FREEZING',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  AFTERSALE = 'AFTERSALE',
}

export enum AftersaleType {
  REFUND = 'REFUND',
  REMAKE = 'REMAKE',
  COMPLAINT = 'COMPLAINT',
  RESOLVED = 'RESOLVED',
}

export enum OrderType {
  FRESH_FOOD = 'FRESH_FOOD',
  CUSTOM_SERVICE = 'CUSTOM_SERVICE',
}

export enum ProductionTaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

