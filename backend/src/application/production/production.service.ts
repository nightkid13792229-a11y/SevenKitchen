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
import { GlobalConfigService } from '../config/global-config.service';
import { DateUtil } from '../../utils/date.util';

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
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * Create production batch from PAID orders
   * Groups OrderItems by recipeSnapshotId and aggregates dailyIntakeG
   */
  async createProductionBatch(
    dto: CreateProductionBatchDto,
  ): Promise<ProductionBatch> {
    // 使用统一的日期工具解析生产日期（中午12点避免时区问题）
    const productionDate = DateUtil.getStartOfDay(dto.productionDate);
    if (isNaN(productionDate.getTime())) {
      throw new BadRequestException(
        `Invalid production date format: ${dto.productionDate}. Expected YYYY-MM-DD`,
      );
    }

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
      quantityG: number; // OrderItem total net weight (已考虑订购周期)
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
          quantityG: item.quantityG,
        });
      }
    }

    if (orderItemsWithDailyIntake.length === 0) {
      throw new BadRequestException(
        'No eligible OrderItems found. All items may already be allocated to other batches.',
      );
    }

    // Get global config for batch capacity
    const globalConfig = await this.globalConfigService.getGlobalConfig();
    const maxCapacityG = globalConfig.defaultBatchCapacityG; // 单锅最大容量（净重）

    this.logger.log(
      `[createProductionBatch] Batch capacity: ${maxCapacityG}g, Processing ${orderItemsWithDailyIntake.length} order items`,
    );

    // ============================================================
    // Phase 1: 聚合阶段 (Aggregation Phase)
    // 按 (recipe_id, version) 聚合订单 -> 计算生肉总重
    // ============================================================

    type OrderItemWithRawWeight = {
      orderItemId: string;
      dailyIntakeG: number;
      quantityG: number; // OrderItem total net weight (已考虑订购周期)
      rawWeightNeededG: number; // 生肉重量 = 净重 × (1 + 损耗率)
    };

    type ProductionGroup = {
      recipeSnapshot: any;
      totalRawWeightG: number; // 生肉总重（用于分锅）
      itemQueue: OrderItemWithRawWeight[]; // 待分配的订单队列（FIFO）
    };

    const productionGroups = new Map<string, ProductionGroup>();

    for (const item of orderItemsWithDailyIntake) {
      const recipeSnapshotId = item.recipeSnapshotId;
      const recipeSnapshot = item.recipeSnapshot;

      // 从recipe snapshot中读取损耗率
      // 注意：数据库中存储的是乘数（如 1.07），不是百分比（如 0.07）
      const lossRate = recipeSnapshot.production_loss_rate || 1.07; // 默认7%损耗

      // 计算生肉重量 = 净重 × 损耗率乘数
      const rawWeightNeededG = item.quantityG * lossRate;

      this.logger.debug(
        `Item ${item.orderItemId}: dailyIntake=${item.dailyIntakeG}g, lossRate=${lossRate}, rawWeight=${rawWeightNeededG}g`,
      );

      // 按recipe分组
      if (!productionGroups.has(recipeSnapshotId)) {
        productionGroups.set(recipeSnapshotId, {
          recipeSnapshot,
          totalRawWeightG: 0,
          itemQueue: [],
        });
      }

      const group = productionGroups.get(recipeSnapshotId)!;
      group.totalRawWeightG += rawWeightNeededG;
      group.itemQueue.push({
        orderItemId: item.orderItemId,
        dailyIntakeG: item.dailyIntakeG,
        quantityG: item.quantityG,
        rawWeightNeededG,
      });
    }

    this.logger.log(
      `[createProductionBatch] Grouped into ${productionGroups.size} recipe group(s)`,
    );

    // ============================================================
    // Phase 2: 分锅阶段 (Pot Splitting Phase)
    // 对每个recipe组按单锅容量分锅，FIFO分配订单
    // ============================================================

    const batchId = randomUUID();
    const packagingUnits: PackagingUnit[] = [];
    const allOrderItemIds: string[] = [];

    for (const [recipeSnapshotId, group] of productionGroups.entries()) {
      this.logger.log(
        `[createProductionBatch] Processing recipe ${recipeSnapshotId}: totalRawWeight=${group.totalRawWeightG}g, capacity=${maxCapacityG}g`,
      );

      // 获取损耗率（所有订单的损耗率应该相同，因为都是同一个recipe）
      const lossRate = group.recipeSnapshot.production_loss_rate || 1.07;

      let remainingRawWeight = group.totalRawWeightG;
      let potNumber = 1; // 锅序号

      // 分锅循环：只要还有剩余生肉重量，就继续创建锅
      while (remainingRawWeight > 0) {
        // 计算本锅的净重：固定 maxCapacityG（5000g），最多允许 5% 溢出
        const overflowTolerance = 0.05; // 5% 溢出容差
        const maxNetWeightForThisPot = Math.min(
          maxCapacityG * (1 + overflowTolerance),
          remainingRawWeight / lossRate,
        );

        // 计算本锅的生肉重量 = 净重 × 损耗率
        const currentPotRawWeight = maxNetWeightForThisPot * lossRate;

        this.logger.debug(
          `[createProductionBatch] Creating pot #${potNumber}: net=${maxNetWeightForThisPot.toFixed(2)}g, raw=${currentPotRawWeight.toFixed(2)}g, remaining raw=${remainingRawWeight.toFixed(2)}g`,
        );

        // 追踪本锅的生肉重量分配：{ orderItemId: allocatedRawWeightG }
        const rawMaterialAllocations: { [orderItemId: string]: number } = {};
        let allocatedRawWeight = 0;

        // FIFO分配订单到本锅（允许订单拆分）
        while (
          group.itemQueue.length > 0 &&
          allocatedRawWeight < currentPotRawWeight
        ) {
          const nextItem = group.itemQueue[0]; // 预读队列头部
          const remainingCapacity = currentPotRawWeight - allocatedRawWeight;

          if (nextItem.rawWeightNeededG <= remainingCapacity) {
            // 订单可以完全放入本锅
            group.itemQueue.shift();

            // 记录完整分配
            rawMaterialAllocations[nextItem.orderItemId] = nextItem.rawWeightNeededG;
            allocatedRawWeight += nextItem.rawWeightNeededG;

            this.logger.debug(
              `[createProductionBatch] Fully assigned item ${nextItem.orderItemId} to pot #${potNumber}: raw=${nextItem.rawWeightNeededG.toFixed(2)}g`,
            );
          } else {
            // 订单需要拆分：部分分配到本锅
            const partialRawWeight = remainingCapacity;

            // 记录部分分配
            rawMaterialAllocations[nextItem.orderItemId] = partialRawWeight;
            allocatedRawWeight += partialRawWeight;

            // 更新队列中该订单的剩余生肉重量
            nextItem.rawWeightNeededG -= partialRawWeight;
            nextItem.quantityG -= partialRawWeight / lossRate; // 同步更新净重

            this.logger.debug(
              `[createProductionBatch] Partially assigned item ${nextItem.orderItemId} to pot #${potNumber}: allocated=${partialRawWeight.toFixed(2)}g, remaining=${nextItem.rawWeightNeededG.toFixed(2)}g`,
            );

            // 停止分配（本锅已满）
            break;
          }
        }

        // 创建PackagingUnit
        const unitId = randomUUID();
        const sourceOrderItemIds = Object.keys(rawMaterialAllocations);

        const unit = new PackagingUnit(
          unitId,
          batchId,
          group.recipeSnapshot,
          maxNetWeightForThisPot, // 净重（用于显示）
          sourceOrderItemIds,
          new Date(),
        );

        // 将生肉重量分配信息附加到 unit 对象上（用于后续分装）
        (unit as any).rawMaterialAllocations = rawMaterialAllocations;

        packagingUnits.push(unit);
        allOrderItemIds.push(...sourceOrderItemIds);

        this.logger.log(
          `[createProductionBatch] Created pot #${potNumber}: ${maxNetWeightForThisPot.toFixed(2)}g net (${currentPotRawWeight.toFixed(2)}g raw), ${sourceOrderItemIds.length} order(s)`,
        );

        // 更新剩余生肉重量：扣减本锅的理论生肉重量（而不是实际填充量）
        remainingRawWeight -= currentPotRawWeight;
        potNumber++;
      }

      this.logger.log(
        `[createProductionBatch] Recipe ${recipeSnapshotId} split into ${potNumber - 1} pot(s)`,
      );
    }

    this.logger.log(
      `[createProductionBatch] Total packaging units created: ${packagingUnits.length}`,
    );

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

      // Phase 9: Transition orders from PAID → IN_PRODUCTION
      // Simplified flow aligned with e-commerce standards
      const uniqueOrderIds = new Set(orders.map((o) => o.id));
      let transitionedCount = 0;
      for (const orderId of uniqueOrderIds) {
        const order = await this.orderRepository.findById(orderId);
        if (!order) {
          continue;
        }

        try {
          // Phase 9: Direct transition PAID → IN_PRODUCTION (removed WAITING_FOR_PRODUCTION)
          // Phase 8.18: Log status transitions to history
          if (order.status === OrderStatus.PAID) {
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
              `Order ${orderId} transitioned from PAID to IN_PRODUCTION after batch ${batchId} creation`,
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
   * Get all batches for a specific recipe with their order items
   * Used for batch label printing: print all orders of a recipe across all batches
   */
  async getRecipeBatchesWithOrders(params: {
    recipeId: string;
    recipeVersion?: number;
    targetDate?: string; // YYYY-MM-DD format
  }): Promise<{
    batches: Array<{
      batchId: string;
      batchCode?: string;
      productionDate: string;
      isCurrentBatch: boolean;
      orderItems: Array<{
        orderItemId: string;
        orderId: string;
        dogName: string;
        recipeName: string;
        packageSpecG: number;
        packageCount: number;
        recipeSnapshot: any;
        createdAt: string;
      }>;
    }>;
  }> {
    const { recipeId, recipeVersion, targetDate } = params;

    // Parse target date if provided
    let productionDateFilter: Date | undefined;
    if (targetDate) {
      productionDateFilter = DateUtil.getStartOfDay(targetDate);
      if (isNaN(productionDateFilter.getTime())) {
        throw new BadRequestException(
          `Invalid target date format: ${targetDate}. Expected YYYY-MM-DD`,
        );
      }
    }

    // Get all production batches that contain this recipe
    const allBatches = await this.productionRepository.findAll();

    // Filter batches that contain the recipe and match the date filter
    const matchingBatches: Array<{
      batchId: string;
      batchCode?: string;
      productionDate: string;
      isCurrentBatch: boolean;
      orderItems: Array<{
        orderItemId: string;
        orderId: string;
        dogName: string;
        recipeName: string;
        packageSpecG: number;
        packageCount: number;
        recipeSnapshot: any;
        createdAt: string;
      }>;
    }> = [];

    for (const batch of allBatches) {
      // Filter by date if specified
      if (productionDateFilter) {
        const batchDate = DateUtil.getStartOfDay(
          batch.productionDate.toISOString().split('T')[0],
        );
        if (batchDate.getTime() !== productionDateFilter.getTime()) {
          continue;
        }
      }

      // Check if this batch contains the recipe
      const matchingUnits = batch.packagingUnits.filter((unit) => {
        const unitRecipeId = (unit.recipeSnapshot as any).id;
        const unitRecipeVersion = (unit.recipeSnapshot as any).version;

        // Match by recipeId
        if (unitRecipeId !== recipeId) {
          return false;
        }

        // Match by version if specified
        if (recipeVersion !== undefined && unitRecipeVersion !== recipeVersion) {
          return false;
        }

        return true;
      });

      if (matchingUnits.length === 0) {
        continue;
      }

      // Collect order items from all matching units
      const orderItems = [];
      for (const unit of matchingUnits) {
        const sourceOrderItemIds = unit.sourceOrderItemIds || [];
        for (const orderItemId of sourceOrderItemIds) {
          // Find the order item details
          const orderItem = await this.orderRepository.findOrderItemById(orderItemId);
          if (!orderItem) {
            this.logger.warn(`OrderItem ${orderItemId} not found`);
            continue;
          }

          // Get dog name
          let dogName = '未知';
          if (orderItem.dogId) {
            const order = await this.orderRepository.findById(orderItem.orderId);
            if (order?.dogId) {
              const dog = await this.orderRepository.findDogById(order.dogId);
              if (dog) {
                dogName = dog.name;
              }
            }
          }

          orderItems.push({
            orderItemId: orderItem.id,
            orderId: orderItem.orderId,
            dogName,
            recipeName: (unit.recipeSnapshot as any).name || '未知食谱',
            packageSpecG: orderItem.packageSpecG,
            packageCount: orderItem.packageCount,
            recipeSnapshot: unit.recipeSnapshot,
            createdAt: orderItem.createdAt.toISOString(),
          });
        }
      }

      if (orderItems.length > 0) {
        matchingBatches.push({
          batchId: batch.id,
          batchCode: this.generateBatchCode(matchingUnits[0], matchingBatches.length),
          productionDate: batch.productionDate.toISOString().split('T')[0],
          isCurrentBatch: false, // Will be determined by caller
          orderItems,
        });
      }
    }

    return {
      batches: matchingBatches,
    };
  }

  /**
   * Helper method to generate batch code
   */
  private generateBatchCode(unit: any, sequenceNumber: number): string {
    const recipeSnapshot = unit.recipeSnapshot;
    const recipeId = recipeSnapshot.id || recipeSnapshot.recipeId;
    const version = recipeSnapshot.version;
    const recipeShort = recipeId.substring(0, 4).toUpperCase();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${date}-${recipeShort}-V${version}-${String(sequenceNumber + 1).padStart(2, '0')}`;
  }

  /**
   * Get all packaging units for a specific date, grouped by recipe
   * Used for batch production guide printing
   */
  async getBatchProductionGuide(params: {
    targetDate: string; // YYYY-MM-DD format
  }): Promise<{
    productionDate: string;
    totalBatches: number;
    recipes: Array<{
      recipeId: string;
      recipeName: string;
      recipeVersion: number;
      totalProductionG: number;
      totalPots: number;
      packagingUnits: Array<{
        unitId: string;
        potNumber: number;
        totalPots: number;
        totalProductionG: number;
        orderItems: Array<{
          orderItemId: string;
          orderId: string;
          dogName: string;
          packageSpecG: number;
          packageCount: number;
        }>;
        ingredientsUsage: any;
      }>;
    }>;
  }> {
    const { targetDate } = params;

    // Parse target date
    const productionDate = DateUtil.getStartOfDay(targetDate);
    if (isNaN(productionDate.getTime())) {
      throw new BadRequestException(
        `Invalid target date format: ${targetDate}. Expected YYYY-MM-DD`,
      );
    }

    // Get all production batches for this date
    const batches = await this.productionRepository.findByProductionDate(productionDate);

    if (batches.length === 0) {
      return {
        productionDate: targetDate,
        totalBatches: 0,
        recipes: [],
      };
    }

    // Group by recipe
    const recipeGroups = new Map<string, any>();

    for (const batch of batches) {
      for (const unit of batch.packagingUnits) {
        const recipeSnapshot = unit.recipeSnapshot as any;
        const recipeId = recipeSnapshot.id;
        const recipeName = recipeSnapshot.name;
        const recipeVersion = recipeSnapshot.version;

        // Create recipe group if not exists
        if (!recipeGroups.has(recipeId)) {
          recipeGroups.set(recipeId, {
            recipeId,
            recipeName,
            recipeVersion,
            totalProductionG: 0,
            totalPots: 0,
            packagingUnits: [],
          });
        }

        const group = recipeGroups.get(recipeId);

        // Calculate pot numbers
        const unitsForThisRecipe = batch.packagingUnits.filter(
          (u) => (u.recipeSnapshot as any).id === recipeId
        );
        const potNumber = unitsForThisRecipe.findIndex((u) => u.id === unit.id) + 1;
        const totalPots = unitsForThisRecipe.length;

        // Collect order items
        const orderItems = [];
        const sourceOrderItemIds = unit.sourceOrderItemIds || [];
        for (const orderItemId of sourceOrderItemIds) {
          const orderItem = await this.orderRepository.findOrderItemById(orderItemId);
          if (!orderItem) {
            continue;
          }

          // Get dog name
          let dogName = '未知';
          if (orderItem.dogId) {
            const dog = await this.orderRepository.findDogById(orderItem.dogId);
            if (dog) {
              dogName = dog.name;
            }
          }

          orderItems.push({
            orderItemId: orderItem.id,
            orderId: orderItem.orderId,
            dogName,
            packageSpecG: orderItem.packageSpecG,
            packageCount: orderItem.packageCount,
          });
        }

        // Add to group
        group.totalProductionG += unit.totalProductionG;
        group.totalPots += 1;
        group.packagingUnits.push({
          unitId: unit.id,
          potNumber,
          totalPots,
          totalProductionG: unit.totalProductionG,
          orderItems,
          ingredientsUsage: unit.ingredientsUsageSnapshot,
        });
      }
    }

    // Convert map to array
    const recipes = Array.from(recipeGroups.values());

    return {
      productionDate: targetDate,
      totalBatches: batches.length,
      recipes,
    };
  }

  /**
   * List production batches by production date
   */
  async listProductionBatchesByDate(
    date: string,
  ): Promise<ProductionBatch[]> {
    // 使用中午12点避免时区转换导致日期变化
    const productionDate = new Date(`${date}T12:00:00`);
    if (isNaN(productionDate.getTime())) {
      throw new BadRequestException(
        `Invalid date format: ${date}. Expected YYYY-MM-DD`,
      );
    }
    // 设置为中午12点，避免时区问题
    productionDate.setHours(12, 0, 0, 0);
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
    // Phase 9: Simplified status check - only check PAID and IN_PRODUCTION
    const statusesToCheck = [
      OrderStatus.IN_PRODUCTION,
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
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        continue;
      }

      try {
        // Phase 9: Simplified flow - only PAID → IN_PRODUCTION
        // Orders stay in IN_PRODUCTION after batch completion (manual shipping required)
        if (order.status === OrderStatus.PAID) {
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
            `Order ${orderId} transitioned from PAID to IN_PRODUCTION after batch ${batchId} completion`,
          );
        } else if (order.status === OrderStatus.IN_PRODUCTION) {
          // Already in IN_PRODUCTION (idempotent)
          transitionedCount++;
          this.logger.debug(
            `Order ${orderId} is already IN_PRODUCTION, staying in this state after batch ${batchId} completion`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to transition order ${orderId} to IN_PRODUCTION: ${error}`,
        );
      }
    }

    this.logger.log(
      `Batch ${batchId} completion: ${transitionedCount} orders in IN_PRODUCTION status`,
    );

    return true;
  }
}


