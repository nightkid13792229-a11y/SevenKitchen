/**
 * Order Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Order } from './order.entity';
import { OrderStatus } from '../index';

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByCustomerId(customerId: string): Promise<Order[]>;
  findByStatus(status: OrderStatus): Promise<Order[]>;
  save(order: Order): Promise<Order>;
}
