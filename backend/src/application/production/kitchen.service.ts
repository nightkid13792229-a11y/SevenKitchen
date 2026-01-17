/**
 * Staff Production Application Service
 * Service for WeChat mini-program staff production management operations
 * Different from admin KitchenService - focuses on simplified staff workflow
 */

import { Injectable, Inject, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ProductionService } from './production.service';
import { PurchasingService } from '../purchasing/purchasing.service';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { PackagingUnitStatus, ProductionBatchStatus } from '../../domain/production/enums';
import { OrderStatus } from '../../domain';
import { PRODUCTION_BATCH_REPOSITORY } from './production.service';
import { PURCHASE_LIST_REPOSITORY } from '../purchasing/purchasing.service.tokens';
import { ORDER_REPOSITORY } from '../order/order.service';
import {
  AutoScheduleDto,
  PackagingUnitDetailDto,
  OrderPackagingInfoDto,
  GetPackagingUnitsDto,
  TodayStatisticsDto,
} from '../../interfaces/dto/production/kitchen.dto';

@Injectable()
export class StaffProductionService {
  private readonly logger = new Logger(StaffProductionService.name);

  constructor(
    private readonly productionService: ProductionService,
    private readonly purchasingService: PurchasingService,
    @Inject(PRODUCTION_BATCH_REPOSITORY)
    private readonly productionRepository: ProductionBatchRepository,
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
  ) {}

  /**
   * Auto-schedule production for today
   * Follows the 07 document batch/pot algorithm (lines 823-926)
   */
  async autoScheduleToday(dto: AutoScheduleDto): Promise<ProductionBatch> {
    this.logger.log(`[AutoSchedule] Starting auto-schedule for ${dto.startDate}`);

    // Step 1: Check if today's purchase list is completed
    // 🔧 修复：使用 UTC 时间进行查询，避免时区转换问题
    // 将 "YYYY-MM-DD" 字符串转换为 UTC 时间的当天 00:00:00
    const today = new Date(`${dto.startDate}T00:00:00Z`);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    this.logger.log(`[AutoSchedule] Query range: ${today.toISOString()} to ${tomorrow.toISOString()}`);

    const { list: purchaseLists } = await this.purchaseListRepository.findMany({
      startDate: today,
      endDate: tomorrow,
    });

    const purchaseList = purchaseLists[0];

    if (!purchaseList) {
      throw new BadRequestException(
        `未找到 ${dto.startDate} 的采购清单，请先生成采购清单`,
      );
    }

    if (purchaseList.status !== 'COMPLETED') {
      throw new BadRequestException(
        `请先完成 ${dto.startDate} 的采购任务后再进行排单`,
      );
    }

    this.logger.log(`[AutoSchedule] Purchase list check passed for ${dto.startDate}`);

    // Step 2: Use ProductionService.createProductionBatch() which already implements the algorithm
    // The algorithm follows 07 document lines 823-926:
    // - Groups by (recipe_id, version)
    // - Calculates total raw weight with loss rate
    // - Splits by capacity (default_batch_capacity_g)
    // - FIFO allocates orders to pots

    // Note: We're passing undefined for orderIds to include all PAID orders for today
    const batch = await this.productionService.createProductionBatch({
      productionDate: dto.startDate,
      orderIds: undefined, // Include all eligible PAID orders
    });

    this.logger.log(`[AutoSchedule] Created batch ${batch.id} with ${batch.packagingUnits.length} packaging units`);

    return batch;
  }

  /**
   * Get packaging units with filtering and pagination
   */
  async getPackagingUnits(query: GetPackagingUnitsDto): Promise<{
    list: PackagingUnitDetailDto[];
    total: number;
  }> {
    const { page = 1, pageSize = 20, status, targetDate } = query;

    // Get all packaging units from all batches
    const batches = await this.productionRepository.findAll();
    let units: PackagingUnit[] = [];
    batches.forEach(batch => {
      units = units.concat(batch.packagingUnits || []);
    });

    // Filter by status
    if (status) {
      units = units.filter((u: PackagingUnit) => u.status === status);
    }

    // Filter by target date (via production batch)
    if (targetDate) {
      const targetDateTime = new Date(targetDate);
      targetDateTime.setHours(0, 0, 0, 0);

      // Get batches for target date
      const targetDateBatches = await this.productionRepository.findByProductionDate(targetDateTime);
      const targetDateBatchIds = new Set(targetDateBatches.map(b => b.id));

      units = units.filter((u: PackagingUnit) => u.productionBatchId && targetDateBatchIds.has(u.productionBatchId));
    }

    // Sort by creation time (newest first)
    units.sort((a: PackagingUnit, b: PackagingUnit) => b.createdAt.getTime() - a.createdAt.getTime());

    // Calculate pot numbers for each recipe group
    // Group by (productionBatchId, recipeSnapshot.id)
    const potNumberMap = new Map<string, number>();
    const totalPotsMap = new Map<string, number>();

    for (const unit of units) {
      const recipeId = (unit.recipeSnapshot as any).id;
      const key = `${unit.productionBatchId}-${recipeId}`;

      if (!totalPotsMap.has(key)) {
        const sameRecipeUnits = units.filter((u: PackagingUnit) =>
          u.productionBatchId === unit.productionBatchId &&
          (u.recipeSnapshot as any).id === recipeId
        );
        totalPotsMap.set(key, sameRecipeUnits.length);
        sameRecipeUnits
          .sort((a: PackagingUnit, b: PackagingUnit) => a.createdAt.getTime() - b.createdAt.getTime())
          .forEach((u: PackagingUnit, idx: number) => {
            potNumberMap.set(u.id, idx + 1);
          });
      }
    }

    // Calculate pagination
    const total = units.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedUnits = units.slice(startIndex, endIndex);

    // Convert to DTOs with order information
    const list = await Promise.all(
      paginatedUnits.map(async (unit: PackagingUnit) => {
        const recipeSnapshot = unit.recipeSnapshot as any;
        const recipeId = recipeSnapshot.id;
        const key = `${unit.productionBatchId}-${recipeId}`;

        // Get order items information
        const orderItems = await this.getOrderPackagingInfo(unit);

        // Convert times to local time
        const createdAt = this.toLocalTime(unit.createdAt);
        const completedAt = unit.updatedAt !== unit.createdAt ?
          this.toLocalTime(unit.updatedAt) : undefined;

        return {
          id: unit.id,
          recipeName: recipeSnapshot.name,
          recipeVersion: recipeSnapshot.version,
          totalProductionG: unit.totalProductionG,
          status: unit.status as PackagingUnitStatus,
          orderItems,
          currentPotNumber: potNumberMap.get(unit.id) || 1,
          totalPots: totalPotsMap.get(key) || 1,
          createdAt,
          completedAt,
          photosRaw: unit.photosRaw || [],
          ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot,
          recipeSnapshot: unit.recipeSnapshot, // 添加完整的食谱快照（包含原料列表）
        } as PackagingUnitDetailDto;
      })
    );

    return { list, total };
  }

  /**
   * Get order packaging information for a packaging unit
   */
  private async getOrderPackagingInfo(unit: PackagingUnit): Promise<OrderPackagingInfoDto[]> {
    const orderItemIds = unit.sourceOrderItemIds || [];

    if (orderItemIds.length === 0) {
      return [];
    }

    // Get all orders and find the order items (now includes dog and address)
    const orders = await this.orderRepository.findByStatus(OrderStatus.PAID);
    const inProductionOrders = await this.orderRepository.findByStatus(OrderStatus.IN_PRODUCTION);
    orders.push(...inProductionOrders);

    const orderPackagingInfo: OrderPackagingInfoDto[] = [];

    for (const order of orders) {
      for (const item of order.items) {
        if (orderItemIds.includes(item.id)) {
          // 🔧 修复：从order.dog和order.address获取真实数据
          orderPackagingInfo.push({
            orderId: order.id,
            orderItemId: item.id,
            dogName: order.dog?.name || '未知狗狗',  // ✅ 使用真实狗狗名称
            packageSpecG: item.packageSpecG,
            packageCount: item.packageCount,
            recipientName: order.address?.recipientName,  // ✅ 收货人姓名
            recipientCity: order.address?.region?.city,   // ✅ 收货城市
            completedAt: order.completedAt ? this.toLocalTime(order.completedAt) : undefined,
          });
        }
      }
    }

    return orderPackagingInfo;
  }

  /**
   * Start production task
   */
  async startProductionTask(unitId: string): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Production task not found: ${unitId}`);
    }

    if (unit.status !== PackagingUnitStatus.PENDING) {
      throw new BadRequestException(
        `Can only start PENDING tasks. Current status: ${unit.status}`,
      );
    }

    unit.transitionTo(PackagingUnitStatus.IN_PROGRESS);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    this.logger.log(`[KitchenService] Started production task ${unitId}`);
    return updated;
  }

  /**
   * Upload production photos (preparation photos only)
   */
  async uploadProductionPhotos(
    unitId: string,
    photoUrls: string[],
  ): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Production task not found: ${unitId}`);
    }

    if (unit.status !== PackagingUnitStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Can only upload photos to IN_PROGRESS tasks. Current status: ${unit.status}`,
      );
    }

    // Validate photo count (2-3 photos)
    if (photoUrls.length < 2 || photoUrls.length > 3) {
      throw new BadRequestException(
        `Must upload 2-3 preparation photos. Got ${photoUrls.length}`,
      );
    }

    // Update photosRaw field (preparation photos)
    unit.photosRaw = photoUrls;
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    this.logger.log(`[KitchenService] Uploaded ${photoUrls.length} photos for task ${unitId}`);
    return updated;
  }

  /**
   * Complete production task
   */
  async completeProductionTask(unitId: string): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Production task not found: ${unitId}`);
    }

    if (unit.status !== PackagingUnitStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Can only complete IN_PROGRESS tasks. Current status: ${unit.status}`,
      );
    }

    // Check if photos are uploaded (optional based on requirements)
    // For now, we'll allow completion without photos

    unit.transitionTo(PackagingUnitStatus.COMPLETED);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    this.logger.log(`[KitchenService] Completed production task ${unitId}`);

    // Check if all units in the batch are completed
    const batch = await this.productionRepository.findById(unit.productionBatchId);
    if (batch && batch.status === ProductionBatchStatus.IN_PRODUCTION) {
      await this.productionService.checkAndCompleteBatch(unit.productionBatchId);
    }

    return updated;
  }

  /**
   * Get today's statistics
   */
  async getTodayStatistics(): Promise<TodayStatisticsDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's production batches
    const batches = await this.productionRepository.findByProductionDate(today);

    // Count all packaging units
    const allUnits = batches.flatMap(b => b.packagingUnits);

    const todayTasks = allUnits.length; // 统计制作单数量（每一锅为一个制作单）

    const inProgress = allUnits.filter(
      u => u.status === PackagingUnitStatus.IN_PROGRESS
    ).length;

    const completed = allUnits.filter(
      u => u.status === PackagingUnitStatus.COMPLETED
    ).length;

    return {
      todayOrders: todayTasks, // 保持字段名不变，只修改值
      inProgress,
      completed,
    };
  }

  /**
   * Convert UTC DateTime to local time string
   */
  private toLocalTime(date: Date): string {
    // Simple format: YYYY-MM-DD HH:mm
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }
}
