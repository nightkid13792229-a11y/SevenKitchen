/**
 * Order Status History Entity
 * Phase 8.18: Order Status History & Audit Trail
 * Immutable record of order status transitions
 */

import { OrderStatus } from '../index';

export class OrderStatusHistory {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly fromStatus: OrderStatus,
    public readonly toStatus: OrderStatus,
    public readonly timestamp: Date,
    public readonly actor: 'customer' | 'staff' | 'admin' | 'system',
    public readonly actorId: string | null,
    public readonly metadata: Record<string, any> | null,
  ) {}
}
