/**
 * Production Application Service
 * Phase 8.10: Production & Packaging MVP
 */

import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { ProductionBatchStatus } from '../../domain/production/enums';
import { OrderStatus } from '../../domain';
import { ORDER_REPOSITORY, ORDER_STATUS_HISTORY_REPOSITORY } from '../order/order.service';

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
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: OrderStatusHistoryRepository,
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
    try {
      this.logger.debug(`[ProductionService] Saving batch ${batchId} with ${batch.packagingUnits.length} packaging units`);
      const savedBatch = await this.productionRepository.save(batch);
      this.logger.debug(`[ProductionService] Batch ${batchId} saved successfully`);

      // Allocate OrderItems to this batch (atomic update)
      this.logger.debug(`[ProductionService] Allocating ${allOrderItemIds.length} order items to batch ${batchId}`);
      const allocatedCount = await this.productionRepository.allocateOrderItems(
        allOrderItemIds,
        batchId,
      );
      this.logger.debug(`[ProductionService] Allocated ${allocatedCount} order items to batch ${batchId}`);

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

      // Phase 8.14: Transition orders from PAID → WAITING_FOR_PRODUCTION → IN_PRODUCTION
      // This ensures orders are in the correct status for batch completion detection
      const uniqueOrderIds = new Set(orders.map((o) => o.id));
      let transitionedCount = 0;
      for (const orderId of uniqueOrderIds) {
        const order = await this.orderRepository.findById(orderId);
        if (!order) {
          continue;
        }

        try {
          // Transition from PAID → WAITING_FOR_PRODUCTION → IN_PRODUCTION
          // Phase 8.18: Log status transitions to history
          if (order.status === OrderStatus.PAID) {
            const fromStatus = order.status;
            order.transitionTo(OrderStatus.WAITING_FOR_PRODUCTION);
            const savedOrder = await this.orderRepository.save(order);
            // Log status transition
            try {
              await this.statusHistoryRepository.append(
                savedOrder.id,
                fromStatus,
                OrderStatus.WAITING_FOR_PRODUCTION,
                'system',
                null,
                { batchId, triggeredBy: 'batch_creation' },
              );
            } catch (error) {
              // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
              this.logger.error(
                `[History] ERROR: Failed to log status transition for order ${orderId}:`,
                error,
              );
              // Re-throw to fail fast and prevent silent failures
              throw error;
            }
            this.logger.log(
              `Order ${orderId} transitioned from PAID to WAITING_FOR_PRODUCTION after batch ${batchId} creation`,
            );
          }

          if (order.status === OrderStatus.WAITING_FOR_PRODUCTION) {
            const fromStatus = order.status;
            order.transitionTo(OrderStatus.IN_PRODUCTION);
            const savedOrder = await this.orderRepository.save(order);
            transitionedCount++;
            // Log status transition
            try {
              await this.statusHistoryRepository.append(
                savedOrder.id,
                fromStatus,
                OrderStatus.IN_PRODUCTION,
                'system',
                null,
                { batchId, triggeredBy: 'batch_creation' },
              );
            } catch (error) {
              // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
              this.logger.error(
                `[History] ERROR: Failed to log status transition for order ${orderId}:`,
                error,
              );
              // Re-throw to fail fast and prevent silent failures
              throw error;
            }
            this.logger.log(
              `Order ${orderId} transitioned from WAITING_FOR_PRODUCTION to IN_PRODUCTION after batch ${batchId} creation`,
            );
          }
        } catch (error: any) {
          this.logger.warn(
            `Failed to transition order ${orderId} to IN_PRODUCTION: ${error}`,
          );
          // Continue with other orders
        }
      }

      if (transitionedCount > 0) {
        this.logger.log(
          `Batch ${batchId} creation: ${transitionedCount} orders transitioned to IN_PRODUCTION`,
        );
      }

      // Transition batch from PLANNED → IN_PRODUCTION when created
      // This indicates the batch is ready for production work
      if (savedBatch.status === ProductionBatchStatus.PLANNED) {
        savedBatch.transitionTo(ProductionBatchStatus.IN_PRODUCTION);
        const updatedBatch = await this.productionRepository.save(savedBatch);
        this.logger.log(
          `Batch ${batchId} transitioned from PLANNED to IN_PRODUCTION`,
        );
        return updatedBatch;
      }

      return savedBatch;
    } catch (error) {
      this.logger.error(`[ProductionService] Error saving batch ${batchId}:`, error);
      if (error instanceof Error) {
        this.logger.error(`[ProductionService] Error stack:`, error.stack);
      }
      throw error;
    }
  }

  /**
   * Get production batch by ID with full details
   */
  async getProductionBatchById(id: string): Promise<ProductionBatch | null> {
    return this.productionRepository.findById(id);
  }

  /**
   * Get all production batches
   */
  async getAllProductionBatches(): Promise<ProductionBatch[]> {
    return this.productionRepository.findAll();
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

    // Phase 8.14: Check completion using database query, not domain object hydration
    // This ensures we check the actual database state, not relying on whether
    // packagingUnits array was properly hydrated in the domain object
    const allUnitsCompleted = await this.productionRepository.areAllUnitsCompleted(batchId);
    if (!allUnitsCompleted) {
      this.logger.debug(
        `Batch ${batchId} not ready for completion: not all units are COMPLETED (checked via database)`,
      );
      return false;
    }

    // Transition batch to COMPLETED
    batch.transitionTo(ProductionBatchStatus.COMPLETED);
    await this.productionRepository.save(batch);

    // Phase 8.14: Reload batch to get all packaging units (for orderItemIds extraction)
    // This ensures we have the complete list even if the original batch object wasn't fully hydrated
    const reloadedBatch = await this.productionRepository.findById(batchId);
    if (!reloadedBatch) {
      this.logger.error(`Failed to reload batch ${batchId} after completion transition`);
      return false;
    }

    this.logger.log(
      `Batch ${batchId} auto-completed: all ${reloadedBatch.packagingUnits.length} packaging units are COMPLETED (verified via database)`,
    );

    // Find all orders with OrderItems in this batch
    const orderItemIds = reloadedBatch.packagingUnits.flatMap(
      (unit) => unit.sourceOrderItemIds || [],
    );

    if (orderItemIds.length === 0) {
      this.logger.warn(
        `Batch ${batchId} has no sourceOrderItemIds. Cannot find associated orders.`,
      );
      return true; // Batch is completed, but no orders to transition
    }

    this.logger.log(
      `Batch ${batchId} completion: searching for orders with item IDs: ${orderItemIds.join(', ')}`,
    );

    // Get unique order IDs from order items
    // Phase 8.14: Look for orders in IN_PRODUCTION, but also check PAID/WAITING_FOR_PRODUCTION
    // as defensive fallback in case transitions didn't happen during batch creation
    // Root cause fix: Match orders by item ID from sourceOrderItemIds (primary key).
    // productionBatchId check is secondary validation but not required if item ID matches.
    const orderIds = new Set<string>();
    const statusesToCheck = [
      OrderStatus.IN_PRODUCTION,
      OrderStatus.WAITING_FOR_PRODUCTION,
      OrderStatus.PAID,
    ];

    for (const status of statusesToCheck) {
      const orders = await this.orderRepository.findByStatus(status);
      this.logger.debug(
        `Found ${orders.length} orders with status ${status} to check for batch ${batchId}`,
      );
      
      for (const order of orders) {
        // Check if any of this order's items are in the batch
        // Primary match: item ID must be in sourceOrderItemIds
        // Secondary validation: productionBatchId should match (if set), but don't fail if null
        const matchingItems = order.items.filter((item) => {
          const itemIdMatches = orderItemIds.includes(item.id);
          if (!itemIdMatches) {
            return false;
          }
          // If productionBatchId is set, it must match batchId (safety check)
          // If productionBatchId is null, still match by item ID (allocation may not be persisted yet)
          return item.productionBatchId === null || item.productionBatchId === batchId;
        });
        
        if (matchingItems.length > 0) {
          orderIds.add(order.id);
          this.logger.log(
            `Found order ${order.id} (status: ${order.status}) linked to batch ${batchId} via ${matchingItems.length} item(s): ${matchingItems.map(i => i.id).join(', ')}`,
          );
        } else {
          // Debug: log why order was not matched
          const orderItemIdsInOrder = order.items.map(i => i.id);
          this.logger.debug(
            `Order ${order.id} not matched: order has items [${orderItemIdsInOrder.join(', ')}], batch expects [${orderItemIds.join(', ')}]`,
          );
        }
      }
    }

    if (orderIds.size === 0) {
      this.logger.error(
        `No orders found for batch ${batchId}. Searched for item IDs: ${orderItemIds.join(', ')}. This may indicate a data consistency issue.`,
      );
      // Still return true - batch is completed, but we couldn't find orders to transition
      return true;
    }

    this.logger.log(
      `Batch ${batchId} completion: found ${orderIds.size} order(s) to transition: ${Array.from(orderIds).join(', ')}`,
    );

    // Transition all related orders to READY_FOR_SHIPMENT
    // State machine: IN_PRODUCTION -> READY_FOR_PACKAGING -> READY_FOR_SHIPMENT
    let transitionedCount = 0;
    for (const orderId of orderIds) {
      let order = await this.orderRepository.findById(orderId);
      if (!order) {
        continue;
      }

      // If already in target state, skip
      if (order.status === OrderStatus.READY_FOR_SHIPMENT) {
        this.logger.debug(
          `Order ${orderId} is already READY_FOR_SHIPMENT, skipping transition`,
        );
        transitionedCount++;
        continue;
      }

      try {
        // Transition through the state machine step by step
        // Transition through the state machine step by step
        // Phase 8.18: Log status transitions to history
        // Step 1: PAID -> WAITING_FOR_PRODUCTION
        if (order.status === OrderStatus.PAID) {
          const fromStatus = order.status;
          order.transitionTo(OrderStatus.WAITING_FOR_PRODUCTION);
          const savedOrder = await this.orderRepository.save(order);
          // Log status transition
          try {
            await this.statusHistoryRepository.append(
              savedOrder.id,
              fromStatus,
              OrderStatus.WAITING_FOR_PRODUCTION,
              'system',
              null,
              { batchId, triggeredBy: 'batch_completion' },
            );
          } catch (error) {
            // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
            this.logger.error(
              `[History] ERROR: Failed to log status transition for order ${orderId}:`,
              error,
            );
            // Re-throw to fail fast and prevent silent failures
            throw error;
          }
          this.logger.log(
            `Order ${orderId} transitioned from PAID to WAITING_FOR_PRODUCTION during batch ${batchId} completion`,
          );
          // Reload order to get updated status
          const updatedOrder = await this.orderRepository.findById(orderId);
          if (updatedOrder) {
            order = updatedOrder;
          }
        }

        // Step 2: WAITING_FOR_PRODUCTION -> IN_PRODUCTION
        if (order.status === OrderStatus.WAITING_FOR_PRODUCTION) {
          const fromStatus = order.status;
          order.transitionTo(OrderStatus.IN_PRODUCTION);
          const savedOrder = await this.orderRepository.save(order);
          // Log status transition
          try {
            await this.statusHistoryRepository.append(
              savedOrder.id,
              fromStatus,
              OrderStatus.IN_PRODUCTION,
              'system',
              null,
              { batchId, triggeredBy: 'batch_completion' },
            );
          } catch (error) {
            // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
            this.logger.error(
              `[History] ERROR: Failed to log status transition for order ${orderId}:`,
              error,
            );
            // Re-throw to fail fast and prevent silent failures
            throw error;
          }
          this.logger.log(
            `Order ${orderId} transitioned from WAITING_FOR_PRODUCTION to IN_PRODUCTION during batch ${batchId} completion`,
          );
          // Reload order to get updated status
          const updatedOrder = await this.orderRepository.findById(orderId);
          if (updatedOrder) {
            order = updatedOrder;
          }
        }

        // Step 3: IN_PRODUCTION -> READY_FOR_PACKAGING
        if (order.status === OrderStatus.IN_PRODUCTION) {
          const fromStatus = order.status;
          order.transitionTo(OrderStatus.READY_FOR_PACKAGING);
          const savedOrder = await this.orderRepository.save(order);
          // Log status transition
          try {
            await this.statusHistoryRepository.append(
              savedOrder.id,
              fromStatus,
              OrderStatus.READY_FOR_PACKAGING,
              'system',
              null,
              { batchId, triggeredBy: 'batch_completion' },
            );
          } catch (error) {
            // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
            this.logger.error(
              `[History] ERROR: Failed to log status transition for order ${orderId}:`,
              error,
            );
            // Re-throw to fail fast and prevent silent failures
            throw error;
          }
          this.logger.log(
            `Order ${orderId} transitioned from IN_PRODUCTION to READY_FOR_PACKAGING during batch ${batchId} completion`,
          );
          // Reload order to get updated status
          const updatedOrder = await this.orderRepository.findById(orderId);
          if (updatedOrder) {
            order = updatedOrder;
          }
        }

        // Step 4: READY_FOR_PACKAGING -> READY_FOR_SHIPMENT
        if (order.status === OrderStatus.READY_FOR_PACKAGING) {
          const fromStatus = order.status;
          order.transitionTo(OrderStatus.READY_FOR_SHIPMENT);
          const savedOrder = await this.orderRepository.save(order);
          transitionedCount++;
          // Log status transition
          try {
            await this.statusHistoryRepository.append(
              savedOrder.id,
              fromStatus,
              OrderStatus.READY_FOR_SHIPMENT,
              'system',
              null,
              { batchId, triggeredBy: 'batch_completion' },
            );
          } catch (error) {
            // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
            this.logger.error(
              `[History] ERROR: Failed to log status transition for order ${orderId}:`,
              error,
            );
            // Re-throw to fail fast and prevent silent failures
            throw error;
          }
          this.logger.log(
            `Order ${orderId} auto-transitioned to READY_FOR_SHIPMENT after batch ${batchId} completion`,
          );
        } else if (order.status === OrderStatus.READY_FOR_SHIPMENT) {
          // Already in target state (idempotent)
          transitionedCount++;
          this.logger.debug(
            `Order ${orderId} is already READY_FOR_SHIPMENT, skipping transition`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to transition order ${orderId} to READY_FOR_SHIPMENT: ${error}`,
        );
      }
    }

    this.logger.log(
      `Batch ${batchId} completion: ${transitionedCount} orders transitioned to READY_FOR_SHIPMENT`,
    );

    return true;
  }
}

