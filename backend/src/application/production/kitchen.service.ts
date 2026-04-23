/**
 * Staff Production Application Service
 * Service for WeChat mini-program staff production management operations
 * Different from admin KitchenService - focuses on simplified staff workflow
 */

import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { PurchasingService } from '../purchasing/purchasing.service';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import {
  PackagingUnitStatus,
  ProductionBatchStatus,
} from '../../domain/production/enums';
import { PurchaseListKind, PurchaseListStatus } from '../../domain/purchasing';
import { Order, OrderStatus } from '../../domain';
import { PRODUCTION_BATCH_REPOSITORY } from './production.service';
import { PURCHASE_LIST_REPOSITORY } from '../purchasing/purchasing.service.tokens';
import { ORDER_REPOSITORY } from '../order/order.service';
import {
  AutoScheduleDto,
  CompleteProductionDto,
  PackagingUnitDetailDto,
  OrderPackagingInfoDto,
  GetPackagingUnitsDto,
  TodayStatisticsDto,
} from '../../interfaces/dto/production/kitchen.dto';
import type { PrintTaskDto } from '../../interfaces/dto/production/print-task.dto';
import { DateUtil } from '../../utils/date.util';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { PdfGeneratorService } from '../../infrastructure/services/pdf-generator.service';

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
    private readonly cosService: TencentCosService,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  /**
   * Auto-schedule production for today
   * Follows the 07 document batch/pot algorithm (lines 823-926)
   */
  async autoScheduleToday(dto: AutoScheduleDto): Promise<ProductionBatch> {
    this.logger.log(
      `[AutoSchedule] Starting auto-schedule for ${dto.startDate}`,
    );

    // Step 1: Check if today's purchase list is completed
    // 使用统一的日期工具创建查询范围（中午12点避免时区问题）
    const { start: today, end: tomorrow } = DateUtil.createDateRange(
      dto.startDate,
    );

    this.logger.log(
      `[AutoSchedule] Query range: ${today.toISOString()} to ${tomorrow.toISOString()}`,
    );

    const { list: purchaseLists } = await this.purchaseListRepository.findMany({
      kind: PurchaseListKind.ORDER_DEMAND,
      startDate: today,
      endDate: tomorrow,
    });

    if (purchaseLists.length === 0) {
      throw new BadRequestException(
        `未找到 ${dto.startDate} 的采购清单，请先生成采购清单`,
      );
    }

    const pendingPurchaseLists = purchaseLists.filter(
      (list) => list.status !== PurchaseListStatus.COMPLETED,
    );
    if (pendingPurchaseLists.length > 0) {
      throw new BadRequestException(
        `请先完成 ${dto.startDate} 的所有采购任务后再进行排单`,
      );
    }

    this.logger.log(
      `[AutoSchedule] Purchase list check passed for ${dto.startDate}`,
    );

    // Step 2: Use ProductionService.createProductionBatch() which already implements the algorithm
    // The algorithm follows 07 document lines 823-926:
    // - Groups by (recipe_id, version)
    // - Calculates total raw weight with loss rate
    // - Splits by capacity (default_batch_capacity_g)
    // - FIFO allocates orders to pots

    // Passing undefined includes all eligible PURCHASING orders for the date.
    const batch = await this.productionService.createProductionBatch({
      productionDate: dto.startDate,
      orderIds: undefined, // Include all eligible PAID orders
    });

    this.logger.log(
      `[AutoSchedule] Created batch ${batch.id} with ${batch.packagingUnits.length} packaging units`,
    );

    return batch;
  }

  /**
   * Get packaging units with filtering and pagination
   */
  async getPackagingUnits(query: GetPackagingUnitsDto): Promise<{
    list: PackagingUnitDetailDto[];
    total: number;
  }> {
    const {
      page = 1,
      pageSize = 20,
      status,
      targetDate,
      includeUnfinishedCarryover = false,
    } = query;
    const shouldIncludeUnfinishedCarryover =
      includeUnfinishedCarryover === true ||
      String(includeUnfinishedCarryover) === 'true';

    // Get all packaging units from all batches
    const batches = await this.productionRepository.findAll();
    const productionDateByBatchId = new Map<string, Date>();
    let units: PackagingUnit[] = [];
    batches.forEach((batch) => {
      productionDateByBatchId.set(batch.id, batch.productionDate);
      units = units.concat(batch.packagingUnits || []);
    });

    // Filter by target date (via production batch)
    if (targetDate) {
      units = units.filter((unit: PackagingUnit) => {
        const productionDate = productionDateByBatchId.get(unit.productionBatchId);
        const isSelectedDate =
          productionDate && DateUtil.formatDate(productionDate) === targetDate;
        const isUnfinishedCarryover =
          shouldIncludeUnfinishedCarryover &&
          unit.status !== PackagingUnitStatus.COMPLETED;

        return Boolean(isSelectedDate || isUnfinishedCarryover);
      });
    }

    // Filter by status after date/carryover selection.
    if (status) {
      units = units.filter((u: PackagingUnit) => u.status === status);
    }

    // Sort by creation time (newest first)
    units.sort(
      (a: PackagingUnit, b: PackagingUnit) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const orderInfoMap = await this.getOrderPackagingInfoMap(units);

    // Calculate pot numbers for each display group.
    // Group by batch, recipe and ingredient source plan so same-recipe orders
    // with different procurement strategies are not presented as one pot series.
    const potNumberMap = new Map<string, number>();
    const totalPotsMap = new Map<string, number>();

    for (const unit of units) {
      const key = this.buildPackagingUnitDisplayGroupKey(
        unit,
        orderInfoMap.get(unit.id) || [],
      );

      if (!totalPotsMap.has(key)) {
        const sameRecipeUnits = units.filter(
          (u: PackagingUnit) =>
            this.buildPackagingUnitDisplayGroupKey(
              u,
              orderInfoMap.get(u.id) || [],
            ) === key,
        );
        totalPotsMap.set(key, sameRecipeUnits.length);
        sameRecipeUnits
          .sort(
            (a: PackagingUnit, b: PackagingUnit) =>
              a.createdAt.getTime() - b.createdAt.getTime(),
          )
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
    const purchaseListsByDate =
      await this.getOrderDemandPurchaseListsByProductionDate(
        paginatedUnits,
        productionDateByBatchId,
      );

    // Convert to DTOs with order information
    const list = await Promise.all(
      paginatedUnits.map(async (unit: PackagingUnit) => {
        const recipeSnapshot = unit.recipeSnapshot as any;

        // Get order items information
        const orderItems = orderInfoMap.get(unit.id) || [];
        const ingredientSourcePlan =
          this.resolvePackagingUnitIngredientSourcePlan(orderItems);
        const key = this.buildPackagingUnitDisplayGroupKey(unit, orderItems);

        // Convert times to local time
        const createdAt = this.toLocalTime(unit.createdAt);
        const completedAt = unit.completedAt
          ? this.toLocalTime(unit.completedAt)
          : undefined;
        const productionDate = DateUtil.formatDate(
          productionDateByBatchId.get(unit.productionBatchId) ||
            unit.createdAt,
        );
        const productionRecipeSnapshot =
          this.enrichRecipeSnapshotWithProcurementSku({
            recipeSnapshot,
            ingredientSourcePlan,
            orderItems,
            purchaseLists: purchaseListsByDate.get(productionDate) || [],
          });

        return {
          id: unit.id,
          productionBatchId: unit.productionBatchId, // 添加批次ID用于删除操作
          recipeName: recipeSnapshot.name,
          recipeVersion: recipeSnapshot.version,
          totalProductionG: unit.totalProductionG,
          status: unit.status,
          orderItems,
          ingredientSourcePlan,
          ingredientSourcePlanLabel:
            this.getIngredientSourcePlanLabel(ingredientSourcePlan),
          currentPotNumber: potNumberMap.get(unit.id) || 1,
          totalPots: totalPotsMap.get(key) || 1,
          productionDate,
          createdAt,
          completedAt,
          resultStatus: unit.resultStatus || undefined,
          actualOutputG: unit.actualOutputG ?? undefined,
          surplusG: unit.surplusG,
          shortageG: unit.shortageG,
          resultPhotoUrls: unit.resultPhotoUrls || [],
          photosRaw: unit.photosRaw || [],
          ingredientsUsageSnapshot: unit.ingredientsUsageSnapshot,
          recipeSnapshot: productionRecipeSnapshot, // 添加完整的食谱快照（包含原料列表和生产采购SKU）
        } as PackagingUnitDetailDto;
      }),
    );

    return { list, total };
  }

  /**
   * Get order packaging information for a packaging unit
   */
  private async getOrderPackagingInfo(
    unit: PackagingUnit,
  ): Promise<OrderPackagingInfoDto[]> {
    const infoMap = await this.getOrderPackagingInfoMap([unit]);
    return infoMap.get(unit.id) || [];
  }

  private async getOrderPackagingInfoMap(
    units: PackagingUnit[],
  ): Promise<Map<string, OrderPackagingInfoDto[]>> {
    const result = new Map<string, OrderPackagingInfoDto[]>();
    const requestedOrderItemIds = new Set<string>();

    for (const unit of units) {
      result.set(unit.id, []);
      for (const orderItemId of unit.sourceOrderItemIds || []) {
        requestedOrderItemIds.add(orderItemId);
      }
    }

    if (requestedOrderItemIds.size === 0) {
      return result;
    }

    // Get all orders that could be associated with production tasks (all except CANCELLED and INIT)
    // Orders can transition through: PAID -> PURCHASING -> IN_PRODUCTION -> FREEZING -> SHIPPED -> COMPLETED/AFTERSALE
    const orderStatuses = [
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      OrderStatus.IN_PRODUCTION,
      OrderStatus.FREEZING,
      OrderStatus.SHIPPED,
      OrderStatus.COMPLETED,
      OrderStatus.AFTERSALE,
    ];

    // Fetch all orders in these statuses
    const allOrders = await Promise.all(
      orderStatuses.map((status) => this.orderRepository.findByStatus(status)),
    );

    // Flatten the array of arrays
    const orders = allOrders.flat();

    const infoByOrderItemId = new Map<string, OrderPackagingInfoDto>();

    for (const order of orders) {
      for (const item of order.items) {
        if (requestedOrderItemIds.has(item.id)) {
          // 🔧 修复：从order.dog和order.address获取真实数据
          infoByOrderItemId.set(item.id, {
            orderId: order.id,
            orderItemId: item.id,
            dogName: order.dog?.name || '未知狗狗', // ✅ 使用真实狗狗名称
            packageSpecG: item.packageSpecG,
            packageCount: item.packageCount,
            packagePlan: item.packagePlan ?? null,
            ingredientSourcePlan: item.ingredientSourcePlan ?? null,
            recipientName: order.address?.recipientName, // ✅ 收货人姓名
            recipientCity: order.address?.region?.city, // ✅ 收货城市
            adminRemark: order.adminRemark ?? undefined,
            completedAt: order.completedAt
              ? this.toLocalTime(order.completedAt)
              : undefined,
          });
        }
      }
    }

    for (const unit of units) {
      const unitOrderItems: OrderPackagingInfoDto[] = [];
      for (const orderItemId of unit.sourceOrderItemIds || []) {
        const info = infoByOrderItemId.get(orderItemId);
        if (info) {
          unitOrderItems.push(info);
        }
      }
      result.set(unit.id, unitOrderItems);
    }

    return result;
  }

  private async getOrderDemandPurchaseListsByProductionDate(
    units: PackagingUnit[],
    productionDateByBatchId: Map<string, Date>,
  ): Promise<Map<string, any[]>> {
    const dateStrings = Array.from(
      new Set(
        units
          .map((unit) =>
            DateUtil.formatDate(
              productionDateByBatchId.get(unit.productionBatchId) ||
                unit.createdAt,
            ),
          )
          .filter(Boolean),
      ),
    );

    const entries = await Promise.all(
      dateStrings.map(async (dateString) => {
        const { start, end } = DateUtil.createDateRange(dateString);
        const { list } = await this.purchaseListRepository.findMany({
          kind: PurchaseListKind.ORDER_DEMAND,
          startDate: start,
          endDate: end,
        });
        return [dateString, list] as const;
      }),
    );

    return new Map(entries);
  }

  private enrichRecipeSnapshotWithProcurementSku(params: {
    recipeSnapshot: any;
    ingredientSourcePlan?: string | null;
    orderItems: OrderPackagingInfoDto[];
    purchaseLists: any[];
  }): any {
    const items = Array.isArray(params.recipeSnapshot?.items)
      ? params.recipeSnapshot.items
      : [];

    if (items.length === 0 || params.purchaseLists.length === 0) {
      return params.recipeSnapshot;
    }

    const orderIds = new Set(
      params.orderItems.map((item) => item.orderId).filter(Boolean),
    );
    const relevantPurchaseItems = params.purchaseLists
      .filter((list) => {
        const sourceOrderIds = Array.isArray(list.sourceOrderIds)
          ? list.sourceOrderIds
          : [];

        return (
          sourceOrderIds.length === 0 ||
          sourceOrderIds.some((orderId: string) => orderIds.has(orderId))
        );
      })
      .flatMap((list) => (Array.isArray(list.items) ? list.items : []));

    if (relevantPurchaseItems.length === 0) {
      return params.recipeSnapshot;
    }

    return {
      ...params.recipeSnapshot,
      items: items.map((item: any) => {
        const ingredientId = item.ingredient_id || item.ingredientId;
        const candidates = relevantPurchaseItems.filter(
          (purchaseItem: any) => purchaseItem.ingredientId === ingredientId,
        );
        const selectedPurchaseItem = this.selectPurchaseItemForSourcePlan(
          candidates,
          params.ingredientSourcePlan,
          item.ingredient_type,
        );

        if (!selectedPurchaseItem?.procurementSkuName) {
          return item;
        }

        const selectedSku =
          this.getPurchaseItemProcurementSku(selectedPurchaseItem);
        const procurementSkuBrand =
          selectedPurchaseItem.brand || selectedSku?.brand || undefined;
        const procurementSkuPurchaseChannel =
          selectedPurchaseItem.purchaseChannel ||
          selectedSku?.purchaseChannel ||
          undefined;
        const procurementSkuProductModel =
          selectedPurchaseItem.productModel ||
          selectedSku?.productModel ||
          undefined;

        return {
          ...item,
          standardIngredientName: item.standardIngredientName || item.name,
          procurementSkuId: selectedPurchaseItem.procurementSkuId || undefined,
          procurementSkuName: selectedPurchaseItem.procurementSkuName,
          procurementSkuBrand,
          procurementSkuPurchaseChannel,
          procurementSkuProductModel,
          procurement_sku_id: selectedPurchaseItem.procurementSkuId || undefined,
          procurement_sku_name: selectedPurchaseItem.procurementSkuName,
          procurement_sku_brand: procurementSkuBrand,
          procurement_sku_purchase_channel: procurementSkuPurchaseChannel,
          procurement_sku_product_model: procurementSkuProductModel,
        };
      }),
    };
  }

  private selectPurchaseItemForSourcePlan(
    candidates: any[],
    ingredientSourcePlan?: string | null,
    ingredientType?: string | null,
  ): any | undefined {
    const validCandidates = candidates.filter(
      (candidate) => candidate?.procurementSkuName,
    );

    if (validCandidates.length <= 1) {
      return validCandidates[0];
    }

    if (ingredientType !== 'FOOD') {
      return validCandidates[0];
    }

    const plan = ingredientSourcePlan || 'WHOLESALE';
    const tierPriority: Record<string, string[]> = {
      ORGANIC: ['ORGANIC', 'MARKET_PREMIUM', 'WHOLESALE'],
      MARKET_PREMIUM: ['MARKET_PREMIUM', 'ORGANIC', 'WHOLESALE'],
      WHOLESALE: ['WHOLESALE', 'MARKET_PREMIUM', 'ORGANIC'],
    };
    const orderedTiers = tierPriority[plan] || tierPriority.WHOLESALE;

    let tierCandidates = validCandidates;
    for (const tier of orderedTiers) {
      const matched = validCandidates.filter(
        (candidate) => this.getPurchaseItemSourceTier(candidate) === tier,
      );
      if (matched.length > 0) {
        tierCandidates = matched;
        break;
      }
    }

    const preferLowestPrice = plan === 'WHOLESALE';
    return [...tierCandidates].sort((a, b) => {
      const priceA = this.getPurchaseItemPrice(a);
      const priceB = this.getPurchaseItemPrice(b);

      if (priceA !== null && priceB !== null && priceA !== priceB) {
        return preferLowestPrice ? priceA - priceB : priceB - priceA;
      }

      return String(a.procurementSkuName).localeCompare(
        String(b.procurementSkuName),
        'zh-Hans-CN',
      );
    })[0];
  }

  private getPurchaseItemSourceTier(purchaseItem: any): string | null {
    const sku = this.getPurchaseItemProcurementSku(purchaseItem);

    return sku?.sourceTier || null;
  }

  private getPurchaseItemPrice(purchaseItem: any): number | null {
    const sku = this.getPurchaseItemProcurementSku(purchaseItem);
    const price =
      sku?.currentPurchasePrice ??
      sku?.referencePricePerPurchaseUnit ??
      (purchaseItem.quantityNeeded
        ? Number(purchaseItem.estimatedCost) / Number(purchaseItem.quantityNeeded)
        : null);
    const numericPrice = Number(price);

    return Number.isFinite(numericPrice) ? numericPrice : null;
  }

  private getPurchaseItemProcurementSku(purchaseItem: any): any | null {
    return (
      (purchaseItem.ingredient?.procurementSkus || []).find(
        (item: any) => item.id === purchaseItem.procurementSkuId,
      ) || null
    );
  }

  private resolvePackagingUnitIngredientSourcePlan(
    orderItems: OrderPackagingInfoDto[],
  ): string | null {
    const plans = Array.from(
      new Set(
        orderItems
          .map((item) => item.ingredientSourcePlan)
          .filter((plan): plan is string => Boolean(plan)),
      ),
    );

    if (plans.length === 0) {
      return null;
    }

    if (plans.length > 1) {
      return 'MIXED';
    }

    return plans[0];
  }

  private getIngredientSourcePlanLabel(plan?: string | null): string | undefined {
    const labels: Record<string, string> = {
      ORGANIC: '有机优先',
      MARKET_PREMIUM: '超市优先',
      WHOLESALE: '性价比优先',
      MIXED: '多采购策略',
    };

    if (!plan) {
      return undefined;
    }

    return labels[plan] || plan;
  }

  private buildPackagingUnitDisplayGroupKey(
    unit: PackagingUnit,
    orderItems: OrderPackagingInfoDto[],
  ): string {
    const recipeId = (unit.recipeSnapshot as any).id || 'unknown-recipe';
    const sourcePlan =
      this.resolvePackagingUnitIngredientSourcePlan(orderItems) ||
      'DEFAULT_SOURCE_PLAN';

    return `${unit.productionBatchId}-${recipeId}-${sourcePlan}`;
  }

  private areAllPackagingUnitsForOrderCompleted(
    order: Order,
    batch: ProductionBatch | null,
  ): boolean {
    if (!batch) return false;

    const orderItemIds = new Set((order.items || []).map((item) => item.id));
    if (orderItemIds.size === 0) return false;

    const relatedUnits = (batch.packagingUnits || []).filter((packagingUnit) =>
      (packagingUnit.sourceOrderItemIds || []).some((orderItemId) =>
        orderItemIds.has(orderItemId),
      ),
    );

    if (relatedUnits.length === 0) return false;

    return relatedUnits.every(
      (packagingUnit) =>
        packagingUnit.status === PackagingUnitStatus.COMPLETED,
    );
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
   * 支持累加模式：每次调用追加新照片到现有列表
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

    // Validate photo count per upload (支持1-3张照片的累加上传)
    if (photoUrls.length === 0 || photoUrls.length > 3) {
      throw new BadRequestException(
        `Each upload must contain 1-3 photos. Got ${photoUrls.length}`,
      );
    }

    // Auto-cleanup: Check if existing photos in database are valid
    const existingPhotos = unit.photosRaw || [];
    if (existingPhotos.length > 0) {
      this.logger.log(
        `[KitchenService] Checking ${existingPhotos.length} existing photos for validity...`,
      );

      const validPhotos: string[] = [];
      const invalidPhotos: string[] = [];

      for (const photoUrl of existingPhotos) {
        const exists = await this.cosService.checkFileExists(photoUrl);
        if (exists) {
          validPhotos.push(photoUrl);
        } else {
          invalidPhotos.push(photoUrl);
        }
      }

      if (invalidPhotos.length > 0) {
        this.logger.log(
          `[KitchenService] Found ${invalidPhotos.length} invalid photos, removing from database...`,
        );
        this.logger.log(
          `[KitchenService] Invalid photos: ${invalidPhotos.join(', ')}`,
        );

        // Update unit with only valid photos
        unit.photosRaw = validPhotos;
        await this.productionRepository.updatePackagingUnit(unit);

        this.logger.log(
          `[KitchenService] Cleaned database. Valid photos: ${validPhotos.length}, Removed: ${invalidPhotos.length}`,
        );
      } else {
        this.logger.log(`[KitchenService] All existing photos are valid`);
      }
    }

    // Update photosRaw field using domain method (累加模式，触发状态转换)
    const shouldTrigger = unit.uploadPhotos(photoUrls);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    // Trigger order status transitions on first upload
    if (shouldTrigger && unit.sourceOrderItemIds.length > 0) {
      // Get all affected orders from sourceOrderItemIds
      const orderItems = await this.productionRepository.findOrderItemsByIds(
        unit.sourceOrderItemIds,
      );
      const uniqueOrderIds = [
        ...new Set(orderItems.map((item) => item.orderId)),
      ];

      this.logger.log(
        `[KitchenService] Processing ${uniqueOrderIds.length} affected orders for unit ${unitId}`,
      );

      let transitionedCount = 0;
      let skippedCount = 0;

      for (const orderId of uniqueOrderIds) {
        try {
          const order = await this.orderRepository.findById(orderId);

          if (!order) {
            this.logger.warn(`[KitchenService] Order not found: ${orderId}`);
            skippedCount++;
            continue;
          }

          // Only transition IN_PRODUCTION orders to FREEZING
          if (order.status === OrderStatus.IN_PRODUCTION) {
            order.markAsFreezing();
            await this.orderRepository.save(order);
            transitionedCount++;
            this.logger.log(
              `[KitchenService] Order ${orderId} transitioned to FREEZING`,
            );
          } else {
            skippedCount++;
            this.logger.log(
              `[KitchenService] Order ${orderId} skipped (status: ${order.status})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[KitchenService] Error processing order ${orderId}:`,
            error,
          );
          skippedCount++;
        }
      }

      this.logger.log(
        `[KitchenService] Uploaded ${photoUrls.length} photos for task ${unitId}: ` +
          `${transitionedCount} orders → FREEZING, ${skippedCount} orders skipped`,
      );
    } else {
      this.logger.log(
        `[KitchenService] Uploaded ${photoUrls.length} photos for task ${unitId} (no order transition needed)`,
      );
    }

    return updated;
  }

  /**
   * Complete production task
   */
  async completeProductionTask(
    unitId: string,
    dto: CompleteProductionDto = {},
  ): Promise<PackagingUnit> {
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

    unit.recordProductionResult({
      resultStatus: dto.resultStatus || 'NORMAL',
      surplusG: dto.surplusG,
      shortageG: dto.shortageG,
      resultPhotoUrls: dto.resultPhotoUrls,
    });
    unit.transitionTo(PackagingUnitStatus.COMPLETED);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    this.logger.log(`[KitchenService] Completed production task ${unitId}`);

    const batch = await this.productionRepository.findById(
      unit.productionBatchId,
    );

    // Update order status: IN_PRODUCTION → FREEZING (制作中 → 急冻中待发货)
    if (unit.sourceOrderItemIds.length > 0) {
      const orderItems = await this.productionRepository.findOrderItemsByIds(
        unit.sourceOrderItemIds,
      );
      const uniqueOrderIds = [
        ...new Set(orderItems.map((item) => item.orderId)),
      ];

      this.logger.log(
        `[KitchenService] Processing ${uniqueOrderIds.length} affected orders for unit ${unitId}`,
      );

      let transitionedCount = 0;
      let skippedCount = 0;

      for (const orderId of uniqueOrderIds) {
        try {
          const order = await this.orderRepository.findById(orderId);

          if (!order) {
            this.logger.warn(`[KitchenService] Order not found: ${orderId}`);
            skippedCount++;
            continue;
          }

          // Transition IN_PRODUCTION orders to FREEZING
          if (order.status === OrderStatus.IN_PRODUCTION) {
            if (!this.areAllPackagingUnitsForOrderCompleted(order, batch)) {
              skippedCount++;
              this.logger.log(
                `[KitchenService] Order ${orderId} skipped (not all packaging units completed)`,
              );
              continue;
            }

            order.markAsFreezing();
            await this.orderRepository.save(order);
            transitionedCount++;
            this.logger.log(
              `[KitchenService] Order ${orderId} transitioned to FREEZING`,
            );
          } else {
            skippedCount++;
            this.logger.log(
              `[KitchenService] Order ${orderId} skipped (status: ${order.status})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `[KitchenService] Error processing order ${orderId}:`,
            error,
          );
          skippedCount++;
        }
      }

      this.logger.log(
        `[KitchenService] Completed task ${unitId}: ` +
          `${transitionedCount} orders → FREEZING, ${skippedCount} orders skipped`,
      );
    }

    // Check if all units in the batch are completed
    if (batch && batch.status === ProductionBatchStatus.IN_PRODUCTION) {
      await this.productionService.checkAndCompleteBatch(
        unit.productionBatchId,
      );
    }

    return updated;
  }

  /**
   * Get today's statistics
   */
  async getTodayStatistics(targetDate?: string): Promise<TodayStatisticsDto> {
    const productionDate = targetDate || DateUtil.formatDate(new Date());
    const { start: selectedDate } = DateUtil.createDateRange(productionDate);
    const queryStartDate = new Date(`${productionDate}T00:00:00`);
    const queryEndDate = new Date(`${productionDate}T23:59:59.999`);

    // Get production batches for the selected date
    const batches =
      await this.productionRepository.findByProductionDate(selectedDate);
    const { list: purchasingOrders } =
      await this.orderRepository.findByTargetProductionDateRange({
        status: OrderStatus.PURCHASING,
        startDate: queryStartDate,
        endDate: queryEndDate,
      });

    // Count all packaging units
    const allUnits = batches.flatMap((b) => b.packagingUnits);
    const pendingScheduleOrders = purchasingOrders.filter((order) =>
      order.items.some((item) => item.productionBatchId === null),
    ).length;

    const todayTasks = allUnits.length; // 统计制作单数量（每一锅为一个制作单）

    const inProgress = allUnits.filter(
      (u) => u.status === PackagingUnitStatus.IN_PROGRESS,
    ).length;

    const completed = allUnits.filter(
      (u) => u.status === PackagingUnitStatus.COMPLETED,
    ).length;

    return {
      todayOrders: todayTasks, // 保持字段名不变，只修改值
      pendingScheduleOrders,
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

  /**
   * Replace production photos (原料照片替换)
   * Deletes old photos from COS and uploads new ones
   */
  /**
   * Delete a single production photo
   * Removes photo from array and deletes from COS storage
   */
  async deleteProductionPhoto(
    unitId: string,
    photoUrl: string,
  ): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Production task not found: ${unitId}`);
    }

    if (!unit.photosRaw || unit.photosRaw.length === 0) {
      throw new BadRequestException('No photos to delete');
    }

    // Check if the photo URL exists in the unit
    const photoIndex = unit.photosRaw.indexOf(photoUrl);
    if (photoIndex === -1) {
      throw new BadRequestException('Photo not found in this unit');
    }

    // Remove photo from array using domain method
    unit.removePhoto(photoUrl);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    // Delete from COS storage
    try {
      const key = this.extractKeyFromCosUrl(photoUrl);
      if (key) {
        await this.cosService.deleteImage(key);
        this.logger.log(`[KitchenService] Deleted photo from COS: ${key}`);
      }
    } catch (error) {
      // COS deletion failure should not block the main flow
      this.logger.warn(
        `[KitchenService] Failed to delete photo from COS: ${photoUrl}`,
        error,
      );
    }

    this.logger.log(
      `[KitchenService] Deleted photo for unit ${unitId}. Remaining: ${updated.photosRaw?.length || 0}`,
    );

    return updated;
  }

  async replaceProductionPhotos(
    unitId: string,
    photoUrls: string[],
  ): Promise<PackagingUnit> {
    const unit = await this.productionRepository.findPackagingUnitById(unitId);

    if (!unit) {
      throw new NotFoundException(`Production task not found: ${unitId}`);
    }

    // Save old photo URLs for deletion
    const oldPhotoUrls = unit.photosRaw || [];

    // Update photos using domain method
    unit.replacePhotos(photoUrls);
    const updated = await this.productionRepository.updatePackagingUnit(unit);

    // Delete old photos from COS
    let deletedCount = 0;
    for (const oldUrl of oldPhotoUrls) {
      try {
        const key = this.extractKeyFromCosUrl(oldUrl);
        if (key) {
          await this.cosService.deleteImage(key);
          deletedCount++;
          this.logger.log(`[KitchenService] Deleted old photo: ${key}`);
        }
      } catch (error) {
        // Deletion failure should not block the main flow
        this.logger.warn(
          `[KitchenService] Failed to delete old photo: ${oldUrl}`,
          error,
        );
      }
    }

    this.logger.log(
      `[KitchenService] Replaced photos for unit ${unitId}: ` +
        `${photoUrls.length} new photos, ${deletedCount}/${oldPhotoUrls.length} old photos deleted`,
    );

    return updated;
  }

  /**
   * Extract COS key from URL
   * URL format: https://bucket.cos.region.myqcloud.com/production/unitId/timestamp-random.ext
   * or: https://cdn.domain.com/production/unitId/timestamp-random.ext
   */
  private extractKeyFromCosUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // Extract path without leading /
      const key = urlObj.pathname.substring(1);
      return key;
    } catch {
      return null;
    }
  }

  /**
   * Generate PDF for production task and upload to COS
   */
  async printProductionTask(taskData: PrintTaskDto): Promise<{ pdfUrl: string }> {
    this.logger.log(`[PrintProductionTask] Generating PDF for task`);

    try {
      // Generate PDF
      const pdfBuffer =
        await this.pdfGenerator.generateProductionTaskPDF(taskData);

      // Upload to COS
      const uploadResult = await this.cosService.uploadFile(
        pdfBuffer,
        `task-${taskData.taskId || Date.now()}.pdf`,
        'print-tasks',
      );

      this.logger.log(
        `[PrintProductionTask] PDF uploaded to ${uploadResult.url}`,
      );

      return {
        pdfUrl: uploadResult.url,
      };
    } catch (error) {
      this.logger.error(
        `[PrintProductionTask] Failed to generate/print PDF`,
        error,
      );
      throw new BadRequestException('生成PDF失败，请重试');
    }
  }
}
