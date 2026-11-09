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
    existsBySourceVersionAndIngredient: jest.fn(),
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

  const mockPrisma: any = {
    ingredient: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: any) => callback(mockPrisma)),
    inventoryLedgerEntry: {
      count: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    purchaseRecord: {
      update: jest.fn(),
    },
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
          useValue: mockPrisma,
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
  describe('inboundFromPurchaseRecords', () => {
    it('日采原料也入库', async () => {
      mockPrisma.inventoryLedgerEntry.count.mockResolvedValue(0);
      mockPrisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 2 });

      const result = await service.inboundFromPurchaseRecords([
        { id: 'pr-daily', ingredientId: 'ing-daily', actualBaseQuantity: 500 },
        { id: 'pr-stock', ingredientId: 'ing-stock', actualBaseQuantity: 1200 },
      ] as any);

      expect(result.createdCount).toBe(2);
      const rows =
        mockPrisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
      expect(rows.map((row: any) => row.ingredientId)).toEqual([
        'ing-daily',
        'ing-stock',
      ]);
    });

    it('入账行带来源版本 1', async () => {
      mockPrisma.inventoryLedgerEntry.count.mockResolvedValue(0);
      mockPrisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 1 });

      await service.inboundFromPurchaseRecords([
        { id: 'pr-stock', ingredientId: 'ing-stock', actualBaseQuantity: 1200 },
      ] as any);

      const rows =
        mockPrisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0].sourceVersion).toBe(1);
    });
  });

  describe('purchase inbound versions / reversal', () => {
    it('同一采购记录再完成时版本递增', async () => {
      mockPrisma.inventoryLedgerEntry.count.mockResolvedValue(0);
      mockPrisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.purchaseRecord.update.mockResolvedValue({});

      await service.inboundFromPurchaseRecords([
        {
          id: 'pr-1',
          ingredientId: 'ing-1',
          actualBaseQuantity: 500,
          inboundVersion: 1,
        },
      ] as any);

      expect(mockPrisma.inventoryLedgerEntry.createMany).toHaveBeenCalled();
      const rows =
        mockPrisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0].sourceVersion).toBe(2);
      expect(mockPrisma.purchaseRecord.update).toHaveBeenCalledWith({
        where: { id: 'pr-1' },
        data: { inboundVersion: 2 },
      });
    });

    it('撤回按当前版本写负数冲红', async () => {
      mockPrisma.inventoryLedgerEntry.findMany.mockResolvedValue([
        {
          ingredientId: 'ing-1',
          deltaG: 500,
          procurementSkuId: null,
          costAmount: null,
        },
      ]);
      mockPrisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 1 });

      const result =
        await service.reversePurchaseRecordInboundsForPurchaseList([
          { id: 'pr-1', inboundVersion: 2 },
        ] as any);

      expect(result.reversedCount).toBe(1);
      const rows =
        mockPrisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
      expect(rows[0]).toEqual(
        expect.objectContaining({
          ingredientId: 'ing-1',
          deltaG: -500,
          sourceType: 'PURCHASE_RECORD_REVERSAL',
          sourceVersion: 2,
        }),
      );
    });

    it('撤回不动版本号', async () => {
      mockPrisma.inventoryLedgerEntry.findMany.mockResolvedValue([
        { ingredientId: 'ing-1', deltaG: 500, procurementSkuId: null, costAmount: null },
      ]);
      mockPrisma.inventoryLedgerEntry.createMany.mockResolvedValue({ count: 1 });

      await service.reversePurchaseRecordInboundsForPurchaseList([
        { id: 'pr-1', inboundVersion: 2 },
      ] as any);

      expect(mockPrisma.purchaseRecord.update).not.toHaveBeenCalled();
    });

    it('没有入库行时撤回跳过', async () => {
      mockPrisma.inventoryLedgerEntry.findMany.mockResolvedValue([]);

      const result =
        await service.reversePurchaseRecordInboundsForPurchaseList([
          { id: 'pr-1', inboundVersion: 2 },
        ] as any);

      expect(result.reversedCount).toBe(0);
      expect(mockPrisma.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
    });

    it('完成 → 撤回 → 再完成：余额按新数量，版本递增', async () => {
      const ledger: any[] = [];
      const key = (row: any) =>
        `${row.sourceType}|${row.sourceId}|${row.sourceVersion}|${row.ingredientId}`;
      const record: any = {
        id: 'pr-1',
        ingredientId: 'ing-1',
        actualBaseQuantity: 1200,
        inboundVersion: 0,
      };

      mockPrisma.inventoryLedgerEntry.count.mockImplementation(
        async ({ where }: any) =>
          ledger.filter(
            (row) =>
              row.sourceType === where.sourceType &&
              row.sourceId === where.sourceId &&
              row.sourceVersion === where.sourceVersion &&
              row.ingredientId === where.ingredientId,
          ).length,
      );
      mockPrisma.inventoryLedgerEntry.createMany.mockImplementation(
        async ({ data }: any) => {
          let count = 0;
          for (const row of data) {
            if (!ledger.some((existing) => key(existing) === key(row))) {
              ledger.push(row);
              count++;
            }
          }
          return { count };
        },
      );
      mockPrisma.inventoryLedgerEntry.findMany.mockImplementation(
        async ({ where }: any) =>
          ledger.filter(
            (row) =>
              row.sourceType === where.sourceType &&
              row.sourceId === where.sourceId &&
              row.sourceVersion === where.sourceVersion,
          ),
      );
      mockPrisma.purchaseRecord.update.mockImplementation(
        async ({ where, data }: any) => {
          if (where.id === record.id) {
            record.inboundVersion = data.inboundVersion;
          }
          return record;
        },
      );

      const balance = () =>
        ledger.reduce((sum, row) => sum + row.deltaG, 0);

      await service.inboundFromPurchaseRecords([record]);
      expect(balance()).toBe(1200);
      expect(record.inboundVersion).toBe(1);

      await service.reversePurchaseRecordInboundsForPurchaseList([record]);
      expect(balance()).toBe(0);

      record.actualBaseQuantity = 800;
      await service.inboundFromPurchaseRecords([record]);
      expect(balance()).toBe(800);
      expect(record.inboundVersion).toBe(2);

      await service.reversePurchaseRecordInboundsForPurchaseList([record]);
      expect(balance()).toBe(0);
      expect(ledger).toHaveLength(4);
    });
  });
});
