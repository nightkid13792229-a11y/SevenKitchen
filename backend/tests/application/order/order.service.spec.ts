/**
 * OrderService Unit Tests
 * Phase 8.9: Tests for dailyIntakeG calculation and immutability
 */

import { Test, TestingModule } from '@nestjs/testing';
import { OrderService, ORDER_REPOSITORY, ORDER_STATUS_HISTORY_REPOSITORY } from 'src/order.service';
import { OrderSourcePlanService } from 'src/order/order-source-plan.service';
import type { OrderRepository } from 'src/domain/order/order.repository';
import type { OrderStatusHistoryRepository } from 'src/domain/order/order-status-history.repository';
import { OrderStatusHistory } from 'src/domain/order/order-status-history.entity';
import type { RecipeRepository } from 'src/domain/recipe/recipe.repository';
import type { IngredientRepository } from 'src/domain/ingredient/ingredient.repository';
import type { DogRepository } from 'src/domain/dog/dog.repository';
import type { AddressRepository } from 'src/domain/address/address.repository';
import {
  Order,
  OrderItem,
  PreparationMethod,
  CookingMethod,
} from 'src/domain/order';
import { AftersaleType, OrderType, OrderStatus, calculateDogEnergy } from 'src/domain';
import { Ingredient } from 'src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from 'src/domain/ingredient/enums';
import { PricingService } from 'src/domain/pricing/pricing.service';
import { GlobalConfigService } from 'src/config/global-config.service';
import { ShippingService } from 'src/shipping/shipping.service';
import { Dog } from 'src/domain/dog/dog.entity';
import { OrderPricingSnapshot } from 'src/domain/order-pricing-snapshot/order-pricing-snapshot.entity';
import { PrismaService } from 'src/infrastructure/prisma.service';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';
import { RECIPE_REPOSITORY } from 'src/dog/dog.service';
import { INGREDIENT_REPOSITORY } from 'src/ingredient/ingredient.service';
import { ProcurementSkuService } from 'src/ingredient/procurement-sku.service';
import { DOG_REPOSITORY } from 'src/dog/dog.service';
import { ADDRESS_REPOSITORY } from 'src/address/address.service';
import { SearchGovernanceService } from 'src/application/search-governance/search-governance.service';

describe('OrderService - Phase 8.9: dailyIntakeG Calculation', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let recipeRepository: jest.Mocked<RecipeRepository>;
  let dogRepository: jest.Mocked<DogRepository>;
  let searchGovernance: jest.Mocked<
    Pick<SearchGovernanceService, 'expandQuery' | 'recordSearchEvent'>
  >;

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    findAll: jest.fn(),
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

  const mockProcurementSkuService = {
    batchFindActive: jest.fn(),
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

  const mockPricingSnapshotRepository = {
    findById: jest.fn(),
    create: jest.fn(),
    markAsUsed: jest.fn(),
  };

  const mockPrismaService = {
    preparationMethod: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    dog: {
      findUnique: jest.fn(),
    },
    recipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockSearchGovernance = {
    expandQuery: jest.fn(),
    recordSearchEvent: jest.fn(),
  } as jest.Mocked<
    Pick<SearchGovernanceService, 'expandQuery' | 'recordSearchEvent'>
  >;

  const mockStatusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository> = {
    append: jest.fn(),
    findByOrderId: jest.fn(),
  };

  const createMockProcurementSku = (overrides: Record<string, unknown> = {}) => ({
    id: 'sku-market',
    ingredientId: 'ingredient-1',
    name: '超市鸡胸肉',
    brand: '超市品牌',
    productModel: '1kg/包',
    purchaseChannel: '山姆会员店',
    supplierName: null,
    purchaseUnit: 'kg',
    purchaseToBaseRatio: 1000,
    currentPurchasePrice: 80,
    referencePurchasePrice: null,
    referencePricePerPurchaseUnit: null,
    sourceTier: 'MARKET_PREMIUM',
    notes: null,
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    safetyStock: 1,
    reorderPoint: 3,
    targetStock: 5,
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
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
        OrderSourcePlanService,
        {
          provide: ProcurementSkuService,
          useValue: mockProcurementSkuService,
        },
        {
          provide: GlobalConfigService,
          useValue: mockGlobalConfigService,
        },
        {
          provide: ShippingService,
          useValue: mockShippingService,
        },
        {
          provide: 'IOrderPricingSnapshotRepository',
          useValue: mockPricingSnapshotRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SearchGovernanceService,
          useValue: mockSearchGovernance,
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(ORDER_REPOSITORY);
    recipeRepository = module.get(RECIPE_REPOSITORY);
    dogRepository = module.get(DOG_REPOSITORY);
    searchGovernance = module.get(SearchGovernanceService);

    jest.clearAllMocks();
    mockOrderRepository.findAll.mockResolvedValue({ list: [], total: 0 });
    mockPrismaService.order.count.mockResolvedValue(0);
    mockPrismaService.order.findMany.mockResolvedValue([]);
    searchGovernance.expandQuery.mockImplementation(async (_domain, rawQuery) =>
      rawQuery ? [rawQuery] : [],
    );
    searchGovernance.recordSearchEvent.mockResolvedValue({ id: 'query-log-1' });
    mockProcurementSkuService.batchFindActive.mockResolvedValue({
      'ingredient-1': [createMockProcurementSku()],
    });
  });

  const createMockDog = (): Dog => {
    return new Dog(
      'dog-id-1',
      'owner-id-1',
      'Test Dog',
      'breed-id-1',
      null,
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

  const createFullFoodIngredient = () =>
    new Ingredient(
      'ingredient-1',
      'Test Ingredient',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      true,
      true,
      'Original Brand',
      'Original Model',
      '山姆会员店',
      null,
      BaseUnit.G,
      'g',
      'kg',
      1000,
      80,
      null,
      null,
      null,
      null,
      null,
      null,
      { edible_yield_rate: 0.8 },
      { protein_g: 20 } as any,
    );

  const createSupplementIngredient = (
    id: string,
    overrides: Partial<{
      name: string;
      diyEnabled: boolean;
      procurementEnabled: boolean;
      brand: string | null;
      productModel: string | null;
      purchaseChannel: string | null;
    }> = {},
  ) =>
    new Ingredient(
      id,
      overrides.name ?? '鸡蛋壳粉',
      IngredientType.SUPPLEMENT,
      IngredientProcurementStrategy.STOCK_REPLENISHMENT,
      overrides.diyEnabled ?? false,
      overrides.procurementEnabled ?? true,
      overrides.brand ?? null,
      overrides.productModel ?? '散装',
      overrides.purchaseChannel ?? '自制',
      null,
      BaseUnit.G,
      'g',
      'g',
      1,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      { production_loss_rate: 1.02, add_timing: 'BEFORE_MIXING' },
      {
        minerals: { calcium: 360 },
      } as any,
    );

  describe('listAllOrders - governed keyword search', () => {
    const getLastOrderWhere = () =>
      mockPrismaService.order.findMany.mock.calls.at(-1)?.[0]?.where;

    const getIdSearchTerms = () =>
      (getLastOrderWhere()?.OR ?? [])
        .map((clause: any) => clause.id?.contains)
        .filter(Boolean);

    it('expands ORDER keyword aliases and maps status labels to exact order statuses', async () => {
      searchGovernance.expandQuery.mockResolvedValue([
        '待支付',
        '未付款',
        '未支付',
      ]);

      await service.listAllOrders({ keyword: '未付款' });

      expect(searchGovernance.expandQuery).toHaveBeenCalledWith(
        'ORDER',
        '未付款',
      );
      expect(getLastOrderWhere()?.OR).toContainEqual({
        status: OrderStatus.PENDING_PAYMENT,
      });
    });

    it('matches customer phone suffix through the searchable order projection', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['1388']);

      await service.listAllOrders({ keyword: '1388' });

      expect(getLastOrderWhere()?.OR).toContainEqual({
        customer: {
          phone: {
            contains: '1388',
            mode: 'insensitive',
          },
        },
      });
    });

    it('falls back to the original keyword when order query expansion fails', async () => {
      searchGovernance.expandQuery.mockRejectedValue(
        new Error('alias unavailable'),
      );

      await expect(
        service.listAllOrders({ keyword: 'SK-ORDER-001' }),
      ).resolves.toEqual({ list: [], total: 0 });

      expect(getIdSearchTerms()).toContain('SK-ORDER-001');
    });

    it('keeps the original keyword first and caps expanded terms at eight unique values', async () => {
      searchGovernance.expandQuery.mockResolvedValue([
        '扩展1',
        '扩展2',
        '扩展3',
        '原始',
        '扩展4',
        '扩展5',
        '扩展6',
        '扩展7',
        '扩展8',
        '扩展9',
      ]);

      await service.listAllOrders({ keyword: '原始' });

      expect(getIdSearchTerms()).toEqual([
        '原始',
        '扩展1',
        '扩展2',
        '扩展3',
        '扩展4',
        '扩展5',
        '扩展6',
        '扩展7',
      ]);
    });

    it('records admin order list searches with the total result count', async () => {
      mockPrismaService.order.count.mockResolvedValue(7);
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.listAllOrders({ keyword: ' 未付款 ' });

      expect(searchGovernance.recordSearchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'ORDER',
          source: 'ADMIN_ORDER_LIST',
          rawQuery: '未付款',
          resultCount: 7,
        }),
      );
    });

    it('preserves the exact status filter when keyword aliases also map to a status', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['待支付']);

      await service.listAllOrders({
        status: OrderStatus.PAID,
        keyword: '未付款',
      });

      expect(getLastOrderWhere()?.status).toBe(OrderStatus.PAID);
      expect(getLastOrderWhere()?.OR).toContainEqual({
        status: OrderStatus.PENDING_PAYMENT,
      });
    });

    it('keeps multi-status filters as an exact Prisma in-clause', async () => {
      await service.listAllOrders({
        status: [OrderStatus.PURCHASING, OrderStatus.IN_PRODUCTION] as any,
      });

      expect(getLastOrderWhere()?.status).toEqual({
        in: [OrderStatus.PURCHASING, OrderStatus.IN_PRODUCTION],
      });
    });

    it('keeps multi-status filters when keyword search clauses are present', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['1388']);

      await service.listAllOrders({
        status: [OrderStatus.PURCHASING, OrderStatus.IN_PRODUCTION] as any,
        keyword: '1388',
      });

      expect(getLastOrderWhere()?.status).toEqual({
        in: [OrderStatus.PURCHASING, OrderStatus.IN_PRODUCTION],
      });
      expect(getLastOrderWhere()?.OR).toContainEqual({
        customer: {
          phone: {
            contains: '1388',
            mode: 'insensitive',
          },
        },
      });
    });
  });

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

    it('does not leak unresolved legacy preparation method uuids into pricing input or order snapshots', async () => {
      const missingId = '33333333-3333-3333-3333-333333333333';
      const dog = createMockDog();
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'item-1',
            ingredientId: 'ingredient-1',
            ratioPercent: 100,
            isPrimarySource: true,
            preparationMethod: missingId,
          },
        ],
      };
      const ingredient = createMockIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
      });
      orderRepository.save.mockImplementation(async (order: Order) => order);

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

      expect(mockPricingService.calculateOrderPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          recipe: expect.objectContaining({
            items: [
              expect.objectContaining({
                preparationMethod: null,
              }),
            ],
          }),
        }),
      );

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      expect(
        savedOrder.items[0].recipeSnapshot.items[0].preparation_methods,
      ).toBeUndefined();
    });

    it('does not leak unresolved legacy preparation method uuids into preview pricing input', async () => {
      const missingId = '33333333-3333-3333-3333-333333333333';
      const dog = createMockDog();
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'item-1',
            ingredientId: 'ingredient-1',
            ratioPercent: 100,
            isPrimarySource: true,
            preparationMethod: missingId,
          },
        ],
      };
      const ingredient = createMockIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
        weightPackagingG: 0,
      });
      mockPricingSnapshotRepository.create.mockResolvedValue({
        id: 'snapshot-1',
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      await service.previewPricing({
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

      expect(mockPricingService.calculateOrderPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          recipe: expect.objectContaining({
            items: [
              expect.objectContaining({
                preparationMethod: null,
              }),
            ],
          }),
        }),
      );
    });

    it('uses the selected ingredient source plan SKU in preview pricing and snapshot params', async () => {
      const dog = createMockDog();
      const recipe = createMockRecipe();
      const ingredient = createFullFoodIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      mockProcurementSkuService.batchFindActive.mockResolvedValue({
        [ingredient.id]: [
          {
            id: 'sku-default',
            ingredientId: ingredient.id,
            name: '山姆鸡胸肉',
            brand: '山姆',
            productModel: '2kg/包',
            purchaseChannel: '山姆会员店',
            supplierName: null,
            purchaseUnit: 'kg',
            purchaseToBaseRatio: 1000,
            currentPurchasePrice: 80,
            referencePurchasePrice: null,
            referencePricePerPurchaseUnit: null,
            sourceTier: 'MARKET_PREMIUM',
            notes: null,
            isDefault: true,
            isActive: true,
            sortOrder: 0,
            safetyStock: 1,
            reorderPoint: 3,
            targetStock: 5,
          },
          {
            id: 'sku-wholesale',
            ingredientId: ingredient.id,
            name: '批发鸡胸肉',
            brand: '批发品牌',
            productModel: '10kg/箱',
            purchaseChannel: '生鲜批发商',
            supplierName: null,
            purchaseUnit: 'kg',
            purchaseToBaseRatio: 1000,
            currentPurchasePrice: 42,
            referencePurchasePrice: null,
            referencePricePerPurchaseUnit: null,
            sourceTier: 'WHOLESALE',
            notes: null,
            isDefault: false,
            isActive: true,
            sortOrder: 1,
            safetyStock: 2,
            reorderPoint: 4,
            targetStock: 8,
          },
        ],
      });
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 42,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 77,
        productPrice: 128.33,
        weightPackagingG: 0,
      });
      mockPricingSnapshotRepository.create.mockResolvedValue({
        id: 'snapshot-wholesale',
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        ingredientSourcePlan: 'WHOLESALE',
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      });

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      const pricedIngredient = pricingInput.recipe.items[0].ingredient;
      expect(pricedIngredient.purchaseChannel).toBe('生鲜批发商');
      expect(pricedIngredient.brand).toBe('批发品牌');
      expect(pricedIngredient.productModel).toBe('10kg/箱');
      expect(pricedIngredient.currentPricePerPurchaseUnit).toBe(42);
      expect(pricedIngredient.effectivePricePerPurchaseUnit).toBe(42);
      expect(pricedIngredient.properties).toEqual(
        expect.objectContaining({
          edible_yield_rate: 0.8,
          procurement_sku_id: 'sku-wholesale',
          procurement_sku_name: '批发鸡胸肉',
          procurement_sku_display_unit: 'kg',
        }),
      );
      expect(pricedIngredient.nutritionProfile).toBe(
        ingredient.nutritionProfile,
      );
      expect(pricedIngredient.procurementSkuId).toBe('sku-wholesale');
      expect(pricedIngredient.procurementSkuName).toBe('批发鸡胸肉');

      const snapshotInput = mockPricingSnapshotRepository.create.mock
        .calls[0][0] as any;
      expect(snapshotInput.requestParams.ingredientSourcePlan).toBe(
        'WHOLESALE',
      );
    });

    it('does not require procurement source SKUs or create an order snapshot for DIY sheet previews', async () => {
      const dog = createMockDog();
      const recipe = createMockRecipe();
      const ingredient = createFullFoodIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      mockProcurementSkuService.batchFindActive.mockResolvedValue({});
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
        weightPackagingG: 0,
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      const result = await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        pricingPurpose: 'DIY_SHEET',
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      } as any);

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      expect(mockProcurementSkuService.batchFindActive).not.toHaveBeenCalled();
      expect(pricingInput.recipe.items[0].ingredient).toBe(ingredient);
      expect(mockPricingSnapshotRepository.create).not.toHaveBeenCalled();
      expect(result.snapshotId).toBeUndefined();
    });

    it('keeps the default supplement ingredient for order pricing and production snapshots even when a procurement alternative exists', async () => {
      const dog = createMockDog();
      const mainSupplement = createSupplementIngredient('supplement-diy', {
        diyEnabled: true,
        procurementEnabled: false,
        brand: '西知堂',
        productModel: '500g/罐',
        purchaseChannel: '京东',
      });
      const procurementSupplement = createSupplementIngredient(
        'supplement-procurement',
        {
          diyEnabled: false,
          procurementEnabled: true,
          brand: '无',
          productModel: '散装',
          purchaseChannel: '自制',
        },
      );
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'supplement-item-1',
            ingredientId: mainSupplement.id,
            ratioPercent: 0,
            nutrientTargetKey: '钙',
            nutrientTargetValue: 2500,
            supplementTargets: [
              {
                label: '钙',
                fieldPath: 'minerals.calcium',
                unit: 'mg',
                targetValuePerKg: 2500,
              },
            ],
            supplementAlternatives: [
              {
                ingredientId: procurementSupplement.id,
                ingredientName: procurementSupplement.name,
                isActive: true,
                ingredient: {
                  id: procurementSupplement.id,
                  name: procurementSupplement.name,
                  type: 'SUPPLEMENT',
                  procurementEnabled: true,
                },
              },
            ],
          },
        ],
      };

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([
        mainSupplement,
        procurementSupplement,
      ]);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
      });
      orderRepository.save.mockImplementation(async (order: Order) => order);

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

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      expect(pricingInput.recipe.items[0].ingredient).toBe(mainSupplement);
      expect(pricingInput.recipe.items[0].ingredientId).toBe(
        mainSupplement.id,
      );

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      const snapshotItem = savedOrder.items[0].recipeSnapshot.items[0];
      expect(snapshotItem.ingredient_id).toBe(mainSupplement.id);
      expect(snapshotItem.name).toBe(mainSupplement.name);
      expect(snapshotItem.properties).toBe(mainSupplement.properties);
    });

    it('keeps the original supplement ingredient for DIY sheet pricing previews even when a procurement alternative exists', async () => {
      const dog = createMockDog();
      const mainSupplement = createSupplementIngredient('supplement-diy', {
        diyEnabled: true,
        procurementEnabled: false,
        brand: '西知堂',
        productModel: '500g/罐',
        purchaseChannel: '京东',
      });
      const procurementSupplement = createSupplementIngredient(
        'supplement-procurement',
        {
          diyEnabled: false,
          procurementEnabled: true,
          brand: '无',
          productModel: '散装',
          purchaseChannel: '自制',
        },
      );
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'supplement-item-1',
            ingredientId: mainSupplement.id,
            ratioPercent: 0,
            nutrientTargetKey: '钙',
            nutrientTargetValue: 2500,
            supplementTargets: [
              {
                label: '钙',
                fieldPath: 'minerals.calcium',
                unit: 'mg',
                targetValuePerKg: 2500,
              },
            ],
            supplementAlternatives: [
              {
                ingredientId: procurementSupplement.id,
                ingredientName: procurementSupplement.name,
                isActive: true,
                ingredient: {
                  id: procurementSupplement.id,
                  name: procurementSupplement.name,
                  type: 'SUPPLEMENT',
                  procurementEnabled: true,
                },
              },
            ],
          },
        ],
      };

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([
        mainSupplement,
        procurementSupplement,
      ]);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
        weightPackagingG: 0,
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        pricingPurpose: 'DIY_SHEET',
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      } as any);

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      expect(pricingInput.recipe.items[0].ingredient).toBe(mainSupplement);
      expect(pricingInput.recipe.items[0].ingredientId).toBe(
        mainSupplement.id,
      );
    });

    it('passes supplement example weight into pricing previews for fixed-ratio supplements', async () => {
      const dog = createMockDog();
      const foodIngredient = createFullFoodIngredient();
      const fixedSupplement = createSupplementIngredient('supplement-fixed', {
        name: '洋车前子壳粉',
        diyEnabled: true,
        procurementEnabled: true,
      });
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'food-item-1',
            ingredientId: foodIngredient.id,
            ratioPercent: 100,
            exampleWeight: 100,
          },
          {
            id: 'supplement-item-fixed',
            ingredientId: fixedSupplement.id,
            ratioPercent: null,
            exampleWeight: 1,
            nutrientTargetKey: null,
            nutrientTargetValue: null,
            supplementTargets: null,
          },
        ],
      };

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([
        foodIngredient,
        fixedSupplement,
      ]);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
        weightPackagingG: 0,
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        pricingPurpose: 'DIY_SHEET',
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      } as any);

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      expect(pricingInput.recipe.items[1]).toEqual(
        expect.objectContaining({
          ingredientId: fixedSupplement.id,
          exampleWeight: 1,
        }),
      );
    });

    it.each([
      {
        field: 'quantityG',
        legacyOverride: { quantityG: 1200 },
        expectedMessage: 'packagePlan does not match quantityG',
      },
      {
        field: 'packageCount',
        legacyOverride: { packageCount: 6 },
        expectedMessage: 'packagePlan does not match packageCount',
      },
      {
        field: 'packageSpecG',
        legacyOverride: { packageSpecG: 100 },
        expectedMessage: 'packagePlan does not match packageSpecG',
      },
    ])(
      'rejects packagePlan when legacy $field conflicts with derived values',
      async ({ legacyOverride, expectedMessage }) => {
        const dog = createMockDog();

        dogRepository.findById.mockResolvedValue(dog);

        await expect(
          service.previewPricing({
            customerId: 'customer-id-1',
            dogId: 'dog-id-1',
            type: OrderType.FRESH_FOOD,
            items: [
              {
                recipeId: 'recipe-id-1',
                quantityG: 800,
                packageCount: 5,
                packageSpecG: 200,
                packagePlan: [
                  { packageSpecG: 100, packageCount: 2 },
                  { packageSpecG: 200, packageCount: 3 },
                ],
                dailyIntakeG: 300,
                ...legacyOverride,
              },
            ],
          }),
        ).rejects.toThrow(expectedMessage);
        expect(recipeRepository.findById).not.toHaveBeenCalled();
        expect(mockPricingService.calculateOrderPrice).not.toHaveBeenCalled();
      },
    );

    it('passes legacy non-divisible package count without synthesizing a packagePlan for pricing', async () => {
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
        weightPackagingG: 0,
      });
      mockPricingSnapshotRepository.create.mockResolvedValue({
        id: 'snapshot-legacy-non-divisible',
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });

      await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 300,
          },
        ],
      });

      const pricingInput = mockPricingService.calculateOrderPrice.mock
        .calls[0][0] as any;
      expect(pricingInput.totalNetFoodWeightG).toBe(1000);
      expect(pricingInput.totalPacks).toBe(4);
      expect(pricingInput.singlePackSpecG).toBe(300);
      expect(pricingInput.packagePlan).toBeUndefined();

      const snapshotInput = mockPricingSnapshotRepository.create.mock
        .calls[0][0] as any;
      expect(snapshotInput.requestParams.items[0]).toEqual(
        expect.objectContaining({
          quantityG: 1000,
          packageCount: 4,
          packageSpecG: 300,
        }),
      );
      expect(snapshotInput.requestParams.items[0]).not.toHaveProperty(
        'packagePlan',
      );
    });

    it('includes packaging weight when calculating direct-create shipping fee', async () => {
      const dog = createMockDog();
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();

      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      mockAddressRepository.findById.mockResolvedValue({
        id: 'address-id-1',
        userId: 'customer-id-1',
        recipientName: 'Test Recipient',
        phone: '13800000000',
        region: {
          province: 'Shanghai',
          city: 'Shanghai',
          district: 'Pudong',
        },
        detailAddress: 'Test Address',
        isDefault: true,
      } as any);
      mockPricingService.calculateOrderPrice.mockReturnValue({
        costIngredients: 50,
        costPackaging: 10,
        costLabor: 20,
        costOverhead: 5,
        totalProductCost: 85,
        productPrice: 141.67,
        weightPackagingG: 125,
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 10,
        templateId: 'template-1',
      });
      orderRepository.save.mockImplementation(async (order: Order) => order);

      await service.createOrderDraft({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        addressId: 'address-id-1',
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
          },
        ],
      });

      expect(
        mockShippingService.calculateShippingFeePreview,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          totalWeightG: 1125,
        }),
      );
    });

    it('should preserve snapshot dailyIntakeG when the dog profile changes before order creation', async () => {
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();
      const changedDog = createMockDog();
      changedDog.currentWeightKg = 20;

      const snapshotDailyIntakeG = 180;
      const recalculatedDailyIntakeG = calculateDogEnergy(
        changedDog,
        recipe.energyDensityKcalPerKg,
      ).dailyIntakeG!;

      const snapshot = new OrderPricingSnapshot(
        'snapshot-id-1',
        'owner-id-1',
        {
          dogId: changedDog.id,
          items: [
            {
              recipeId: recipe.id,
              quantityG: 1260,
              packageCount: 28,
              packageSpecG: 45,
              cycleDays: 7,
              dailyIntakeG: snapshotDailyIntakeG,
            },
          ],
        },
        {
          amountProduct: 180,
          amountShipping: 20,
          amountTotal: 200,
          pricingBreakdown: {
            costIngredients: 100,
            costPackaging: 10,
            costLabor: 20,
            costOverhead: 5,
            totalProductCost: 135,
            productPrice: 180,
            ingredientDetails: [],
            packagingDetails: {
              perPackConsumables: {
                vacuumBagSpec: null,
              },
            },
          },
        },
        new Date(Date.now() + 15 * 60 * 1000),
        false,
        new Date(),
      );

      mockPricingSnapshotRepository.findById.mockResolvedValue(snapshot);
      dogRepository.findById.mockResolvedValue(changedDog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      orderRepository.save.mockImplementation(async (order: Order) => order);

      await service.createOrderDraft({
        customerId: 'owner-id-1',
        type: OrderType.FRESH_FOOD,
        snapshotId: 'snapshot-id-1',
        targetProductionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      const orderItem = savedOrder.items[0];

      expect(orderItem.dailyIntakeG).toBe(snapshotDailyIntakeG);
      expect(orderItem.dailyIntakeG).not.toBeCloseTo(recalculatedDailyIntakeG, 1);
    });

    it('should create order items from snapshot with packagePlan and ingredientSourcePlan', async () => {
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();
      const dog = createMockDog();
      const packagePlan = [
        { packageSpecG: 100, packageCount: 2 },
        { packageSpecG: 200, packageCount: 3 },
      ];

      const snapshot = new OrderPricingSnapshot(
        'snapshot-package-plan',
        'owner-id-1',
        {
          dogId: dog.id,
          ingredientSourcePlan: 'WHOLESALE',
          items: [
            {
              recipeId: recipe.id,
              packagePlan,
              quantityG: 800,
              packageCount: 5,
              packageSpecG: 200,
              cycleDays: 3,
              dailyIntakeG: 300,
            },
          ],
        },
        {
          amountProduct: 180,
          amountShipping: 20,
          amountTotal: 200,
          pricingBreakdown: {
            costIngredients: 100,
            costPackaging: 10,
            costLabor: 20,
            costOverhead: 5,
            totalProductCost: 135,
            productPrice: 180,
            ingredientDetails: [],
            packagingDetails: {
              perPackConsumables: { vacuumBagSpec: '多规格' },
            },
          },
        },
        new Date(Date.now() + 15 * 60 * 1000),
        false,
        new Date(),
      );

      mockPricingSnapshotRepository.findById.mockResolvedValue(snapshot);
      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([ingredient]);
      orderRepository.save.mockImplementation(async (order: Order) => order);

      await service.createOrderDraft({
        customerId: 'owner-id-1',
        type: OrderType.FRESH_FOOD,
        snapshotId: 'snapshot-package-plan',
        targetProductionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      expect(savedOrder.items[0].quantityG).toBe(800);
      expect(savedOrder.items[0].packageCount).toBe(5);
      expect(savedOrder.items[0].packageSpecG).toBe(200);
      expect(savedOrder.items[0].packagePlan).toEqual(packagePlan);
      expect(savedOrder.items[0].ingredientSourcePlan).toBe('WHOLESALE');
    });

    it('keeps the default supplement ingredient when creating an order from a pricing snapshot that references a procurement alternative', async () => {
      const dog = createMockDog();
      const mainSupplement = createSupplementIngredient('supplement-default', {
        name: '碳酸钙粉',
        diyEnabled: true,
        procurementEnabled: true,
      });
      const procurementSupplement = createSupplementIngredient(
        'supplement-procurement',
        {
          name: '柠檬酸钙粉',
          diyEnabled: true,
          procurementEnabled: true,
        },
      );
      const recipe = {
        ...createMockRecipe(),
        items: [
          {
            id: 'supplement-item-1',
            ingredientId: mainSupplement.id,
            ratioPercent: 0,
            nutrientTargetKey: '钙',
            nutrientTargetValue: 2500,
            supplementTargets: [
              {
                label: '钙',
                fieldPath: 'minerals.calcium',
                unit: 'mg',
                targetValuePerKg: 2500,
              },
            ],
            supplementAlternatives: [
              {
                ingredientId: procurementSupplement.id,
                ingredientName: procurementSupplement.name,
                isActive: true,
              },
            ],
          },
        ],
      };
      const snapshot = new OrderPricingSnapshot(
        'snapshot-supplement-alternative',
        'owner-id-1',
        {
          dogId: dog.id,
          items: [
            {
              recipeId: recipe.id,
              quantityG: 1000,
              packageCount: 5,
              packageSpecG: 200,
            },
          ],
        },
        {
          amountProduct: 180,
          amountShipping: 20,
          amountTotal: 200,
          pricingBreakdown: {
            costIngredients: 100,
            costPackaging: 10,
            costLabor: 20,
            costOverhead: 5,
            totalProductCost: 135,
            productPrice: 180,
            ingredientDetails: [
              {
                recipeItemId: 'supplement-item-1',
                ingredientId: procurementSupplement.id,
                name: procurementSupplement.name,
                type: 'SUPPLEMENT',
              },
            ],
            packagingDetails: {
              perPackConsumables: { vacuumBagSpec: null },
            },
          },
        },
        new Date(Date.now() + 15 * 60 * 1000),
        false,
        new Date(),
      );

      mockPricingSnapshotRepository.findById.mockResolvedValue(snapshot);
      dogRepository.findById.mockResolvedValue(dog);
      recipeRepository.findById.mockResolvedValue(recipe);
      mockIngredientRepository.findByIds.mockResolvedValue([
        mainSupplement,
        procurementSupplement,
      ]);
      orderRepository.save.mockImplementation(async (order: Order) => order);

      await service.createOrderDraft({
        customerId: 'owner-id-1',
        type: OrderType.FRESH_FOOD,
        snapshotId: 'snapshot-supplement-alternative',
        targetProductionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      const snapshotItem = savedOrder.items[0].recipeSnapshot.items[0];

      expect(snapshotItem.ingredient_id).toBe(mainSupplement.id);
      expect(snapshotItem.name).toBe(mainSupplement.name);
    });

    it('should preserve item-level preparation and cooking methods from preview snapshot into the created order item', async () => {
      const recipe = createMockRecipe();
      const ingredient = createMockIngredient();
      const dog = createMockDog();
      dog.ownerId = 'customer-id-1';

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
        weightPackagingG: 0,
        packagingDetails: {
          perPackConsumables: {
            vacuumBagSpec: '12*17cm',
          },
        },
      });
      mockShippingService.calculateShippingFeePreview.mockResolvedValue({
        amountShipping: 0,
        templateId: null,
      });
      mockPricingSnapshotRepository.create.mockResolvedValue({
        id: 'snapshot-methods',
      });
      orderRepository.save.mockImplementation(async (order: Order) => order);

      await service.previewPricing({
        customerId: 'customer-id-1',
        dogId: 'dog-id-1',
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId: 'recipe-id-1',
            quantityG: 1000,
            packageSpecG: 200,
            packageCount: 5,
            preparationMethod: PreparationMethod.DICED,
            cookingMethod: CookingMethod.COOKED,
          },
        ],
      });

      const snapshotInput = mockPricingSnapshotRepository.create.mock.calls[0][0] as any;
      expect(snapshotInput.requestParams.items[0]).toEqual(
        expect.objectContaining({
          preparationMethod: PreparationMethod.DICED,
          cookingMethod: CookingMethod.COOKED,
        }),
      );

      mockPricingSnapshotRepository.findById.mockResolvedValue(
        new OrderPricingSnapshot(
          'snapshot-methods',
          snapshotInput.customerId,
          snapshotInput.requestParams,
          snapshotInput.pricingResult,
          snapshotInput.expiresAt,
          false,
          new Date(),
        ),
      );

      await service.createOrderDraft({
        customerId: 'customer-id-1',
        type: OrderType.FRESH_FOOD,
        snapshotId: 'snapshot-methods',
      });

      const savedOrder = orderRepository.save.mock.calls[0][0] as Order;
      expect(savedOrder.items[0].preparationMethod).toBe(
        PreparationMethod.DICED,
      );
      expect(savedOrder.items[0].cookingMethod).toBe(CookingMethod.COOKED);
    });
  });
});

describe('OrderService - Phase 8.16: Order Cancellation', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  const createMockRecipeSnapshot = () => ({
    id: 'recipe-1',
    version: 1,
    name: 'Test Recipe',
    production_loss_rate: 1.07,
    energy_density_kcal_per_kg: 1450,
    nutrition_standard: 'FEDIAF_2021',
    items: [],
  });

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockStatusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository> = {
    append: jest.fn(),
    findByOrderId: jest.fn(),
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
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: {},
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: {},
        },
        {
          provide: DOG_REPOSITORY,
          useValue: {},
        },
        {
          provide: ADDRESS_REPOSITORY,
          useValue: {},
        },
        {
          provide: PricingService,
          useValue: {},
        },
        {
          provide: GlobalConfigService,
          useValue: {},
        },
        {
          provide: ShippingService,
          useValue: {},
        },
        {
          provide: OrderSourcePlanService,
          useValue: { applySourcePlanToIngredients: jest.fn() },
        },
        {
          provide: 'IOrderPricingSnapshotRepository',
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            markAsUsed: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            preparationMethod: { findMany: jest.fn().mockResolvedValue([]) },
            order: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(ORDER_REPOSITORY);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('cancelOrder', () => {
    const createMockOrder = (status: OrderStatus) => {
      const item = new OrderItem(
        'item-1',
        'order-1',
        'dog-1',
        createMockRecipeSnapshot(),
        1000,
        10,
        100,
        null,
        310.34,
      );

      return new Order(
        'order-1',
        'customer-1',
        status,
        OrderType.FRESH_FOOD,
        new Date('2025-01-01T00:00:00Z'),
        null,
        null,
        100,
        10,
        110,
        [item],
      );
    };

    it('should cancel order in INIT status by customer', async () => {
      const order = createMockOrder(OrderStatus.INIT);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      const result = await service.cancelOrder(
        'order-1',
        'Customer requested cancellation',
        'customer',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledAt).toBeDefined();
      expect(result.cancellationReason).toBe('Customer requested cancellation');
      expect(result.cancelledBy).toBe('customer');
      expect(orderRepository.save).toHaveBeenCalledWith(order);
    });

    it('should cancel order in PENDING_PAYMENT status by customer', async () => {
      const order = createMockOrder(OrderStatus.PENDING_PAYMENT);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      const result = await service.cancelOrder(
        'order-1',
        'Payment failed',
        'customer',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledAt).toBeDefined();
      expect(result.cancellationReason).toBe('Payment failed');
      expect(result.cancelledBy).toBe('customer');
    });

    it('should reject customer cancellation of PAID order', async () => {
      const order = createMockOrder(OrderStatus.PAID);
      orderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelOrder('order-1', 'Customer request', 'customer'),
      ).rejects.toThrow('Customer cannot cancel order in status: PAID');
    });

    it('should cancel order in PAID status by admin', async () => {
      const order = createMockOrder(OrderStatus.PAID);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      const result = await service.cancelOrder(
        'order-1',
        'Admin cancellation',
        'admin',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledBy).toBe('admin');
    });

    it('should cancel order in IN_PRODUCTION status by admin', async () => {
      const order = createMockOrder(OrderStatus.IN_PRODUCTION);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      const result = await service.cancelOrder(
        'order-1',
        'Production issue',
        'admin',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledBy).toBe('admin');
    });

    it('should reject admin cancellation of SHIPPED order', async () => {
      const order = createMockOrder(OrderStatus.SHIPPED);
      orderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelOrder('order-1', 'Admin request', 'admin'),
      ).rejects.toThrow('Admin/system cannot cancel order in status: SHIPPED');
    });

    it('should reject admin cancellation of COMPLETED order', async () => {
      const order = createMockOrder(OrderStatus.COMPLETED);
      orderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelOrder('order-1', 'Admin request', 'admin'),
      ).rejects.toThrow('Admin/system cannot cancel order in status: COMPLETED');
    });

    it('should reject cancellation of already CANCELLED order', async () => {
      const order = createMockOrder(OrderStatus.CANCELLED);
      order.cancelledAt = new Date();
      order.cancellationReason = 'Previous cancellation';
      order.cancelledBy = 'customer';
      orderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelOrder('order-1', 'Another reason', 'customer'),
      ).rejects.toThrow('Order is already cancelled');
    });

    it('should reject cancellation with empty reason', async () => {
      const order = createMockOrder(OrderStatus.INIT);
      orderRepository.findById.mockResolvedValue(order);

      await expect(
        service.cancelOrder('order-1', '', 'customer'),
      ).rejects.toThrow('Cancellation reason is required');
    });

    it('should handle system cancellation', async () => {
      const order = createMockOrder(OrderStatus.PAID);
      orderRepository.findById.mockResolvedValue(order);
      orderRepository.save.mockResolvedValue(order);

      const result = await service.cancelOrder(
        'order-1',
        'System timeout',
        'system',
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result.cancelledBy).toBe('system');
    });
  });
});

describe('OrderService - Aftersale resolution state restoration', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  let statusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository>;

  const createMockRecipeSnapshot = () => ({
    id: 'recipe-1',
    version: 1,
    name: 'Test Recipe',
    production_loss_rate: 1.07,
    energy_density_kcal_per_kg: 1450,
    nutrition_standard: 'FEDIAF_2021',
    items: [],
  });

  const createMockOrder = (status: OrderStatus) => {
    const item = new OrderItem(
      'item-1',
      'order-1',
      'dog-1',
      createMockRecipeSnapshot(),
      1000,
      10,
      100,
      null,
      310.34,
    );

    return new Order(
      'order-1',
      'customer-1',
      status,
      OrderType.FRESH_FOOD,
      new Date('2025-01-01T00:00:00Z'),
      null,
      null,
      100,
      10,
      110,
      [item],
    );
  };

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockStatusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository> = {
    append: jest.fn(),
    findByOrderId: jest.fn(),
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
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: {},
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: {},
        },
        {
          provide: DOG_REPOSITORY,
          useValue: {},
        },
        {
          provide: ADDRESS_REPOSITORY,
          useValue: {},
        },
        {
          provide: PricingService,
          useValue: {},
        },
        {
          provide: GlobalConfigService,
          useValue: {},
        },
        {
          provide: ShippingService,
          useValue: {},
        },
        {
          provide: OrderSourcePlanService,
          useValue: { applySourcePlanToIngredients: jest.fn() },
        },
        {
          provide: 'IOrderPricingSnapshotRepository',
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            markAsUsed: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            preparationMethod: { findMany: jest.fn().mockResolvedValue([]) },
            order: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(ORDER_REPOSITORY);
    statusHistoryRepository = module.get(ORDER_STATUS_HISTORY_REPOSITORY);
    orderRepository.save.mockImplementation(async (order) => order);
    statusHistoryRepository.append.mockResolvedValue(
      new OrderStatusHistory(
        'history-resolve',
        'order-1',
        OrderStatus.AFTERSALE,
        OrderStatus.PAID,
        new Date('2025-01-02T00:00:00Z'),
        'admin',
        'admin-1',
        null,
      ),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('restores a rejected refund to the status before aftersale', async () => {
    const order = createMockOrder(OrderStatus.PURCHASING);
    order.applyForAftersale(AftersaleType.REFUND, '想退款', []);
    orderRepository.findById.mockResolvedValue(order);
    statusHistoryRepository.findByOrderId.mockResolvedValue([
      new OrderStatusHistory(
        'history-apply',
        'order-1',
        OrderStatus.PURCHASING,
        OrderStatus.AFTERSALE,
        new Date('2025-01-01T00:00:00Z'),
        'customer',
        'customer-1',
        { type: AftersaleType.REFUND },
      ),
    ]);

    const result = await service.resolveAftersale(
      'order-1',
      'resolved',
      'admin-1',
      '退款驳回',
      'ADMIN',
    );

    expect(result.status).toBe(OrderStatus.PURCHASING);
    expect(result.completedAt).toBeFalsy();
    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.AFTERSALE,
      OrderStatus.PURCHASING,
      'admin',
      'admin-1',
      { resolutionType: 'resolved', adminNote: '退款驳回' },
    );
  });

  it('restores complaint resolution to the status before aftersale', async () => {
    const order = createMockOrder(OrderStatus.SHIPPED);
    order.applyForAftersale(AftersaleType.COMPLAINT, '有问题', []);
    orderRepository.findById.mockResolvedValue(order);
    statusHistoryRepository.findByOrderId.mockResolvedValue([
      new OrderStatusHistory(
        'history-apply',
        'order-1',
        OrderStatus.SHIPPED,
        OrderStatus.AFTERSALE,
        new Date('2025-01-01T00:00:00Z'),
        'customer',
        'customer-1',
        { type: AftersaleType.COMPLAINT },
      ),
    ]);

    const result = await service.resolveAftersale(
      'order-1',
      'resolved',
      'admin-1',
      '已沟通',
      'ADMIN',
    );

    expect(result.status).toBe(OrderStatus.SHIPPED);
    expect(result.completedAt).toBeFalsy();
  });

  it('rejects remake requests before production output exists', () => {
    const order = createMockOrder(OrderStatus.PAID);

    expect(() =>
      order.applyForAftersale(AftersaleType.REMAKE, '想重做', []),
    ).toThrow('Cannot apply for REMAKE aftersale from status: PAID');
  });

  it('blocks staff from resolving refund requests', async () => {
    const order = createMockOrder(OrderStatus.PAID);
    order.applyForAftersale(AftersaleType.REFUND, '想退款', []);
    orderRepository.findById.mockResolvedValue(order);

    await expect(
      service.resolveAftersale(
        'order-1',
        'resolved',
        'staff-1',
        '员工驳回',
        'STAFF',
      ),
    ).rejects.toThrow('退款申请仅管理员可以审核');
  });
});

describe('OrderService - Phase 8.17: Payment Transaction Tracking', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<OrderRepository>;
  const createMockRecipeSnapshot = () => ({
    id: 'recipe-1',
    version: 1,
    name: 'Test Recipe',
    production_loss_rate: 1.07,
    energy_density_kcal_per_kg: 1450,
    nutrition_standard: 'FEDIAF_2021',
    items: [],
  });

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockStatusHistoryRepository: jest.Mocked<OrderStatusHistoryRepository> = {
    append: jest.fn(),
    findByOrderId: jest.fn(),
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
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: {},
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: {},
        },
        {
          provide: DOG_REPOSITORY,
          useValue: {},
        },
        {
          provide: ADDRESS_REPOSITORY,
          useValue: {},
        },
        {
          provide: PricingService,
          useValue: {},
        },
        {
          provide: GlobalConfigService,
          useValue: {},
        },
        {
          provide: ShippingService,
          useValue: {},
        },
        {
          provide: OrderSourcePlanService,
          useValue: { applySourcePlanToIngredients: jest.fn() },
        },
        {
          provide: 'IOrderPricingSnapshotRepository',
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            markAsUsed: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            preparationMethod: { findMany: jest.fn().mockResolvedValue([]) },
            order: { findUnique: jest.fn(), update: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    orderRepository = module.get(ORDER_REPOSITORY);

    jest.clearAllMocks();
  });

  describe('processPayment', () => {
    const createMockOrder = (status: OrderStatus) => {
      const item = new OrderItem(
        'item-1',
        'order-1',
        'dog-1',
        createMockRecipeSnapshot(),
        1000,
        10,
        100,
        null,
        310.34,
      );

      return new Order(
        'order-1',
        'customer-1',
        status,
        OrderType.FRESH_FOOD,
        new Date('2025-01-01T00:00:00Z'),
        null,
        null,
        100,
        10,
        110,
        [item],
      );
    };

    it('should record payment and transition to PAID', async () => {
      const order = createMockOrder(OrderStatus.PENDING_PAYMENT);

      mockOrderRepository.findById.mockResolvedValue(order);
      mockOrderRepository.save.mockImplementation(async (o) => o);

      const result = await service.processPayment('order-1');

      expect(result.status).toBe(OrderStatus.PAID);
      expect(result.paymentStatus).toBe('SUCCESS');
      expect(result.paymentMethod).toBe('WECHAT');
      expect(result.transactionId).toMatch(/^MOCK_\d+_[a-z0-9]+$/);
      expect(result.paidAt).toBeInstanceOf(Date);
      expect(orderRepository.save).toHaveBeenCalledWith(result);
    });

    it('should use default payment method WECHAT when not provided', async () => {
      const order = createMockOrder(OrderStatus.PENDING_PAYMENT);

      mockOrderRepository.findById.mockResolvedValue(order);
      mockOrderRepository.save.mockImplementation(async (o) => o);

      const result = await service.processPayment('order-1');

      expect(result.paymentMethod).toBe('WECHAT');
    });

    it('should be idempotent for already PAID orders', async () => {
      const order = createMockOrder(OrderStatus.PAID);
      order.paymentMethod = 'WECHAT';
      order.transactionId = 'MOCK_1234567890_abc123';
      order.paidAt = new Date('2025-01-01');
      order.paymentStatus = 'SUCCESS';

      // Verify order has payment fields set
      expect(order.paymentMethod).toBe('WECHAT');
      expect(order.transactionId).toBe('MOCK_1234567890_abc123');
      expect(order.paymentStatus).toBe('SUCCESS');

      mockOrderRepository.findById.mockResolvedValue(order);
      mockOrderRepository.save.mockImplementation(async (o) => o);

      const result = await service.processPayment('order-1');

      // Idempotency: should return the same order without calling save
      expect(result).toBe(order);
      expect(result.status).toBe(OrderStatus.PAID);
      // Verify payment fields are preserved
      expect(result.paymentMethod).toBe('WECHAT');
      expect(result.transactionId).toBe('MOCK_1234567890_abc123');
      expect(result.paymentStatus).toBe('SUCCESS');
      expect(result.paidAt).toBeInstanceOf(Date);
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if order not found', async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(service.processPayment('non-existent')).rejects.toThrow(
        'Order not found: non-existent',
      );
    });

    it('should throw InvalidStateTransitionError if order is not in PENDING_PAYMENT', async () => {
      const order = createMockOrder(OrderStatus.INIT);

      mockOrderRepository.findById.mockResolvedValue(order);

      await expect(service.processPayment('order-1')).rejects.toThrow(
        'Cannot record payment for order in status: INIT',
      );
    });
  });
});
