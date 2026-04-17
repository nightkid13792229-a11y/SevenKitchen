/**
 * Production Application Service
 * Phase 8.10: Production & Packaging MVP
 */

import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import {
  ProductionBatchStatus,
  PackagingUnitStatus,
} from '../../domain/production/enums';
import { OrderStatus } from '../../domain';
import {
  ORDER_REPOSITORY,
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../order/order.service';
import { GlobalConfigService } from '../config/global-config.service';
import { DateUtil } from '../../utils/date.util';
import {
  PRODUCTION_COST_SETTLEMENT_SERVICE,
  type ProductionCostSettlementRunner,
} from './production-cost-settlement.tokens';

export const PRODUCTION_BATCH_REPOSITORY = Symbol('ProductionBatchRepository');

export interface CreateProductionBatchDto {
  productionDate: string; // YYYY-MM-DD format
  orderIds?: string[]; // Optional: specific orders to include; if not provided, includes all PURCHASING unassigned orders for the production date
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
    @Optional()
    @Inject(PRODUCTION_COST_SETTLEMENT_SERVICE)
    private readonly productionCostSettlementService?: ProductionCostSettlementRunner,
  ) {}

  /**
   * Create production batch from PURCHASING orders
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
      // Load orders for the specific production date with PURCHASING status
      // 使用午夜00:00:00创建查询范围（与订单存储格式保持一致）
      const queryStartDate = new Date(`${dto.productionDate}T00:00:00`);
      const queryEndDate = new Date(`${dto.productionDate}T23:59:59.999`);

      const { list: purchasingOrders } =
        await this.orderRepository.findByTargetProductionDateRange({
          status: OrderStatus.PURCHASING,
          startDate: queryStartDate,
          endDate: queryEndDate,
        });

      orders = purchasingOrders;
    }

    if (orders.length === 0) {
      throw new BadRequestException(
        `No PURCHASING orders found for production date ${dto.productionDate}`,
      );
    }

    // Validate all orders are PURCHASING
    const invalidOrders = orders.filter(
      (o) => o.status !== OrderStatus.PURCHASING,
    );
    if (invalidOrders.length > 0) {
      throw new BadRequestException(
        `Cannot include non-PURCHASING orders in production batch. Found: ${invalidOrders.map((o) => `${o.id}:${o.status}`).join(', ')}`,
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
            rawMaterialAllocations[nextItem.orderItemId] =
              nextItem.rawWeightNeededG;
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

    // ============================================================
    // Phase 2.5: 最小重量优化
    // ============================================================

    const minThresholdG = globalConfig.minPotWeightG || 2000;

    for (const [recipeSnapshotId, group] of productionGroups.entries()) {
      // 获取该食谱的所有锅次
      const recipeUnits = packagingUnits.filter(
        (unit) => (unit.recipeSnapshot as any).id === recipeSnapshotId,
      );

      if (recipeUnits.length > 1) {
        // 获取损耗率（与分锅时使用的损耗率保持一致）
        const lossRate = group.recipeSnapshot.production_loss_rate || 1.07;

        this.logger.log(
          `[createProductionBatch] 优化食谱 ${recipeSnapshotId} 的锅次重量，最小阈值=${minThresholdG}g`,
        );
        this.optimizePotWeights(recipeUnits, minThresholdG, lossRate);
      }
    }

    this.logger.log(
      `[createProductionBatch] Total packaging units created: ${packagingUnits.length}`,
    );

    // ============================================================
    // Phase 2.6: 数据完整性验证
    // ============================================================

    for (const unit of packagingUnits) {
      const allocations = (unit as any).rawMaterialAllocations as Record<string, number>;
      const totalRawWeight = Object.values(allocations).reduce(
        (sum: number, weight: number) => sum + weight,
        0,
      );
      // 获取损耗率进行验证
      const lossRate = unit.recipeSnapshot.production_loss_rate || 1.07;
      const expectedRawWeight = unit.totalProductionG * lossRate;

      if (Math.abs(totalRawWeight - expectedRawWeight) > 1) {
        this.logger.error(
          `[createProductionBatch] 数据完整性错误！锅 ${unit.id}: ` +
            `分配总和=${totalRawWeight.toFixed(2)}g, 预期=${expectedRawWeight.toFixed(2)}g`,
        );
        throw new Error(
          `Data integrity violation in packaging unit ${unit.id}: ` +
            `allocation sum mismatch`,
        );
      }
    }

    this.logger.log(
      `[createProductionBatch] 数据完整性验证通过，所有锅次分配正确`,
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
      this.logger.debug(
        `[ProductionService] Saving batch ${batchId} with ${batch.packagingUnits.length} packaging units`,
      );
      const savedBatch = await this.productionRepository.save(batch);
      this.logger.debug(
        `[ProductionService] Batch ${batchId} saved successfully`,
      );

      // Allocate OrderItems to this batch (atomic update)
      this.logger.debug(
        `[ProductionService] Allocating ${allOrderItemIds.length} order items to batch ${batchId}`,
      );
      const allocatedCount = await this.productionRepository.allocateOrderItems(
        allOrderItemIds,
        batchId,
      );
      this.logger.debug(
        `[ProductionService] Allocated ${allocatedCount} order items to batch ${batchId}`,
      );

      // Verify allocation succeeded (all items should be allocated)
      // Ensure allocatedCount is a number before comparison
      const allocatedCountNum =
        typeof allocatedCount === 'number' ? allocatedCount : 0;
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
          // Phase 9: Direct transition PURCHASING → IN_PRODUCTION
          // Phase 8.18: Log status transitions to history
          if (order.status === OrderStatus.PURCHASING) {
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
              `Order ${orderId} transitioned from ${fromStatus} to IN_PRODUCTION after batch ${batchId} creation`,
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
      this.logger.error(
        `[ProductionService] Error saving batch ${batchId}:`,
        error,
      );
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
        packagePlan: Array<{ packageSpecG: number; packageCount: number }> | null;
        ingredientSourcePlan: string | null;
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
        packagePlan: Array<{ packageSpecG: number; packageCount: number }> | null;
        ingredientSourcePlan: string | null;
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
        if (
          recipeVersion !== undefined &&
          unitRecipeVersion !== recipeVersion
        ) {
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
          const orderItem =
            await this.orderRepository.findOrderItemById(orderItemId);
          if (!orderItem) {
            this.logger.warn(`OrderItem ${orderItemId} not found`);
            continue;
          }

          // Get dog name
          let dogName = '未知';
          if (orderItem.dogId) {
            const order = await this.orderRepository.findById(
              orderItem.orderId,
            );
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
            packagePlan: orderItem.packagePlan ?? null,
            ingredientSourcePlan: orderItem.ingredientSourcePlan ?? null,
            recipeSnapshot: unit.recipeSnapshot,
            createdAt: orderItem.createdAt.toISOString(),
          });
        }
      }

      if (orderItems.length > 0) {
        matchingBatches.push({
          batchId: batch.id,
          batchCode: this.generateBatchCode(
            matchingUnits[0],
            matchingBatches.length,
          ),
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
    const batches =
      await this.productionRepository.findByProductionDate(productionDate);

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
          (u) => (u.recipeSnapshot as any).id === recipeId,
        );
        const potNumber =
          unitsForThisRecipe.findIndex((u) => u.id === unit.id) + 1;
        const totalPots = unitsForThisRecipe.length;

        // Collect order items
        const orderItems = [];
        const sourceOrderItemIds = unit.sourceOrderItemIds || [];
        for (const orderItemId of sourceOrderItemIds) {
          const orderItem =
            await this.orderRepository.findOrderItemById(orderItemId);
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
            packagePlan: orderItem.packagePlan ?? null,
            ingredientSourcePlan: orderItem.ingredientSourcePlan ?? null,
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
  async listProductionBatchesByDate(date: string): Promise<ProductionBatch[]> {
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
    const allUnitsCompleted =
      await this.productionRepository.areAllUnitsCompleted(batchId);
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
      this.logger.error(
        `Failed to reload batch ${batchId} after completion transition`,
      );
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
    // Phase 8.14: Look for orders in IN_PRODUCTION, but also check PAID/PURCHASING
    // as defensive fallback in case transitions didn't happen during batch creation
    // Root cause fix: Match orders by item ID from sourceOrderItemIds (primary key).
    // productionBatchId check is secondary validation but not required if item ID matches.
    const orderIds = new Set<string>();
    // Phase 9: Simplified status check - only check PAID and IN_PRODUCTION
    const statusesToCheck = [OrderStatus.IN_PRODUCTION, OrderStatus.PAID];

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
          return (
            item.productionBatchId === null ||
            item.productionBatchId === batchId
          );
        });

        if (matchingItems.length > 0) {
          orderIds.add(order.id);
          this.logger.log(
            `Found order ${order.id} (status: ${order.status}) linked to batch ${batchId} via ${matchingItems.length} item(s): ${matchingItems.map((i) => i.id).join(', ')}`,
          );
        } else {
          // Debug: log why order was not matched
          const orderItemIdsInOrder = order.items.map((i) => i.id);
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

    if (this.productionCostSettlementService) {
      await this.productionCostSettlementService.settleCompletedBatch(batchId);
    }

    return true;
  }

  /**
   * Delete production batch
   * Only allows deletion of IN_PRODUCTION status batches
   * Reverts order status to PURCHASING
   *
   * IMPORTANT: Cannot delete batch if any packaging unit is COMPLETED
   * to prevent accidental loss of production photos and data
   */
  async deleteProductionBatch(batchId: string): Promise<void> {
    // 1. Query batch
    const batch = await this.productionRepository.findById(batchId);
    if (!batch) {
      throw new BadRequestException('Production batch not found');
    }

    // 2. Validate batch status
    if (batch.status !== ProductionBatchStatus.IN_PRODUCTION) {
      throw new BadRequestException(
        `Cannot delete batch with status ${batch.status}. Only IN_PRODUCTION batches can be deleted.`,
      );
    }

    // 3. Check if any packaging unit is COMPLETED
    // This prevents accidental deletion of production photos
    const completedUnits = batch.packagingUnits.filter(
      (unit) => unit.status === PackagingUnitStatus.COMPLETED,
    );
    if (completedUnits.length > 0) {
      // Get the order IDs affected by completed units
      const completedOrderItemIds = completedUnits.flatMap(
        (unit) => unit.sourceOrderItemIds,
      );
      const affectedOrderIds = new Set<string>();
      for (const orderItemId of completedOrderItemIds) {
        const orderItem =
          await this.orderRepository.findOrderItemById(orderItemId);
        if (orderItem) {
          affectedOrderIds.add(orderItem.orderId);
        }
      }

      throw new BadRequestException(
        `Cannot delete batch: ${completedUnits.length} packaging unit(s) have been completed. ` +
        `Deleting would lose production photos and data. ` +
        `Affected order(s): ${Array.from(affectedOrderIds).join(', ')}. ` +
        `Please ship these orders first, or contact technical support.`,
      );
    }

    // 4. Get associated order item IDs from all packaging units
    const orderItemIds = batch.packagingUnits.flatMap(
      (unit) => unit.sourceOrderItemIds,
    );

    if (orderItemIds.length === 0) {
      this.logger.warn(`Batch ${batchId} has no associated order items`);
    }

    // 5. Query associated orders from order items
    const uniqueOrderIds = new Set<string>();
    for (const orderItemId of orderItemIds) {
      // Query order item to get orderId
      const orderItem =
        await this.orderRepository.findOrderItemById(orderItemId);
      if (orderItem) {
        uniqueOrderIds.add(orderItem.orderId);
      }
    }

    const orderIdsArray = Array.from(uniqueOrderIds);

    // 6. Check all orders can be safely reverted
    // Orders that are not IN_PRODUCTION cannot be reverted properly
    const nonRevertibleOrders: string[] = [];
    for (const orderId of orderIdsArray) {
      const order = await this.orderRepository.findById(orderId);
      if (order && order.status !== OrderStatus.IN_PRODUCTION) {
        nonRevertibleOrders.push(
          `${orderId.slice(-8)} (${order.status})`,
        );
      }
    }

    if (nonRevertibleOrders.length > 0) {
      throw new BadRequestException(
        `Cannot delete batch: Some orders are not in IN_PRODUCTION status. ` +
        `Orders: ${nonRevertibleOrders.join(', ')}. ` +
        `Only batches where all orders are IN_PRODUCTION can be deleted.`,
      );
    }

    // 7. Revert order status IN_PRODUCTION → PURCHASING
    let revertedCount = 0;
    for (const orderId of orderIdsArray) {
      const order = await this.orderRepository.findById(orderId);
      if (order && order.status === OrderStatus.IN_PRODUCTION) {
        const fromStatus = order.status;
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);
        revertedCount++;

        // Log status transition
        try {
          await this.statusHistoryRepository.append(
            order.id,
            fromStatus,
            OrderStatus.PURCHASING,
            'staff',
            null,
            { batchId, triggeredBy: 'batch_deletion' },
          );
        } catch (error) {
          this.logger.error(
            `[History] ERROR: Failed to log status transition for order ${orderId}:`,
            error,
          );
          throw error;
        }
      }
    }

    // 8. Deallocate order items
    if (orderItemIds.length > 0) {
      await this.productionRepository.deallocateOrderItems(orderItemIds);
    }

    // 9. Delete batch and packaging units
    await this.productionRepository.delete(batchId);

    this.logger.log(
      `Deleted production batch ${batchId}, reverted ${revertedCount} of ${orderIdsArray.length} orders to PURCHASING`,
    );
  }

  /**
   * 优化锅次重量，确保满足最小阈值
   * Phase 8.12.1: 最小锅重强制执行
   * @private
   */
  private optimizePotWeights(
    units: PackagingUnit[],
    minThresholdG: number,
    lossRate: number,
  ): void {
    // 1. 检查：是否需要优化？
    if (units.length < 2) {
      this.logger.warn(`[optimizePotWeights] 只有1锅，无法重新分配`);
      return;
    }

    const lastPot = units[units.length - 1];
    const currentWeight = lastPot.totalProductionG;

    if (currentWeight >= minThresholdG) {
      this.logger.debug(
        `[optimizePotWeights] 最后一锅已满足阈值 (${currentWeight}g >= ${minThresholdG}g)`,
      );
      return;
    }

    // 2. 计算：需要多少重量？
    const deficit = minThresholdG - currentWeight;

    this.logger.log(
      `[optimizePotWeights] 最后一锅缺口 ${deficit}g，开始从前序锅次匀出重量`,
    );

    // 3. 重新分配：从后向前遍历前序锅次
    let remainingDeficit = deficit;

    for (let i = units.length - 2; i >= 0; i--) {
      if (remainingDeficit <= 0) break;

      const sourcePot = units[i];
      const sourceWeight = sourcePot.totalProductionG;

      // 计算最大可转移量：不能让源锅低于最小阈值
      const maxTransferable = sourceWeight - minThresholdG;

      if (maxTransferable <= 0) {
        this.logger.debug(
          `[optimizePotWeights] 锅 ${i + 1} 已达到最小阈值，无法贡献重量`,
        );
        continue;
      }

      // 确定实际转移量
      const transferAmount = Math.min(maxTransferable, remainingDeficit);

      // 执行转移
      this.transferWeightBetweenPots(
        sourcePot,
        lastPot,
        transferAmount,
        lossRate,
      );

      remainingDeficit -= transferAmount;

      this.logger.debug(
        `[optimizePotWeights] 从锅 ${i + 1} 转移 ${transferAmount}g 到最后一锅，剩余缺口 ${remainingDeficit}g`,
      );
    }

    // 4. 验证：是否成功达到阈值？
    if (remainingDeficit > 0) {
      this.logger.warn(
        `[optimizePotWeights] 无法完全满足阈值。最后一锅仍缺 ${remainingDeficit}g。` +
          `建议增加批次大小或调整阈值。`,
      );
    } else {
      this.logger.log(
        `[optimizePotWeights] 优化完成。最后一锅重量: ${lastPot.totalProductionG}g (阈值: ${minThresholdG}g)`,
      );
    }
  }

  /**
   * 在两锅之间转移重量，保持 FIFO 分配完整性
   * @private
   */
  private transferWeightBetweenPots(
    sourcePot: PackagingUnit,
    targetPot: PackagingUnit,
    transferNetWeightG: number,
    lossRate: number,
  ): void {
    // 1. 更新净重
    const sourceOriginalWeight = sourcePot.totalProductionG;
    const targetOriginalWeight = targetPot.totalProductionG;

    // 注意：totalProductionG 在构造函数中是 readonly
    // 但 TypeScript 运行时允许修改对象属性
    (sourcePot as any).totalProductionG =
      sourceOriginalWeight - transferNetWeightG;
    (targetPot as any).totalProductionG =
      targetOriginalWeight + transferNetWeightG;

    // 2. 更新生肉重量分配
    const sourceAllocations = (sourcePot as any).rawMaterialAllocations;
    const targetAllocations = (targetPot as any).rawMaterialAllocations;

    // 计算需要转移的生肉重量（净重 × 损耗率）
    const transferRawWeightG = transferNetWeightG * lossRate;

    // 从源锅转移订单分配到目标锅
    // 策略：从源锅分配的末尾开始转移（保持 FIFO 顺序）
    let transferredRawWeight = 0;
    const orderItemsToTransfer: string[] = [];

    // 从后向前遍历源锅的订单项
    for (let i = sourcePot.sourceOrderItemIds.length - 1; i >= 0; i--) {
      if (transferredRawWeight >= transferRawWeightG) break;

      const orderItemId = sourcePot.sourceOrderItemIds[i];
      const rawWeight = sourceAllocations[orderItemId];

      if (rawWeight <= transferRawWeightG - transferredRawWeight) {
        // 完全转移：整个订单项
        orderItemsToTransfer.unshift(orderItemId);
        transferredRawWeight += rawWeight;

        // 更新分配
        targetAllocations[orderItemId] = rawWeight;
        delete sourceAllocations[orderItemId];
      } else {
        // 部分转移：拆分订单项
        const partialRawWeight = transferRawWeightG - transferredRawWeight;

        // 减少源锅分配
        sourceAllocations[orderItemId] = rawWeight - partialRawWeight;

        // 增加目标锅分配
        // 如果目标锅已有该订单的部分分配，则累加
        if (targetAllocations[orderItemId]) {
          targetAllocations[orderItemId] += partialRawWeight;
        } else {
          targetAllocations[orderItemId] = partialRawWeight;
        }

        // 确保订单项在目标锅的 sourceOrderItemIds 中
        if (!targetPot.sourceOrderItemIds.includes(orderItemId)) {
          targetPot.sourceOrderItemIds.push(orderItemId);
        }

        transferredRawWeight += partialRawWeight;
      }
    }

    // 3. 更新 sourceOrderItemIds 数组
    // 从源锅移除完全转移的订单项
    (sourcePot as any).sourceOrderItemIds = sourcePot.sourceOrderItemIds.filter(
      (id) => !orderItemsToTransfer.includes(id),
    );

    // 将完全转移的订单项添加到目标锅（保持顺序）
    (targetPot as any).sourceOrderItemIds = [
      ...targetPot.sourceOrderItemIds,
      ...orderItemsToTransfer,
    ];

    // 4. 日志记录
    this.logger.debug(
      `[transferWeightBetweenPots] ` +
        `转移 ${transferNetWeightG}g 净重 (${transferRawWeightG.toFixed(2)}g 生肉) ` +
        `从锅（原 ${sourceOriginalWeight}g）到锅（原 ${targetOriginalWeight}g）`,
    );
  }
}
