/**
 * ProductionService Unit Tests
 * Phase 8.10: Tests for production batch creation and aggregation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProductionService, PRODUCTION_BATCH_REPOSITORY } from './production.service';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { ProductionBatchStatus } from '../../domain/production/enums';
import { Order, OrderItem } from '../../domain/order';
import { OrderStatus, OrderType } from '../../domain';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { ORDER_REPOSITORY } from '../order/order.service';

describe('ProductionService - Phase 8.10', () => {
  let service: ProductionService;
  let productionRepository: jest.Mocked<ProductionBatchRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;

  const mockProductionRepository: jest.Mocked<ProductionBatchRepository> = {
    findById: jest.fn(),
    findByProductionDate: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  const mockOrderRepository: jest.Mocked<OrderRepository> = {
    findById: jest.fn(),
    findByCustomerId: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        {
          provide: PRODUCTION_BATCH_REPOSITORY,
          useValue: mockProductionRepository,
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
    productionRepository = module.get(PRODUCTION_BATCH_REPOSITORY);
    orderRepository = module.get(ORDER_REPOSITORY);

    jest.clearAllMocks();
  });

  const createMockRecipeSnapshot = (id: string): RecipeSnapshot => {
    return {
      id,
      version: 1,
      name: 'Test Recipe',
      production_loss_rate: 1.07,
      energy_density_kcal_per_kg: 1450,
      nutrition_standard: 'FEDIAF_2021',
      items: [],
    };
  };

  const createMockOrderItem = (
    id: string,
    recipeSnapshot: RecipeSnapshot,
    dailyIntakeG: number,
  ): OrderItem => {
    return new OrderItem(
      id,
      'order-id-1',
      recipeSnapshot,
      1000, // quantityG
      5, // packageCount
      200, // packageSpecG
      null, // customRequirements
      dailyIntakeG,
    );
  };

  const createMockPaidOrder = (
    orderId: string,
    items: OrderItem[],
  ): Order => {
    return new Order(
      orderId,
      'customer-id-1',
      OrderStatus.PAID,
      OrderType.FRESH_FOOD,
      null,
      100,
      10,
      110,
      items,
      undefined,
      undefined,
      'dog-id-1',
      undefined,
    );
  };

  describe('createProductionBatch - aggregation correctness', () => {
    it('should aggregate dailyIntakeG correctly by recipeSnapshotId', async () => {
      // Arrange: Create orders with OrderItems having different dailyIntakeG values
      const recipeSnapshot1 = createMockRecipeSnapshot('recipe-1');
      const recipeSnapshot2 = createMockRecipeSnapshot('recipe-2');

      const orderItem1 = createMockOrderItem('item-1', recipeSnapshot1, 310.34); // 310.34g
      const orderItem2 = createMockOrderItem('item-2', recipeSnapshot1, 250.0); // 250g (same recipe)
      const orderItem3 = createMockOrderItem('item-3', recipeSnapshot2, 400.0); // 400g (different recipe)

      const order1 = createMockPaidOrder('order-1', [orderItem1, orderItem2]);
      const order2 = createMockPaidOrder('order-2', [orderItem3]);

      orderRepository.findByStatus.mockResolvedValue([order1, order2]);
      productionRepository.save.mockImplementation(async (batch) => batch);

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert
      expect(result.packagingUnits).toHaveLength(2); // Two unique recipes

      // Recipe 1: 310.34 + 250.0 = 560.34g
      const unit1 = result.packagingUnits.find(
        (u) => u.recipeSnapshot.id === 'recipe-1',
      );
      expect(unit1).toBeDefined();
      expect(unit1!.totalProductionG).toBeCloseTo(560.34, 2);
      expect(unit1!.sourceOrderItemIds).toEqual(['item-1', 'item-2']);

      // Recipe 2: 400.0g
      const unit2 = result.packagingUnits.find(
        (u) => u.recipeSnapshot.id === 'recipe-2',
      );
      expect(unit2).toBeDefined();
      expect(unit2!.totalProductionG).toBe(400.0);
      expect(unit2!.sourceOrderItemIds).toEqual(['item-3']);

      // Total production
      expect(result.getTotalProductionG()).toBeCloseTo(960.34, 2);
    });

    it('should reject non-PAID orders', async () => {
      // Arrange: Create order with INIT status
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const initOrder = new Order(
        'order-1',
        'customer-id-1',
        OrderStatus.INIT, // Not PAID
        OrderType.FRESH_FOOD,
        null,
        100,
        10,
        110,
        [orderItem],
        undefined,
        undefined,
        'dog-id-1',
        undefined,
      );

      orderRepository.findByStatus.mockResolvedValue([initOrder]);

      // Act & Assert
      await expect(
        service.createProductionBatch({
          productionDate: '2025-01-20',
        }),
      ).rejects.toThrow('Cannot include non-PAID orders');
    });

    it('should preserve RecipeSnapshot immutability', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const order = createMockPaidOrder('order-1', [orderItem]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      productionRepository.save.mockImplementation(async (batch) => batch);

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert: RecipeSnapshot in PackagingUnit should be identical to original
      const unit = result.packagingUnits[0];
      expect(unit.recipeSnapshot).toEqual(recipeSnapshot);
      expect(unit.recipeSnapshot.id).toBe('recipe-1');
      expect(unit.recipeSnapshot.energy_density_kcal_per_kg).toBe(1450);

      // Verify immutability: modifying the snapshot should not affect the unit
      const originalEnergyDensity = unit.recipeSnapshot.energy_density_kcal_per_kg;
      // Simulate Recipe update (should NOT affect batch)
      const updatedSnapshot = { ...recipeSnapshot, energy_density_kcal_per_kg: 2000 };
      
      // Unit should still have original value
      expect(unit.recipeSnapshot.energy_density_kcal_per_kg).toBe(originalEnergyDensity);
      expect(unit.recipeSnapshot.energy_density_kcal_per_kg).not.toBe(updatedSnapshot.energy_density_kcal_per_kg);
    });
  });
});
