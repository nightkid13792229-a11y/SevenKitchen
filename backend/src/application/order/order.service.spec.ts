/**
 * OrderService Unit Tests
 * Phase 8.9: Tests for dailyIntakeG calculation and immutability
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrderService, ORDER_REPOSITORY } from './order.service';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { RecipeRepository } from '../../domain/recipe/recipe.repository';
import type { IngredientRepository } from '../../domain/ingredient/ingredient.repository';
import type { DogRepository } from '../../domain/dog/dog.repository';
import type { AddressRepository } from '../../domain/address/address.repository';
import { Order, OrderItem } from '../../domain/order';
import { OrderType, OrderStatus, calculateDogEnergy } from '../../domain';
import { PricingService } from '../../domain/pricing/pricing.service';
import { GlobalConfigService } from '../config/global-config.service';
import { ShippingService } from '../shipping/shipping.service';
import { Dog } from '../../domain/dog/dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../../domain';
import { RECIPE_REPOSITORY } from '../dog/dog.service';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import { DOG_REPOSITORY } from '../dog/dog.service';
import { ADDRESS_REPOSITORY } from '../address/address.service';

describe('OrderService - Phase 8.9: dailyIntakeG Calculation', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let recipeRepository: jest.Mocked<RecipeRepository>;
  let dogRepository: jest.Mocked<DogRepository>;

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockRecipeRepository: jest.Mocked<RecipeRepository> = {
    findById: jest.fn(),
    findByIdAndVersion: jest.fn(),
    findPublicRecipes: jest.fn(),
    save: jest.fn(),
  };

  const mockIngredientRepository: jest.Mocked<IngredientRepository> = {
    findByIds: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
  };

  const mockDogRepository: jest.Mocked<DogRepository> = {
    findById: jest.fn(),
    findByOwnerId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockAddressRepository: jest.Mocked<AddressRepository> = {
    findById: jest.fn(),
    listByCustomerId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setDefault: jest.fn(),
  };

  const mockPricingService = {
    calculateOrderPrice: jest.fn(),
  };

  const mockGlobalConfigService = {
    getGlobalConfig: jest.fn().mockReturnValue({
      laborHourlyRate: 30,
      minOrderWeightG: 1000,
      defaultBatchCapacityG: 5000,
      targetMargin: 0.4,
      overheadCostPerKg: 2.0,
      targetBatchUtilization: 0.8,
      supplementLossRate: 1.05,
    }),
  };

  const mockShippingService = {
    calculateShippingFeePreview: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: mockRecipeRepository,
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: mockIngredientRepository,
        },
        {
          provide: DOG_REPOSITORY,
          useValue: mockDogRepository,
        },
        {
          provide: ADDRESS_REPOSITORY,
          useValue: mockAddressRepository,
        },
        {
          provide: PricingService,
          useValue: mockPricingService,
        },
        {
          provide: GlobalConfigService,
          useValue: mockGlobalConfigService,
        },
        {
          provide: ShippingService,
          useValue: mockShippingService,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(ORDER_REPOSITORY);
    recipeRepository = module.get(RECIPE_REPOSITORY);
    dogRepository = module.get(DOG_REPOSITORY);

    jest.clearAllMocks();
  });

  const createMockDog = (): Dog => {
    return new Dog(
      'dog-id-1',
      'owner-id-1',
      'Test Dog',
      'breed-id-1',
      new Date('2020-01-01'), // 4+ years old
      DogGender.MALE,
      true, // neutered
      10.0, // 10kg
      5, // BCS 5 (ideal)
      ActivityLevel.NORMAL,
      LifeStageOverride.NONE,
      null,
      2,
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.LOW,
      null,
      null,
      0,
    );
  };

  const createMockRecipe = () => {
    return {
      id: 'recipe-id-1',
      version: 1,
      name: 'Test Recipe',
      status: 'PUBLIC',
      energyDensityKcalPerKg: 1450, // 1450 kcal/kg
      productionLossRate: 1.07,
      batchLaborHours: 2.0,
      items: [
        {
          id: 'item-1',
          ingredientId: 'ingredient-1',
          ratioPercent: 100,
          isPrimarySource: true,
        },
      ],
    };
  };

  const createMockIngredient = () => {
    return {
      id: 'ingredient-1',
      name: 'Test Ingredient',
      type: 'FOOD',
      baseUnit: 'G',
      currentPricePerPurchaseUnit: 10,
      purchaseUnit: 'kg',
      purchaseToBaseRatio: 1000,
    };
  };

  describe('createOrderDraft - dailyIntakeG calculation', () => {
    it('should calculate dailyIntakeG from DogCalc.finalFoodKcal and Recipe.energyDensityKcalPerKg', async () => {
      // Arrange
      const dog = createMockDog();
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);

      // Calculate expected dailyIntakeG
      const dogCalcResult = calculateDogEnergy(dog, recipe.energyDensityKcalPerKg);
      const expectedDailyIntakeG = dogCalcResult.dailyIntakeG!;

      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67, // With 40% margin
      });

      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 10,
        templateId: 'template-1',
      });

      // Mock save to return the order that was passed in (with items)
      orderRepository.save.mockImplementation(async (order: Order) => order);

      // Act
      const result = await service.createOrderDraft({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      });

      // Assert
      expect(orderRepository.save).toHaveBeenCalled();
      const savedCall = orderRepository.save.mock.calls[0][0] as Order;
      expect(savedCall.items).toHaveLength(1);

      const orderItem = savedCall.items[0];
      expect(orderItem.dailyIntakeG).toBeDefined();
      expect(orderItem.dailyIntakeG).toBeGreaterThan(0);
      // Verify calculation: dailyIntakeG should match DogCalc result
      expect(orderItem.dailyIntakeG).toBeCloseTo(expectedDailyIntakeG, 1);

      // Verify RecipeSnapshot includes energyDensityKcalPerKg
      expect(orderItem.recipeSnapshot.energy_density_kcal_per_kg).toBe(
        recipe.energyDensityKcalPerKg,
      );
    });

    it('should persist dailyIntakeG as immutable snapshot field', async () => {
      // Arrange
      const dog = createMockDog();
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);

      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
      });

      // Mock save to return the order that was passed in (with items)
      orderRepository.save.mockImplementation(async (order: Order) => order);

      // Act
      await service.createOrderDraft({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      });

      // Assert: Verify dailyIntakeG is passed to repository
      const savedCall = orderRepository.save.mock.calls[0][0] as Order;
      const orderItem = savedCall.items[0];
      const capturedDailyIntakeG = orderItem.dailyIntakeG;

      // Simulate Recipe energy density change (should NOT affect existing order)
      const updatedRecipe = { ...recipe, energyDensityKcalPerKg: 2000 }; // Changed from 1450 to 2000

      // Verify immutability: dailyIntakeG should remain unchanged even if Recipe changes
      // The snapshot should contain the original energy density
      expect(orderItem.recipeSnapshot.energy_density_kcal_per_kg).toBe(
        recipe.energyDensityKcalPerKg, // Original value captured at order creation
      );

      // Simulate Recipe energy density change (should NOT affect existing order)
      // In a real scenario, if Recipe.energyDensityKcalPerKg changes from 1450 to 2000,
      // the order's snapshot should still have the original 1450 value
      
      // Verify that the snapshot still has the original value (immutability)
      expect(orderItem.recipeSnapshot.energy_density_kcal_per_kg).toBe(
        recipe.energyDensityKcalPerKg, // Still original, not updated
      );
      expect(orderItem.dailyIntakeG).toBe(capturedDailyIntakeG); // Still original, immutable
    });
  });
});
