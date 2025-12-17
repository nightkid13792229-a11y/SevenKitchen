/**
 * KitchenService Unit Tests
 * Phase 8.12: Tests for kitchen task operations
 */

import { Test, TestingModule } from '@nestjs/testing';
import { KitchenService } from './kitchen.service';
import type { ProductionBatchRepository } from '../../domain/production/production.repository';
import { ProductionBatch, PackagingUnit } from '../../domain/production';
import { ProductionBatchStatus, PackagingUnitStatus } from '../../domain/production/enums';
import { PRODUCTION_BATCH_REPOSITORY } from '../production/production.service';
import { InventoryService } from '../inventory/inventory.service';
import type { RecipeSnapshot } from '../../domain/recipe/types';

describe('KitchenService - Phase 8.12', () => {
  let service: KitchenService;
  let productionRepository: jest.Mocked<ProductionBatchRepository>;
  let inventoryService: jest.Mocked<InventoryService>;

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

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
    productionRepository = module.get(PRODUCTION_BATCH_REPOSITORY);
    inventoryService = module.get(InventoryService);

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

      // Assert
      expect(result).toHaveLength(1);
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
    it('should return batch detail with full task information', async () => {
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

    it('should validate status transitions', async () => {
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

      // Act: Transition PENDING -> IN_PROGRESS
      await service.updateTask('unit-1', {
        status: PackagingUnitStatus.IN_PROGRESS,
      });

      // Assert: Status updated
      expect(unit.status).toBe(PackagingUnitStatus.IN_PROGRESS);

      // Act: Transition IN_PROGRESS -> COMPLETED
      unit.status = PackagingUnitStatus.IN_PROGRESS;
      await service.updateTask('unit-1', {
        status: PackagingUnitStatus.COMPLETED,
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
  });
});
