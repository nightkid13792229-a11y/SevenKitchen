/**
 * Order Application Service
 * Application layer service for Order domain operations
 */

import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import { Order, OrderItem, PricingBreakdownSnapshot } from '../../domain/order';
import type { PriceExplanationDto } from '../../interfaces/dto/orders/pricing-preview.dto';
import { OrderType, OrderStatus, calculateDogEnergy, calculateDailyIntakeG } from '../../domain';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { ORDER_REPOSITORY } from './order.service.tokens';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import { PricingService, type RecipeItem as PricingRecipeItem } from '../../domain/pricing/pricing.service';
import { GlobalConfigService } from '../config/global-config.service';
import type { DogRepository } from '../../domain/dog/dog.repository';
import { DOG_REPOSITORY } from '../dog/dog.service';
import { ShippingService } from '../shipping/shipping.service';
import type { AddressRepository } from '../../domain/address/address.repository';
import { ADDRESS_REPOSITORY } from '../address/address.service';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { OrderStatusHistory } from '../../domain/order/order-status-history.entity';
import { ORDER_STATUS_HISTORY_REPOSITORY } from './order.service.tokens';
import type { CartRepository } from '../../domain/cart';

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
    @Inject('CartRepository')
    private readonly cartRepository: CartRepository,
  ) {}

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

    // If cartItemIds is provided, load cart items and convert to order items
    if (dto.cartItemIds && dto.cartItemIds.length > 0) {
      return this.createOrderFromCart(dto, orderId);
    }

    // Original flow: create from provided items
    return this.createOrderFromItems(dto, orderId);
  }

  /**
   * Create order from cart items
   */
  private async createOrderFromCart(dto: CreateOrderDraftDto, orderId: string): Promise<Order> {
    if (!dto.cartItemIds || dto.cartItemIds.length === 0) {
      throw new BadRequestException('cartItemIds is required');
    }

    // Load cart items
    const cartItems = await this.cartRepository.findItemsByIds(dto.cartItemIds);

    if (cartItems.length !== dto.cartItemIds.length) {
      throw new NotFoundException('Some cart items not found');
    }

    // Validate all cart items belong to the customer
    const cart = await this.cartRepository.findByCustomerId(dto.customerId);
    const cartItemIdsInCart = new Set(cart.items.map(item => item.id));

    for (const cartItem of cartItems) {
      if (!cartItemIdsInCart.has(cartItem.id)) {
        throw new BadRequestException('Cart item does not belong to customer');
      }
    }

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
  }

  /**
   * Create order from provided items (original flow)
   */
  private async createOrderFromItems(dto: CreateOrderDraftDto, orderId: string): Promise<Order> {
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
      const ingredients = await this.ingredientRepository.findByIds(
        ingredientIds,
      );

      // Create map for quick lookup
      const ingredientMap = new Map(
        ingredients.map((ing) => [ing.id, ing]),
      );

      // Build enriched recipe items with ingredient objects for pricing
      const pricingRecipeItems: PricingRecipeItem[] = recipeItems.map((ri) => {
        const ingredient = ingredientMap.get(ri.ingredientId);
        if (!ingredient) {
          throw new NotFoundException(
            `Ingredient not found: ${ri.ingredientId}`,
          );
        }
        return {
          ingredientId: ri.ingredientId,
          ingredient,
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
      const dailyG = itemDto.dailyIntakeG ?? (itemDto.quantityG / days);

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
            // Use quantityG as total weight for shipping (simplified, in production would include packaging)
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
      const dogCalcResult = calculateDogEnergy(dog, recipe.energyDensityKcalPerKg);
      
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
        items: recipeItems.map((ri) => {
          const ingredient = ingredientMap.get(ri.ingredientId);
          return {
            ingredient_id: ri.ingredientId,
            name: ingredient?.name || 'Unknown',
            ratio: ri.ratioPercent ?? 0,
          };
        }),
      };

      const itemId = randomUUID();
      // Use normalized packageCount (already computed above)
      // Phase 8.9: Include calculated dailyIntakeG (immutable after order creation)
      const orderItem = new OrderItem(
        itemId,
        orderId,
        recipeSnapshot,
        itemDto.quantityG,
        normalizedPackageCount,
        itemDto.packageSpecG,
        typeof itemDto.customRequirements === 'string'
          ? itemDto.customRequirements
          : itemDto.customRequirements !== null && itemDto.customRequirements !== undefined
          ? JSON.stringify(itemDto.customRequirements)
          : null,
        dailyIntakeG, // Calculated from DogCalc.finalFoodKcal ÷ Recipe.energyDensityKcalPerKg
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
    );

    const order = new Order(
      orderId,
      dto.customerId,
      OrderStatus.INIT,
      dto.type,
      dto.targetProductionDate ?? null,
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
  async previewPricing(
    dto: CreateOrderDraftDto,
  ): Promise<{
    amountProduct: number;
    amountShipping: number;
    amountTotal: number;
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
      items: recipeItems.map(ri => ({
        ingredientId: ri.ingredientId,
        ratioPercent: ri.ratioPercent,
        nutrientTargetKey: ri.nutrientTargetKey,
        nutrientTargetValue: ri.nutrientTargetValue,
      }))
    });

    const ingredientIds = recipeItems.map((ri) => ri.ingredientId);
    const ingredients = await this.ingredientRepository.findByIds(
      ingredientIds,
    );

    console.log('[PricingPreview] Ingredients loaded:', {
      requestedIds: ingredientIds.length,
      found: ingredients.length,
      ingredientIds: ingredients.map(ing => ing.id),
    });

    // Create map for quick lookup
    const ingredientMap = new Map(
      ingredients.map((ing) => [ing.id, ing]),
    );

    // Build enriched recipe items with ingredient objects for pricing
    const pricingRecipeItems: PricingRecipeItem[] = recipeItems.map((ri) => {
      const ingredient = ingredientMap.get(ri.ingredientId);
      if (!ingredient) {
        throw new NotFoundException(
          `Ingredient not found: ${ri.ingredientId}`,
        );
      }
      return {
        ingredientId: ri.ingredientId,
        ingredient,
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
    const dailyG = itemDto.dailyIntakeG ?? (itemDto.quantityG / days);

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
      // Use total weight including packaging from pricing calculation
      const totalWeightG = pricing.weightPackagingG || itemDto.quantityG;

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

    return {
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
   * @returns Updated order
   */
  async completeOrder(
    orderId: string,
    actor: 'customer' | 'staff' | 'admin' | 'system' = 'admin',
    actorId?: string | null,
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
}
