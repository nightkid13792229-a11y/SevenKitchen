/**
 * File-Backed Order Repository Implementation
 * Development-only persistence using JSON file storage
 * Persists orders across server restarts without requiring a database
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Order } from '../../domain/order/order.entity';
import { OrderItem } from '../../domain/order/order-item.entity';
import { PricingBreakdownSnapshot } from '../../domain/order/pricing-breakdown-snapshot';
import type { OrderRepository } from '../../domain/order/order.repository';
import { OrderStatus, OrderType } from '../../domain';

interface OrderData {
  id: string;
  customerId: string;
  status: string;
  type: string;
  createdAt?: string; // ISO timestamp string
  targetProductionDate: string | null;
  amountProduct: number;
  amountShipping: number;
  amountTotal: number;
  totalAmount?: number;
  items: Array<{
    id: string;
    orderId: string;
    dogId?: string | null; // Phase 8.20: Link to dog
    recipeSnapshot: any;
    quantityG: number;
    packageCount: number;
    packageSpecG: number;
    customRequirements: string | null;
    dailyIntakeG?: number; // Optional for backward compatibility
    productionBatchId?: string | null; // Phase 8.11: Allocation lock
    allocatedAt?: string | null; // Phase 8.11: ISO timestamp string
  }>;
  pricingBreakdownSnapshot?: {
    costIngredients: number;
    costPackaging: number;
    costLabor: number;
    costOverhead: number;
    totalProductCost: number;
    productPrice: number;
    shippingFee: number;
    totalPrice: number;
    shippingTemplateId: string | null;
    marginStrategyName: string;
    createdAt: string;
    ingredientPriceVersionHash?: string | null;
  };
}

@Injectable()
export class FileBackedOrderRepository
  implements OrderRepository, OnModuleInit
{
  private orders: Map<string, Order> = new Map();
  private readonly dataDir: string;
  private readonly dataFile: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    // Use backend/.data/orders.json
    this.dataDir = join(process.cwd(), '.data');
    this.dataFile = join(this.dataDir, 'orders.json');
  }

  async onModuleInit(): Promise<void> {
    await this.loadFromFile();
  }

  /**
   * Load orders from JSON file on startup
   */
  private async loadFromFile(): Promise<void> {
    try {
      // Ensure .data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });

      // Try to read existing file
      try {
        const fileContent = await fs.readFile(this.dataFile, 'utf-8');
        const data: OrderData[] = JSON.parse(fileContent);

        // Reconstruct Order entities from JSON
        for (const orderData of data) {
          const order = this.reconstructOrder(orderData);
          this.orders.set(order.id, order);
        }

        console.log(
          `[FileBackedOrderRepository] Loaded ${this.orders.size} orders from ${this.dataFile}`,
        );
      } catch (error: any) {
        // File doesn't exist or is invalid - start with empty map
        if (error.code === 'ENOENT') {
          console.log(
            `[FileBackedOrderRepository] No existing data file, starting fresh`,
          );
        } else {
          console.warn(
            `[FileBackedOrderRepository] Failed to load data: ${error.message}`,
          );
        }
      }
    } catch (error: any) {
      console.error(
        `[FileBackedOrderRepository] Failed to initialize: ${error.message}`,
      );
      // Continue with empty map - don't crash the app
    }
  }

  /**
   * Reconstruct Order entity from JSON data
   */
  private reconstructOrder(data: OrderData): Order {
    const items = data.items.map(
      (itemData) =>
        new OrderItem(
          itemData.id,
          itemData.orderId,
          itemData.dogId ?? null, // Phase 8.20: dogId parameter
          itemData.recipeSnapshot,
          itemData.quantityG,
          itemData.packageCount,
          itemData.packageSpecG,
          itemData.customRequirements,
          itemData.dailyIntakeG ?? itemData.quantityG / (itemData.packageCount || 1), // Fallback for backward compatibility
          // Phase 8.11: Allocation fields
          itemData.productionBatchId ?? null,
          itemData.allocatedAt ? new Date(itemData.allocatedAt) : null,
        ),
    );

    let pricingBreakdown: PricingBreakdownSnapshot | undefined = undefined;
    if (data.pricingBreakdownSnapshot) {
      const snapshot = data.pricingBreakdownSnapshot;
      pricingBreakdown = new PricingBreakdownSnapshot(
        snapshot.costIngredients,
        snapshot.costPackaging,
        snapshot.costLabor,
        snapshot.costOverhead,
        snapshot.totalProductCost,
        snapshot.productPrice,
        snapshot.shippingFee,
        snapshot.totalPrice,
        snapshot.shippingTemplateId,
        snapshot.marginStrategyName,
        new Date(snapshot.createdAt),
        snapshot.ingredientPriceVersionHash ?? null,
      );
    }

    return new Order(
      data.id,
      data.customerId,
      data.status as OrderStatus,
      data.type as any,
      data.createdAt ? new Date(data.createdAt) : new Date(),
      data.targetProductionDate ? new Date(data.targetProductionDate) : null,
      data.amountProduct,
      data.amountShipping,
      data.amountTotal,
      items,
      data.totalAmount,
      pricingBreakdown,
    );
  }

  /**
   * Serialize orders to JSON and write to file
   * Uses write lock to prevent concurrent write conflicts
   */
  private async persistToFile(): Promise<void> {
    // Chain write operations to serialize them
    this.writeLock = this.writeLock.then(async () => {
      try {
        // Ensure directory exists
        await fs.mkdir(this.dataDir, { recursive: true });

        // Serialize orders to JSON
        const ordersArray: OrderData[] = Array.from(this.orders.values()).map(
          (order) => this.serializeOrder(order),
        );

        // Write atomically: write to temp file, then rename
        const tempFile = `${this.dataFile}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(ordersArray, null, 2), 'utf-8');
        await fs.rename(tempFile, this.dataFile);
      } catch (error: any) {
        console.error(
          `[FileBackedOrderRepository] Failed to persist: ${error.message}`,
        );
        throw error;
      }
    });

    return this.writeLock;
  }

  /**
   * Serialize Order entity to JSON-compatible format
   */
  private serializeOrder(order: Order): OrderData {
    return {
      id: order.id,
      customerId: order.customerId,
      status: order.status,
      type: order.type,
      targetProductionDate: order.targetProductionDate
        ? order.targetProductionDate.toISOString()
        : null,
      amountProduct: order.amountProduct,
      amountShipping: order.amountShipping,
      amountTotal: order.amountTotal,
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        id: item.id,
        orderId: item.orderId,
        recipeSnapshot: item.recipeSnapshot,
        quantityG: item.quantityG,
        packageCount: item.packageCount,
        packageSpecG: item.packageSpecG,
        customRequirements: item.customRequirements,
        dailyIntakeG: item.dailyIntakeG,
        // Phase 8.11: Allocation fields
        productionBatchId: item.productionBatchId ?? null,
        allocatedAt: item.allocatedAt ? item.allocatedAt.toISOString() : null,
      })),
      pricingBreakdownSnapshot: order.pricingBreakdownSnapshot
        ? {
            costIngredients: order.pricingBreakdownSnapshot.costIngredients,
            costPackaging: order.pricingBreakdownSnapshot.costPackaging,
            costLabor: order.pricingBreakdownSnapshot.costLabor,
            costOverhead: order.pricingBreakdownSnapshot.costOverhead,
            totalProductCost:
              order.pricingBreakdownSnapshot.totalProductCost,
            productPrice: order.pricingBreakdownSnapshot.productPrice,
            shippingFee: order.pricingBreakdownSnapshot.shippingFee,
            totalPrice: order.pricingBreakdownSnapshot.totalPrice,
            shippingTemplateId:
              order.pricingBreakdownSnapshot.shippingTemplateId,
            marginStrategyName:
              order.pricingBreakdownSnapshot.marginStrategyName,
            createdAt:
              order.pricingBreakdownSnapshot.createdAt.toISOString(),
            ingredientPriceVersionHash:
              order.pricingBreakdownSnapshot.ingredientPriceVersionHash ??
              null,
          }
        : undefined,
    };
  }

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
    // Update in-memory map
    this.orders.set(order.id, order);

    // Persist to file (write-through)
    await this.persistToFile();

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
      const aDate = a.targetProductionDate ? a.targetProductionDate.getTime() : 0;
      const bDate = b.targetProductionDate ? b.targetProductionDate.getTime() : 0;
      return aDate - bDate;
    });

    return Promise.resolve({
      list: filtered,
      total: filtered.length,
    });
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


