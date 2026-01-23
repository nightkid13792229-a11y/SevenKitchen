/**
 * Purchasing Service
 * 采购管理服务
 * Phase 1: Purchasing Management Feature
 */

import { Injectable, Inject, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus } from '../../domain';
import { ORDER_REPOSITORY } from '../order/order.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { PURCHASE_LIST_REPOSITORY, PURCHASE_RECORD_REPOSITORY } from './purchasing.service.tokens';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import type { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import {
  PurchaseList,
  PurchaseItem,
  PurchaseListStatus,
  PurchaseRecord,
} from '../../domain/purchasing';
import { validatePurchasingOperation } from './purchasing-time.utils';
import { DateUtil } from '../../utils/date.util';

export interface GeneratePurchaseListDto {
  startDate: string;  // YYYY-MM-DD format
  endDate?: string;   // YYYY-MM-DD format, optional (defaults to startDate)
}

export interface CompletePurchaseDto {
  actualCosts?: Array<{ itemId: string; actualCost: number }>;
}

export interface AddPurchaseRecordDto {
  purchaseItemId: string;
  ingredientId: string;
  ingredientName: string;
  purchaseChannel: string;
  actualQuantity: number;
  actualCost: number;
  productModel?: string;
  notes?: string;
}

export interface UpdatePurchaseRecordDto {
  purchaseChannel?: string;
  actualQuantity?: number;
  actualCost?: number;
  productModel?: string;
  notes?: string;
}

export interface PurchaseRequirement {
  ingredientId: string;
  ingredientName: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  quantityNeeded: number;      // 基于baseUnit
  quantityUnit: string;        // G / ML / PCS
  estimatedCost: number;       // 基于currentPricePerPurchaseUnit
  purchaseChannel?: string;
  productModel?: string;
  displayUnit?: string;        // 显示单位（补剂类的单位显示标签）
  minSortOrder?: number;       // 最小排序值（用于多食谱合并）
}

@Injectable()
export class PurchasingService {
  private readonly logger = new Logger(PurchasingService.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: IngredientRepository,
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
    @Inject(PURCHASE_RECORD_REPOSITORY)
    private readonly purchaseRecordRepository: PurchaseRecordRepository,
  ) {}

  /**
   * 计算指定日期范围的采购需求
   * 复用订单的 pricingBreakdownSnapshot 中的 ingredientDetails
   */
  async calculatePurchaseRequirements(
    startDate: string,
    endDate?: string
  ): Promise<PurchaseRequirement[]> {
    const end = endDate || startDate;

    // 使用统一的日期工具创建查询范围（中午12点避免时区问题）
    const { start: start_date, end: end_date } = DateUtil.createDateRange(startDate);

    this.logger.log(`Calculating purchase requirements from ${startDate} to ${end}`);
    this.logger.log(`Query range (local): ${start_date.toString()} to ${end_date.toString()}`);
    this.logger.log(`Query range (UTC): ${start_date.toISOString()} to ${end_date.toISOString()}`);

    // 查询制作日期范围内的待生产订单（PAID状态）
    // 使用 targetProductionDate 而不是 createdAt，因为采购需求基于制作日期
    const { list: orders } = await this.orderRepository.findByTargetProductionDateRange({
      status: OrderStatus.PAID,
      startDate: start_date,
      endDate: end_date,
    });

    this.logger.log(`Found ${orders.length} PAID orders in query range`);

    if (orders.length === 0) {
      this.logger.warn(`No PAID orders found with target production date in range ${startDate} - ${end}`);
      return [];
    }

    this.logger.log(`Found ${orders.length} PAID orders for purchase calculation`);

    // 汇总所有订单的原料需求
    const ingredientMap = new Map<string, PurchaseRequirement>();

    for (const order of orders) {
      // 检查订单是否有定价快照
      if (!order.pricingBreakdownSnapshot) {
        this.logger.warn(`Order ${order.id} has no pricing breakdown snapshot, skipping`);
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      // 创建recipeSnapshot的映射，用于获取sort_order
      const recipeSnapshotMap = new Map<string, any>();
      for (const orderItem of order.items) {
        if (orderItem.recipeSnapshot?.items) {
          for (const item of orderItem.recipeSnapshot.items) {
            recipeSnapshotMap.set(item.ingredient_id, item);
          }
        }
      }

      // 遍历定价快照中的每个原料
      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const ingredientId = detail.ingredientId;

        // 从recipeSnapshot中获取原料信息（用于排序和类型）
        const recipeItem = recipeSnapshotMap.get(ingredientId);
        if (!recipeItem) {
          this.logger.warn(`Ingredient ${ingredientId} (${detail.name}) not found in recipe snapshot, skipping`);
          continue;
        }

        // purchaseAmount 是整个订单的采购总量（已包含制作损耗，不含出肉率）
        // 如果没有 purchaseAmount，回退到 amount
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;

        // 调试日志
        this.logger.debug(`Ingredient calculation: ${detail.name}`, {
          ingredientId,
          purchaseAmount: detail.purchaseAmount,
          amount: detail.amount,
          purchaseQuantity,
          type: detail.type,
          sortOrder: recipeItem.sort_order,
        });

        // 如果采购量为0或负数，跳过该原料
        if (purchaseQuantity <= 0) {
          this.logger.warn(`Skipping ingredient ${detail.name} due to non-positive quantity: ${purchaseQuantity}`);
          continue;
        }

        // 获取原料类型（从recipeSnapshot或ingredientDetails）
        const type = recipeItem.ingredient_type || detail.type || 'FOOD';

        // 使用订单的总成本
        const totalCost = detail.cost || 0;

        if (ingredientMap.has(key)) {
          // 累加数量和成本
          const existing = ingredientMap.get(key)!;
          existing.quantityNeeded += purchaseQuantity;
          existing.estimatedCost += totalCost;
          // 更新最小sortOrder
          if (recipeItem.sort_order !== undefined) {
            existing.minSortOrder = Math.min(existing.minSortOrder ?? 99999, recipeItem.sort_order);
          }
        } else {
          // 新增原料
          ingredientMap.set(key, {
            ingredientId: key,
            ingredientName: detail.name,
            type: type as any,
            quantityNeeded: purchaseQuantity,
            quantityUnit: detail.unit || 'G',
            estimatedCost: totalCost,
            purchaseChannel: detail.purchaseChannel,
            productModel: detail.productModel,
            displayUnit: detail.displayUnit,
            minSortOrder: recipeItem.sort_order,
          });
        }
      }
    }

    // 转换为数组并排序：先按类型，再按sortOrder
    const requirements = Array.from(ingredientMap.values()).sort((a, b) => {
      // 1. 先按类型排序
      const typeOrder = { 'FOOD': 1, 'SUPPLEMENT': 2, 'PACKAGING': 3 };
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;

      // 2. 同类型内按sortOrder排序（取最小值）
      return (a.minSortOrder ?? 99999) - (b.minSortOrder ?? 99999);
    });

    this.logger.log(`Calculated ${requirements.length} unique ingredient requirements`);

    return requirements;
  }

  /**
   * 生成采购清单
   */
  async generatePurchaseList(
    dto: GeneratePurchaseListDto,
    createdById: string
  ): Promise<PurchaseList> {
    const end = dto.endDate || dto.startDate;

    // 使用统一的日期工具创建查询范围（中午12点避免时区问题）
    const { start: startDate, end: endDate } = DateUtil.createDateRange(dto.startDate);

    // 验证日期格式
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException(
        `日期格式无效。期望格式：YYYY-MM-DD，实际值：${dto.startDate}`
      );
    }

    // 验证日期范围
    if (endDate < startDate) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }

    // 检查是否已存在该日期范围的采购清单
    const exists = await this.purchaseListRepository.existsByDateRange(startDate, endDate);
    if (exists) {
      throw new ConflictException(
        `日期范围 ${dto.startDate} - ${end} 的采购清单已存在`
      );
    }

    this.logger.log(`Generating purchase list for ${dto.startDate} - ${end} by user ${createdById}`);

    // 计算采购需求
    const requirements = await this.calculatePurchaseRequirements(dto.startDate, end);

    if (requirements.length === 0) {
      throw new BadRequestException(
        `日期范围 ${dto.startDate} - ${end} 内没有找到采购需求，请确认有待生产的订单`
      );
    }

    // 查询订单ID列表（使用制作日期查询）
    const { list: orders } = await this.orderRepository.findByTargetProductionDateRange({
      status: OrderStatus.PAID,
      startDate: startDate,
      endDate: endDate,
    });
    const sourceOrderIds = orders.map(o => o.id);

    // 创建采购明细
    const totalEstimatedCost = requirements.reduce((sum, r) => sum + r.estimatedCost, 0);
    const items = requirements.map(req =>
      new PurchaseItem({
        purchaseListId: '', // 会在创建PurchaseList时更新
        ingredientId: req.ingredientId,
        ingredientName: req.ingredientName, // ✅ 传入原料名称
        type: req.type,  // ✅ 传入原料类型
        quantityNeeded: req.quantityNeeded,
        quantityUnit: req.quantityUnit,
        estimatedCost: req.estimatedCost,
        purchaseChannel: req.purchaseChannel,
        productModel: req.productModel,
        displayUnit: req.displayUnit,  // ✅ 传入显示单位
      })
    );

    // 创建采购清单（使用startDate作为目标日期）
    const purchaseList = new PurchaseList({
      targetDate: startDate,
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost,
      itemCount: items.length,
      createdById,
      sourceOrderIds,
      items,
    });

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${saved.id} created successfully with ${items.length} items`);

    return saved;
  }

  /**
   * 查询采购清单列表
   */
  async getPurchaseLists(params: {
    status?: PurchaseListStatus;
    createdById?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: PurchaseList[]; total: number }> {
    const { status, createdById, startDate, endDate, page = 1, pageSize = 20 } = params;

    const query: any = { page, pageSize };
    if (status) query.status = status;
    if (createdById) query.createdById = createdById;
    if (startDate) query.startDate = new Date(startDate);
    if (endDate) query.endDate = new Date(endDate);

    return this.purchaseListRepository.findMany(query);
  }

  /**
   * 查询采购清单详情
   */
  async getPurchaseListDetail(id: string): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    return purchaseList;
  }

  /**
   * 确认采购完成
   * 状态转换: DRAFT/PENDING → COMPLETED
   */
  async completePurchase(id: string, dto: CompletePurchaseDto): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '确认采购完成');

    // 如果提供了实际成本，更新采购明细
    if (dto.actualCosts && dto.actualCosts.length > 0) {
      for (const actualCost of dto.actualCosts) {
        const item = purchaseList.items.find(i => i.id === actualCost.itemId);
        if (item) {
          // 注意：PurchaseItem的estimatedCost是readonly，这里需要创建新的PurchaseItem
          // 但为了简化，我们暂时只记录实际成本的差异，不修改entity
          this.logger.log(
            `Item ${actualCost.itemId}: estimated ${item.estimatedCost}, actual ${actualCost.actualCost}`
          );
        }
      }
    }

    // 确认采购完成
    purchaseList.complete();

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${id} marked as completed`);

    return saved;
  }

  /**
   * 取消采购清单
   * 状态转换: DRAFT/PENDING → CANCELLED
   */
  async cancelPurchaseList(id: string): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    // 取消采购清单
    purchaseList.cancel();

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${id} cancelled`);

    return saved;
  }

  /**
   * 开始采购
   * 记录开始采购的时间
   */
  async startPurchase(id: string): Promise<PurchaseList> {
    const purchaseList = await this.purchaseListRepository.findById(id);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${id}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '开始采购');

    // 开始采购
    purchaseList.start();

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${id} started`);

    return saved;
  }

  /**
   * 添加采购记录
   */
  async addPurchaseRecord(
    purchaseListId: string,
    dto: AddPurchaseRecordDto
  ): Promise<PurchaseRecord> {
    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${purchaseListId}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '添加采购记录');

    // 创建采购记录
    const purchaseRecord = new PurchaseRecord({
      purchaseListId,
      purchaseItemId: dto.purchaseItemId,
      ingredientId: dto.ingredientId,
      ingredientName: dto.ingredientName,
      purchaseChannel: dto.purchaseChannel,
      actualQuantity: dto.actualQuantity,
      actualCost: dto.actualCost,
      productModel: dto.productModel,
      notes: dto.notes,
    });

    // 保存到数据库
    const saved = await this.purchaseRecordRepository.save(purchaseRecord);

    this.logger.log(`Purchase record ${saved.id} added to purchase list ${purchaseListId}`);

    return saved;
  }

  /**
   * 更新采购记录
   */
  async updatePurchaseRecord(
    id: string,
    dto: UpdatePurchaseRecordDto
  ): Promise<PurchaseRecord> {
    const purchaseRecord = await this.purchaseRecordRepository.findById(id);

    if (!purchaseRecord) {
      throw new BadRequestException(`未找到采购记录：${id}`);
    }

    // 获取关联的采购清单
    const purchaseList = await this.purchaseListRepository.findById(purchaseRecord.purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到关联的采购清单：${purchaseRecord.purchaseListId}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '更新采购记录');

    // 检查是否已关联报销单（已关联则不能修改）
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购记录不能修改');
    }

    // 更新采购记录
    purchaseRecord.update(dto);

    // 保存到数据库
    const saved = await this.purchaseRecordRepository.save(purchaseRecord);

    this.logger.log(`Purchase record ${id} updated`);

    return saved;
  }

  /**
   * 删除采购记录
   */
  async deletePurchaseRecord(id: string): Promise<void> {
    const purchaseRecord = await this.purchaseRecordRepository.findById(id);

    if (!purchaseRecord) {
      throw new BadRequestException(`未找到采购记录：${id}`);
    }

    // 获取关联的采购清单
    const purchaseList = await this.purchaseListRepository.findById(purchaseRecord.purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到关联的采购清单：${purchaseRecord.purchaseListId}`);
    }

    // 验证操作时间（6:00-14:00）和目标日期
    // TODO: 测试期间临时注释时间限制
    // validatePurchasingOperation(purchaseList.targetDate, '删除采购记录');

    // 检查是否已关联报销单（已关联则不能删除）
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购记录不能删除');
    }

    // 删除采购记录
    await this.purchaseRecordRepository.delete(id);

    this.logger.log(`Purchase record ${id} deleted`);
  }

  /**
   * 查询采购记录列表
   */
  async getPurchaseRecords(purchaseListId: string): Promise<PurchaseRecord[]> {
    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException(`未找到采购清单：${purchaseListId}`);
    }

    return this.purchaseRecordRepository.findByPurchaseListId(purchaseListId);
  }
}
