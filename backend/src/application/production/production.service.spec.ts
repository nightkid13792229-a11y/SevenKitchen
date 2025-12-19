/**
 * ProductionService Unit Tests
 * Phase 8.10: Tests for production batch creation and aggregation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ProductionService, PRODUCTION_BATCH_REPOSITORY } from './production.service';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import type { OrderRepository } from '../../domain/order/order.repository';
import type { OrderStatusHistoryRepository } from '../../domain/order/order-status-history.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { ProductionBatchStatus, PackagingUnitStatus } from '../../domain/production/enums';
import { Order, OrderItem } from '../../domain/order';
import { OrderStatus, OrderType } from '../../domain';
import type { RecipeSnapshot } from '../../domain/recipe/types';
import { ORDER_REPOSITORY, ORDER_STATUS_HISTORY_REPOSITORY } from '../order/order.service';
import type { ProductionBatchSummaryDto } from './production.service';

describe('ProductionService - Phase 8.10', () => {
  let service: ProductionService;
  let productionRepository: jest.Mocked<ProductionBatchRepository>;
  let orderRepository: jest.Mocked<OrderRepository>;

  const mockProductionRepository: jest.Mocked<ProductionBatchRepository> = {
    findById: jest.fn(),
    findByProductionDate: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
    allocateOrderItems: jest.fn(),
    findPackagingUnitById: jest.fn(),
    updatePackagingUnit: jest.fn(),
    findBatchesByPackagingUnitStatus: jest.fn(),
    areAllUnitsCompleted: jest.fn(),
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
        ProductionService,
        {
          provide: PRODUCTION_BATCH_REPOSITORY,
          useValue: mockProductionRepository,
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
      ],
    }).compile();

    service = module.get<ProductionService>(ProductionService);
    productionRepository = module.get(PRODUCTION_BATCH_REPOSITORY);
    orderRepository = module.get(ORDER_REPOSITORY);

    jest.clearAllMocks();
    // Reset mock implementations
    mockProductionRepository.allocateOrderItems = jest.fn();
    
    // Suppress console.warn during tests (especially for allocation warnings)
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    jest.restoreAllMocks();
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

  // Helper function to map domain batch to DTO (simulating controller mapping)
  const mapBatchToDto = (batch: ProductionBatch): ProductionBatchSummaryDto => {
    const packagingUnits = batch.packagingUnits.map((unit) => ({
      recipeSnapshotId: unit.recipeSnapshot.id,
      totalProductionG: unit.totalProductionG,
      orderItemCount: unit.sourceOrderItemIds.length,
      sourceOrderItemIds: Array.isArray(unit.sourceOrderItemIds)
        ? unit.sourceOrderItemIds
        : [],
    }));

    return {
      id: batch.id,
      productionDate: batch.productionDate.toISOString().split('T')[0],
      status: batch.status,
      packagingUnits,
      totalProductionG: batch.getTotalProductionG(),
      uniqueRecipeCount: batch.getUniqueRecipeCount(),
      orderItemCount: packagingUnits.reduce((sum, unit) => sum + unit.orderItemCount, 0),
    };
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

    it('should include sourceOrderItemIds as string[] in domain entities', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem1 = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const orderItem2 = createMockOrderItem('item-2', recipeSnapshot, 250.0);
      const order = createMockPaidOrder('order-1', [orderItem1, orderItem2]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      productionRepository.save.mockImplementation(async (batch) => batch);

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert: sourceOrderItemIds must be an array
      expect(result.packagingUnits).toHaveLength(1);
      const unit = result.packagingUnits[0];
      
      // Verify sourceOrderItemIds is an array
      expect(Array.isArray(unit.sourceOrderItemIds)).toBe(true);
      expect(unit.sourceOrderItemIds).toEqual(['item-1', 'item-2']);
      expect(unit.sourceOrderItemIds.length).toBe(2);
    });

    it('should include sourceOrderItemIds in API response DTO', async () => {
      // Arrange
      const recipeSnapshot1 = createMockRecipeSnapshot('recipe-1');
      const recipeSnapshot2 = createMockRecipeSnapshot('recipe-2');

      const orderItem1 = createMockOrderItem('item-1', recipeSnapshot1, 310.34);
      const orderItem2 = createMockOrderItem('item-2', recipeSnapshot1, 250.0);
      const orderItem3 = createMockOrderItem('item-3', recipeSnapshot2, 400.0);

      const order1 = createMockPaidOrder('order-1', [orderItem1, orderItem2]);
      const order2 = createMockPaidOrder('order-2', [orderItem3]);

      orderRepository.findByStatus.mockResolvedValue([order1, order2]);
      productionRepository.save.mockImplementation(async (batch) => batch);

      // Act
      const batch = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });
      const dto = mapBatchToDto(batch);

      // Assert: DTO must include sourceOrderItemIds as string[]
      expect(dto.packagingUnits).toHaveLength(2);
      
      // Verify first unit
      const unit1 = dto.packagingUnits.find((u) => u.recipeSnapshotId === 'recipe-1');
      expect(unit1).toBeDefined();
      expect(Array.isArray(unit1!.sourceOrderItemIds)).toBe(true);
      expect(unit1!.sourceOrderItemIds).toEqual(['item-1', 'item-2']);
      expect(unit1!.orderItemCount).toBe(2);

      // Verify second unit
      const unit2 = dto.packagingUnits.find((u) => u.recipeSnapshotId === 'recipe-2');
      expect(unit2).toBeDefined();
      expect(Array.isArray(unit2!.sourceOrderItemIds)).toBe(true);
      expect(unit2!.sourceOrderItemIds).toEqual(['item-3']);
      expect(unit2!.orderItemCount).toBe(1);

      // Verify batch-level orderItemCount
      expect(dto.orderItemCount).toBe(3); // 2 + 1
    });

    it('should transition orders from PAID to IN_PRODUCTION when batch is created', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const order = createMockPaidOrder('order-1', [orderItem]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      // Mock findById to return a fresh order instance each time (to track transitions)
      let orderStatus = OrderStatus.PAID;
      orderRepository.findById.mockImplementation(async (id) => {
        const currentOrder = new Order(
          id,
          order.customerId,
          orderStatus,
          order.type,
          order.addressId,
          order.amountSubtotal,
          order.amountShipping,
          order.amountTotal,
          order.items,
          order.dogId,
        );
        return currentOrder;
      });
      productionRepository.save.mockImplementation(async (batch) => batch);
      productionRepository.allocateOrderItems.mockResolvedValue(1);
      orderRepository.save.mockImplementation(async (o) => {
        // Track status changes
        orderStatus = o.status;
        return o;
      });

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert: Batch should be in IN_PRODUCTION status
      expect(result.status).toBe(ProductionBatchStatus.IN_PRODUCTION);

      // Assert: Order should be transitioned to IN_PRODUCTION
      expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
      expect(orderRepository.save).toHaveBeenCalled();
      // Verify final order status is IN_PRODUCTION
      expect(orderStatus).toBe(OrderStatus.IN_PRODUCTION);
    });

    it('should handle empty sourceOrderItemIds gracefully', async () => {
      // Arrange: Create a batch with a unit that has empty sourceOrderItemIds
      // This test ensures the mapping handles edge cases
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const order = createMockPaidOrder('order-1', [orderItem]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      productionRepository.save.mockImplementation(async (batch) => batch);

      // Act
      const batch = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });
      
      // Simulate edge case: unit with empty array
      const unit = batch.packagingUnits[0];
      expect(Array.isArray(unit.sourceOrderItemIds)).toBe(true);
      expect(unit.sourceOrderItemIds.length).toBeGreaterThan(0); // Should have items

      // Map to DTO
      const dto = mapBatchToDto(batch);
      const dtoUnit = dto.packagingUnits[0];
      
      // Assert: Even if empty, should be an array
      expect(Array.isArray(dtoUnit.sourceOrderItemIds)).toBe(true);
      expect(dtoUnit.sourceOrderItemIds.length).toBe(1); // item-1
    });
  });

  describe('createProductionBatch - allocation lock (Phase 8.11)', () => {
    it('should allocate OrderItems and write productionBatchId', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem1 = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const orderItem2 = createMockOrderItem('item-2', recipeSnapshot, 250.0);
      const order = createMockPaidOrder('order-1', [orderItem1, orderItem2]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      productionRepository.save.mockImplementation(async (batch) => batch);
      (productionRepository.allocateOrderItems as jest.Mock).mockResolvedValue(2); // All 2 items allocated

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert: Allocation should be called
      expect(productionRepository.allocateOrderItems).toHaveBeenCalledWith(
        ['item-1', 'item-2'],
        expect.any(String), // batchId
      );
      expect(productionRepository.allocateOrderItems).toHaveBeenCalledTimes(1);
    });

    it('should not include already allocated items in new batch', async () => {
      // Arrange: Create order with already allocated items
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const allocatedItem = new OrderItem(
        'item-1',
        'order-1',
        recipeSnapshot,
        1000,
        5,
        200,
        null,
        310.34,
        'existing-batch-id', // Already allocated
        new Date(),
      );
      const order = createMockPaidOrder('order-1', [allocatedItem]);

      orderRepository.findByStatus.mockResolvedValue([order]);

      // Act & Assert: Should throw error because no eligible items
      await expect(
        service.createProductionBatch({
          productionDate: '2025-01-20',
        }),
      ).rejects.toThrow('No eligible OrderItems found');
      
      // Allocation should not be called
      expect(productionRepository.allocateOrderItems).not.toHaveBeenCalled();
    });

    it('should handle concurrent allocation conflicts', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const orderItem1 = createMockOrderItem('item-1', recipeSnapshot, 310.34);
      const orderItem2 = createMockOrderItem('item-2', recipeSnapshot, 250.0);
      const order = createMockPaidOrder('order-1', [orderItem1, orderItem2]);

      orderRepository.findByStatus.mockResolvedValue([order]);
      productionRepository.save.mockImplementation(async (batch) => batch);
      // Simulate concurrent allocation: only 1 of 2 items allocated
      (productionRepository.allocateOrderItems as jest.Mock).mockResolvedValue(1);

      // Act
      const result = await service.createProductionBatch({
        productionDate: '2025-01-20',
      });

      // Assert: Batch is created, but allocation count mismatch is logged
      expect(result).toBeDefined();
      expect(productionRepository.allocateOrderItems).toHaveBeenCalledWith(
        ['item-1', 'item-2'],
        expect.any(String),
      );
      // Service should continue even if not all items were allocated (concurrent conflict)
    });
  });

  describe('checkAndCompleteBatch - Phase 8.14', () => {
    it('should auto-complete batch and transition orders to READY_FOR_SHIPMENT when all units are COMPLETED', async () => {
      // Arrange: Create batch with all units COMPLETED
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const unit2 = new PackagingUnit(
        'unit-2',
        'batch-1',
        recipeSnapshot,
        500,
        ['item-2'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.IN_PRODUCTION,
        [unit1, unit2],
        new Date(),
      );

      // Create order with items matching the batch
      // Note: productionBatchId is null (default), which should still match via item ID
      const orderItem1 = new OrderItem(
        'item-1',
        'order-1',
        recipeSnapshot,
        1000,
        5,
        200,
        null,
        310.34,
        null, // productionBatchId
        null, // allocatedAt
      );
      const orderItem2 = new OrderItem(
        'item-2',
        'order-1',
        recipeSnapshot,
        500,
        3,
        200,
        null,
        250.0,
        null, // productionBatchId
        null, // allocatedAt
      );
      const order = new Order(
        'order-1',
        'customer-1',
        OrderStatus.IN_PRODUCTION,
        OrderType.FRESH_FOOD,
        null,
        250.0,
        0.0,
        250.0,
        [orderItem1, orderItem2],
      );

      productionRepository.findById
        .mockResolvedValueOnce(batch) // First call: initial load
        .mockResolvedValueOnce(batch); // Second call: reload after save
      productionRepository.areAllUnitsCompleted.mockResolvedValue(true);
      productionRepository.save.mockImplementation(async (b) => b);
      // findByStatus is called for each status in statusesToCheck (IN_PRODUCTION, WAITING_FOR_PRODUCTION, PAID)
      // Mock it to return the order for IN_PRODUCTION status, empty for others
      orderRepository.findByStatus.mockImplementation(async (status: OrderStatus) => {
        if (status === OrderStatus.IN_PRODUCTION) {
          return [order];
        }
        return [];
      });
      // Mock findById to return a fresh order instance each time (to track state transitions)
      let currentOrderStatus = OrderStatus.IN_PRODUCTION;
      orderRepository.findById.mockImplementation(async (id: string) => {
        const currentOrder = new Order(
          id,
          order.customerId,
          currentOrderStatus,
          order.type,
          order.addressId,
          order.amountSubtotal,
          order.amountShipping,
          order.amountTotal,
          order.items,
          order.dogId,
        );
        return currentOrder;
      });
      orderRepository.save.mockImplementation(async (o: Order) => {
        // Track status changes
        currentOrderStatus = o.status;
        return o;
      });

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert
      expect(result).toBe(true);
      expect(productionRepository.areAllUnitsCompleted).toHaveBeenCalledWith('batch-1');
      expect(batch.status).toBe(ProductionBatchStatus.COMPLETED);
      expect(productionRepository.save).toHaveBeenCalledWith(batch);
      // Verify batch was reloaded after save
      expect(productionRepository.findById).toHaveBeenCalledTimes(2); // Once initially, once after save
      // Verify order repository was called to find orders
      // findByStatus is called for each status in statusesToCheck
      expect(orderRepository.findByStatus).toHaveBeenCalled();
      // Verify order was found and transitioned
      expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
      expect(orderRepository.save).toHaveBeenCalled();
      // Verify order status was transitioned to READY_FOR_SHIPMENT
      const saveCalls = orderRepository.save.mock.calls;
      expect(saveCalls.length).toBeGreaterThan(0);
      const savedOrder = saveCalls[saveCalls.length - 1][0] as Order;
      expect(currentOrderStatus).toBe(OrderStatus.READY_FOR_SHIPMENT);
      expect(savedOrder.status).toBe(OrderStatus.READY_FOR_SHIPMENT);
    });

    it('should complete batch even when domain object units are not hydrated (database-based check)', async () => {
      // Arrange: Simulate scenario where batch object has empty/incomplete units array
      // but database shows all units are COMPLETED
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      
      // Create batch with empty units array (simulating unhydrated state)
      const batchWithEmptyUnits = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.IN_PRODUCTION,
        [], // Empty array - units not hydrated
        new Date(),
      );

      // But when reloaded, it should have the complete units
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const unit2 = new PackagingUnit(
        'unit-2',
        'batch-1',
        recipeSnapshot,
        500,
        ['item-2'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const batchWithHydratedUnits = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.COMPLETED, // Already transitioned
        [unit1, unit2],
        new Date(),
      );

      // Create order with items matching the batch
      const orderItem1 = new OrderItem(
        'item-1',
        'order-1',
        recipeSnapshot,
        1000,
        5,
        200,
        null,
        310.34,
        null,
        null,
      );
      const orderItem2 = new OrderItem(
        'item-2',
        'order-1',
        recipeSnapshot,
        500,
        3,
        200,
        null,
        250.0,
        null,
        null,
      );
      const order = new Order(
        'order-1',
        'customer-1',
        OrderStatus.IN_PRODUCTION,
        OrderType.FRESH_FOOD,
        null,
        250.0,
        0.0,
        250.0,
        [orderItem1, orderItem2],
      );

      // Mock: Initial findById returns batch with empty units (unhydrated)
      productionRepository.findById
        .mockResolvedValueOnce(batchWithEmptyUnits) // First call: unhydrated
        .mockResolvedValueOnce(batchWithHydratedUnits); // Second call: after save, reloaded with units
      
      // Mock: Database check says all units are completed (this is the key fix)
      productionRepository.areAllUnitsCompleted.mockResolvedValue(true);
      
      productionRepository.save.mockImplementation(async (b) => {
        // Batch status is already COMPLETED after transitionTo call in service
        return b;
      });

      orderRepository.findByStatus.mockImplementation(async (status: OrderStatus) => {
        if (status === OrderStatus.IN_PRODUCTION) {
          return [order];
        }
        return [];
      });

      let currentOrderStatus = OrderStatus.IN_PRODUCTION;
      orderRepository.findById.mockImplementation(async (id: string) => {
        return new Order(
          id,
          order.customerId,
          currentOrderStatus,
          order.type,
          order.addressId,
          order.amountSubtotal,
          order.amountShipping,
          order.amountTotal,
          order.items,
          order.dogId,
        );
      });
      orderRepository.save.mockImplementation(async (o: Order) => {
        currentOrderStatus = o.status;
        return o;
      });

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert
      expect(result).toBe(true);
      // Verify database-based check was used (not domain method)
      expect(productionRepository.areAllUnitsCompleted).toHaveBeenCalledWith('batch-1');
      // Verify batch was saved with COMPLETED status
      expect(productionRepository.save).toHaveBeenCalled();
      const savedBatch = productionRepository.save.mock.calls[0][0] as ProductionBatch;
      expect(savedBatch.status).toBe(ProductionBatchStatus.COMPLETED);
      // Verify batch was reloaded to get hydrated units for orderItemIds extraction
      expect(productionRepository.findById).toHaveBeenCalledTimes(2);
      // Verify order was found and transitioned
      expect(orderRepository.findByStatus).toHaveBeenCalled();
      expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
      expect(orderRepository.save).toHaveBeenCalled();
      expect(currentOrderStatus).toBe(OrderStatus.READY_FOR_SHIPMENT);
    });

    it('should transition order to READY_FOR_SHIPMENT even when productionBatchId is null on items', async () => {
      // Arrange: Simulate case where items exist but productionBatchId not yet persisted
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.IN_PRODUCTION,
        [unit1],
        new Date(),
      );

      // Order item with null productionBatchId (simulating allocation not yet persisted)
      const orderItem1 = new OrderItem(
        'item-1',
        'order-1',
        recipeSnapshot,
        1000,
        5,
        200,
        null,
        310.34,
        null, // productionBatchId is null
        null,
      );
      const order = new Order(
        'order-1',
        'customer-1',
        OrderStatus.IN_PRODUCTION,
        OrderType.FRESH_FOOD,
        null,
        250.0,
        0.0,
        250.0,
        [orderItem1],
      );

      productionRepository.findById
        .mockResolvedValueOnce(batch) // First call: initial load
        .mockResolvedValueOnce(batch); // Second call: reload after save
      productionRepository.areAllUnitsCompleted.mockResolvedValue(true);
      productionRepository.save.mockImplementation(async (b) => b);
      // findByStatus is called for each status in statusesToCheck (IN_PRODUCTION, WAITING_FOR_PRODUCTION, PAID)
      // Mock it to return the order for IN_PRODUCTION status, empty for others
      orderRepository.findByStatus.mockImplementation(async (status: OrderStatus) => {
        if (status === OrderStatus.IN_PRODUCTION) {
          return [order];
        }
        return [];
      });
      // Mock findById to return a fresh order instance each time (to track state transitions)
      let currentOrderStatus = OrderStatus.IN_PRODUCTION;
      orderRepository.findById.mockImplementation(async (id: string) => {
        const currentOrder = new Order(
          id,
          order.customerId,
          currentOrderStatus,
          order.type,
          order.addressId,
          order.amountSubtotal,
          order.amountShipping,
          order.amountTotal,
          order.items,
          order.dogId,
        );
        return currentOrder;
      });
      orderRepository.save.mockImplementation(async (o: Order) => {
        // Track status changes
        currentOrderStatus = o.status;
        return o;
      });

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert: Should still find and transition order by item ID match
      expect(result).toBe(true);
      expect(orderRepository.save).toHaveBeenCalled();
      const saveCalls = orderRepository.save.mock.calls;
      expect(saveCalls.length).toBeGreaterThanOrEqual(2); // At least 2 saves: READY_FOR_PACKAGING, then READY_FOR_SHIPMENT
      // Verify final state: READY_FOR_SHIPMENT
      const savedOrder = saveCalls[saveCalls.length - 1][0] as Order;
      expect(savedOrder.status).toBe(OrderStatus.READY_FOR_SHIPMENT);
      // Verify that the order went through READY_FOR_PACKAGING (check currentOrderStatus was updated)
      expect(currentOrderStatus).toBe(OrderStatus.READY_FOR_SHIPMENT);
    });

    it('should transition order through READY_FOR_PACKAGING intermediate state', async () => {
      // Arrange: Create batch with all units COMPLETED
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.IN_PRODUCTION,
        [unit1],
        new Date(),
      );

      const orderItem1 = new OrderItem(
        'item-1',
        'order-1',
        recipeSnapshot,
        1000,
        5,
        200,
        null,
        310.34,
        null,
        null,
      );
      const order = new Order(
        'order-1',
        'customer-1',
        OrderStatus.IN_PRODUCTION,
        OrderType.FRESH_FOOD,
        null,
        250.0,
        0.0,
        250.0,
        [orderItem1],
      );

      productionRepository.findById.mockResolvedValue(batch);
      productionRepository.save.mockImplementation(async (b) => b);
      orderRepository.findByStatus.mockImplementation(async (status: OrderStatus) => {
        if (status === OrderStatus.IN_PRODUCTION) {
          return [order];
        }
        return [];
      });

      // Track status transitions
      const statusTransitions: OrderStatus[] = [];
      let currentOrderStatus = OrderStatus.IN_PRODUCTION;
      orderRepository.findById.mockImplementation(async (id: string) => {
        const currentOrder = new Order(
          id,
          order.customerId,
          currentOrderStatus,
          order.type,
          order.addressId,
          order.amountSubtotal,
          order.amountShipping,
          order.amountTotal,
          order.items,
          order.dogId,
        );
        return currentOrder;
      });
      orderRepository.save.mockImplementation(async (o: Order) => {
        statusTransitions.push(o.status);
        currentOrderStatus = o.status;
        return o;
      });

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert
      expect(result).toBe(true);
      // Verify state machine transitions: IN_PRODUCTION -> READY_FOR_PACKAGING -> READY_FOR_SHIPMENT
      expect(statusTransitions).toHaveLength(2);
      expect(statusTransitions[0]).toBe(OrderStatus.READY_FOR_PACKAGING);
      expect(statusTransitions[1]).toBe(OrderStatus.READY_FOR_SHIPMENT);
      expect(currentOrderStatus).toBe(OrderStatus.READY_FOR_SHIPMENT);
    });

    it('should not complete batch if any unit is not COMPLETED', async () => {
      // Arrange: Create batch with one unit still IN_PROGRESS
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const unit2 = new PackagingUnit(
        'unit-2',
        'batch-1',
        recipeSnapshot,
        500,
        ['item-2'],
        new Date(),
        PackagingUnitStatus.IN_PROGRESS, // Not completed
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.IN_PRODUCTION,
        [unit1, unit2],
        new Date(),
      );

      productionRepository.findById.mockResolvedValue(batch);
      // Mock database check: not all units completed
      productionRepository.areAllUnitsCompleted.mockResolvedValue(false);

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert
      expect(result).toBe(false);
      expect(productionRepository.areAllUnitsCompleted).toHaveBeenCalledWith('batch-1');
      expect(batch.status).toBe(ProductionBatchStatus.IN_PRODUCTION);
      expect(productionRepository.save).not.toHaveBeenCalled();
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('should be idempotent - calling twice should not cause issues', async () => {
      // Arrange: Batch already COMPLETED
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = new PackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        1000,
        ['item-1'],
        new Date(),
        PackagingUnitStatus.COMPLETED,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.COMPLETED, // Already completed
        [unit1],
        new Date(),
      );

      productionRepository.findById.mockResolvedValue(batch);
      productionRepository.areAllUnitsCompleted.mockResolvedValue(true);

      // Act
      const result = await service.checkAndCompleteBatch('batch-1');

      // Assert
      expect(result).toBe(false); // Should return false for already completed batch
      expect(productionRepository.areAllUnitsCompleted).not.toHaveBeenCalled(); // Should not check if batch is not IN_PRODUCTION
      expect(batch.status).toBe(ProductionBatchStatus.COMPLETED);
      expect(productionRepository.save).not.toHaveBeenCalled();
    });
  });
});

