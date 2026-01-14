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

    // 创建日期范围
    // 使用UTC时间，并将结束时间设置为第二天的开始，以覆盖整个结束日期
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end_date = new Date(`${end}T23:59:59.999Z`);

    this.logger.log(`Calculating purchase requirements from ${startDate} to ${end}`);

    // 查询制作日期范围内的待生产订单（PAID状态）
    // 使用 targetProductionDate 而不是 createdAt，因为采购需求基于制作日期
    const { list: orders } = await this.orderRepository.findByTargetProductionDateRange({
      status: OrderStatus.PAID,
      startDate: start,
      endDate: end_date,
    });

    if (orders.length === 0) {
      this.logger.warn(`No PAID orders found with target production date in range ${startDate} - ${end}`);
      return [];
    }

    this.logger.log(`Found ${orders.length} PAID orders for purchase calculation`);

    // 汇总所有订单的原料需求
    const ingredientMap = new Map<string, PurchaseRequirement>();

    for (const order of orders) {
      // 读取订单定价快照中的原料详情
      if (!order.pricingBreakdownSnapshot) {
        this.logger.warn(`Order ${order.id} has no pricing breakdown snapshot, skipping`);
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;

        // 优先使用purchaseAmount（仅含生产损耗率，不含出肉率），回退到amount
        const purchaseQuantity = detail.purchaseAmount ?? detail.amount;

        if (ingredientMap.has(key)) {
          // 累加数量和成本
          const existing = ingredientMap.get(key)!;
          existing.quantityNeeded += purchaseQuantity || 0;
          existing.estimatedCost += detail.cost || 0;
        } else {
          // 新增原料
          ingredientMap.set(key, {
            ingredientId: detail.ingredientId,
            ingredientName: detail.name,
            type: detail.type,
            quantityNeeded: purchaseQuantity || 0,
            quantityUnit: detail.unit,
            estimatedCost: detail.cost || 0,
            purchaseChannel: detail.purchaseChannel,
            productModel: detail.productModel,
            displayUnit: detail.displayUnit,  // 显示单位标签
          });
        }
      }
    }

    // 转换为数组并按原料类型排序
    const requirements = Array.from(ingredientMap.values()).sort((a, b) => {
      const typeOrder = { 'FOOD': 1, 'SUPPLEMENT': 2, 'PACKAGING': 3 };
      return typeOrder[a.type] - typeOrder[b.type];
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

    // 创建日期范围
    // 使用UTC时间，并将结束时间设置为第二天的开始，以覆盖整个结束日期
    const startDate = new Date(`${dto.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${end}T23:59:59.999Z`);

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
      status: PurchaseListStatus.DRAFT,
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
    validatePurchasingOperation(purchaseList.targetDate, '确认采购完成');

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
    validatePurchasingOperation(purchaseList.targetDate, '开始采购');

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
    validatePurchasingOperation(purchaseList.targetDate, '添加采购记录');

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
    validatePurchasingOperation(purchaseList.targetDate, '更新采购记录');

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
    validatePurchasingOperation(purchaseList.targetDate, '删除采购记录');

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
