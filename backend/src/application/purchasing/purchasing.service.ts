/**
 * Purchasing Service
 * 采购管理服务
 * Phase 1: Purchasing Management Feature
 */

import { Injectable, Inject, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { OrderStatus, Order } from '../../domain';
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

    // 为targetProductionDate查询创建范围（使用午夜00:00:00，因为数据库中存储的是午夜时间）
    const start_date = new Date(`${startDate}T00:00:00`);
    const end_date = new Date(`${end}T23:59:59.999`);

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
   * 预览采购需求（不创建采购清单，不改变订单状态）
   */
  async previewPurchaseRequirements(
    startDate: string,
    endDate?: string
  ): Promise<{
    targetDateRange: { start: string; end: string };
    itemCount: number;
    items: Array<{
      ingredientId: string;
      ingredientName: string;
      quantityNeeded: number;
      quantityUnit: string;
      purchaseChannel?: string;
      productModel?: string;
    }>;
    affectedOrders: Array<{
      orderId: string;
      targetProductionDate: string;
    }>;
  }> {
    const end = endDate || startDate;

    this.logger.log(`Previewing purchase requirements for ${startDate} - ${end}`);

    // 1. 计算采购需求（复用现有逻辑）
    const requirements = await this.calculatePurchaseRequirements(startDate, end);

    // 2. 查询影响的订单（用于预览）
    const start_date = new Date(`${startDate}T00:00:00`);
    const end_date = new Date(`${end}T23:59:59.999`);
    const { list: orders } = await this.orderRepository.findByTargetProductionDateRange({
      status: OrderStatus.PAID,
      startDate: start_date,
      endDate: end_date,
    });

    // 3. 组装订单信息
    const affectedOrders = orders.map(order => ({
      orderId: order.id,
      targetProductionDate: order.targetProductionDate?.toISOString().split('T')[0] || '',
    }));

    // 4. 组装返回数据（只返回必要的信息）
    const items = requirements.map(req => ({
      ingredientId: req.ingredientId,
      ingredientName: req.ingredientName,
      quantityNeeded: req.quantityNeeded,
      quantityUnit: req.quantityUnit,
      type: req.type,
      displayUnit: req.displayUnit,
      purchaseChannel: req.purchaseChannel,
      productModel: req.productModel,
    }));

    return {
      targetDateRange: { start: startDate, end },
      itemCount: requirements.length,
      items,
      affectedOrders,
    };
  }

  /**
   * 生成采购清单
   */
  async generatePurchaseList(
    dto: GeneratePurchaseListDto,
    createdById: string
  ): Promise<PurchaseList> {
    const end = dto.endDate || dto.startDate;

    // 为targetProductionDate查询创建范围（使用午夜00:00:00，因为数据库中存储的是午夜时间）
    const queryStartDate = new Date(`${dto.startDate}T00:00:00`);
    const queryEndDate = new Date(`${end}T23:59:59.999`);

    // 为采购清单的targetDate创建中午12点时间（与其他模块保持一致）
    const targetDate = new Date(`${dto.startDate}T12:00:00`);

    // 验证日期格式
    if (isNaN(queryStartDate.getTime()) || isNaN(queryEndDate.getTime())) {
      throw new BadRequestException(
        `日期格式无效。期望格式：YYYY-MM-DD，实际值：${dto.startDate}`
      );
    }

    // 验证日期范围
    if (queryEndDate < queryStartDate) {
      throw new BadRequestException('结束日期不能早于开始日期');
    }

    // 检查是否已存在该日期范围的采购清单（使用中午12点的时间）
    const { start: checkStart, end: checkEnd } = DateUtil.createDateRange(dto.startDate);
    const exists = await this.purchaseListRepository.existsByDateRange(checkStart, checkEnd);
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
      startDate: queryStartDate,
      endDate: queryEndDate,
    });
    const sourceOrderIds = orders.map(o => o.id);

    // 转换订单状态：PAID → PURCHASING
    let transitionedCount = 0;
    for (const order of orders) {
      try {
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);
        transitionedCount++;
        this.logger.log(`Order ${order.id} transitioned from PAID to PURCHASING`);
      } catch (error) {
        this.logger.error(`Failed to transition order ${order.id} to PURCHASING: ${error}`);
      }
    }
    this.logger.log(`Transitioned ${transitionedCount}/${orders.length} orders to PURCHASING status`);

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

    // 保存订单日期快照
    const orderDateSnapshot: Record<string, { originalDate: string; hasChanged: boolean }> = {};
    for (const order of orders) {
      orderDateSnapshot[order.id] = {
        originalDate: order.targetProductionDate?.toISOString().split('T')[0] || '',
        hasChanged: false,
      };
    }

    // 创建采购清单（使用中午12点的targetDate）
    const purchaseList = new PurchaseList({
      targetDate: targetDate,
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost,
      itemCount: items.length,
      createdById,
      sourceOrderIds,
      orderDateSnapshot,
      items,
    });

    // 保存到数据库
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Purchase list ${saved.id} created successfully with ${items.length} items`);

    return saved;
  }

  /**
   * 追加订单到采购清单
   */
  async addOrdersToPurchaseList(
    purchaseListId: string,
    orderIds: string[],
    operatorId: string
  ): Promise<{
    addedCount: number;
    newItems: PurchaseItem[];
    updatedItems: PurchaseItem[];
    purchaseList: PurchaseList;
  }> {
    this.logger.log(`Adding ${orderIds.length} orders to purchase list ${purchaseListId}`);

    // 1. 验证采购清单状态
    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);
    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 只有PENDING状态可以追加订单
    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以追加订单');
    }

    // 2. 查询订单并验证状态
    const orderPromises = orderIds.map(id => this.orderRepository.findById(id));
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter(o => o !== null) as Order[];
    const validOrders = orders.filter(o => o.status === OrderStatus.PAID);

    if (validOrders.length === 0) {
      throw new BadRequestException('没有可追加的PAID状态订单');
    }

    this.logger.log(`Found ${validOrders.length}/${orders.length} valid PAID orders to add`);

    // 3. 计算新增订单的原料需求
    const ingredientMap = new Map<string, any>();

    for (const order of validOrders) {
      if (!order.pricingBreakdownSnapshot) {
        this.logger.warn(`Order ${order.id} has no pricing breakdown snapshot, skipping`);
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;

        if (purchaseQuantity <= 0) continue;

        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key);
          existing.quantityNeeded += purchaseQuantity;
          existing.estimatedCost += detail.cost || 0;
        } else {
          ingredientMap.set(key, {
            ingredientId: key,
            ingredientName: detail.name,
            type: detail.type || 'FOOD',
            quantityNeeded: purchaseQuantity,
            quantityUnit: detail.unit || 'G',
            estimatedCost: detail.cost || 0,
            purchaseChannel: detail.purchaseChannel,
            productModel: detail.productModel,
            displayUnit: detail.displayUnit,
          });
        }
      }
    }

    // 4. 合并到现有采购清单
    const existingItemMap = new Map(purchaseList.items.map(item => [item.ingredientId, item]));

    const newItems: PurchaseItem[] = [];
    const updatedItems: PurchaseItem[] = [];

    for (const [ingredientId, requirement] of ingredientMap) {
      if (existingItemMap.has(ingredientId)) {
        // 更新现有项
        const existing = existingItemMap.get(ingredientId)!;
        existing.quantityNeeded += requirement.quantityNeeded;
        existing.estimatedCost = Number(existing.estimatedCost) + requirement.estimatedCost;
        updatedItems.push(existing);
      } else {
        // 新增项
        const newItem = new PurchaseItem({
          purchaseListId,
          ingredientId: requirement.ingredientId,
          ingredientName: requirement.ingredientName,
          type: requirement.type,
          quantityNeeded: requirement.quantityNeeded,
          quantityUnit: requirement.quantityUnit,
          estimatedCost: requirement.estimatedCost,
          purchaseChannel: requirement.purchaseChannel,
          productModel: requirement.productModel,
          displayUnit: requirement.displayUnit,
        });
        purchaseList.items.push(newItem);
        newItems.push(newItem);
      }
    }

    // 5. 更新采购清单汇总
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost = purchaseList.items.reduce(
      (sum, item) => sum + Number(item.estimatedCost),
      0
    );
    purchaseList.sourceOrderIds = [
      ...new Set([...purchaseList.sourceOrderIds, ...validOrders.map(o => o.id)]),
    ];

    // 6. 转换订单状态
    let transitionedCount = 0;
    for (const order of validOrders) {
      try {
        order.transitionTo(OrderStatus.PURCHASING);
        await this.orderRepository.save(order);
        transitionedCount++;
        this.logger.log(`Order ${order.id} transitioned from PAID to PURCHASING`);
      } catch (error) {
        this.logger.error(`Failed to transition order ${order.id} to PURCHASING: ${error}`);
      }
    }

    // 7. 保存采购清单
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Added ${validOrders.length} orders to purchase list ${purchaseListId}`);

    return {
      addedCount: validOrders.length,
      newItems,
      updatedItems,
      purchaseList: saved,
    };
  }

  /**
   * 从采购清单剔除订单
   */
  async removeOrdersFromPurchaseList(
    purchaseListId: string,
    orderIds: string[],
    operatorId: string
  ): Promise<{
    removedCount: number;
    affectedItems: Array<{
      ingredientId: string;
      ingredientName: string;
      oldQuantity: number;
      newQuantity: number;
    }>;
    purchaseList: PurchaseList;
  }> {
    this.logger.log(`Removing ${orderIds.length} orders from purchase list ${purchaseListId}`);

    // 1. 验证采购清单
    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);
    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以剔除订单');
    }

    // 2. 验证订单是否在清单中
    const validOrderIds = orderIds.filter(id => purchaseList.sourceOrderIds.includes(id));

    if (validOrderIds.length === 0) {
      throw new BadRequestException('这些订单不在当前采购清单中');
    }

    // 3. 查询被剔除的订单
    const orderPromises = validOrderIds.map(id => this.orderRepository.findById(id));
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter(o => o !== null) as Order[];

    // 4. 计算被剔除订单的原料需求（用于扣减）
    const ingredientDeductionMap = new Map<string, number>();
    const ingredientCostMap = new Map<string, number>();

    for (const order of orders) {
      if (!order.pricingBreakdownSnapshot) {
        continue;
      }

      const pricingBreakdown = order.pricingBreakdownSnapshot as any;
      const ingredientDetails = pricingBreakdown.ingredientDetails || [];

      for (const detail of ingredientDetails) {
        const key = detail.ingredientId;
        const purchaseQuantity = detail.purchaseAmount || detail.amount || 0;
        const cost = detail.cost || 0;

        if (purchaseQuantity <= 0) continue;

        ingredientDeductionMap.set(key, (ingredientDeductionMap.get(key) || 0) + purchaseQuantity);
        ingredientCostMap.set(key, (ingredientCostMap.get(key) || 0) + cost);
      }
    }

    // 5. 更新采购清单项
    const affectedItems: Array<{
      ingredientId: string;
      ingredientName: string;
      oldQuantity: number;
      newQuantity: number;
    }> = [];

    const itemsToKeep: PurchaseItem[] = [];

    for (const item of purchaseList.items) {
      const deduction = ingredientDeductionMap.get(item.ingredientId) || 0;

      if (deduction > 0) {
        const oldQuantity = item.quantityNeeded;
        item.quantityNeeded -= deduction;

        // 如果数量为0或负数，删除该项
        if (item.quantityNeeded <= 0.01) {
          affectedItems.push({
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            oldQuantity,
            newQuantity: 0,
          });
          // 不添加到 itemsToKeep，相当于删除
        } else {
          item.estimatedCost = Number(item.estimatedCost) - (ingredientCostMap.get(item.ingredientId) || 0);
          affectedItems.push({
            ingredientId: item.ingredientId,
            ingredientName: item.ingredientName,
            oldQuantity,
            newQuantity: item.quantityNeeded,
          });
          itemsToKeep.push(item);
        }
      } else {
        itemsToKeep.push(item);
      }
    }

    purchaseList.items = itemsToKeep;

    // 6. 更新采购清单汇总
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost = purchaseList.items.reduce(
      (sum, item) => sum + Number(item.estimatedCost),
      0
    );
    purchaseList.sourceOrderIds = purchaseList.sourceOrderIds.filter(id => !validOrderIds.includes(id));

    // 7. 回退订单状态
    let restoredCount = 0;
    for (const order of orders) {
      if (order.status === OrderStatus.PURCHASING) {
        try {
          order.transitionTo(OrderStatus.PAID);
          await this.orderRepository.save(order);
          restoredCount++;
          this.logger.log(`Order ${order.id} transitioned from PURCHASING to PAID`);
        } catch (error) {
          this.logger.error(`Failed to restore order ${order.id} to PAID: ${error}`);
        }
      }
    }

    // 8. 保存采购清单
    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Removed ${orders.length} orders from purchase list ${purchaseListId}`);

    return {
      removedCount: orders.length,
      affectedItems,
      purchaseList: saved,
    };
  }

  /**
   * 添加原料到采购清单（人工添加）
   */
  async addManualItem(
    purchaseListId: string,
    dto: {
      ingredientId: string;
      ingredientName: string;
      type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
      quantityNeeded: number;
      quantityUnit: string;
      estimatedCost: number;
      purchaseChannel?: string;
      productModel?: string;
    },
    operatorId: string
  ): Promise<PurchaseList> {
    this.logger.log(`Adding manual item to purchase list ${purchaseListId}`);

    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以添加原料');
    }

    // 检查原料是否已存在
    const existingItem = purchaseList.items.find(item => item.ingredientId === dto.ingredientId);

    if (existingItem) {
      throw new BadRequestException('该原料已在清单中，请使用追加订单功能');
    }

    // 创建新原料项
    const newItem = new PurchaseItem({
      purchaseListId,
      ingredientId: dto.ingredientId,
      ingredientName: dto.ingredientName,
      type: dto.type,
      quantityNeeded: dto.quantityNeeded,
      quantityUnit: dto.quantityUnit,
      estimatedCost: dto.estimatedCost,
      purchaseChannel: dto.purchaseChannel,
      productModel: dto.productModel,
    });

    purchaseList.items.push(newItem);
    purchaseList.itemCount = purchaseList.items.length;
    purchaseList.totalEstimatedCost = Number(purchaseList.totalEstimatedCost) + dto.estimatedCost;

    const saved = await this.purchaseListRepository.save(purchaseList);

    this.logger.log(`Added manual item ${dto.ingredientName} to purchase list ${purchaseListId}`);

    return saved;
  }

  /**
   * 从采购清单删除原料
   */
  async removeItem(
    purchaseListId: string,
    itemId: string,
    operatorId: string
  ): Promise<PurchaseList> {
    this.logger.log(`Removing item ${itemId} from purchase list ${purchaseListId}`);

    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以删除原料');
    }

    const itemIndex = purchaseList.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      throw new BadRequestException('原料项不存在');
    }

    const item = purchaseList.items[itemIndex];

    // 从items数组中移除
    const updatedItems = [...purchaseList.items];
    updatedItems.splice(itemIndex, 1);

    // 创建更新后的PurchaseList对象
    const updatedList = new PurchaseList({
      ...purchaseList,
      items: updatedItems,
      itemCount: updatedItems.length,
      totalEstimatedCost: Number(purchaseList.totalEstimatedCost) - Number(item.estimatedCost),
    });

    // 使用repository的原始Prisma访问直接删除原料项并更新清单
    const saved = await (this.purchaseListRepository as any).deleteItemAndUpdate(purchaseListId, itemId, updatedList);

    return saved;
  }

  /**
   * 重新计算采购清单需求（恢复被删除的原料）
   */
  async recalculatePurchaseList(
    purchaseListId: string,
    operatorId: string
  ): Promise<PurchaseList> {
    this.logger.log(`Recalculating purchase list ${purchaseListId}`);

    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    if (purchaseList.status !== PurchaseListStatus.PENDING) {
      throw new BadRequestException('只有待采购状态的清单可以重新计算需求');
    }

    // 获取采购清单的targetDate
    const targetDate = new Date(purchaseList.targetDate);
    const startDate = targetDate.toISOString().split('T')[0];
    const endDate = startDate;

    // 计算原始原料需求（基于订单）
    const calculatedRequirements = await this.calculatePurchaseRequirements(startDate, endDate);

    if (calculatedRequirements.length === 0) {
      throw new BadRequestException('没有找到可以纳入的订单');
    }

    // 分离手动添加的原料和自动生成的原料
    const manualItems = purchaseList.items.filter(item =>
      item.ingredientId && item.ingredientId.startsWith('manual-')
    );

    // 合并手动添加的原料和重新计算的原料
    const mergedItemsMap = new Map<string, any>();

    // 先添加重新计算的原料
    for (const req of calculatedRequirements) {
      mergedItemsMap.set(req.ingredientId, {
        ingredientId: req.ingredientId,
        ingredientName: req.ingredientName,
        type: req.type,
        quantityNeeded: req.quantityNeeded,
        quantityUnit: req.quantityUnit,
        estimatedCost: req.estimatedCost,
        purchaseChannel: req.purchaseChannel,
        productModel: req.productModel,
      });
    }

    // 再添加手动添加的原料（避免覆盖，但需要合并数量）
    for (const manualItem of manualItems) {
      const existing = mergedItemsMap.get(manualItem.ingredientId);
      if (existing) {
        // 如果该原料既在订单中又手动添加了，累加数量
        mergedItemsMap.set(manualItem.ingredientId, {
          ...existing,
          quantityNeeded: existing.quantityNeeded + manualItem.quantityNeeded,
          estimatedCost: existing.estimatedCost + manualItem.estimatedCost,
        });
      } else {
        // 仅手动添加的原料
        mergedItemsMap.set(manualItem.ingredientId, manualItem);
      }
    }

    // 转换为数组并计算总成本
    const mergedItems = Array.from(mergedItemsMap.values());
    const totalCost = mergedItems.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0);

    // 创建更新后的采购清单
    const updatedList = new PurchaseList({
      ...purchaseList,
      items: mergedItems.map(item => new PurchaseItem({
        id: `recalc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 生成新ID
        purchaseListId: purchaseList.id,
        ...item,
      })),
      itemCount: mergedItems.length,
      totalEstimatedCost: totalCost,
    });

    // 保存到数据库
    const saved = await (this.purchaseListRepository as any).recalculateItems(purchaseListId, updatedList);

    this.logger.log(`Recalculated purchase list ${purchaseListId}: ${mergedItems.length} items`);

    return saved;
  }

  /**
   * 删除采购清单
   */
  async deletePurchaseList(
    purchaseListId: string,
    operatorId: string
  ): Promise<{
    deletedId: string;
    restoredOrdersCount: number;
  }> {
    this.logger.log(`Deleting purchase list ${purchaseListId}`);

    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 检查是否已关联报销单
    if (purchaseList.reimbursementId) {
      throw new BadRequestException('已关联报销单的采购清单不能删除');
    }

    // 检查状态
    if (purchaseList.status === PurchaseListStatus.COMPLETED) {
      throw new BadRequestException('已完成的采购清单不能删除');
    }

    // 回退订单状态（PURCHASING → PAID）
    const orderPromises = purchaseList.sourceOrderIds.map(id => this.orderRepository.findById(id));
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter(o => o !== null) as Order[];
    let restoredCount = 0;

    for (const order of orders) {
      if (order.status === OrderStatus.PURCHASING) {
        try {
          order.transitionTo(OrderStatus.PAID);
          await this.orderRepository.save(order);
          restoredCount++;
          this.logger.log(`Order ${order.id} restored to PAID`);
        } catch (error) {
          this.logger.error(`Failed to restore order ${order.id}: ${error}`);
        }
      }
    }

    // 删除采购清单
    await this.purchaseListRepository.delete(purchaseListId);

    this.logger.log(`Deleted purchase list ${purchaseListId}, restored ${restoredCount} orders`);

    return {
      deletedId: purchaseListId,
      restoredOrdersCount: restoredCount,
    };
  }

  /**
   * 检查采购清单中订单的制作日期是否发生变更
   */
  async checkOrderDateChanges(
    purchaseListId: string
  ): Promise<{
    hasChanges: boolean;
    changedOrders: Array<{
      orderId: string;
      originalDate: string;
      currentDate: string;
    }>;
  }> {
    this.logger.log(`Checking order date changes for purchase list ${purchaseListId}`);

    const purchaseList = await this.purchaseListRepository.findById(purchaseListId);

    if (!purchaseList) {
      throw new BadRequestException('采购清单不存在');
    }

    // 从快照中获取原始日期（如果已保存）
    const dateSnapshot = purchaseList.orderDateSnapshot as any || {};

    // 查询当前订单
    const orderPromises = purchaseList.sourceOrderIds.map(id => this.orderRepository.findById(id));
    const orderResults = await Promise.all(orderPromises);
    const orders = orderResults.filter(o => o !== null) as Order[];

    const changedOrders: Array<{
      orderId: string;
      originalDate: string;
      currentDate: string;
    }> = [];

    for (const order of orders) {
      const originalDate = dateSnapshot[order.id]?.originalDate;
      const currentDate = order.targetProductionDate?.toISOString().split('T')[0] || '';

      // 如果没有快照记录，首次检测
      if (!originalDate) {
        continue;
      }

      // 比较日期
      if (originalDate !== currentDate) {
        changedOrders.push({
          orderId: order.id,
          originalDate,
          currentDate,
        });
      }
    }

    this.logger.log(`Found ${changedOrders.length} orders with date changes`);

    return {
      hasChanges: changedOrders.length > 0,
      changedOrders,
    };
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
