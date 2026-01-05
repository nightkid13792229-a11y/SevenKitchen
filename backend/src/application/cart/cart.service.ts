/**
 * Cart Service
 * Business logic for cart operations
 */

import { Injectable, Inject, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import type { CartRepository } from '../../domain/cart';
import { Cart, CartItem } from '../../domain/cart';
import { RecipeService } from '../recipe/recipe.service';
import { DogService, DOG_REPOSITORY } from '../dog/dog.service';
import { OrderService } from '../order/order.service';
import type { DogRepository } from '../../domain';
import { Recipe } from '../../domain';
import { PreparationMethod, CookingMethod, OrderType } from '../../domain/order';
import { RECIPE_REPOSITORY_TOKEN } from '../../interfaces/controllers/recipes.controller';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';

export interface AddToCartDto {
  dogId: string;
  recipeId: string;
  cycleDays: number;
  preparationMethod?: PreparationMethod;
  cookingMethod?: CookingMethod;
}

export interface CartItemResponseDto {
  id: string;
  cartId: string;
  dogId: string;
  dogName: string;
  dogBreedName: string;
  dogWeightKg: number;
  recipeId: string;
  recipeName: string;
  recipeCoverImage: string | null;
  cycleDays: number;
  dailyIntakeG: number;
  totalGrams: number;
  packageCount: number;
  packageSpecG: number;
  unitPrice: number;
  totalPrice: number;
  preparationMethod: PreparationMethod | null;
  cookingMethod: CookingMethod | null;
  isValid: boolean;  // 商品是否有效
  invalidReason?: string;  // 失效原因：'recipe_deleted' | 'dog_deleted' | 'data_incomplete'
}

export interface CartResponseDto {
  items: CartItemResponseDto[];
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    @Inject('CartRepository') private readonly cartRepository: CartRepository,
    private readonly recipeService: RecipeService,
    @Inject(DOG_REPOSITORY) private readonly dogRepository: DogRepository,
    private readonly dogService: DogService,
    @Inject(RECIPE_REPOSITORY_TOKEN) private readonly recipeRepository: RecipeRepository,
    private readonly orderService: OrderService,
  ) {}

  /**
   * Get customer's cart
   */
  async getCart(customerId: string): Promise<CartResponseDto> {
    const cart = await this.cartRepository.findByCustomerId(customerId);
    return this.toResponseDto(cart);
  }

  /**
   * Add item to cart
   */
  async addToCart(customerId: string, dto: AddToCartDto): Promise<CartItemResponseDto> {
    console.log('========== CartService.addToCart 开始 ==========');
    console.log('[输入参数]', {
      customerId,
      dogId: dto.dogId,
      recipeId: dto.recipeId,
      cycleDays: dto.cycleDays,
      preparationMethod: dto.preparationMethod,
      cookingMethod: dto.cookingMethod
    });

    // Validate dog exists and belongs to customer
    const dog = await this.dogRepository.findById(dto.dogId);
    if (!dog) {
      throw new NotFoundException('Dog not found');
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Dog does not belong to customer');
    }

    // Validate recipe exists (use recipeRepository to support both id and recipe_id)
    const recipe = await this.recipeRepository.findById(dto.recipeId);
    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    console.log('[验证通过]', {
      dogName: dog.name,
      dogWeightKg: dog.currentWeightKg,
      dogMealsPerDay: dog.mealsPerDay,
      recipeName: recipe.name,
      recipeEnergyDensity: recipe.energyDensityKcalPerKg
    });

    // Calculate daily intake and package info using calcForRecipe API
    // This uses the recipe's energy density for accurate gram calculation
    const recipeCalc = await this.dogService.calcForRecipe(dto.dogId, dto.recipeId);

    console.log('[calcForRecipe返回]', recipeCalc);

    // Use API-returned values (consistent with frontend recipe-order page)
    const mealsPerDay = dog.mealsPerDay;
    const dailyIntakeG = recipeCalc.dailyIntakeG;
    const perMealG = recipeCalc.perMealIntakeG;
    const singlePackSpecG = perMealG;  // Use API value directly
    const packageCount = mealsPerDay * dto.cycleDays;
    const totalGrams = dailyIntakeG * dto.cycleDays;

    console.log('[计算的物理量]', {
      mealsPerDay,
      dailyIntakeG,
      perMealG,
      singlePackSpecG,
      cycleDays: dto.cycleDays,
      packageCount,
      totalGrams
    });

    // Calculate price using OrderService's pricing API
    console.log('[准备调用previewPricing]', {
      customerId,
      dogId: dto.dogId,
      type: 'FRESH_FOOD',
      items: [{
        recipeId: dto.recipeId,
        quantityG: totalGrams,
        packageCount: packageCount,
        packageSpecG: singlePackSpecG,
      }]
    });

    const pricingResult = await this.orderService.previewPricing({
      customerId,
      dogId: dto.dogId,
      type: OrderType.FRESH_FOOD,
      items: [{
        recipeId: dto.recipeId,
        quantityG: totalGrams,
        packageCount: packageCount,
        packageSpecG: singlePackSpecG,
        cycleDays: dto.cycleDays,
        dailyIntakeG: dailyIntakeG,
      }]
    });

    console.log('[previewPricing返回]', pricingResult);

    const unitPrice = packageCount > 0 ? pricingResult.amountTotal / packageCount : 0;
    const totalPrice = pricingResult.amountTotal;

    // Set default values for preparation and cooking methods if not provided
    const preparationMethod = dto.preparationMethod || PreparationMethod.CHOPPED;
    const cookingMethod = dto.cookingMethod || CookingMethod.RAW;

    console.log('[准备保存到数据库]', {
      dogId: dto.dogId,
      recipeId: dto.recipeId,
      cycleDays: dto.cycleDays,
      dailyIntakeG,
      totalGrams,
      packageCount,
      packageSpecG: singlePackSpecG,
      unitPrice,
      totalPrice: Number(totalPrice.toFixed(2)),
      preparationMethod,
      cookingMethod
    });

    // Create cart item
    const cartItem = await this.cartRepository.addItem(customerId, {
      dogId: dto.dogId,
      recipeId: dto.recipeId,
      cycleDays: dto.cycleDays,
      dailyIntakeG,
      totalGrams,
      packageCount,
      packageSpecG: singlePackSpecG,
      unitPrice,
      totalPrice: Number(totalPrice.toFixed(2)),
      preparationMethod,
      cookingMethod,
    });

    console.log('[数据库保存成功]', {
      cartItemId: cartItem.id,
      cartId: cartItem.cartId
    });

    console.log('========== CartService.addToCart 结束 ==========');

    // Return with enriched data (using calculated prices)
    return this.toItemResponseDto(
      cartItem,
      dog.name,
      dog.customBreedName || '',
      dog.currentWeightKg,
      recipe.name,
      recipe.coverImageUrl || null,
      unitPrice,
      totalPrice
    );
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(customerId: string, itemId: string): Promise<void> {
    // Verify item belongs to customer's cart
    const cart = await this.cartRepository.findByCustomerId(customerId);
    const item = cart.items.find(item => item.id === itemId);

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.removeItem(itemId);
  }

  /**
   * Clear cart
   */
  async clearCart(customerId: string): Promise<void> {
    await this.cartRepository.clearCart(customerId);
  }

  /**
   * Get cart items by IDs (for checkout)
   */
  async getCartItemsByIds(customerId: string, itemIds: string[]): Promise<CartItemResponseDto[]> {
    const cart = await this.cartRepository.findByCustomerId(customerId);
    const items = cart.items.filter(item => itemIds.includes(item.id));

    if (items.length !== itemIds.length) {
      throw new NotFoundException('Some cart items not found');
    }

    // Enrich items with dog and recipe data
    const enrichedItems: CartItemResponseDto[] = [];
    for (const item of items) {
      try {
        const dog = await this.dogRepository.findById(item.dogId);
        const recipe = await this.recipeRepository.findById(item.recipeId);

        if (!dog || !recipe) {
          // 标记为失效商品
          enrichedItems.push({
            id: item.id,
            cartId: item.cartId,
            dogId: item.dogId,
            dogName: '未知',
            dogBreedName: '',
            dogWeightKg: 0,
            recipeId: item.recipeId,
            recipeName: '已下架食谱',
            recipeCoverImage: null,
            cycleDays: item.cycleDays,
            dailyIntakeG: item.dailyIntakeG,
            totalGrams: item.totalGrams,
            packageCount: item.packageCount,
            packageSpecG: item.packageSpecG,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            preparationMethod: item.preparationMethod as PreparationMethod | null,
            cookingMethod: item.cookingMethod as CookingMethod | null,
            isValid: false,
            invalidReason: !dog ? 'dog_deleted' : 'recipe_deleted',
          });
          continue;
        }

        // Calculate real-time price for checkout items
        let realTimeUnitPrice = item.unitPrice;
        let realTimeTotalPrice = item.totalPrice;

        try {
          const pricingResult = await this.orderService.previewPricing({
            customerId,
            dogId: item.dogId,
            type: OrderType.FRESH_FOOD,
            items: [{
              recipeId: item.recipeId,
              quantityG: item.totalGrams,
              packageCount: item.packageCount,
              packageSpecG: item.packageSpecG,
              cycleDays: item.cycleDays,
              dailyIntakeG: item.dailyIntakeG,
            }]
          });

          realTimeTotalPrice = pricingResult.amountTotal;
          realTimeUnitPrice = item.packageCount > 0
            ? pricingResult.amountTotal / item.packageCount
            : 0;

          this.logger.debug(`Real-time price calculated for checkout item ${item.id}: ${realTimeTotalPrice.toFixed(2)}`);
        } catch (error) {
          // If pricing calculation fails, use stored snapshot price
          this.logger.warn(`Failed to calculate real-time price for checkout item ${item.id}, using snapshot price`, error);
          realTimeUnitPrice = item.unitPrice;
          realTimeTotalPrice = item.totalPrice;
        }

        enrichedItems.push(this.toItemResponseDto(
          item,
          dog.name,
          dog.customBreedName || '',
          dog.currentWeightKg,
          recipe.name,
          recipe.coverImageUrl || null,
          realTimeUnitPrice,
          realTimeTotalPrice,
        ));
      } catch (error) {
        // 捕获异常，标记为失效商品
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Invalid cart item ${item.id}: ${errorMessage}`);

        const isRecipeError = errorMessage.toLowerCase().includes('recipe');
        const isDogError = errorMessage.toLowerCase().includes('dog');

        enrichedItems.push({
          id: item.id,
          cartId: item.cartId,
          dogId: item.dogId,
          dogName: '未知',
          dogBreedName: '',
          dogWeightKg: 0,
          recipeId: item.recipeId,
          recipeName: isRecipeError ? '已下架食谱' : item.recipeId,
          recipeCoverImage: null,
          cycleDays: item.cycleDays,
          dailyIntakeG: item.dailyIntakeG,
          totalGrams: item.totalGrams,
          packageCount: item.packageCount,
          packageSpecG: item.packageSpecG,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          preparationMethod: item.preparationMethod as PreparationMethod | null,
          cookingMethod: item.cookingMethod as CookingMethod | null,
          isValid: false,
          invalidReason: isRecipeError ? 'recipe_deleted' : (isDogError ? 'dog_deleted' : 'data_incomplete'),
        });
      }
    }

    return enrichedItems;
  }

  /**
   * Convert cart to response DTO
   */
  private async toResponseDto(cart: Cart): Promise<CartResponseDto> {
    const items: CartItemResponseDto[] = [];

    for (const item of cart.items) {
      try {
        const dog = await this.dogRepository.findById(item.dogId);
        const recipe = await this.recipeRepository.findById(item.recipeId);

        if (!dog || !recipe) {
          // 标记为失效商品
          items.push({
            id: item.id,
            cartId: item.cartId,
            dogId: item.dogId,
            dogName: '未知',
            dogBreedName: '',
            dogWeightKg: 0,
            recipeId: item.recipeId,
            recipeName: '已下架食谱',
            recipeCoverImage: null,
            cycleDays: item.cycleDays,
            dailyIntakeG: item.dailyIntakeG,
            totalGrams: item.totalGrams,
            packageCount: item.packageCount,
            packageSpecG: item.packageSpecG,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            preparationMethod: item.preparationMethod as PreparationMethod | null,
            cookingMethod: item.cookingMethod as CookingMethod | null,
            isValid: false,
            invalidReason: !dog ? 'dog_deleted' : 'recipe_deleted',
          });
          continue;
        }

        // Calculate real-time price for valid items
        let realTimeUnitPrice = item.unitPrice;
        let realTimeTotalPrice = item.totalPrice;

        try {
          const pricingResult = await this.orderService.previewPricing({
            customerId: cart.customerId,
            dogId: item.dogId,
            type: OrderType.FRESH_FOOD,
            items: [{
              recipeId: item.recipeId,
              quantityG: item.totalGrams,
              packageCount: item.packageCount,
              packageSpecG: item.packageSpecG,
              cycleDays: item.cycleDays,
              dailyIntakeG: item.dailyIntakeG,
            }]
          });

          realTimeTotalPrice = pricingResult.amountTotal;
          realTimeUnitPrice = item.packageCount > 0
            ? pricingResult.amountTotal / item.packageCount
            : 0;

          this.logger.debug(`Real-time price calculated for cart item ${item.id}: ${realTimeTotalPrice.toFixed(2)}`);
        } catch (error) {
          // If pricing calculation fails, use stored snapshot price
          this.logger.warn(`Failed to calculate real-time price for cart item ${item.id}, using snapshot price`, error);
          realTimeUnitPrice = item.unitPrice;
          realTimeTotalPrice = item.totalPrice;
        }

        items.push(this.toItemResponseDto(
          item,
          dog.name,
          dog.customBreedName || '',
          dog.currentWeightKg,
          recipe.name,
          recipe.coverImageUrl || null,
          realTimeUnitPrice,
          realTimeTotalPrice,
        ));
      } catch (error) {
        // 捕获异常，标记为失效商品
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Invalid cart item ${item.id}: ${errorMessage}`);

        const isRecipeError = errorMessage.toLowerCase().includes('recipe');
        const isDogError = errorMessage.toLowerCase().includes('dog');

        items.push({
          id: item.id,
          cartId: item.cartId,
          dogId: item.dogId,
          dogName: '未知',
          dogBreedName: '',
          dogWeightKg: 0,
          recipeId: item.recipeId,
          recipeName: isRecipeError ? '已下架食谱' : item.recipeId,
          recipeCoverImage: null,
          cycleDays: item.cycleDays,
          dailyIntakeG: item.dailyIntakeG,
          totalGrams: item.totalGrams,
          packageCount: item.packageCount,
          packageSpecG: item.packageSpecG,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          preparationMethod: item.preparationMethod as PreparationMethod | null,
          cookingMethod: item.cookingMethod as CookingMethod | null,
          isValid: false,
          invalidReason: isRecipeError ? 'recipe_deleted' : (isDogError ? 'dog_deleted' : 'data_incomplete'),
        });
      }
    }

    return { items };
  }

  /**
   * Convert cart item to response DTO
   */
  private toItemResponseDto(
    item: CartItem,
    dogName: string,
    dogBreedName: string,
    dogWeightKg: number,
    recipeName: string,
    recipeCoverImage: string | null,
    realTimeUnitPrice: number,
    realTimeTotalPrice: number,
  ): CartItemResponseDto {
    return {
      id: item.id,
      cartId: item.cartId,
      dogId: item.dogId,
      dogName,
      dogBreedName,
      dogWeightKg,
      recipeId: item.recipeId,
      recipeName,
      recipeCoverImage,
      cycleDays: item.cycleDays,
      dailyIntakeG: item.dailyIntakeG,
      totalGrams: item.totalGrams,
      packageCount: item.packageCount,
      packageSpecG: item.packageSpecG,
      unitPrice: realTimeUnitPrice,
      totalPrice: realTimeTotalPrice,
      preparationMethod: item.preparationMethod as PreparationMethod | null,
      cookingMethod: item.cookingMethod as CookingMethod | null,
      isValid: true,  // 有效商品
    };
  }
}
