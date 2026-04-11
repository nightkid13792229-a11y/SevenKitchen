/**
 * Order Application Service
 * Application layer service for Order domain operations
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Order, OrderItem, PricingBreakdownSnapshot } from '../../domain/order';
import type { PriceExplanationDto } from '../../interfaces/dto/orders/pricing-preview.dto';
import {
  OrderType,
  OrderStatus,
  calculateDogEnergy,
  calculateDailyIntakeG,
} from '../../domain';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { ORDER_REPOSITORY } from './order.service.tokens';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import {
  PricingService,
  type RecipeItem as PricingRecipeItem,
} from '../../domain/pricing/pricing.service';
import { GlobalConfigService } from '../config/global-config.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import { DOG_REPOSITORY } from '../dog/dog.service';
import { ShippingService } from '../shipping/shipping.service';
import type { AddressRepository } from '../../domain/address/address.repository';
import { ADDRESS_REPOSITORY } from '../address/address.service';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { OrderStatusHistory } from '../../domain/order/order-status-history.entity';
import { ORDER_STATUS_HISTORY_REPOSITORY } from './order.service.tokens';
import { ValidationError } from '../../domain/common/errors';
// import type { CartRepository } from '../../domain/cart';  // Cart功能已移除
import type { IOrderPricingSnapshotRepository } from '../../domain/order-pricing-snapshot/order-pricing-snapshot.repository.interface';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import {
  extractLegacyPreparationMethodIds,
  resolvePreparationMethodText,
  resolvePreparationMethodTokens,
} from '../recipe/preparation-method-text.util';

// Re-export for convenience
export { ORDER_REPOSITORY, ORDER_STATUS_HISTORY_REPOSITORY };
import { RECIPE_REPOSITORY } from '../dog/dog.service';

export interface CreateOrderDraftDto {
  customerId: string;
  dogId?: string;
  type: OrderType;
  targetProductionDate?: Date | null;
  items?: CreateOrderItemDto[];
  cartItemIds?: string[];
  snapshotId?: string; // ✅ 新增：快照ID（立即购买）
  addressId?: string;
}

export interface CreateOrderItemDto {
  recipeId: string;
  quantityG: number;
  packageCount?: number; // Optional - will be computed if missing
  packageSpecG: number;
  cycleDays?: number; // Order cycle days
  dailyIntakeG?: number; // Daily food intake in grams
  customRequirements?: string | null;
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
    @Inject(ORDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: OrderStatusHistoryRepository,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: RecipeRepository,
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: IngredientRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepository: DogRepository,
    private readonly pricingService: PricingService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly shippingService: ShippingService,
    @Inject(ADDRESS_REPOSITORY)
    private readonly addressRepository: AddressRepository,
    // @Inject('CartRepository')
    // private readonly cartRepository: CartRepository,  // Cart功能已移除
    @Inject('IOrderPricingSnapshotRepository')
    private readonly pricingSnapshotRepository: IOrderPricingSnapshotRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(
      methods.map((method: { id: string; name: string }) => [
        method.id,
        method.name,
      ]),
    );
  }

  /**
   * Log order status transition to history
   * Phase 8.18: Order Status History & Audit Trail
   */
  private async logStatusTransition(
    order: Order,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    actor: 'customer' | 'staff' | 'admin' | 'system',
    actorId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<void> {
    // Phase 8.18: Log status transition to history
    // Repository should always be available when Prisma is enabled
    if (!this.statusHistoryRepository) {
      console.error(
        `[CRITICAL] OrderStatusHistoryRepository not injected! Cannot log transition for order ${order.id}: ${fromStatus} -> ${toStatus}`,
      );
      // Don't throw - allow operation to continue, but log the issue
      return;
    }

    try {
      await this.statusHistoryRepository.append(
        order.id,
        fromStatus,
        toStatus,
        actor,
        actorId,
        metadata,
      );
    } catch (error) {
      // Phase 8.18: Log errors at ERROR level and re-throw to prevent silent failures
      console.error(
        `[History] ERROR: Failed to log status transition for order ${order.id} (${fromStatus} -> ${toStatus}):`,
        error,
      );
      // Log full error details
      if (error instanceof Error) {
        console.error('[History] Error message:', error.message);
        if (error.stack) {
          console.error('[History] Error stack:', error.stack);
        }
      }
      // Re-throw to fail fast and prevent silent failures
      // This ensures E2E tests catch history insertion failures
      throw error;
    }
  }

  /**
   * Normalize packageCount: compute if missing, validate inputs
   * Business logic: packageCount = ceil(quantityG / packageSpecG) when not provided
   * @throws BadRequestException if packageSpecG is invalid or packageCount cannot be computed
   */
  private normalizePackageCount(
    quantityG: number,
    packageCount: number | undefined,
    packageSpecG: number | undefined,
  ): number {
    // If packageCount is provided, validate and return it
    if (packageCount !== undefined && packageCount !== null) {
      const normalized = Math.floor(packageCount);
      if (normalized < 1) {
        throw new BadRequestException(
          `packageCount must be >= 1, got: ${packageCount}`,
        );
      }
      return normalized;
    }

    // If packageCount is missing, compute from quantityG and packageSpecG
    if (!packageSpecG || packageSpecG <= 0) {
      throw new BadRequestException(
        `packageSpecG is required and must be > 0 when packageCount is not provided. Got: ${packageSpecG}`,
      );
    }

    const computed = Math.ceil(quantityG / packageSpecG);
    if (computed < 1) {
      throw new BadRequestException(
        `Computed packageCount must be >= 1. quantityG=${quantityG}, packageSpecG=${packageSpecG}, computed=${computed}`,
      );
    }

    return computed;
  }

  /**
   * Create order draft
   * Creates order in INIT status with recipe snapshots and calculated pricing
   * Phase 5: Integrates ingredient costing and pricing calculation
   * Supports creating from cart items (when cartItemIds is provided)
   */
  async createOrderDraft(dto: CreateOrderDraftDto): Promise<Order> {
    const orderId = randomUUID();

    // ✅ Priority 1: 如果提供 snapshotId，从快照创建（立即购买）
    if (dto.snapshotId) {
      return this.createOrderFromSnapshot(dto, dto.snapshotId, orderId);
    }

    // Priority 2: 如果提供 cartItemIds，从购物车创建
    if (dto.cartItemIds && dto.cartItemIds.length > 0) {
      return this.createOrderFromCart(dto, orderId);
    }

    // Priority 3: 从items参数创建（DEPRECATED - 仅用于向后兼容）
    return this.createOrderFromItems(dto, orderId);
  }

  /**
   * Create order from pricing snapshot (IMMEDIATE BUY - security enhancement)
   * Phase: Price tampering prevention
   */
  private async createOrderFromSnapshot(
    dto: CreateOrderDraftDto,
    snapshotId: string,
    orderId: string,
  ): Promise<Order> {
    console.log('[CreateOrderFromSnapshot] Loading snapshot:', snapshotId);

    // 1. 验证快照
    const snapshot = await this.pricingSnapshotRepository.findById(snapshotId);

    if (!snapshot) {
      throw new NotFoundException('Pricing snapshot not found or expired');
    }

    if (!snapshot.belongsToCustomer(dto.customerId)) {
      throw new BadRequestException(
        'Pricing snapshot does not belong to this customer',
      );
    }

    if (!snapshot.canBeUsed()) {
      if (snapshot.used) {
        throw new BadRequestException('Pricing snapshot already used');
      }
      if (snapshot.isExpired()) {
        throw new BadRequestException('Pricing snapshot has expired');
      }
    }

    // 2. 处理制作日期
    let productionDate = dto.targetProductionDate;

    // 默认值：如果未提供制作日期，根据上海时区判断（0-6点当日，6-24点次日）
    if (!productionDate) {
      productionDate = TimezoneUtil.calculateProductionDate();
      console.log(
        '[CreateOrderFromSnapshot] No production date provided, calculated from Shanghai timezone:',
        productionDate.toISOString(),
      );
    } else {
      // 如果提供了日期，将时间部分清零（使用UTC时间）
      const year = productionDate.getUTCFullYear();
      const month = productionDate.getUTCMonth();
      const day = productionDate.getUTCDate();
      productionDate = new Date(Date.UTC(year, month, day));
    }

    // 验证：制作日期不能早于今天（使用UTC日期）
    const today = new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );
    if (productionDate < today) {
      throw new BadRequestException('制作日期不能早于今天');
    }

    // 验证：制作日期不能超过90天
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    maxDate.setHours(0, 0, 0, 0);
    if (productionDate > maxDate) {
      throw new BadRequestException('制作日期不能超过90天后');
    }

    console.log(
      '[CreateOrderFromSnapshot] Production date validated:',
      productionDate.toISOString(),
    );

    // 3. 从快照获取数据
    const { requestParams, pricingResult } = snapshot;
    const itemParams = requestParams.items[0]; // MVP: 只支持单商品

    // ✅ 修复：从快照的requestParams中获取addressId（如果快照中有）
    const addressId = requestParams.addressId || dto.addressId;

    console.log(
      '[CreateOrderFromSnapshot] Request params:',
      JSON.stringify(requestParams, null, 2),
    );
    console.log('[CreateOrderFromSnapshot] Using pricing from snapshot:', {
      amountProduct: pricingResult.amountProduct,
      amountShipping: pricingResult.amountShipping,
      amountTotal: pricingResult.amountTotal,
    });

    // 4. 加载必要的数据（recipe, dog, address）
    const recipe = await this.recipeRepository.findById(itemParams.recipeId);
    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${itemParams.recipeId}`);
    }

    console.log(
      '[CreateOrderFromSnapshot] Loading dog with ID:',
      requestParams.dogId,
    );
    const dog = await this.dogRepository.findById(requestParams.dogId);
    if (!dog) {
      throw new NotFoundException(`Dog not found: ${requestParams.dogId}`);
    }
    console.log('[CreateOrderFromSnapshot] Dog loaded:', dog.name);

    // 5. 验证狗狗所有权（确保狗狗属于当前用户）
    if (dog.ownerId !== dto.customerId) {
      throw new BadRequestException('Dog does not belong to this customer');
    }

    // 6. 验证地址（如果提供了addressId）
    if (addressId) {
      const address = await this.addressRepository.findById(addressId);
      if (!address) {
        throw new NotFoundException('Address not found');
      }
      // 验证地址所有权
      if (address.userId !== dto.customerId) {
        throw new BadRequestException(
          'Address does not belong to this customer',
        );
      }
      console.log(
        '[CreateOrderFromSnapshot] Address validated:',
        address.recipientName,
      );
    }

    // 7. 创建 RecipeSnapshot
    const recipeItems = recipe.items || [];
    const ingredientIds = recipeItems.map((ri) => ri.ingredientId);
    const ingredients =
      await this.ingredientRepository.findByIds(ingredientIds);
    const ingredientMap = new Map(ingredients.map((ing) => [ing.id, ing]));

    const prepMethodMap = await this.loadPreparationMethodNameMap(
      recipeItems.map((item) => item.preparationMethod),
    );

    const recipeSnapshot: RecipeSnapshot = {
      id: recipe.id,
      version: recipe.version,
      name: recipe.name,
      production_loss_rate: recipe.productionLossRate,
      energy_density_kcal_per_kg: recipe.energyDensityKcalPerKg,
      nutrition_standard: 'FEDIAF_2021',
      nutrition_detailed_data: recipe.nutritionDetailedData, // 添加营养成分详细数据
      items: recipeItems.map((ri) => {
        const ingredient = ingredientMap.get(ri.ingredientId);

        // 解析制备方法ID数组并转换为名称数组
        // preparationMethod存储格式：逗号分隔的UUID字符串
        const preparationMethodNames = resolvePreparationMethodTokens(
          ri.preparationMethod,
          prepMethodMap,
          { preserveUnresolvedLegacy: false },
        );

        return {
          ingredient_id: ri.ingredientId,
          name: ingredient?.name || 'Unknown',
          ratio: ri.ratioPercent ?? 0,
          ingredient_type: ingredient?.type,
          nutrient_target_key: ri.nutrientTargetKey ?? undefined,
          nutrient_target_value: ri.nutrientTargetValue ?? undefined,
          properties: ingredient?.properties,
          preparation_methods:
            preparationMethodNames.length > 0
              ? preparationMethodNames
              : undefined,
          unit_display_label: ingredient?.unitDisplayLabel ?? undefined,
        };
      }),
    };

    // 8. 计算 dailyIntakeG
    const dogCalcResult = calculateDogEnergy(
      dog,
      recipe.energyDensityKcalPerKg,
    );
    const dailyIntakeG = calculateDailyIntakeG(
      dogCalcResult.finalFoodKcal,
      recipe.energyDensityKcalPerKg,
    );

    // 9. 创建 OrderItem
    console.log(
      '[CreateOrderFromSnapshot] Creating OrderItem with dogId:',
      requestParams.dogId,
    );

    // Extract vacuum bag spec from pricing result
    const vacuumBagSpec =
      pricingResult.pricingBreakdown?.packagingDetails?.perPackConsumables
        ?.vacuumBagSpec || null;

    const orderItem = new OrderItem(
      randomUUID(),
      orderId,
      requestParams.dogId,
      recipeSnapshot,
      itemParams.quantityG,
      itemParams.packageCount,
      itemParams.packageSpecG,
      null, // customRequirements
      dailyIntakeG,
      vacuumBagSpec, // vacuum bag specification
    );
    console.log(
      '[CreateOrderFromSnapshot] OrderItem created, dogId:',
      orderItem.dogId,
    );

    // 10. 创建 PricingBreakdownSnapshot
    const pricingBreakdownSnapshot = new PricingBreakdownSnapshot(
      pricingResult.pricingBreakdown.costIngredients,
      pricingResult.pricingBreakdown.costPackaging,
      pricingResult.pricingBreakdown.costLabor,
      pricingResult.pricingBreakdown.costOverhead,
      pricingResult.pricingBreakdown.totalProductCost,
      pricingResult.pricingBreakdown.productPrice,
      pricingResult.amountShipping,
      pricingResult.amountTotal,
      null, // shippingTemplateId
      'targetMargin_40%', // marginStrategyName (简化)
      new Date(),
      null, // ingredientPriceVersionHash
      pricingResult.pricingBreakdown.ingredientDetails, // 保存原料详情，用于采购清单
    );

    // 11. 创建订单（使用快照价格，不重新计算）
    const order = new Order(
      orderId,
      dto.customerId,
      OrderStatus.INIT,
      dto.type,
      new Date(),
      productionDate, // ✅ 使用处理后的制作日期
      productionDate, // ✅ 原始制作日期（首次创建时与当前日期相同）
      pricingResult.amountProduct, // ✅ 使用快照价格
      pricingResult.amountShipping, // ✅ 使用快照运费
      pricingResult.amountTotal, // ✅ 使用快照总价
      [orderItem],
      undefined, // totalAmount (computed by constructor)
      pricingBreakdownSnapshot,
      requestParams.dogId, // ✅ 修复：dogId 和 addressId 位置交换
      addressId, // ✅ 修复：使用从快照中获取的addressId
    );

    // 12. 保存订单
    await this.orderRepository.save(order);

    // 13. 标记快照已使用
    await this.pricingSnapshotRepository.markAsUsed(snapshotId);
    console.log(
      '[CreateOrderFromSnapshot] Snapshot marked as used:',
      snapshotId,
    );

    // 14. 记录状态转换
    await this.logStatusTransition(
      order,
      OrderStatus.INIT,
      OrderStatus.INIT,
      'customer',
      dto.customerId,
      { source: 'snapshot', snapshotId },
    );

    return order;
  }

  /**
   * Create order from cart items
   */
  private async createOrderFromCart(
    dto: CreateOrderDraftDto,
    orderId: string,
  ): Promise<Order> {
    if (!dto.cartItemIds || dto.cartItemIds.length === 0) {
      throw new BadRequestException('cartItemIds is required');
    }

    // Load cart items
    // const cartItems = await this.cartRepository.findItemsByIds(dto.cartItemIds);

    // if (cartItems.length !== dto.cartItemIds.length) {
    //   throw new NotFoundException('Some cart items not found');
    // }

    const cartItems: any[] = []; // Cart功能已移除，临时占位
    throw new BadRequestException('Cart functionality has been removed');

    /* ========== 以下代码已废弃（Cart功能移除）==========
    // Validate all cart items belong to the customer
    // const cart = await this.cartRepository.findByCustomerId(dto.customerId);
    // const cartItemIdsInCart = new Set(cart.items.map((item: any) => item.id));

    // for (const cartItem of cartItems) {
    //   if (!cartItemIdsInCart.has(cartItem.id)) {
    //     throw new BadRequestException('Cart item does not belong to customer');
    //   }
    // }

    // Get first dog from cart items (all cart items should be for the same customer)
    const firstCartItem = cartItems[0];
    const dog = await this.dogRepository.findById(firstCartItem.dogId);
    if (!dog) {
      throw new NotFoundException(`Dog not found: ${firstCartItem.dogId}`);
    }

    const orderItems: OrderItem[] = [];
    let totalProductPrice = 0;

    // Process each cart item
    for (const cartItem of cartItems) {
      const recipe = await this.recipeRepository.findById(cartItem.recipeId);
      if (!recipe) {
        throw new NotFoundException(`Recipe not found: ${cartItem.recipeId}`);
      }

      // Create order item from cart item
      const orderItem = new OrderItem(
        randomUUID(),
        orderId,
        cartItem.dogId, // Save dogId to link order item with dog
        {
          id: recipe.id,
          version: recipe.version,
          name: recipe.name,
          production_loss_rate: recipe.productionLossRate,
          energy_density_kcal_per_kg: recipe.energyDensityKcalPerKg,
          nutrition_standard: recipe.nutritionStandard || 'FEDIAF_2021',
          items: [], // Simplified for cart orders
        },
        cartItem.totalGrams,
        cartItem.packageCount,
        cartItem.packageSpecG,
        null, // customRequirements
        cartItem.dailyIntakeG,
      );

      orderItems.push(orderItem);
      totalProductPrice += cartItem.totalPrice;
    }

    // Calculate shipping fee
    const totalWeightG = orderItems.reduce((sum, item) => sum + item.quantityG, 0);
    const shippingResult = await this.shippingService.calculateShippingFeePreview({
      region: {
        province: 'default',
        city: 'default',
        district: 'default',
      },
      totalWeightG,
    });
    const shippingFee = shippingResult.amountShipping;

    // Create order
    const amountTotal = totalProductPrice + shippingFee;

    const order = new Order(
      orderId,
      dto.customerId,
      OrderStatus.INIT,
      dto.type,
      new Date(),
      dto.targetProductionDate || null,
      totalProductPrice,
      shippingFee,
      amountTotal,
      orderItems,
      undefined, // totalAmount (computed by constructor)
      undefined, // pricingBreakdownSnapshot (will be calculated on confirm)
      dto.addressId,
      dog.id, // Use first dog's ID
    );

    // Save order
    await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      order,
      OrderStatus.INIT,
      OrderStatus.INIT,
      'customer',
      dto.customerId,
      { source: 'cart' },
    );

    return order;
    ========== 废弃代码结束 ========== */
  }

  /**
   * Create order from provided items (original flow)
   */
  private async createOrderFromItems(
    dto: CreateOrderDraftDto,
    orderId: string,
  ): Promise<Order> {
    if (!dto.dogId) {
      throw new BadRequestException('dogId is required when not using cart');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('items is required when not using cart');
    }

    // Load dog profile for pricing calculation
    const dog = await this.dogRepository.findById(dto.dogId);
    if (!dog) {
      throw new NotFoundException(`Dog not found: ${dto.dogId}`);
    }

    const items: OrderItem[] = [];
    let pricing: any = null;
    let shippingFee = 0;
    let shippingTemplateId: string | null = null;

    // Calculate pricing for first item (MVP: assume single item orders)
    // In production, we'd calculate pricing per item and sum
    if (dto.items.length === 0) {
      throw new NotFoundException('Order must have at least one item');
    }

    {
      const itemDto = dto.items[0];
      const recipe = await this.recipeRepository.findById(itemDto.recipeId);
      if (!recipe) {
        throw new NotFoundException(`Recipe not found: ${itemDto.recipeId}`);
      }

      // Load ingredients for recipe items
      const recipeItems = recipe.items || [];
      const ingredientIds = recipeItems.map((ri) => ri.ingredientId);
      const ingredients =
        await this.ingredientRepository.findByIds(ingredientIds);

      const prepMethodMap = await this.loadPreparationMethodNameMap(
        recipeItems.map((item) => item.preparationMethod),
      );

      console.log('[OrderService] PreparationMethod IDs:', {
        totalItems: recipeItems.length,
        resolvedCount: prepMethodMap.size,
        resolvedIds: Array.from(prepMethodMap.keys()),
      });

      // Create map for quick lookup
      const ingredientMap = new Map(ingredients.map((ing) => [ing.id, ing]));

      // Helper function to convert preparationMethod IDs to names
      // Build enriched recipe items with ingredient objects for pricing
      const pricingRecipeItems: PricingRecipeItem[] = recipeItems.map((ri) => {
        const ingredient = ingredientMap.get(ri.ingredientId);
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient not found: ${ri.ingredientId}`,
          );
        }

        // Convert preparationMethod ID(s) to name(s)
        const prepMethodText =
          resolvePreparationMethodText(ri.preparationMethod, prepMethodMap, {
            preserveUnresolvedLegacy: false,
          }) ?? null;

        console.log('[OrderService] RecipeItem preparationMethod:', {
          ingredientName: ingredient.name,
          originalIds: ri.preparationMethod,
          mappedNames: prepMethodText,
        });

        return {
          ingredientId: ri.ingredientId,
          ingredient,
          preparationMethod: prepMethodText,
          ratioPercent: ri.ratioPercent ?? null,
          nutrientTargetKey: ri.nutrientTargetKey ?? null,
          nutrientTargetValue: ri.nutrientTargetValue ?? null,
        };
      });

      // Calculate pricing
      // For MVP, derive days and dailyG from order item
      // Assumption: quantityG = total grams, packageCount = days, packageSpecG = grams per pack
      // dailyG = total / days = quantityG / packageCount
      const globalConfig = await this.globalConfigService.getGlobalConfig();

      // Normalize packageCount (compute if missing, validate inputs)
      const normalizedPackageCount = this.normalizePackageCount(
        itemDto.quantityG,
        itemDto.packageCount,
        itemDto.packageSpecG,
      );

      // Use frontend-provided cycleDays and dailyIntakeG if available
      const days = itemDto.cycleDays ?? normalizedPackageCount;
      const dailyG = itemDto.dailyIntakeG ?? itemDto.quantityG / days;

      pricing = await this.pricingService.calculateOrderPrice({
        dog: {
          mealsPerDay: dog.mealsPerDay || 2,
        },
        recipe: {
          id: recipe.id,
          productionLossRate: recipe.productionLossRate,
          batchLaborHours: recipe.batchLaborHours || 2.0,
          items: pricingRecipeItems,
        },
        dailyG,
        days,
        discountRate: 1.0,
        globalConfig,
        singlePackSpecG: itemDto.packageSpecG, // Use frontend-provided package spec
      });

      // Calculate shipping fee if address is provided
      if (dto.addressId) {
        try {
          const address = await this.addressRepository.findById(dto.addressId);
          if (address) {
            // Calculate total shipping weight (food weight only, packaging weight will be added after pricing calculation)
            // TODO: Include packaging weight in shipping fee calculation for accurate pricing
            const totalWeightG = itemDto.quantityG;
            const shippingResult =
              await this.shippingService.calculateShippingFeePreview({
                region: address.region,
                totalWeightG,
                shippingTemplateId: null, // Use default active template
              });
            shippingFee = shippingResult.amountShipping;
            shippingTemplateId = shippingResult.templateId;
          }
        } catch (error) {
          // Address not found or shipping calculation failed - shipping fee remains 0
          console.warn('Shipping fee calculation failed:', error);
        }
      }

      // Phase 8.9: Calculate dailyIntakeG from DogCalc + Recipe energy density
      // Get DogCalc result (finalFoodKcal)
      const dogCalcResult = calculateDogEnergy(
        dog,
        recipe.energyDensityKcalPerKg,
      );

      // Calculate dailyIntakeG = finalFoodKcal / (energyDensityKcalPerKg / 1000)
      // Formula: dailyIntakeG = (finalFoodKcal / energyDensityKcalPerKg) * 1000
      const dailyIntakeG = calculateDailyIntakeG(
        dogCalcResult.finalFoodKcal,
        recipe.energyDensityKcalPerKg,
      );

      // Create RecipeSnapshot from recipe (immutable snapshot)
      // Phase 8.9: Include energyDensityKcalPerKg in snapshot for immutability
      const recipeSnapshot: RecipeSnapshot = {
        id: recipe.id,
        version: recipe.version,
        name: recipe.name,
        production_loss_rate: recipe.productionLossRate,
        energy_density_kcal_per_kg: recipe.energyDensityKcalPerKg, // CRITICAL: Captured at order time
        nutrition_standard: 'FEDIAF_2021', // TODO: Get from recipe when interface is complete
        nutrition_detailed_data: recipe.nutritionDetailedData, // 添加营养成分详细数据
        items: recipeItems.map((ri) => {
          const ingredient = ingredientMap.get(ri.ingredientId);

          // 解析制备方法ID数组并转换为名称数组
          // preparationMethod存储格式：逗号分隔的UUID字符串
          // 例如："a6409a79-402b-41d1-bfe1-031a67da0876, dd27baa4-36cb-4405-9092-0eb37e6160fa"
          const preparationMethodNames = resolvePreparationMethodTokens(
            ri.preparationMethod,
            prepMethodMap,
            { preserveUnresolvedLegacy: false },
          );

          // Debug: log supplement ingredient unit display label
          if (ingredient?.type === 'SUPPLEMENT') {
            console.log(
              `[DEBUG] Supplement: ${ingredient.name}, unitDisplayLabel: ${ingredient.unitDisplayLabel}`,
            );
          }

          return {
            ingredient_id: ri.ingredientId,
            name: ingredient?.name || 'Unknown',
            ratio: ri.ratioPercent ?? 0,
            ingredient_type: ingredient?.type,
            nutrient_target_key: ri.nutrientTargetKey ?? undefined,
            nutrient_target_value: ri.nutrientTargetValue ?? undefined,
            properties: ingredient?.properties,
            preparation_methods:
              preparationMethodNames.length > 0
                ? preparationMethodNames
                : undefined,
            sort_order: ri.sortOrder ?? undefined,
            unit_display_label: ingredient?.unitDisplayLabel ?? undefined,
          };
        }),
      };

      const itemId = randomUUID();
      // Use normalized packageCount (already computed above)
      // Phase 8.9: Include calculated dailyIntakeG (immutable after order creation)

      // Extract vacuum bag spec from pricing result
      const vacuumBagSpec =
        pricing.pricingBreakdown?.packagingDetails?.perPackConsumables
          ?.vacuumBagSpec || null;

      const orderItem = new OrderItem(
        itemId,
        orderId,
        dto.dogId, // Save dogId to link order item with dog
        recipeSnapshot,
        itemDto.quantityG,
        normalizedPackageCount,
        itemDto.packageSpecG,
        typeof itemDto.customRequirements === 'string'
          ? itemDto.customRequirements
          : itemDto.customRequirements !== null &&
              itemDto.customRequirements !== undefined
            ? JSON.stringify(itemDto.customRequirements)
            : null,
        dailyIntakeG, // Calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg
        vacuumBagSpec, // vacuum bag specification
      );

      items.push(orderItem);
    }

    if (!pricing) {
      throw new NotFoundException('Failed to calculate pricing');
    }

    // Calculate amounts from pricing
    const amountProduct = pricing.productPrice;
    const amountShipping = shippingFee;
    const amountTotal = amountProduct + amountShipping;

    // Debug logging for pricing discrepancy
    console.log('[Create Order From Items] Pricing calculation:');
    console.log('  productPrice:', pricing.productPrice);
    console.log('  shippingFee:', shippingFee);
    console.log('  amountProduct:', amountProduct);
    console.log('  amountShipping:', amountShipping);
    console.log('  amountTotal:', amountTotal);
    console.log('  Input params:', {
      quantityG: dto.items[0].quantityG,
      packageCount: dto.items[0].packageCount,
      packageSpecG: dto.items[0].packageSpecG,
      cycleDays: dto.items[0].cycleDays,
      dailyIntakeG: dto.items[0].dailyIntakeG,
    });

    // Phase 7.1: Create pricing breakdown snapshot
    const globalConfig = await this.globalConfigService.getGlobalConfig();
    const marginStrategyName = `targetMargin_${(globalConfig.targetMargin * 100).toFixed(0)}%`;
    const pricingBreakdownSnapshot = new PricingBreakdownSnapshot(
      pricing.costIngredients,
      pricing.costPackaging,
      pricing.costLabor,
      pricing.costOverhead,
      pricing.totalProductCost,
      pricing.productPrice,
      shippingFee,
      amountTotal,
      shippingTemplateId,
      marginStrategyName,
      new Date(),
      null, // ingredientPriceVersionHash - not available in in-memory repos
      pricing.ingredientDetails, // 保存原料详情，用于采购清单
    );

    const order = new Order(
      orderId,
      dto.customerId,
      OrderStatus.INIT,
      dto.type,
      new Date(),
      dto.targetProductionDate ?? null,
      dto.targetProductionDate ?? null, // 原始制作日期
      amountProduct,
      amountShipping,
      amountTotal,
      items,
      undefined, // totalAmount (legacy)
      pricingBreakdownSnapshot,
      dto.dogId,
      dto.addressId,
    );

    return this.orderRepository.save(order);
  }

  /**
   * Confirm order (submit for payment)
   * Transitions INIT → PENDING_PAYMENT
   */
  async confirmOrder(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'customer',
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.transitionTo(OrderStatus.PENDING_PAYMENT);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.PENDING_PAYMENT,
      actor,
      actorId,
    );

    return savedOrder;
  }

  /**
   * Process payment (mock implementation)
   * Phase 8.17: Payment Transaction Tracking
   * Transitions PENDING_PAYMENT → PAID and records payment transaction
   * Phase 8.18: Logs status transition to history
   * @param orderId Order ID
   * @param paymentMethod Payment method (defaults to "WECHAT" if not provided)
   * @param actor Who is processing the payment (defaults to "customer")
   * @param actorId Actor ID (e.g., customerId)
   * @returns Updated order with payment tracking fields set
   */
  async processPayment(
    orderId: string,
    paymentMethod: string = 'WECHAT',
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'customer',
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    // Idempotency: if already paid, return existing order (no history log for idempotent calls)
    if (order.status === OrderStatus.PAID) {
      return order;
    }

    const fromStatus = order.status;

    // Generate mock transaction ID: MOCK_<timestamp>_<random>
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const transactionId = `MOCK_${timestamp}_${random}`;

    // Record payment (sets paymentStatus, paidAt, transactionId, paymentMethod, and transitions to PAID)
    order.recordPayment(paymentMethod, transactionId);

    const savedOrder = await this.orderRepository.save(order);

    // Log status transition with payment metadata
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.PAID,
      actor,
      actorId,
      {
        paymentMethod,
        transactionId,
      },
    );

    return savedOrder;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    return this.orderRepository.findById(orderId);
  }

  /**
   * Get order item snapshot
   */
  async getOrderItemSnapshot(
    orderId: string,
    itemId: string,
  ): Promise<RecipeSnapshot | null> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      return null;
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      return null;
    }

    // Return immutable snapshot
    return item.recipeSnapshot;
  }

  /**
   * List orders by customer ID
   * Returns all orders for the given customer
   */
  async listOrdersByCustomerId(customerId: string): Promise<Order[]> {
    return this.orderRepository.findByCustomerId(customerId);
  }

  /**
   * Preview pricing for an order (without creating it)
   * Phase 6: Pricing Preview API
   * Returns pricing breakdown including product amount, shipping amount, and total
   */
  async previewPricing(dto: CreateOrderDraftDto): Promise<{
    amountProduct: number;
    amountShipping: number;
    amountTotal: number;
    snapshotId: string; // ✅ 新增：快照ID
    pricingBreakdown?: {
      costIngredients: number;
      costPackaging: number;
      costLabor: number;
      costOverhead: number;
      totalProductCost: number;
      productPrice: number;
      weightPackagingG?: number;
      ingredientDetails?: Array<{
        name: string;
        type: string;
        amount: number;
        unit: string;
        unitCost: number;
        cost: number;
        calculation: string;
      }>;
      packagingDetails?: {
        perPackConsumables: {
          vacuumBagName: string;
          vacuumBagSpec: string;
          labelName: string;
          labelSpec: string;
          vacuumBagCostPerPack: number;
          labelCostPerPack: number;
          vacuumBagTotalCost: number;
          labelTotalCost: number;
          totalCost: number;
          weightPerPack: number;
          calculation: string;
          vacuumBagsCount: number;
          labelsCount: number;
        };
        shippingContainers: Array<{
          boxName: string;
          boxSpec: string;
          thermalBagName: string;
          thermalBagSpec: string;
          icePacks: number;
          boxCost: number;
          thermalBagCost: number;
          icePackCost: number;
          totalCost: number;
          weight: number;
          boxesCount: number;
          thermalBagsCount: number;
          calculation: string;
        }>;
      };
      laborDetails?: {
        standardBatchOutputKg: number;
        standardLaborCostPerKg: number;
        rawInputWeightKg: number;
        totalCost: number;
        calculation: string;
      };
      overheadDetails?: {
        overheadCostPerKg: number;
        rawInputWeightKg: number;
        totalCost: number;
        calculation: string;
      };
    } | null;
  }> {
    // Load dog profile
    const dog = await this.dogRepository.findById(dto.dogId!);
    if (!dog) {
      throw new NotFoundException(`Dog not found: ${dto.dogId}`);
    }

    // Calculate pricing for first item (MVP: assume single item orders)
    if (!dto.items || dto.items.length === 0) {
      throw new NotFoundException('Order must have at least one item');
    }

    const itemDto = dto.items[0];
    const recipe = await this.recipeRepository.findById(itemDto.recipeId);
    if (!recipe) {
      throw new NotFoundException(`Recipe not found: ${itemDto.recipeId}`);
    }

    // Load ingredients for recipe items
    const recipeItems = recipe.items || [];
    console.log('[PricingPreview] Recipe items loaded:', {
      recipeId: recipe.id,
      recipeName: recipe.name,
      itemsCount: recipeItems.length,
      items: recipeItems.map((ri) => ({
        ingredientId: ri.ingredientId,
        ratioPercent: ri.ratioPercent,
        nutrientTargetKey: ri.nutrientTargetKey,
        nutrientTargetValue: ri.nutrientTargetValue,
      })),
    });

    const ingredientIds = recipeItems.map((ri) => ri.ingredientId);
    const ingredients =
      await this.ingredientRepository.findByIds(ingredientIds);

    const prepMethodMap = await this.loadPreparationMethodNameMap(
      recipeItems.map((item) => item.preparationMethod),
    );

    console.log('[PricingPreview] PreparationMethods loaded:', {
      found: prepMethodMap.size,
      methodIds: Array.from(prepMethodMap.keys()),
    });

    console.log('[PricingPreview] Ingredients loaded:', {
      requestedIds: ingredientIds.length,
      found: ingredients.length,
      ingredientIds: ingredients.map((ing) => ing.id),
    });

    // Create map for quick lookup
    const ingredientMap = new Map(ingredients.map((ing) => [ing.id, ing]));

    // Helper function to convert preparationMethod IDs to names
    // Build enriched recipe items with ingredient objects for pricing
    const pricingRecipeItems: PricingRecipeItem[] = recipeItems.map((ri) => {
      const ingredient = ingredientMap.get(ri.ingredientId);
      if (!ingredient) {
        throw new NotFoundException(`Ingredient not found: ${ri.ingredientId}`);
      }

      // Convert preparationMethod ID(s) to name(s)
      const prepMethodText =
        resolvePreparationMethodText(ri.preparationMethod, prepMethodMap, {
          preserveUnresolvedLegacy: false,
        }) ?? null;

      return {
        ingredientId: ri.ingredientId,
        ingredient,
        preparationMethod: prepMethodText,
        ratioPercent: ri.ratioPercent ?? null,
        nutrientTargetKey: ri.nutrientTargetKey ?? null,
        nutrientTargetValue: ri.nutrientTargetValue ?? null,
      };
    });

    // Calculate product pricing
    const globalConfig = await this.globalConfigService.getGlobalConfig();

    // Normalize packageCount (compute if missing, validate inputs)
    const normalizedPackageCount = this.normalizePackageCount(
      itemDto.quantityG,
      itemDto.packageCount,
      itemDto.packageSpecG,
    );

    // Use frontend-provided cycleDays and dailyIntakeG if available
    const days = itemDto.cycleDays ?? normalizedPackageCount;
    const dailyG = itemDto.dailyIntakeG ?? itemDto.quantityG / days;

    const pricing = await this.pricingService.calculateOrderPrice({
      dog: {
        mealsPerDay: dog.mealsPerDay || 2,
      },
      recipe: {
        id: recipe.id,
        productionLossRate: recipe.productionLossRate,
        batchLaborHours: recipe.batchLaborHours || 2.0,
        items: pricingRecipeItems,
      },
      dailyG,
      days,
      discountRate: 1.0,
      globalConfig,
      singlePackSpecG: itemDto.packageSpecG, // Use frontend-provided package spec
    });

    // Calculate shipping fee using default shipping template
    let shippingFee = 0;
    try {
      // Calculate total shipping weight (food + packaging materials)
      const totalWeightG = itemDto.quantityG + (pricing.weightPackagingG || 0);

      const shippingResult =
        await this.shippingService.calculateShippingFeePreview({
          totalWeightG,
          shippingTemplateId: null, // Use default active template
        });
      shippingFee = shippingResult.amountShipping;
    } catch (error) {
      // Shipping calculation failed - shipping fee remains 0
      console.error('[PreviewPricing] Shipping calculation failed:', error);
    }

    // Debug logging for pricing comparison
    console.log('[PreviewPricing] Pricing calculation:');
    console.log('  productPrice:', pricing.productPrice);
    console.log('  shippingFee:', shippingFee);
    console.log('  amountTotal:', pricing.productPrice + shippingFee);
    console.log('  Input params:', {
      quantityG: itemDto.quantityG,
      packageCount: itemDto.packageCount,
      packageSpecG: itemDto.packageSpecG,
      cycleDays: itemDto.cycleDays,
      dailyIntakeG: itemDto.dailyIntakeG,
    });

    const pricingResult = {
      amountProduct: pricing.productPrice,
      amountShipping: shippingFee,
      amountTotal: pricing.productPrice + shippingFee,
      pricingBreakdown: {
        costIngredients: pricing.costIngredients,
        costPackaging: pricing.costPackaging,
        costLabor: pricing.costLabor,
        costOverhead: pricing.costOverhead,
        totalProductCost: pricing.totalProductCost,
        productPrice: pricing.productPrice,
        weightPackagingG: pricing.weightPackagingG,
        ingredientDetails: pricing.ingredientDetails,
        packagingDetails: pricing.packagingDetails,
        laborDetails: pricing.laborDetails,
        overheadDetails: pricing.overheadDetails,
      },
    };

    // ✅ Save pricing snapshot to database
    const snapshot = await this.pricingSnapshotRepository.create({
      customerId: dto.customerId,
      requestParams: {
        dogId: dto.dogId,
        addressId: dto.addressId, // ✅ 修复：保存addressId到快照
        items: [
          {
            recipeId: itemDto.recipeId,
            quantityG: itemDto.quantityG,
            packageCount: itemDto.packageCount,
            packageSpecG: itemDto.packageSpecG,
            cycleDays: itemDto.cycleDays,
            dailyIntakeG: itemDto.dailyIntakeG,
          },
        ],
      },
      pricingResult,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15分钟过期
    });

    console.log('[PreviewPricing] Snapshot created:', snapshot.id);

    return {
      ...pricingResult,
      snapshotId: snapshot.id, // 返回快照ID
    };
  }

  /**
   * Map PricingBreakdownSnapshot to PriceExplanationDto (Phase 7.2)
   * Read-only presentation mapping - no recalculation, only simple subtraction for marginAmount
   * @param snapshot Pricing breakdown snapshot from order
   * @returns Price explanation DTO or null if snapshot is missing
   */
  mapToPriceExplanation(
    snapshot: PricingBreakdownSnapshot | undefined,
  ): PriceExplanationDto | null {
    if (!snapshot) {
      return null;
    }

    // Simple subtraction: marginAmount = productPrice - totalProductCost
    // No other calculations - all values come directly from snapshot
    const marginAmount = snapshot.productPrice - snapshot.totalProductCost;

    // Static explanation lines (human-readable, no formulas)
    const explanationLines = [
      'Ingredient cost covers fresh meat and vegetables',
      'Packaging includes vacuum bags and labels',
      'Labor covers preparation and cooking',
      'Platform service supports food safety, R&D, and operations',
    ];

    return {
      productPrice: snapshot.productPrice,
      shippingFee: snapshot.shippingFee,
      totalPrice: snapshot.totalPrice,
      costIngredients: snapshot.costIngredients,
      costPackaging: snapshot.costPackaging,
      costLabor: snapshot.costLabor,
      costOverhead: snapshot.costOverhead,
      marginAmount,
      explanationLines,
    };
  }

  /**
   * Complete order
   * Phase 8.15: Order Completion & Delivery Closure MVP
   * Phase 8.18: Logs status transition to history
   * Transitions SHIPPED → COMPLETED
   * @param orderId Order ID
   * @param actor Who is completing the order (defaults to "admin")
   * @param actorId Actor ID (e.g., adminId)
   * @param metadata Optional metadata for status transition
   * @returns Updated order
   */
  async completeOrder(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'admin',
    actorId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.markAsCompleted();
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.COMPLETED,
      actor,
      actorId,
      metadata,
    );

    return savedOrder;
  }

  /**
   * Cancel order
   * Phase 8.16: Order Cancellation Workflow
   * Phase 8.18: Logs status transition to history
   * @param orderId Order ID
   * @param reason Cancellation reason
   * @param cancelledBy Who cancelled the order: "customer" | "admin" | "system"
   * @param actorId Actor ID (e.g., customerId, adminId)
   * @returns Updated order
   * @throws NotFoundException if order not found
   * @throws BadRequestException if cancellation is not allowed
   */
  async cancelOrder(
    orderId: string,
    reason: string,
    cancelledBy: 'customer' | 'admin' | 'system',
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;

    // Domain method handles all validation and state transitions
    order.cancelOrder(reason, cancelledBy);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition with cancellation metadata
    const actor: 'customer' | 'staff' | 'admin' | 'system' =
      cancelledBy === 'customer'
        ? 'customer'
        : cancelledBy === 'admin'
          ? 'admin'
          : 'system';

    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.CANCELLED,
      actor,
      actorId,
      {
        reason,
        cancelledBy,
      },
    );

    return savedOrder;
  }

  /**
   * Get order status history
   * Phase 8.18: Order Status History & Audit Trail
   */
  async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    return this.statusHistoryRepository.findByOrderId(orderId);
  }

  // ==========================================
  // Admin-only methods for order management
  // ==========================================

  /**
   * List all orders with filtering, pagination, and search
   * Admin-only method for cross-customer order management
   */
  async listAllOrders(params?: {
    customerId?: string;
    status?: OrderStatus;
    type?: OrderType;
    keyword?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Order[]; total: number }> {
    return this.orderRepository.findAll(params);
  }

  /**
   * Ship order with tracking information
   * Phase 9: Simplified shipping flow
   * Transitions IN_PRODUCTION → SHIPPED
   */
  async shipOrder(
    orderId: string,
    trackingNumber: string,
    carrierCode: string,
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.markAsShipped(trackingNumber, carrierCode);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.SHIPPED,
      'admin',
      actorId,
      { trackingNumber, carrierCode },
    );

    return savedOrder;
  }

  /**
   * Confirm payment (admin manual confirmation)
   * Transitions PENDING_PAYMENT → PAID
   */
  async confirmPaymentAdmin(
    orderId: string,
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    const transactionId = `ADMIN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    order.recordPayment('ADMIN', transactionId);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.PAID,
      'admin',
      actorId,
      { paymentMethod: 'ADMIN', transactionId, confirmedBy: 'admin' },
    );

    return savedOrder;
  }

  /**
   * Admin confirm offline payment (线下收款确认)
   * 管理员确认用户已通过微信完成线下支付
   *
   * Transitions: PENDING_PAYMENT → PAID
   *
   * @param orderId Order ID
   * @param adminId Admin user ID
   * @param actualAmount Actual payment amount received (optional, for recording discrepancies)
   * @returns Updated order with payment tracking fields set
   */
  async confirmOfflinePayment(
    orderId: string,
    adminId: string,
    actualAmount?: number,
  ): Promise<Order> {
    // 1. Load and validate order
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    // 2. Validate order status (must be PENDING_PAYMENT)
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(
        `Only PENDING_PAYMENT orders can be confirmed. Current status: ${order.status}`,
      );
    }

    // 3. Generate transaction ID and note
    const transactionId = `OFFLINE_${Date.now()}_${adminId.substring(0, 8)}`;
    let note = '';
    if (actualAmount !== undefined) {
      const diff = actualAmount - order.amountTotal;
      if (Math.abs(diff) > 0.01) {
        note = `实际收款: ¥${actualAmount.toFixed(2)}, 订单金额: ¥${order.amountTotal.toFixed(2)}, 差额: ¥${diff.toFixed(2)}`;
      }
    }

    // 4. Record payment (sets paymentStatus, paidAt, transactionId, paymentMethod, and transitions to PAID)
    const fromStatus = order.status;
    order.recordPayment('OFFLINE_WECHAT', transactionId);
    const savedOrder = await this.orderRepository.save(order);

    // 5. Log status transition with payment metadata
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.PAID,
      'admin',
      adminId,
      {
        paymentMethod: 'OFFLINE_WECHAT',
        transactionId,
        actualAmount,
        note,
      },
    );

    return savedOrder;
  }

  /**
   * Start production
   * Phase 9: Simplified production flow
   * Transitions PURCHASING → IN_PRODUCTION
   *
   * Note: This replaces the previous two-step process:
   * - Old: PAID → PURCHASING → IN_PRODUCTION
   * - New: PURCHASING → IN_PRODUCTION (after purchasing completed)
   */
  async startProduction(
    orderId: string,
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.transitionTo(OrderStatus.IN_PRODUCTION);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.IN_PRODUCTION,
      'admin',
      actorId,
      null,
    );

    return savedOrder;
  }

  /**
   * Get order statistics grouped by status
   * Phase 9: Simplified statistics aligned with e-commerce standards
   */
  async getOrderStats(): Promise<{
    total: number;
    pendingPayment: number;
    paid: number;
    purchasing: number;
    inProduction: number;
    freezing: number;
    shipped: number;
    completed: number;
    cancelled: number;
    aftersale: number;
  }> {
    return this.orderRepository.getStats();
  }

  /**
   * Mark order as freezing (急冻中待发货)
   * Phase 9.1: Freezing status after production photos uploaded
   * @param orderId Order ID
   * @param actorId ID of the staff member performing the action
   */
  async markAsFreezing(
    orderId: string,
    actorId?: string | null,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.markAsFreezing();
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.FREEZING,
      'staff',
      actorId,
      null,
    );

    return savedOrder;
  }

  /**
   * Apply for aftersale (申请售后)
   * Phase 9.1: Customer applies for aftersale
   * @param orderId Order ID
   * @param customerId Customer ID (for authorization)
   * @param type Type of aftersale (REFUND, REMAKE, COMPLAINT)
   * @param reason Customer reason for aftersale
   * @param photos Optional array of photo URLs
   */
  async applyForAftersale(
    orderId: string,
    customerId: string,
    type: any,
    reason: string,
    photos: string[] = [],
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    // Verify ownership
    if (order.customerId !== customerId) {
      throw new BadRequestException(
        'You can only apply for aftersale on your own orders',
      );
    }

    const fromStatus = order.status;
    order.applyForAftersale(type, reason, photos);
    const savedOrder = await this.orderRepository.save(order);

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      OrderStatus.AFTERSALE,
      'customer',
      customerId,
      { type, reason, photoCount: photos.length },
    );

    return savedOrder;
  }

  /**
   * Resolve aftersale (解决售后)
   * Phase 9.1: Admin/staff resolves aftersale request
   * @param orderId Order ID
   * @param resolutionType Type of resolution (refunded, remade, resolved)
   * @param actorId ID of the admin/staff performing the action
   * @param adminNote Optional admin note
   */
  async resolveAftersale(
    orderId: string,
    resolutionType: 'refunded' | 'remade' | 'resolved',
    actorId: string,
    adminNote?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    const fromStatus = order.status;
    order.resolveAftersale(resolutionType);
    const savedOrder = await this.orderRepository.save(order);

    // Determine target status based on resolution type
    let targetStatus: OrderStatus;
    switch (resolutionType) {
      case 'refunded':
        targetStatus = OrderStatus.CANCELLED;
        break;
      case 'remade':
        targetStatus = OrderStatus.IN_PRODUCTION;
        break;
      case 'resolved':
        targetStatus = OrderStatus.COMPLETED;
        break;
    }

    // Log status transition
    await this.logStatusTransition(
      savedOrder,
      fromStatus,
      targetStatus,
      'admin',
      actorId,
      { resolutionType, adminNote },
    );

    return savedOrder;
  }

  /**
   * Update order total amount
   * Admin/staff can manually adjust the order amount
   */
  async updateOrderAmount(orderId: string, newAmount: number): Promise<Order> {
    // Check if order exists (using Prisma directly to avoid entity validation)
    const existingOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existingOrder) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    // Update both totalAmount and amountTotal for consistency
    // Use Prisma directly to bypass Order entity validation (which requires amountTotal = amountProduct + amountShipping)
    // Admin should be able to manually adjust order amount for discounts, etc.
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        totalAmount: newAmount,
        amountTotal: newAmount,
      },
    });

    console.log(
      `Order ${orderId} amount updated to ${newAmount} (both totalAmount and amountTotal)`,
    );

    // Fetch the updated order data
    const updatedOrderData = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!updatedOrderData) {
      throw new NotFoundException(`Order not found after update: ${orderId}`);
    }

    // Use static factory method to create Order without validation
    const updatedOrder = Order.fromPrismaData(updatedOrderData, []);

    return updatedOrder;
  }

  /**
   * Update internal admin remark for production staff.
   */
  async updateAdminRemark(
    orderId: string,
    adminRemark: string | null | undefined,
  ): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    try {
      order.updateAdminRemark(adminRemark);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.orderRepository.save(order);
  }

  /**
   * Get pending aftersale orders
   * Phase 9.1: Admin/staff view list of orders in AFTERSALE status
   */
  async getPendingAftersales(): Promise<Order[]> {
    return this.orderRepository.findByStatus(OrderStatus.AFTERSALE);
  }

  /**
   * Update order address
   * @param orderId Order ID
   * @param addressId New address ID
   * @param userId User ID (for permission check)
   * @param userRole User role (for permission check)
   */
  async updateOrderAddress(
    orderId: string,
    addressId: string,
    userId: string,
    userRole: string,
  ): Promise<Order> {
    // 1. Get order
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // 2. Permission check: must be order owner or admin (NOT STAFF)
    const isOwner = order.customerId === userId;
    const isAdmin = userRole === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new BadRequestException(
        'You do not have permission to modify this order',
      );
    }

    // 3. Get address details
    const address = await this.addressRepository.findById(addressId);
    if (!address) {
      throw new NotFoundException(`Address ${addressId} not found`);
    }

    // 4. Verify address belongs to the customer
    if (address.userId !== order.customerId) {
      throw new BadRequestException(
        'Address does not belong to the order customer',
      );
    }

    // 5. Update order address (domain logic will validate state)
    order.updateAddress(addressId, {
      id: address.id,
      recipientName: address.recipientName,
      phone: address.phone,
      region: address.region,
      detail: address.detail,
    });

    // 6. Save and return
    return this.orderRepository.save(order);
  }

  /**
   * Update order target production date
   * @param orderId Order ID
   * @param targetDate New target production date
   * @param userId User ID (for permission check)
   * @param userRole User role (for permission check)
   */
  async updateOrderTargetDate(
    orderId: string,
    targetDate: Date,
    userId: string,
    userRole: string,
  ): Promise<Order> {
    // 1. Get order
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    // 2. Permission check: must be order owner or admin (NOT STAFF)
    const isOwner = order.customerId === userId;
    const isAdmin = userRole === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new BadRequestException(
        'You do not have permission to modify this order',
      );
    }

    // 3. Update target date (domain logic will validate state and date)
    order.updateTargetProductionDate(targetDate);

    // 4. Save and return
    return this.orderRepository.save(order);
  }
}
