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
      filtered = filtered.filter(
        (o) =>
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

  /**
   * Find orders by target production date range
   * Used by purchasing module to find orders scheduled for production
   */
  async findByTargetProductionDateRange(params: {
    startDate: Date;
    endDate?: Date;
    status?: OrderStatus;
  }): Promise<{ list: Order[]; total: number }> {
    const endDate = params.endDate || params.startDate;

    let filtered = Array.from(this.orders.values());

    // Filter by target production date range
    filtered = filtered.filter((o) => {
      if (!o.targetProductionDate) return false;
      const prodDate = new Date(o.targetProductionDate);
      return prodDate >= params.startDate && prodDate <= endDate;
    });

    // Filter by status if provided
    if (params.status) {
      filtered = filtered.filter((o) => o.status === params.status);
    }

    // Sort by target production date ascending
    filtered.sort((a, b) => {
      const aDate = a.targetProductionDate
        ? a.targetProductionDate.getTime()
        : 0;
      const bDate = b.targetProductionDate
        ? b.targetProductionDate.getTime()
        : 0;
      return aDate - bDate;
    });

    return Promise.resolve({
      list: filtered,
      total: filtered.length,
    });
  }

  async getStats(): Promise<{
    total: number;
    todayNew: number;
    paidRevenue: number;
    pendingPayment: number;
    paid: number;
    purchasing: number;
    inProduction: number;
    freezing: number;
    shipped: number;
    completed: number;
    cancelled: number;
    aftersale: number;
  }> {
    const orders = Array.from(this.orders.values());

    const countByStatus = (status: OrderStatus) =>
      orders.filter((o) => o.status === status).length;
    const { start, end } = this.getShanghaiTodayBounds();
    const paidRevenueStatuses = new Set([
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      OrderStatus.COMPLETED,
      OrderStatus.AFTERSALE,
    ]);

    // Phase 9: Simplified statistics aligned with e-commerce standards
    return Promise.resolve({
      total: orders.length,
      todayNew: orders.filter(
        (o) => o.createdAt >= start && o.createdAt < end,
      ).length,
      paidRevenue: orders
        .filter((o) => paidRevenueStatuses.has(o.status))
        .reduce((sum, o) => sum + Number(o.amountTotal || 0), 0),
      pendingPayment: countByStatus(OrderStatus.PENDING_PAYMENT),
      paid: countByStatus(OrderStatus.PAID),
      purchasing: countByStatus(OrderStatus.PURCHASING),
      inProduction: countByStatus(OrderStatus.IN_PRODUCTION),
      freezing: countByStatus(OrderStatus.FREEZING),
      shipped: countByStatus(OrderStatus.SHIPPED),
      completed: countByStatus(OrderStatus.COMPLETED),
      cancelled: countByStatus(OrderStatus.CANCELLED),
      aftersale: countByStatus(OrderStatus.AFTERSALE),
    });
  }

  private getShanghaiTodayBounds(): { start: Date; end: Date } {
    const now = new Date();
    const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const start = new Date(
      Date.UTC(
        shanghaiNow.getUTCFullYear(),
        shanghaiNow.getUTCMonth(),
        shanghaiNow.getUTCDate(),
      ) -
        8 * 60 * 60 * 1000,
    );
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    return { start, end };
  }

  async findOrderItemById(orderItemId: string): Promise<any | null> {
    for (const order of this.orders.values()) {
      const item = order.items.find((i) => i.id === orderItemId);
      if (item) {
        return {
          id: item.id,
          orderId: item.orderId,
          dogId: item.dogId,
          recipeSnapshot: item.recipeSnapshot,
          quantityG: item.quantityG,
          packageCount: item.packageCount,
          packageSpecG: item.packageSpecG,
          packagePlan: item.packagePlan ?? null,
          ingredientSourcePlan: item.ingredientSourcePlan ?? null,
          preparationMethod: item.preparationMethod ?? null,
          cookingMethod: item.cookingMethod ?? null,
          customRequirements: item.customRequirements,
          dailyIntakeG: item.dailyIntakeG,
          vacuumBagSpec: item.vacuumBagSpec,
          allocatedAt: item.allocatedAt,
          productionBatchId: item.productionBatchId,
          createdAt: (item as any).createdAt || new Date(),
        };
      }
    }
    return null;
  }

  async findDogById(dogId: string): Promise<any | null> {
    // In-memory implementation doesn't have direct access to dogs
    // This would need to be implemented with a proper Dog repository
    return Promise.resolve(null);
  }
}
