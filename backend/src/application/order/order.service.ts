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

// Re-export for convenience
export { ORDER_REPOSITORY };
import { RECIPE_REPOSITORY } from '../dog/dog.service';

export interface CreateOrderDraftDto {
  customerId: string;
  dogId: string;
  type: OrderType;
  targetProductionDate?: Date | null;
  items: CreateOrderItemDto[];
  addressId?: string;
}

export interface CreateOrderItemDto {
  recipeId: string;
  quantityG: number;
  packageCount?: number; // Optional - will be computed if missing
  packageSpecG: number;
  customRequirements?: string | null;
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: OrderRepository,
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
  ) {}

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
   */
  async createOrderDraft(dto: CreateOrderDraftDto): Promise<Order> {
    const orderId = randomUUID();

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
      const globalConfig = this.globalConfigService.getGlobalConfig();
      
      // Normalize packageCount (compute if missing, validate inputs)
      const normalizedPackageCount = this.normalizePackageCount(
        itemDto.quantityG,
        itemDto.packageCount,
        itemDto.packageSpecG,
      );
      const days = normalizedPackageCount;
      const dailyG = itemDto.quantityG / days;
      
      pricing = this.pricingService.calculateOrderPrice({
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
        itemDto.customRequirements ?? null,
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
    const globalConfig = this.globalConfigService.getGlobalConfig();
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
  async confirmOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    order.transitionTo(OrderStatus.PENDING_PAYMENT);
    return this.orderRepository.save(order);
  }

  /**
   * Process payment (mock implementation)
   * Transitions PENDING_PAYMENT → PAID
   */
  async processPayment(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    order.transitionTo(OrderStatus.PAID);
    return this.orderRepository.save(order);
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
    } | null;
  }> {
    // Load dog profile
    const dog = await this.dogRepository.findById(dto.dogId);
    if (!dog) {
      throw new NotFoundException(`Dog not found: ${dto.dogId}`);
    }

    // Calculate pricing for first item (MVP: assume single item orders)
    if (dto.items.length === 0) {
      throw new NotFoundException('Order must have at least one item');
    }

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

    // Calculate product pricing
    const globalConfig = this.globalConfigService.getGlobalConfig();
    
    // Normalize packageCount (compute if missing, validate inputs)
    const normalizedPackageCount = this.normalizePackageCount(
      itemDto.quantityG,
      itemDto.packageCount,
      itemDto.packageSpecG,
    );
    const days = normalizedPackageCount;
    const dailyG = itemDto.quantityG / days;

    const pricing = this.pricingService.calculateOrderPrice({
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
    });

    // Calculate shipping fee if address is provided
    let shippingFee = 0;
    if (dto.addressId) {
      try {
        const address = await this.addressRepository.findById(dto.addressId);
        if (address) {
          // For preview, we use the quantityG as the total weight (simplified)
          // In production, this would include packaging weight from pricing calculation
          const totalWeightG = itemDto.quantityG;

          const shippingResult =
            await this.shippingService.calculateShippingFeePreview({
              region: address.region,
              totalWeightG,
              shippingTemplateId: null, // Use default active template
            });
          shippingFee = shippingResult.amountShipping;
        }
      } catch (error) {
        // Address not found or shipping calculation failed - shipping fee remains 0
        // In production, you might want to log this or handle it differently
      }
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
   * Transitions SHIPPED → COMPLETED
   * @param orderId Order ID
   * @returns Updated order
   */
  async completeOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    order.markAsCompleted();
    return this.orderRepository.save(order);
  }
}
