/**
 * Order Repository Interface
 * Domain layer repository interface (no Prisma dependency)
 */

import { Order } from './order.entity';
import { OrderStatus, OrderType } from '../index';

// Define OrderItem interface for return type
export interface OrderItemDto {
  id: string;
  orderId: string;
  dogId: string | null;
  recipeSnapshot: any;
  quantityG: number;
  packageCount: number;
  packageSpecG: number;
  customRequirements: string | null;
  dailyIntakeG: number | null;
  vacuumBagSpec: string | null;
  preparationMethod: string | null;
  cookingMethod: string | null;
  allocatedAt: Date | null;
  productionBatchId: string | null;
  createdAt: Date;
}

// Define Dog interface for return type
export interface DogDto {
  id: string;
  name: string;
}

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
   * Find orders by target production date range
   * Used by purchasing module to find orders scheduled for production
   */
  findByTargetProductionDateRange(params: {
    startDate: Date;
    endDate?: Date;
    status?: OrderStatus;
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

  /**
   * Find an order item by ID
   */
  findOrderItemById(orderItemId: string): Promise<OrderItemDto | null>;

  /**
   * Find a dog by ID
   */
  findDogById(dogId: string): Promise<DogDto | null>;
}

