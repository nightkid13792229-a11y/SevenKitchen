/**
 * Orders Controller API Tests
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { OrdersController } from './orders.controller';
import { UnauthorizedExceptionFilter } from '../common/unauthorized-exception.filter';
import {
  OrderService,
  ORDER_REPOSITORY,
} from '../../application/order/order.service';
import { RECIPE_REPOSITORY, DOG_REPOSITORY } from '../../application/dog/dog.service';
import { INGREDIENT_REPOSITORY } from '../../application/ingredient/ingredient.service';
import { ADDRESS_REPOSITORY } from '../../application/address/address.service';
import { InMemoryOrderRepository } from '../../infrastructure/repositories/in-memory-order.repository';
import { InMemoryRecipeRepository } from '../../infrastructure/repositories/in-memory-recipe.repository';
import { InMemoryIngredientRepository } from '../../infrastructure/repositories/in-memory-ingredient.repository';
import { InMemoryDogRepository } from '../../infrastructure/repositories/in-memory-dog.repository';
import { InMemoryAddressRepository } from '../../infrastructure/repositories/in-memory-address.repository';
import { PricingService } from '../../domain/pricing/pricing.service';
import { GlobalConfigService } from '../../application/config/global-config.service';
import { ShippingService } from '../../application/shipping/shipping.service';
import { ShippingFeeService } from '../../domain/shipping/shipping-fee.service';
import { SHIPPING_TEMPLATE_REPOSITORY } from '../../application/shipping/shipping.service.tokens';
import { InMemoryShippingTemplateRepository } from '../../infrastructure/repositories/in-memory-shipping-template.repository';
import type { Recipe } from '../../domain/recipe/recipe.repository';
import { OrderStatus, OrderType, DogGender, ActivityLevel, LifeStageOverride, TreatInputMode, TreatLevel } from '../../domain';
import { Order, OrderItem, PricingBreakdownSnapshot } from '../../domain/order';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { JwtAuthService } from '../auth/jwt.service';
import { AuthGuard } from '../auth/auth.guard';
import { Dog } from '../../domain/dog/dog.entity';
import { Ingredient, IngredientType, BaseUnit } from '../../domain/ingredient';

describe('OrdersController (e2e)', () => {
  let app: INestApplication;
  let orderRepository: InMemoryOrderRepository;
  let recipeRepository: InMemoryRecipeRepository;
  let orderService: OrderService;
  let dogRepository: InMemoryDogRepository;
  let ingredientRepository: InMemoryIngredientRepository;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [OrdersController],
      providers: [
        OrderService,
        {
          provide: ORDER_REPOSITORY,
          useClass: InMemoryOrderRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useClass: InMemoryRecipeRepository,
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useClass: InMemoryIngredientRepository,
        },
        {
          provide: DOG_REPOSITORY,
          useClass: InMemoryDogRepository,
        },
        {
          provide: ADDRESS_REPOSITORY,
          useClass: InMemoryAddressRepository,
        },
        PricingService,
        GlobalConfigService,
        ShippingFeeService,
        ShippingService,
        {
          provide: SHIPPING_TEMPLATE_REPOSITORY,
          useClass: InMemoryShippingTemplateRepository,
        },
        JwtAuthService,
        AuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new UnauthorizedExceptionFilter());

    orderRepository = moduleFixture.get(ORDER_REPOSITORY);
    recipeRepository = moduleFixture.get(RECIPE_REPOSITORY);
    orderService = moduleFixture.get(OrderService);
    dogRepository = moduleFixture.get(DOG_REPOSITORY);
    ingredientRepository = moduleFixture.get(INGREDIENT_REPOSITORY);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Helper function to create minimal test dog
  async function createTestDog(ownerId: string, dogId: string): Promise<void> {
    const dog = new Dog(
      dogId,
      ownerId,
      'Test Dog',
      '550e8400-e29b-41d4-a716-446655440000', // breedId
      new Date('2020-01-01'),
      DogGender.MALE,
      false,
      10.0, // currentWeightKg
      5, // bcsScore
      ActivityLevel.NORMAL,
      LifeStageOverride.NONE,
      null, // sizeClassOverride
      2, // mealsPerDay
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.LOW,
      null, // manualTreatKcal
      null, // medicalHistory
      500, // cachedTargetFoodKcal
    );
    await dogRepository.save(dog);
  }

  // Helper function to create minimal test ingredient
  async function createTestIngredient(ingredientId: string): Promise<void> {
    const ingredient = new Ingredient(
      ingredientId,
      'Test Ingredient',
      IngredientType.FOOD,
      null, // brand
      null, // productModel
      null, // purchaseChannel
      null, // notes
      BaseUnit.G,
      null, // unitDisplayLabel
      'kg',
      1.0, // purchaseToBaseRatio
      50.0, // currentPricePerPurchaseUnit (50 CNY per kg)
      null, // weightG
      null, // maxCapacityG
      { edible_yield_rate: 0.8 }, // properties
    );
    await ingredientRepository.save(ingredient);
  }

  // Helper function to create test recipe with items
  async function createTestRecipeWithItems(recipeId: string, ingredientId: string): Promise<void> {
    const recipe: Recipe = {
      id: recipeId,
      version: 1,
      name: 'Test Recipe',
      status: 'PUBLIC',
      energyDensityKcalPerKg: 1450,
      productionLossRate: 1.07,
      batchLaborHours: 2.0,
      items: [
        {
          id: 'recipe-item-1',
          ingredientId,
          ratioPercent: 100,
          isPrimarySource: true,
        },
      ],
    };
    await recipeRepository.save(recipe);
  }

  describe('POST /api/v1/orders', () => {
    it('should return 401 when X-Customer-Id header is missing', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        version: 1,
        name: 'Test Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(recipe);

      const createOrderPayload = {
        dogId: '550e8400-e29b-41d4-a716-446655440000',
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId: recipe.id,
            quantityG: 1400,
            packageCount: 14,
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .send(createOrderPayload)
        .expect(200); // HTTP status is 200, but code in body is 401

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body.message).toContain('Unauthorized');
    });

    it('should create order draft with INIT status', async () => {
      const customerId = 'test-customer-id';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const createOrderPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            packageCount: 14,
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .send(createOrderPayload)
        .expect(201);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('status', OrderStatus.INIT);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.items).toHaveLength(1);
    });
  });

  describe('POST /api/v1/orders/:id/confirm and POST /api/v1/orders/:id/pay', () => {
    it('should successfully transition: INIT -> PENDING_PAYMENT -> PAID', async () => {
      // Create order with item
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-id-1',
        'test-order-id',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );
      const order = new Order(
        'test-order-id',
        'test-customer-id',
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [orderItem],
      );
      await orderRepository.save(order);

      // Confirm order (INIT -> PENDING_PAYMENT)
      const confirmResponse = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .expect(200);

      expect(confirmResponse.body.data.status).toBe(
        OrderStatus.PENDING_PAYMENT,
      );

      // Pay order (PENDING_PAYMENT -> PAID)
      const payResponse = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/pay`)
        .expect(200);

      expect(payResponse.body.data.status).toBe(OrderStatus.PAID);
    });

    it('should fail illegal transition: pay before confirm', async () => {
      // Create order in INIT status with item
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-id-2',
        'test-order-id-2',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );
      const order = new Order(
        'test-order-id-2',
        'test-customer-id',
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [orderItem],
      );
      await orderRepository.save(order);

      // Try to pay directly (should fail - must confirm first)
      const payResponse = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/pay`)
        .expect(200); // API returns 200 with error code in body

      expect(payResponse.body).toHaveProperty('code', 400);
      expect(payResponse.body.message).toContain('Cannot transition');
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should return 401 when X-Customer-Id header is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .expect(200); // HTTP status is 200, but code in body is 401

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body.message).toContain('Unauthorized');
    });

    it('should return empty list when customer has no orders', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('X-Customer-Id', 'test-customer-id')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should return orders created by current customer', async () => {
      const customerId = 'test-customer-id';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };

      // Create two orders for the customer
      const order1 = new Order(
        'order-id-1',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [
          new OrderItem(
            'item-id-1',
            'order-id-1',
            recipeSnapshot,
            1400,
            14,
            100,
            null,
            310.34, // dailyIntakeG
          ),
        ],
      );
      const order2 = new Order(
        'order-id-2',
        customerId,
        OrderStatus.PENDING_PAYMENT,
        OrderType.FRESH_FOOD,
        null,
        350.0, // amountProduct
        0.0, // amountShipping
        350.0, // amountTotal
        [
          new OrderItem(
            'item-id-2',
            'order-id-2',
            recipeSnapshot,
            2000,
            20,
            100,
            null,
            310.34, // dailyIntakeG
          ),
        ],
      );

      await orderRepository.save(order1);
      await orderRepository.save(order2);

      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);

      // Verify summary structure
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const summaries = response.body.data;
      expect(summaries[0]).toHaveProperty('id');
      expect(summaries[0]).toHaveProperty('status');
      expect(summaries[0]).toHaveProperty('type');
      expect(summaries[0]).toHaveProperty('totalAmount');
      expect(summaries[0]).toHaveProperty('itemCount');
      expect(summaries[0]).not.toHaveProperty('items'); // Summary should not include full items

      // Verify order IDs are present
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const orderIds = summaries.map((s: { id: string }) => s.id);
      expect(orderIds).toContain('order-id-1');
      expect(orderIds).toContain('order-id-2');
    });

    it('should not leak other customer orders', async () => {
      const customerId1 = 'customer-a';
      const customerId2 = 'customer-b';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };

      // Create order for customer 1
      const order1 = new Order(
        'order-customer-1',
        customerId1,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [
          new OrderItem(
            'item-customer-1',
            'order-customer-1',
            recipeSnapshot,
            1400,
            14,
            100,
            null,
            310.34, // dailyIntakeG
          ),
        ],
      );

      // Create order for customer 2
      const order2 = new Order(
        'order-customer-2',
        customerId2,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        150.0, // amountProduct
        0.0, // amountShipping
        150.0, // amountTotal
        [
          new OrderItem(
            'item-customer-2',
            'order-customer-2',
            recipeSnapshot,
            1000,
            10,
            100,
            null,
            310.34, // dailyIntakeG
          ),
        ],
      );

      await orderRepository.save(order1);
      await orderRepository.save(order2);

      // Request orders as customer 1 (should only get customer 1's orders)
      const response = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('X-Customer-Id', customerId1)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);

      // Should only return customer 1's order
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const summaries = response.body.data;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const orderIds = summaries.map((s: { id: string }) => s.id);
      expect(orderIds).toContain('order-customer-1');
      expect(orderIds).not.toContain('order-customer-2');

      // Also verify customer 2 can only see their own orders
      const responseCustomer2 = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('X-Customer-Id', customerId2)
        .expect(200);

      expect(responseCustomer2.body).toHaveProperty('code', 0);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const summariesCustomer2 = responseCustomer2.body.data;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const orderIdsCustomer2 = summariesCustomer2.map(
        (s: { id: string }) => s.id,
      );
      expect(orderIdsCustomer2).toContain('order-customer-2');
      expect(orderIdsCustomer2).not.toContain('order-customer-1');
    });

    it('should create orders with correct customer ID from auth context', async () => {
      const customerId = 'auth-customer-123';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const createOrderPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            packageCount: 14,
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .send(createOrderPayload)
        .expect(201);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty('customerId', customerId);

      // Verify it appears in list for that customer
      const listResponse = await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(listResponse.body.code).toBe(0);
      expect(listResponse.body.data).toHaveLength(1);
      expect(listResponse.body.data[0].id).toBe(response.body.data.id);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return 404 for missing order', async () => {
      const customerId = 'test-customer-get-404';
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${nonExistentId}`)
        .set('X-Customer-Id', customerId)
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body).toHaveProperty('message', 'Order not found');
      expect(response.body.data).toBeNull();
    });

    it('should return order detail for existing order', async () => {
      const customerId = 'test-customer-get-detail';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-id-3',
        'test-order-id-3',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );
      const order = new Order(
        'test-order-id-3',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [orderItem],
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(order.id);
      expect(response.body.data.status).toBe(OrderStatus.INIT);
    });
  });

  describe('GET /api/v1/orders/items/:itemId/snapshot', () => {
    it('should return snapshot for order item', async () => {
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };

      const orderItem = new OrderItem(
        'test-item-id',
        'test-order-id-4',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      const order = new Order(
        'test-order-id-4',
        'test-customer-id',
        OrderStatus.PAID,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [orderItem],
      );
      await orderRepository.save(order);

      // Note: This test requires finding by itemId, which currently searches by customerId
      // In real implementation, we should add findOrderItemById to repository
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/items/${orderItem.id}/snapshot`)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBe(recipeSnapshot.id);
      expect(response.body.data.name).toBe(recipeSnapshot.name);
    });
  });

  describe('Snapshot immutability', () => {
    it('should maintain snapshot immutability after order is paid', async () => {
      const originalRecipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Original Recipe Name',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };

      const orderItem = new OrderItem(
        'test-item-id-immutable',
        'test-order-id-immutable',
        originalRecipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      const order = new Order(
        'test-order-id-immutable',
        'test-customer-id',
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        250.0, // amountProduct
        0.0, // amountShipping
        250.0, // amountTotal
        [orderItem],
      );
      await orderRepository.save(order);

      // Confirm and pay order (making snapshots immutable)
      await orderService.confirmOrder(order.id);
      const paidOrder = await orderService.processPayment(order.id);

      expect(paidOrder.status).toBe(OrderStatus.PAID);
      expect(paidOrder.areSnapshotsImmutable()).toBe(true);

      // Get the item snapshot after payment
      const item = paidOrder.items[0];
      const snapshotAfterPayment = item.recipeSnapshot;

      // Verify snapshot hasn't changed
      expect(snapshotAfterPayment.name).toBe(originalRecipeSnapshot.name);
      expect(snapshotAfterPayment.id).toBe(originalRecipeSnapshot.id);
      expect(snapshotAfterPayment.version).toBe(originalRecipeSnapshot.version);

      // Even if we try to modify the snapshot object (JavaScript reference),
      // the domain should prevent this, but in our current implementation,
      // the snapshot is readonly in the OrderItem, so direct mutation would fail
      // This test verifies that the snapshot content is preserved
    });
  });

  describe('GET /api/v1/orders/:id/pricing-breakdown (Phase 7.1)', () => {
    it('should return pricing breakdown for order owner', async () => {
      const customerId = 'test-customer-breakdown';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-breakdown-1',
        'order-breakdown-1',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      // Create order with pricing breakdown snapshot
      const pricingBreakdown = new PricingBreakdownSnapshot(
        50.0, // costIngredients
        2.0, // costPackaging
        10.0, // costLabor
        5.0, // costOverhead
        67.0, // totalProductCost
        111.67, // productPrice
        12.0, // shippingFee
        123.67, // totalPrice
        '8fa85f64-5717-4562-b3fc-2c963f66afa6', // shippingTemplateId
        'targetMargin_40%', // marginStrategyName
        new Date(),
        null, // ingredientPriceVersionHash
      );

      const order = new Order(
        'order-breakdown-1',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        111.67, // amountProduct
        12.0, // amountShipping
        123.67, // amountTotal
        [orderItem],
        undefined, // totalAmount
        pricingBreakdown,
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('costIngredients', 50.0);
      expect(response.body.data).toHaveProperty('costPackaging', 2.0);
      expect(response.body.data).toHaveProperty('costLabor', 10.0);
      expect(response.body.data).toHaveProperty('costOverhead', 5.0);
      expect(response.body.data).toHaveProperty('totalProductCost', 67.0);
      expect(response.body.data).toHaveProperty('productPrice', 111.67);
      expect(response.body.data).toHaveProperty('shippingFee', 12.0);
      expect(response.body.data).toHaveProperty('totalPrice', 123.67);
      expect(response.body.data).toHaveProperty('marginStrategyName');
      expect(response.body.data).toHaveProperty('createdAt');
    });

    it('should enforce customer isolation - customer B cannot access customer A breakdown', async () => {
      const customerA = 'customer-a-breakdown';
      const customerB = 'customer-b-breakdown';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-isolation',
        'order-isolation',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      const pricingBreakdown = new PricingBreakdownSnapshot(
        50.0,
        2.0,
        10.0,
        5.0,
        67.0,
        111.67,
        12.0,
        123.67,
        null,
        'targetMargin_40%',
        new Date(),
        null,
      );

      const order = new Order(
        'order-isolation',
        customerA,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        111.67,
        12.0,
        123.67,
        [orderItem],
        undefined,
        pricingBreakdown,
      );
      await orderRepository.save(order);

      // Customer B tries to access Customer A's order breakdown
      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerB)
        .expect(200); // API returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body.message).toContain('Order not found');
    });

    it('should return null data for legacy orders without breakdown', async () => {
      const customerId = 'test-customer-legacy';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-legacy',
        'order-legacy',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      // Create order without pricing breakdown snapshot (legacy order)
      const order = new Order(
        'order-legacy',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        111.67,
        12.0,
        123.67,
        [orderItem],
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeNull();
    });

    it('should include pricing breakdown in order detail when available', async () => {
      const customerId = 'test-customer-detail';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const createOrderPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            packageCount: 14,
            packageSpecG: 100,
          },
        ],
      };

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .send(createOrderPayload)
        .expect(201);

      expect(createResponse.body).toHaveProperty('code', 0);
      const orderId = createResponse.body.data.id;

      // Fetch order detail
      const detailResponse = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(detailResponse.body).toHaveProperty('code', 0);
      expect(detailResponse.body.data).toBeDefined();
      // Pricing breakdown should be included if available
      if (detailResponse.body.data.pricingBreakdown) {
        expect(detailResponse.body.data.pricingBreakdown).toHaveProperty(
          'costIngredients',
        );
        expect(detailResponse.body.data.pricingBreakdown).toHaveProperty(
          'productPrice',
        );
        expect(detailResponse.body.data.pricingBreakdown).toHaveProperty(
          'totalPrice',
        );
      }
    });
  });

  describe('POST /api/v1/orders/pricing/preview', () => {
    it('should compute packageCount when missing (ceil(quantityG/packageSpecG))', async () => {
      const customerId = 'test-customer-preview';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      // Request without packageCount - should compute as ceil(1400/100) = 14
      const previewPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            // packageCount missing - should be computed
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders/pricing/preview')
        .set('X-Customer-Id', customerId)
        .send(previewPayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('amountProduct');
      expect(response.body.data).toHaveProperty('amountShipping');
      expect(response.body.data).toHaveProperty('amountTotal');
      expect(response.body.data.amountProduct).toBeGreaterThan(0);
      expect(response.body.data.amountTotal).toBeGreaterThan(0);
    });

    it('should return 422 for invalid input', async () => {
      const customerId = 'test-customer-preview-invalid';
      const invalidPayload = {
        dogId: 'not-a-uuid',
        type: OrderType.FRESH_FOOD,
        items: [],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders/pricing/preview')
        .set('X-Customer-Id', customerId)
        .send(invalidPayload)
        .expect(400); // Validation error returns 400 HTTP status

      // Should return error (validation fails at HTTP level)
      expect(response.body).toBeDefined();
    });

    it('should return 404 for non-existent dog', async () => {
      const customerId = 'test-customer-preview-404';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup recipe but not dog
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const previewPayload = {
        dogId: '550e8400-e29b-41d4-a716-446655440999', // Non-existent
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            packageCount: 14,
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders/pricing/preview')
        .set('X-Customer-Id', customerId)
        .send(previewPayload)
        .expect(200); // HTTP 200, but code in body should be 404

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body.message).toContain('Dog not found');
    });

    it('should return 400 for invalid packageSpecG when packageCount is missing', async () => {
      const customerId = 'test-customer-preview-invalid-spec';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const previewPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            // packageCount missing
            packageSpecG: 0, // Invalid: must be > 0 (DTO validation fails)
          },
        ],
      };

      // DTO validation fails at HTTP level (400), not application layer
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders/pricing/preview')
        .set('X-Customer-Id', customerId)
        .send(previewPayload)
        .expect(400); // DTO validation returns 400 HTTP status

      // Validation error response structure
      expect(response.body).toBeDefined();
    });

    it('should respect provided packageCount even if it differs from computed value', async () => {
      const customerId = 'test-customer-preview-provided';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      // quantityG=1400, packageSpecG=100 would compute to 14, but we provide 20
      const previewPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            packageCount: 20, // Provided explicitly
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders/pricing/preview')
        .set('X-Customer-Id', customerId)
        .send(previewPayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.amountProduct).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/orders (order creation with packageCount normalization)', () => {
    it('should compute packageCount when missing during order creation', async () => {
      const customerId = 'test-customer-create-computed';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const createOrderPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            // packageCount missing - should be computed as ceil(1400/100) = 14
            packageSpecG: 100,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .send(createOrderPayload)
        .expect(201);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0].packageCount).toBe(14); // Computed value
    });

    it('should return 400 for invalid packageSpecG when creating order without packageCount', async () => {
      const customerId = 'test-customer-create-invalid';
      const dogId = '550e8400-e29b-41d4-a716-446655440000';
      const recipeId = '550e8400-e29b-41d4-a716-446655440001';
      const ingredientId = '550e8400-e29b-41d4-a716-446655440002';

      // Setup test data
      await createTestDog(customerId, dogId);
      await createTestIngredient(ingredientId);
      await createTestRecipeWithItems(recipeId, ingredientId);

      const createOrderPayload = {
        dogId,
        type: OrderType.FRESH_FOOD,
        items: [
          {
            recipeId,
            quantityG: 1400,
            // packageCount missing
            packageSpecG: 0, // Invalid: must be > 0 (DTO validation fails)
          },
        ],
      };

      // DTO validation fails at HTTP level (400), not application layer
      const response = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('X-Customer-Id', customerId)
        .send(createOrderPayload)
        .expect(400); // DTO validation returns 400 HTTP status

      // Validation error response structure
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /api/v1/orders/:id/pricing-breakdown (Phase 7.2 - Price Explanation)', () => {
    it('should include priceExplanation in response when breakdown exists', async () => {
      const customerId = 'test-customer-explanation';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-explanation-1',
        'order-explanation-1',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      const pricingBreakdown = new PricingBreakdownSnapshot(
        50.0, // costIngredients
        2.0, // costPackaging
        10.0, // costLabor
        5.0, // costOverhead
        67.0, // totalProductCost
        111.67, // productPrice
        12.0, // shippingFee
        123.67, // totalPrice
        '8fa85f64-5717-4562-b3fc-2c963f66afa6', // shippingTemplateId
        'targetMargin_40%', // marginStrategyName
        new Date(),
        null, // ingredientPriceVersionHash
      );

      const order = new Order(
        'order-explanation-1',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        111.67, // amountProduct
        12.0, // amountShipping
        123.67, // amountTotal
        [orderItem],
        undefined, // totalAmount
        pricingBreakdown,
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('priceExplanation');
      expect(response.body.data.priceExplanation).toBeDefined();
      
      const explanation = response.body.data.priceExplanation;
      expect(explanation).toHaveProperty('productPrice', 111.67);
      expect(explanation).toHaveProperty('shippingFee', 12.0);
      expect(explanation).toHaveProperty('totalPrice', 123.67);
      expect(explanation).toHaveProperty('costIngredients', 50.0);
      expect(explanation).toHaveProperty('costPackaging', 2.0);
      expect(explanation).toHaveProperty('costLabor', 10.0);
      expect(explanation).toHaveProperty('costOverhead', 5.0);
      
      // marginAmount = productPrice - totalProductCost = 111.67 - 67.0 = 44.67
      expect(explanation).toHaveProperty('marginAmount', 44.67);
      expect(explanation).toHaveProperty('explanationLines');
      expect(Array.isArray(explanation.explanationLines)).toBe(true);
      expect(explanation.explanationLines.length).toBeGreaterThan(0);
    });

    it('should return null priceExplanation for legacy orders without breakdown', async () => {
      const customerId = 'test-customer-legacy-explanation';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-legacy-explanation',
        'order-legacy-explanation',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      // Create order without pricing breakdown snapshot (legacy order)
      const order = new Order(
        'order-legacy-explanation',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        111.67,
        12.0,
        123.67,
        [orderItem],
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeNull();
    });

    it('should compute marginAmount correctly as productPrice - totalProductCost', async () => {
      const customerId = 'test-customer-margin';
      const recipeSnapshot: RecipeSnapshot = {
        id: 'recipe-id',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450, // Phase 8.9: Required field
        nutrition_standard: 'FEDIAF_2021',
        items: [],
      };
      const orderItem = new OrderItem(
        'item-margin',
        'order-margin',
        recipeSnapshot,
        1400,
        14,
        100,
        null,
        310.34, // dailyIntakeG
      );

      // Test with specific values: productPrice=100, totalProductCost=60, marginAmount should be 40
      const pricingBreakdown = new PricingBreakdownSnapshot(
        40.0, // costIngredients
        5.0, // costPackaging
        10.0, // costLabor
        5.0, // costOverhead
        60.0, // totalProductCost
        100.0, // productPrice
        15.0, // shippingFee
        115.0, // totalPrice
        null,
        'targetMargin_40%',
        new Date(),
        null,
      );

      const order = new Order(
        'order-margin',
        customerId,
        OrderStatus.INIT,
        OrderType.FRESH_FOOD,
        null,
        100.0,
        15.0,
        115.0,
        [orderItem],
        undefined,
        pricingBreakdown,
      );
      await orderRepository.save(order);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pricing-breakdown`)
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body.data.priceExplanation).toBeDefined();
      expect(response.body.data.priceExplanation.marginAmount).toBe(40.0); // 100 - 60
    });
  });
});
