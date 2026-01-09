/**
 * Order Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Order } from './order.entity';
import { OrderStatus, OrderType } from '../index';

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByCustomerId(customerId: string): Promise<Order[]>;
  findByStatus(status: OrderStatus): Promise<Order[]>;
  save(order: Order): Promise<Order>;

  /**
   * Find all orders with filtering, pagination, and search
   * Admin-only method for cross-customer order management
   */
  findAll(params?: {
    customerId?: string;
    status?: OrderStatus;
    type?: OrderType;
    keyword?: string; // Search in order ID, customer name, dog name, address
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Order[]; total: number }>;

  /**
   * Get order statistics grouped by status
   * Phase 9: Simplified statistics aligned with e-commerce standards
   */
  getStats(): Promise<{
    total: number;
    pendingPayment: number;
    paid: number;
    inProduction: number;
    shipped: number;
    completed: number;
    cancelled: number;
  }>;
}

