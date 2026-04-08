/**
 * InventoryService Unit Tests
 * Phase 8.13: Tests for inventory deduction
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InventoryService } from 'src/inventory.service';
import type { InventoryRepository } from 'src/domain/inventory/inventory.repository';
import type { ProductionBatchRepository } from 'src/domain/production/production.repository';
import { PackagingUnit, PackagingUnitStatus } from 'src/domain/production';
import { InventoryLedgerEntry, InventorySourceType } from 'src/domain/inventory';
import { INVENTORY_REPOSITORY } from 'src/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/production/production.service';
import type { RecipeSnapshot } from 'src/domain/recipe/types';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService - Phase 8.13', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let productionRepository: jest.Mocked<ProductionBatchRepository>;

  const mockInventoryRepository: jest.Mocked<InventoryRepository> = {
    recordEntries: jest.fn(),
    existsBySourceAndIngredient: jest.fn(),
    getCurrentBalanceByIngredient: jest.fn(),
    findBySource: jest.fn(),
  };

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: INVENTORY_REPOSITORY,
          useValue: mockInventoryRepository,
        },
        {
          provide: PRODUCTION_BATCH_REPOSITORY,
          useValue: mockProductionRepository,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepository = module.get(INVENTORY_REPOSITORY);
    productionRepository = module.get(PRODUCTION_BATCH_REPOSITORY);

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
          ratio: 70.0,
        },
        {
          ingredient_id: 'ingredient-2',
          name: 'Pumpkin',
          ratio: 30.0,
        },
      ],
    };
  };

  const createMockPackagingUnit = (
    id: string,
    status: PackagingUnitStatus,
    ingredientsUsageSnapshot: any,
  ): PackagingUnit => {
    const recipeSnapshot = createMockRecipeSnapshot('recipe-1');
    return new PackagingUnit(
      id,
      'batch-1',
      recipeSnapshot,
      1000, // totalProductionG
      ['item-1'], // sourceOrderItemIds
      new Date(),
      status,
      ingredientsUsageSnapshot,
      [],
      [],
      [],
      new Date(),
    );
  };

  describe('deductFromKitchenTask', () => {
    it('should use actual_g, not required_g', async () => {
      // Arrange
      const snapshot = {
        'ingredient-1': { required_g: 700, actual_g: 720 }, // actual > required
        'ingredient-2': { required_g: 300, actual_g: 280 }, // actual < required
      };
      const unit = createMockPackagingUnit(
        'unit-1',
        PackagingUnitStatus.COMPLETED,
        snapshot,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      inventoryRepository.existsBySourceAndIngredient.mockResolvedValue(false);
      inventoryRepository.recordEntries.mockResolvedValue(undefined);

      // Act
      await service.deductFromKitchenTask('unit-1');

      // Assert: Verify that actual_g values are used (not required_g)
      expect(inventoryRepository.recordEntries).toHaveBeenCalledTimes(1);
      const entries: InventoryLedgerEntry[] =
        inventoryRepository.recordEntries.mock.calls[0][0];

      expect(entries).toHaveLength(2);
      expect(entries.find((e) => e.ingredientId === 'ingredient-1')?.deltaG).toBe(-720); // actual_g
      expect(entries.find((e) => e.ingredientId === 'ingredient-2')?.deltaG).toBe(-280); // actual_g
    });

    it('should be idempotent - repeated call does not double deduct', async () => {
      // Arrange
      const snapshot = {
        'ingredient-1': { required_g: 700, actual_g: 720 },
      };
      const unit = createMockPackagingUnit(
        'unit-1',
        PackagingUnitStatus.COMPLETED,
        snapshot,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      
      // First call: no existing entries
      inventoryRepository.existsBySourceAndIngredient
        .mockResolvedValueOnce(false)
        // Second call: entry already exists
        .mockResolvedValueOnce(true);
      
      inventoryRepository.recordEntries.mockResolvedValue(undefined);

      // Act: First call
      await service.deductFromKitchenTask('unit-1');
      
      // Act: Second call (should be idempotent)
      await service.deductFromKitchenTask('unit-1');

      // Assert: recordEntries should only be called once
      expect(inventoryRepository.recordEntries).toHaveBeenCalledTimes(1);
      expect(inventoryRepository.existsBySourceAndIngredient).toHaveBeenCalledTimes(2);
    });

    it('should reject non-COMPLETED status', async () => {
      // Arrange
      const snapshot = {
        'ingredient-1': { required_g: 700, actual_g: 720 },
      };
      const unit = createMockPackagingUnit(
        'unit-1',
        PackagingUnitStatus.IN_PROGRESS, // Not COMPLETED
        snapshot,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(service.deductFromKitchenTask('unit-1')).rejects.toThrow(
        'Cannot deduct inventory: PackagingUnit status is IN_PROGRESS, must be COMPLETED',
      );

      expect(inventoryRepository.recordEntries).not.toHaveBeenCalled();
    });

    it('should reject if ingredientsUsageSnapshot is missing', async () => {
      // Arrange
      const unit = createMockPackagingUnit(
        'unit-1',
        PackagingUnitStatus.COMPLETED,
        null, // Missing snapshot
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);

      // Act & Assert
      await expect(service.deductFromKitchenTask('unit-1')).rejects.toThrow(
        'Cannot deduct inventory: ingredientsUsageSnapshot is missing',
      );

      expect(inventoryRepository.recordEntries).not.toHaveBeenCalled();
    });

    it('should skip entries with zero actual_g', async () => {
      // Arrange
      const snapshot = {
        'ingredient-1': { required_g: 700, actual_g: 720 },
        'ingredient-2': { required_g: 300, actual_g: 0 }, // Zero - should be skipped
      };
      const unit = createMockPackagingUnit(
        'unit-1',
        PackagingUnitStatus.COMPLETED,
        snapshot,
      );

      productionRepository.findPackagingUnitById.mockResolvedValue(unit);
      inventoryRepository.existsBySourceAndIngredient.mockResolvedValue(false);
      inventoryRepository.recordEntries.mockResolvedValue(undefined);

      // Act
      await service.deductFromKitchenTask('unit-1');

      // Assert: Only ingredient-1 should be deducted (ingredient-2 has actual_g = 0)
      expect(inventoryRepository.recordEntries).toHaveBeenCalledTimes(1);
      const entries: InventoryLedgerEntry[] =
        inventoryRepository.recordEntries.mock.calls[0][0];

      expect(entries).toHaveLength(1);
      expect(entries[0].ingredientId).toBe('ingredient-1');
      expect(entries[0].deltaG).toBe(-720);
    });

    it('should calculate balance correctly from SUM(delta_g)', async () => {
      // Arrange
      inventoryRepository.getCurrentBalanceByIngredient.mockResolvedValue(500);

      // Act
      const balance = await service.getBalanceByIngredient('ingredient-1');

      // Assert
      expect(balance).toBe(500);
      expect(inventoryRepository.getCurrentBalanceByIngredient).toHaveBeenCalledWith(
        'ingredient-1',
      );
    });

    it('should return 0 if no entries exist', async () => {
      // Arrange
      inventoryRepository.getCurrentBalanceByIngredient.mockResolvedValue(0);

      // Act
      const balance = await service.getBalanceByIngredient('ingredient-1');

      // Assert
      expect(balance).toBe(0);
    });

    it('should throw if PackagingUnit not found', async () => {
      // Arrange
      productionRepository.findPackagingUnitById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.deductFromKitchenTask('non-existent')).rejects.toThrow(
        'PackagingUnit not found: non-existent',
      );
    });
  });
});
