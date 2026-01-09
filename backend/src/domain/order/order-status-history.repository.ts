/**
 * Order Status History Repository Interface
 * Phase 8.18: Order Status History & Audit Trail
 */

import { OrderStatusHistory } from './order-status-history.entity';
import { OrderStatus } from '../index';

export interface OrderStatusHistoryRepository {
  /**
   * Append a new status history record (immutable - only insertion allowed)
   */
  append(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    actor: 'customer' | 'staff' | 'admin' | 'system',
    actorId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<OrderStatusHistory>;

  /**
   * Find all history records for an order, ordered by timestamp ascending
   */
  findByOrderId(orderId: string): Promise<OrderStatusHistory[]>;
}

