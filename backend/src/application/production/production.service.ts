/**
 * Production Application Service
 * Phase 8.10: Production & Packaging MVP
 */

import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
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
    sourceOrderItemIds: string[]; // Traceability: contributing OrderItem IDs
  }>;
  totalProductionG: number;
  uniqueRecipeCount: number;
  orderItemCount: number; // Total count across all packagingUnits
}

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

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

    // Phase 8.11: Collect only unallocated OrderItems (productionBatchId is null)
    const orderItemsWithDailyIntake: Array<{
      orderItemId: string;
      recipeSnapshotId: string; // Use recipeSnapshot.id as unique identifier
      recipeSnapshot: any; // Full RecipeSnapshot for PackagingUnit
      dailyIntakeG: number;
    }> = [];

    for (const order of orders) {
      for (const item of order.items) {
        // Phase 8.11: Skip already allocated items
        if (item.productionBatchId !== null) {
          // Item already allocated, skip
          continue;
        }

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
        'No eligible OrderItems found. All items may already be allocated to other batches.',
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
    const allOrderItemIds: string[] = []; // Collect all item IDs for allocation

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
      // Collect all order item IDs for allocation
      allOrderItemIds.push(...data.sourceOrderItemIds);
    }

    // Create ProductionBatch
    const batch = new ProductionBatch(
      batchId,
      productionDate,
      ProductionBatchStatus.PLANNED,
      packagingUnits,
      new Date(),
    );

    // Phase 8.11: Save batch and allocate OrderItems
    // The repository's save method will create the batch, then we allocate items
    const savedBatch = await this.productionRepository.save(batch);

    // Allocate OrderItems to this batch (atomic update)
    const allocatedCount = await this.productionRepository.allocateOrderItems(
      allOrderItemIds,
      batchId,
    );

    // Verify allocation succeeded (all items should be allocated)
    // Ensure allocatedCount is a number before comparison
    const allocatedCountNum = typeof allocatedCount === 'number' ? allocatedCount : 0;
    if (allocatedCountNum !== allOrderItemIds.length) {
      this.logger.warn(
        `Only ${allocatedCountNum} of ${allOrderItemIds.length} OrderItems were allocated. Possible concurrent allocation conflict.`,
      );
      // In a real system, we might want to rollback or retry, but for MVP we'll continue
      // The batch is created, but some items may have been allocated to another batch concurrently
    }

    return savedBatch;
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

  /**
   * Check and complete batch if all packaging units are completed
   * Phase 8.14: Auto-complete batch and transition orders to READY_FOR_SHIPMENT
   * @param batchId Production batch ID
   * @returns true if batch was completed, false otherwise
   */
  async checkAndCompleteBatch(batchId: string): Promise<boolean> {
    const batch = await this.productionRepository.findById(batchId);
    if (!batch) {
      throw new BadRequestException(`Production batch not found: ${batchId}`);
    }

    // Only check batches that are IN_PRODUCTION
    if (batch.status !== ProductionBatchStatus.IN_PRODUCTION) {
      return false;
    }

    // Check if all units are completed
    if (!batch.areAllUnitsCompleted()) {
      return false;
    }

    // Transition batch to COMPLETED
    batch.transitionTo(ProductionBatchStatus.COMPLETED);
    await this.productionRepository.save(batch);

    this.logger.log(
      `Batch ${batchId} auto-completed: all ${batch.packagingUnits.length} packaging units are COMPLETED`,
    );

    // Find all orders with OrderItems in this batch
    const orderItemIds = batch.packagingUnits.flatMap(
      (unit) => unit.sourceOrderItemIds,
    );

    // Get unique order IDs from order items
    const orderIds = new Set<string>();
    for (const itemId of orderItemIds) {
      // Find order by item ID (we need to query orders and check their items)
      // For now, we'll use a repository method to find orders by item IDs
      const orders = await this.orderRepository.findByStatus(
        OrderStatus.IN_PRODUCTION,
      );
      for (const order of orders) {
        if (order.items.some((item) => item.id === itemId)) {
          orderIds.add(order.id);
        }
      }
    }

    // Transition all related orders to READY_FOR_SHIPMENT
    let transitionedCount = 0;
    for (const orderId of orderIds) {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        continue;
      }

      // Only transition orders that are IN_PRODUCTION
      if (order.status === OrderStatus.IN_PRODUCTION) {
        try {
          order.transitionTo(OrderStatus.READY_FOR_SHIPMENT);
          await this.orderRepository.save(order);
          transitionedCount++;
          this.logger.log(
            `Order ${orderId} auto-transitioned to READY_FOR_SHIPMENT after batch ${batchId} completion`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to transition order ${orderId} to READY_FOR_SHIPMENT: ${error}`,
          );
        }
      }
    }

    this.logger.log(
      `Batch ${batchId} completion: ${transitionedCount} orders transitioned to READY_FOR_SHIPMENT`,
    );

    return true;
  }
}
