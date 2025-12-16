/**
 * InMemory Order Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import { Order } from '../../domain/order/order.entity';
import type { OrderRepository } from '../../domain/order/order.repository';
import { OrderStatus } from '../../domain';

@Injectable()
export class InMemoryOrderRepository implements OrderRepository {
  private orders: Map<string, Order> = new Map();

  async findById(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id) || null);
  }

  async findByCustomerId(customerId: string): Promise<Order[]> {
    return Promise.resolve(
      Array.from(this.orders.values()).filter(
        (order) => order.customerId === customerId,
      ),
    );
  }

  async findByStatus(status: OrderStatus): Promise<Order[]> {
    return Promise.resolve(
      Array.from(this.orders.values()).filter(
        (order) => order.status === status,
      ),
    );
  }

  async save(order: Order): Promise<Order> {
    // Create a copy to ensure immutability of the snapshot
    // In real implementation, this would be handled by the ORM
    this.orders.set(order.id, order);
    return Promise.resolve(order);
  }
}
