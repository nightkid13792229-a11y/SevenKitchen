/**
 * KitchenService Unit Tests
 * Phase 8.12: Tests for kitchen task operations
 */

import { Test, TestingModule } from '@nestjs/testing';
import { KitchenService } from 'src/kitchen.service';
import type { ProductionBatchRepository } from 'src/domain/production/production.repository';
import { ProductionBatch, PackagingUnit } from 'src/domain/production';
import { ProductionBatchStatus, PackagingUnitStatus } from 'src/domain/production/enums';
import { PRODUCTION_BATCH_REPOSITORY, ProductionService } from 'src/production/production.service';
import { InventoryService } from 'src/inventory/inventory.service';
import type { RecipeSnapshot } from 'src/domain/recipe/types';

describe('KitchenService - Phase 8.12', () => {
  let service: KitchenService;
  let productionRepository: jest.Mocked<ProductionBatchRepository>;
  let inventoryService: jest.Mocked<InventoryService>;
  let productionService: jest.Mocked<ProductionService>;

  const mockProductionRepository: jest.Mocked<ProductionBatchRepository> = {
    findById: jest.fn(),
    findByProductionDate: jest.fn(),
    findByStatus: jest.fn(),
    save: jest.fn(),
    allocateOrderItems: jest.fn(),
    findPackagingUnitById: jest.fn(),
    updatePackagingUnit: jest.fn(),
    findBatchesByPackagingUnitStatus: jest.fn(),
  };

  const mockInventoryService: jest.Mocked<InventoryService> = {
    deductFromKitchenTask: jest.fn(),
    getBalanceByIngredient: jest.fn(),
    getEntriesByPackagingUnit: jest.fn(),
  } as any;

  const mockProductionService: jest.Mocked<ProductionService> = {
    checkAndCompleteBatch: jest.fn(),
  } as any;

  beforeEach(async () => {
    // Suppress Logger.error during tests (especially for expected NotFoundException)
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        {
          provide: PRODUCTION_BATCH_REPOSITORY,
          useValue: mockProductionRepository,
        },
        {
          provide: InventoryService,
          useValue: mockInventoryService,
        },
        {
          provide: ProductionService,
          useValue: mockProductionService,
        },
      ],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
    productionRepository = module.get(PRODUCTION_BATCH_REPOSITORY);
    inventoryService = module.get(InventoryService);
    productionService = module.get(ProductionService);

    jest.clearAllMocks();
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
      items: [
        {
          ingredient_id: 'ingredient-1',
          name: 'Chicken',
          ratio: 70.0, // 70%
        },
        {
          ingredient_id: 'ingredient-2',
          name: 'Pumpkin',
          ratio: 30.0, // 30%
        },
      ],
    };
  };

  const createMockPackagingUnit = (
    id: string,
    batchId: string,
    recipeSnapshot: RecipeSnapshot,
    status: PackagingUnitStatus = PackagingUnitStatus.PENDING,
  ): PackagingUnit => {
    return new PackagingUnit(
      id,
      batchId,
      recipeSnapshot,
      1000, // totalProductionG
      ['item-1', 'item-2'], // sourceOrderItemIds
      new Date(),
      status,
      null, // ingredientsUsageSnapshot
      [], // photosRaw
      [], // photosCooked
      [], // photosPortioned
      new Date(),
    );
  };

  describe('listBatchesByStatus', () => {
    it('should return batches filtered by packaging unit status', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.PLANNED,
        [unit1],
        new Date(),
      );

      productionRepository.findBatchesByPackagingUnitStatus.mockResolvedValue([
        batch,
      ]);

      // Act
      const result = await service.listBatchesByStatus(
        PackagingUnitStatus.PENDING,
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('batch-1');
      expect(result[0].taskCount).toBe(1);
      expect(result[0].tasks[0].status).toBe('PENDING');
      expect(productionRepository.findBatchesByPackagingUnitStatus).toHaveBeenCalledWith(
        'PENDING',
      );
    });

    it('should return all batches when no status filter provided', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit1 = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.PLANNED,
        [unit1],
        new Date(),
      );

      productionRepository.findByStatus.mockResolvedValue([batch]);

      // Act
      const result = await service.listBatchesByStatus();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('batch-1');
      expect(result[0].taskCount).toBe(1);
      expect(result[0].tasks).toHaveLength(1);
      expect(productionRepository.findByStatus).toHaveBeenCalledWith('PLANNED');
    });

    it('should handle empty packagingUnits array safely', async () => {
      // Arrange
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.PLANNED,
        [], // Empty packaging units
        new Date(),
      );

      productionRepository.findByStatus.mockResolvedValue([batch]);

      // Act
      const result = await service.listBatchesByStatus();

      // Assert: Empty batches are now included (filter removed)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('batch-1');
      expect(result[0].taskCount).toBe(0);
      expect(result[0].tasks).toEqual([]);
    });

    it('should handle missing fields safely', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );
      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.PLANNED,
        [unit],
        new Date(),
      );

      productionRepository.findByStatus.mockResolvedValue([batch]);

      // Act
      const result = await service.listBatchesByStatus();

      // Assert: Should not throw, should handle gracefully
      expect(result).toHaveLength(1);
      expect(result[0].tasks[0].recipeName).toBeDefined();
      expect(result[0].tasks[0].recipeName).toBe('Test Recipe');
    });
  });

  describe('getBatchDetail', () => {
    it('should return batch detail with full task information including recipeSnapshot.items', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );
      unit.updateTaskData(
        {
          'ingredient-1': { required_g: 700, actual_g: 720 },
        },
        ['photo1.jpg'],
        ['photo2.jpg'],
        [],
      );

      const batch = new ProductionBatch(
        'batch-1',
        new Date('2025-01-20'),
        ProductionBatchStatus.PLANNED,
        [unit],
        new Date(),
      );

      productionRepository.findById.mockResolvedValue(batch);

      // Act
      const result = await service.getBatchDetail('batch-1');

      // Assert
      expect(result.id).toBe('batch-1');
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('unit-1');
      expect(result.tasks[0].status).toBe('IN_PROGRESS');
      expect(result.tasks[0].photosRaw).toEqual(['photo1.jpg']);
      expect(result.tasks[0].ingredientsUsageSnapshot).toEqual({
        'ingredient-1': { required_g: 700, actual_g: 720 },
      });
      
      // Phase 8.12+8.13: Verify recipeSnapshot.items are returned
      expect(result.tasks[0].recipeSnapshot).toBeDefined();
      expect(result.tasks[0].recipeSnapshot.id).toBe('recipe-1');
      expect(result.tasks[0].recipeSnapshot.items).toBeDefined();
      expect(result.tasks[0].recipeSnapshot.items).toHaveLength(2);
      expect(result.tasks[0].recipeSnapshot.items[0].ingredient_id).toBe('ingredient-1');
      expect(result.tasks[0].recipeSnapshot.items[0].ratio).toBe(70.0);
      expect(result.tasks[0].recipeSnapshot.items[1].ingredient_id).toBe('ingredient-2');
      expect(result.tasks[0].recipeSnapshot.items[1].ratio).toBe(30.0);
    });

    it('should throw NotFoundException when batch not found', async () => {
      // Arrange
      productionRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getBatchDetail('non-existent')).rejects.toThrow(
        'Production batch not found',
      );
    });
  });

  describe('updateTask', () => {
    it('should update task with actual usage and photos', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(
        async (u) => u,
      );

      // Act
      const result = await service.updateTask('unit-1', {
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
          { ingredientId: 'ingredient-2', actual_g: 310 },
        ],
        photosRaw: ['raw1.jpg'],
        photosCooked: ['cooked1.jpg'],
        status: PackagingUnitStatus.IN_PROGRESS,
      });

      // Assert
      expect(result.status).toBe(PackagingUnitStatus.IN_PROGRESS);
      expect(result.photosRaw).toEqual(['raw1.jpg']);
      expect(result.photosCooked).toEqual(['cooked1.jpg']);
      expect(result.ingredientsUsageSnapshot).toBeDefined();
      
      // Verify required weights calculated from recipeSnapshot
      const snapshot = result.ingredientsUsageSnapshot!;
      expect(snapshot['ingredient-1']).toBeDefined();
      expect(snapshot['ingredient-1'].required_g).toBeCloseTo(700, 0); // 1000 * 70% = 700
      expect(snapshot['ingredient-1'].actual_g).toBe(720);
      
      expect(snapshot['ingredient-2']).toBeDefined();
      expect(snapshot['ingredient-2'].required_g).toBeCloseTo(300, 0); // 1000 * 30% = 300
      expect(snapshot['ingredient-2'].actual_g).toBe(310);

      expect(productionRepository.updatePackagingUnit).toHaveBeenCalled();
    });

    it('should calculate required weights from recipeSnapshot, not Recipe table', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(
        async (u) => u,
      );

      // Act
      const result = await service.updateTask('unit-1', {
        ingredientsActual: [{ ingredientId: 'ingredient-1', actual_g: 750 }],
      });

      // Assert: Required weight calculated from recipeSnapshot.items[0].ratio (70%)
      // totalProductionG = 1000, ratio = 70, required_g = 1000 * 70 / 100 = 700
      const snapshot = result.ingredientsUsageSnapshot!;
      expect(snapshot['ingredient-1'].required_g).toBeCloseTo(700, 0);
      expect(snapshot['ingredient-1'].actual_g).toBe(750);
    });

    it('should validate status transitions (PENDING -> IN_PROGRESS without data)', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(
        async (u) => u,
      );

      // Act: Transition PENDING -> IN_PROGRESS (without data)
      await service.updateTask('unit-1', {
        status: PackagingUnitStatus.IN_PROGRESS,
      });

      // Assert: Status updated
      expect(unit.status).toBe(PackagingUnitStatus.IN_PROGRESS);
    });

    it('should validate status transitions (IN_PROGRESS -> COMPLETED with data)', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(
        async (u) => u,
      );

      // Act: Transition IN_PROGRESS -> COMPLETED (with data)
      await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
        ],
      });

      // Assert: Status updated
      expect(unit.status).toBe(PackagingUnitStatus.COMPLETED);
    });

    it('should throw NotFoundException when task not found', async () => {
      // Arrange
      productionRepository.findPackagingUnitById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateTask('non-existent', { photosRaw: [] }),
      ).rejects.toThrow('Task (PackagingUnit) not found');
    });

    it('should throw BadRequestException when ingredient not in snapshot', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(
        service.updateTask('unit-1', {
          ingredientsActual: [
            { ingredientId: 'non-existent-ingredient', actual_g: 100 },
          ],
        }),
      ).rejects.toThrow('Ingredient non-existent-ingredient not found in recipe snapshot');
    });

    it('should throw BadRequestException when recipe snapshot has no items', async () => {
      // Arrange
      const recipeSnapshotWithoutItems = {
        id: 'recipe-1',
        version: 1,
        name: 'Test Recipe',
        production_loss_rate: 1.07,
        energy_density_kcal_per_kg: 1450,
        nutrition_standard: 'FEDIAF_2021',
        items: [], // Empty items array
      };
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshotWithoutItems as any,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(
        service.updateTask('unit-1', {
          ingredientsActual: [
            { ingredientId: 'ingredient-1', actual_g: 100 },
          ],
        }),
      ).rejects.toThrow('Recipe snapshot has no items');
    });

    it('should throw BadRequestException when actual_g is negative', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(
        service.updateTask('unit-1', {
          ingredientsActual: [
            { ingredientId: 'ingredient-1', actual_g: -10 },
          ],
        }),
      ).rejects.toThrow('actual_g must be a non-negative number');
    });

    it('should throw BadRequestException for invalid status transition', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.COMPLETED, // Already COMPLETED
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert: Cannot transition from COMPLETED to PENDING
      await expect(
        service.updateTask('unit-1', {
          status: PackagingUnitStatus.PENDING,
        }),
      ).rejects.toThrow('Invalid status transition');
    });

    it('should allow PENDING -> IN_PROGRESS transition without data', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.PENDING,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(async (u) => u);

      // Act
      const result = await service.updateTask('unit-1', {
        status: PackagingUnitStatus.IN_PROGRESS,
      });

      // Assert
      expect(result.status).toBe(PackagingUnitStatus.IN_PROGRESS);
      expect(result.ingredientsUsageSnapshot).toBeNull();
      expect(productionRepository.updatePackagingUnit).toHaveBeenCalled();
    });

    it('should reject IN_PROGRESS -> COMPLETED transition without data', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(
        service.updateTask('unit-1', {
          status: PackagingUnitStatus.COMPLETED,
        }),
      ).rejects.toThrow('Cannot transition to COMPLETED without actual usage data');
    });

    it('should allow IN_PROGRESS -> COMPLETED transition with data', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(async (u) => u);

      // Act
      const result = await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
        ],
      });

      // Assert
      expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
      expect(result.ingredientsUsageSnapshot).toBeDefined();
      expect(result.ingredientsUsageSnapshot!['ingredient-1']).toBeDefined();
      expect(productionRepository.updatePackagingUnit).toHaveBeenCalled();
    });

    it('should trigger batch completion check when task is updated to COMPLETED (Phase 8.14)', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(async (u) => u);
      inventoryService.deductFromKitchenTask.mockResolvedValue(undefined);
      productionService.checkAndCompleteBatch.mockResolvedValue(true);

      // Act: Transition IN_PROGRESS -> COMPLETED
      const result = await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
        ],
      });

      // Assert
      expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
      // Verify inventory deduction was called
      expect(inventoryService.deductFromKitchenTask).toHaveBeenCalledWith('unit-1');
      // Verify batch completion check was triggered
      expect(productionService.checkAndCompleteBatch).toHaveBeenCalledWith('batch-1');
    });

    it('should not trigger batch completion check if task has no productionBatchId (Phase 8.14)', async () => {
      // Arrange: Unit without productionBatchId (edge case)
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        '', // Empty batchId
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(async (u) => u);
      inventoryService.deductFromKitchenTask.mockResolvedValue(undefined);

      // Act: Transition IN_PROGRESS -> COMPLETED
      const result = await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
        ],
      });

      // Assert
      expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
      // Verify inventory deduction was called
      expect(inventoryService.deductFromKitchenTask).toHaveBeenCalledWith('unit-1');
      // Verify batch completion check was NOT called (no batchId)
      expect(productionService.checkAndCompleteBatch).not.toHaveBeenCalled();
    });

    it('should handle batch completion check failure gracefully (Phase 8.14)', async () => {
      // Arrange
      const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
      const unit = createMockPackagingUnit(
        'unit-1',
        'batch-1',
        recipeSnapshot,
        PackagingUnitStatus.IN_PROGRESS,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      productionRepository.updatePackagingUnit.mockImplementation(async (u) => u);
      inventoryService.deductFromKitchenTask.mockResolvedValue(undefined);
      // Mock batch completion check to throw error
      productionService.checkAndCompleteBatch.mockRejectedValue(
        new Error('Batch completion check failed'),
      );

      // Act: Transition IN_PROGRESS -> COMPLETED
      const result = await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
        ingredientsActual: [
          { ingredientId: 'ingredient-1', actual_g: 720 },
        ],
      });

      // Assert: Task should still be completed despite batch check failure
      expect(result.status).toBe(PackagingUnitStatus.COMPLETED);
      expect(inventoryService.deductFromKitchenTask).toHaveBeenCalledWith('unit-1');
      // Verify batch completion check was attempted
      expect(productionService.checkAndCompleteBatch).toHaveBeenCalledWith('batch-1');
      // Task completion should not be affected by batch check failure
    });
  });
});
