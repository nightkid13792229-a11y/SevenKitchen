/**
 * InMemory Order Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import { Order } from '../../domain/order/order.entity';
import type { OrderRepository } from '../../domain/order/order.repository';
import { OrderStatus, OrderType } from '../../domain';

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

  async findAll(params?: {
    customerId?: string;
    status?: OrderStatus;
    type?: OrderType;
    keyword?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Order[]; total: number }> {
    let filtered = Array.from(this.orders.values());

    // Apply filters
    if (params?.customerId) {
      filtered = filtered.filter((o) => o.customerId === params.customerId);
    }
    if (params?.status) {
      filtered = filtered.filter((o) => o.status === params.status);
    }
    if (params?.type) {
      filtered = filtered.filter((o) => o.type === params.type);
    }
    if (params?.keyword) {
      const keyword = params.keyword.toLowerCase();
      filtered = filtered.filter((o) =>
        o.id.toLowerCase().includes(keyword) ||
        o.customerId.toLowerCase().includes(keyword),
      );
    }
    if (params?.startDate) {
      filtered = filtered.filter((o) => o.createdAt >= params.startDate!);
    }
    if (params?.endDate) {
      filtered = filtered.filter((o) => o.createdAt <= params.endDate!);
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Pagination
    const page = params?.page ?? 1;
    const pageSize = params?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const list = filtered.slice(skip, skip + pageSize);
    const total = filtered.length;

    return Promise.resolve({ list, total });
  }

  async getStats(): Promise<{
    total: number;
    pendingPayment: number;
    paid: number;
    inProduction: number;
    shipped: number;
    completed: number;
    cancelled: number;
  }> {
    const orders = Array.from(this.orders.values());

    const countByStatus = (status: OrderStatus) =>
      orders.filter((o) => o.status === status).length;

    // Phase 9: Simplified statistics aligned with e-commerce standards
    return Promise.resolve({
      total: orders.length,
      pendingPayment: countByStatus(OrderStatus.PENDING_PAYMENT),
      paid: countByStatus(OrderStatus.PAID),
      inProduction: countByStatus(OrderStatus.IN_PRODUCTION),
      shipped: countByStatus(OrderStatus.SHIPPED),
      completed: countByStatus(OrderStatus.COMPLETED),
      cancelled: countByStatus(OrderStatus.CANCELLED),
    });
  }
}

