/**
 * Production Application Service
 * Phase 8.10: Production & Packaging MVP
 */

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { ProductionBatchStatus } from '../../domain/production/enums';
import { OrderStatus } from '../../domain';
import { ORDER_REPOSITORY } from '../order/order.service';

export const PRODUCTION_BATCH_REPOSITORY = Symbol('ProductionBatchRepository');

export interface CreateProductionBatchDto {
  productionDate: string; // YYYY-MM-DD format
  orderIds?: string[]; // Optional: specific orders to include; if not provided, includes all PAID unassigned orders
}

export interface ProductionBatchSummaryDto {
  id: string;
  productionDate: string;
  status: string;
  packagingUnits: Array<{
    recipeSnapshotId: string;
    totalProductionG: number;
    orderItemCount: number;
  }>;
  totalProductionG: number;
  uniqueRecipeCount: number;
  orderItemCount: number; // Total count across all packagingUnits
}

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  /**
   * Create production batch from PAID orders
   * Groups OrderItems by recipeSnapshotId and aggregates dailyIntakeG
   */
  async createProductionBatch(
    dto: CreateProductionBatchDto,
  ): Promise<ProductionBatch> {
    // Parse production date
    const productionDate = new Date(dto.productionDate);
    if (isNaN(productionDate.getTime())) {
      throw new BadRequestException(
        `Invalid production date format: ${dto.productionDate}. Expected YYYY-MM-DD`,
      );
    }

    // Normalize to date only (remove time component)
    productionDate.setHours(0, 0, 0, 0);

    // Load orders
    let orders;
    if (dto.orderIds && dto.orderIds.length > 0) {
      // Load specific orders
      orders = await Promise.all(
        dto.orderIds.map((id) => this.orderRepository.findById(id)),
      );
      // Filter out nulls
      orders = orders.filter((o): o is NonNullable<typeof o> => o !== null);
    } else {
      // Load all PAID orders (unassigned - not yet in a production batch)
      // For MVP, we'll load all PAID orders; in production, we'd filter by assignment status
      orders = await this.orderRepository.findByStatus(OrderStatus.PAID);
    }

    if (orders.length === 0) {
      throw new BadRequestException(
        'No PAID orders found to include in production batch',
      );
    }

    // Validate all orders are PAID
    const nonPaidOrders = orders.filter((o) => o.status !== OrderStatus.PAID);
    if (nonPaidOrders.length > 0) {
      throw new BadRequestException(
        `Cannot include non-PAID orders in production batch. Found: ${nonPaidOrders.map((o) => o.id).join(', ')}`,
      );
    }

    // Collect all OrderItems with their dailyIntakeG
    const orderItemsWithDailyIntake: Array<{
      orderItemId: string;
      recipeSnapshotId: string; // Use recipeSnapshot.id as unique identifier
      recipeSnapshot: any; // Full RecipeSnapshot for PackagingUnit
      dailyIntakeG: number;
    }> = [];

    for (const order of orders) {
      for (const item of order.items) {
        // dailyIntakeG is already persisted (Phase 8.9)
        if (!item.dailyIntakeG) {
          this.logger.warn(
            `OrderItem ${item.id} has no dailyIntakeG. Skipping.`,
          );
          continue;
        }

        // Use recipeSnapshot.id as the grouping key
        const recipeSnapshotId = item.recipeSnapshot.id;

        orderItemsWithDailyIntake.push({
          orderItemId: item.id,
          recipeSnapshotId,
          recipeSnapshot: item.recipeSnapshot,
          dailyIntakeG: item.dailyIntakeG,
        });
      }
    }

    if (orderItemsWithDailyIntake.length === 0) {
      throw new BadRequestException(
        'No OrderItems with dailyIntakeG found in selected orders',
      );
    }

    // Group by recipeSnapshotId and aggregate
    const groupedByRecipe = new Map<
      string,
      {
        recipeSnapshot: any;
        totalProductionG: number;
        sourceOrderItemIds: string[];
      }
    >();

    for (const item of orderItemsWithDailyIntake) {
      const existing = groupedByRecipe.get(item.recipeSnapshotId);
      if (existing) {
        existing.totalProductionG += item.dailyIntakeG;
        existing.sourceOrderItemIds.push(item.orderItemId);
      } else {
        groupedByRecipe.set(item.recipeSnapshotId, {
          recipeSnapshot: item.recipeSnapshot,
          totalProductionG: item.dailyIntakeG,
          sourceOrderItemIds: [item.orderItemId],
        });
      }
    }

    // Create PackagingUnits (batchId will be set after batch creation)
    const batchId = randomUUID();
    const packagingUnits: PackagingUnit[] = [];
    for (const [, data] of groupedByRecipe.entries()) {
      const unitId = randomUUID();
      const unit = new PackagingUnit(
        unitId,
        batchId, // Set batchId now that we have it
        data.recipeSnapshot,
        data.totalProductionG,
        data.sourceOrderItemIds,
        new Date(),
      );
      packagingUnits.push(unit);
    }

    // Create ProductionBatch
    const batch = new ProductionBatch(
      batchId,
      productionDate,
      ProductionBatchStatus.PLANNED,
      packagingUnits,
      new Date(),
    );

    // Save batch (repository will handle PackagingUnit creation)
    return this.productionRepository.save(batch);
  }

  /**
   * Get production batch by ID with full details
   */
  async getProductionBatchById(id: string): Promise<ProductionBatch | null> {
    return this.productionRepository.findById(id);
  }

  /**
   * List production batches by production date
   */
  async listProductionBatchesByDate(
    date: string,
  ): Promise<ProductionBatch[]> {
    const productionDate = new Date(date);
    if (isNaN(productionDate.getTime())) {
      throw new BadRequestException(
        `Invalid date format: ${date}. Expected YYYY-MM-DD`,
      );
    }
    productionDate.setHours(0, 0, 0, 0);
    return this.productionRepository.findByProductionDate(productionDate);
  }

  private readonly logger = {
    warn: (message: string) => {
      // Simple logger for now
      console.warn(`[ProductionService] ${message}`);
    },
  };
}
