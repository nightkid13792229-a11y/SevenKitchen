import { Test, type TestingModule } from '@nestjs/testing';
import { InventoryService } from 'src/application/inventory/inventory.service';
import { INVENTORY_REPOSITORY } from 'src/application/inventory/inventory.service';
import { InventorySourceType, type InventoryRepository } from 'src/domain/inventory';
import type { ProductionBatchRepository } from 'src/domain/production/production.repository';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService procurement sku traceability', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let prisma: any;

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

  const createPrismaMock = () => ({
    inventoryLedgerEntry: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    ingredient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    purchaseRecord: {
      findMany: jest.fn(),
    },
    procurementSku: {
      findMany: jest.fn(),
    },
    inventoryAdjustment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    inventoryStocktakeLine: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    inventoryStocktake: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  });

  beforeEach(async () => {
    prisma = createPrismaMock();

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
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepository = module.get(INVENTORY_REPOSITORY);

    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  });

  it('records procurement sku id when purchase records are inbounded into inventory', async () => {
    inventoryRepository.existsBySourceAndIngredient.mockResolvedValue(false);
    inventoryRepository.recordEntries.mockResolvedValue(undefined);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-1',
        procurementStrategy: 'HYBRID',
      },
    ]);

    await service.inboundFromPurchaseRecords([
      {
        id: 'purchase-record-1',
        ingredientId: 'ingredient-1',
        procurementSkuId: 'proc-sku-1',
        actualBaseQuantity: 12,
      } as any,
    ]);

    expect(inventoryRepository.recordEntries).toHaveBeenCalledTimes(1);
    const [entries] = inventoryRepository.recordEntries.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        deltaG: 12,
        sourceType: InventorySourceType.PURCHASE_RECORD,
        sourceId: 'purchase-record-1',
        procurementSkuId: 'proc-sku-1',
      }),
    );
  });

  it('skips daily purchase records when inbounding purchases into inventory', async () => {
    inventoryRepository.existsBySourceAndIngredient.mockResolvedValue(false);
    inventoryRepository.recordEntries.mockResolvedValue(undefined);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'beef',
        procurementStrategy: 'HYBRID',
      },
      {
        id: 'spinach',
        procurementStrategy: 'DAILY_PURCHASE',
      },
    ]);

    const result = await service.inboundFromPurchaseRecords([
      {
        id: 'purchase-record-beef',
        ingredientId: 'beef',
        actualBaseQuantity: 1200,
      } as any,
      {
        id: 'purchase-record-spinach',
        ingredientId: 'spinach',
        actualBaseQuantity: 500,
      } as any,
    ]);

    expect(result).toEqual({ createdCount: 1, skippedCount: 1 });
    expect(inventoryRepository.recordEntries).toHaveBeenCalledTimes(1);
    const [entries] = inventoryRepository.recordEntries.mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'beef',
        deltaG: 1200,
        sourceType: InventorySourceType.PURCHASE_RECORD,
        sourceId: 'purchase-record-beef',
      }),
    );
  });

  it('deletes purchase-record inbound ledger entries when a completed purchase list is reopened', async () => {
    prisma.purchaseRecord.findMany.mockResolvedValue([
      { id: 'purchase-record-1' },
      { id: 'purchase-record-2' },
    ]);
    prisma.inventoryLedgerEntry.deleteMany.mockResolvedValue({ count: 2 });

    const result =
      await service.releasePurchaseRecordInboundsForPurchaseList('list-1');

    expect(result).toEqual({ deletedCount: 2 });
    expect(prisma.inventoryLedgerEntry.deleteMany).toHaveBeenCalledWith({
      where: {
        sourceType: InventorySourceType.PURCHASE_RECORD,
        sourceId: { in: ['purchase-record-1', 'purchase-record-2'] },
      },
    });
  });

  it('includes procurement sku details when listing purchase-record ledger entries', async () => {
    prisma.inventoryLedgerEntry.findMany.mockResolvedValue([
      {
        id: 'ledger-1',
        ingredientId: 'ingredient-1',
        deltaG: 12,
        sourceType: InventorySourceType.PURCHASE_RECORD,
        sourceId: 'purchase-record-1',
        procurementSkuId: 'proc-sku-1',
        createdAt: new Date('2026-04-11T12:00:00.000Z'),
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '猪里脊',
        baseUnit: 'G',
        unitDisplayLabel: '克',
      },
    ]);
    prisma.purchaseRecord.findMany.mockResolvedValue([
      {
        id: 'purchase-record-1',
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
        purchaseChannel: '山姆',
        productModel: '2kg/包',
      },
    ]);
    prisma.procurementSku.findMany.mockResolvedValue([]);
    prisma.inventoryAdjustment.findMany.mockResolvedValue([]);
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([]);

    const result = await service.listLedgerEntries({ limit: 20 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'ingredient-1',
        ingredientName: '猪里脊',
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
        sourceType: InventorySourceType.PURCHASE_RECORD,
      }),
    );
    expect(result[0].sourceDescription).toContain('山姆猪里脊 2kg/包');
  });

  it('stores procurement sku id when creating manual inventory adjustments', async () => {
    inventoryRepository.getCurrentBalanceByIngredient.mockResolvedValue(5);
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: '猪里脊',
      baseUnit: 'G',
      unitDisplayLabel: '克',
    });

    await service.createManualAdjustment({
      ingredientId: 'ingredient-1',
      procurementSkuId: 'proc-sku-1',
      adjustmentMode: 'DELTA' as any,
      quantity: 2,
      reason: '补录库存',
    });

    expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientId: 'ingredient-1',
          procurementSkuId: 'proc-sku-1',
        }),
      }),
    );
    expect(prisma.inventoryLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ingredientId: 'ingredient-1',
          procurementSkuId: 'proc-sku-1',
          sourceType: InventorySourceType.MANUAL_ADJUSTMENT,
        }),
      }),
    );
  });

  it('stores procurement sku id on stocktake lines and stocktake ledger entries', async () => {
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '猪里脊',
        baseUnit: 'G',
        unitDisplayLabel: '克',
      },
    ]);
    prisma.inventoryLedgerEntry.groupBy.mockResolvedValue([
      {
        ingredientId: 'ingredient-1',
        _sum: {
          deltaG: 8,
        },
      },
    ]);
    prisma.inventoryStocktake.findUnique.mockResolvedValue({
      id: 'stocktake-1',
      status: 'APPLIED',
      note: '晚班盘点',
      createdAt: new Date('2026-04-11T13:00:00.000Z'),
      appliedAt: new Date('2026-04-11T13:00:00.000Z'),
      lines: [
        {
          id: 'line-1',
          ingredientId: 'ingredient-1',
          procurementSkuId: 'proc-sku-1',
          expectedQuantityG: 8,
          countedQuantityG: 10,
          deltaG: 2,
          ingredient: {
            id: 'ingredient-1',
            name: '猪里脊',
            baseUnit: 'G',
            unitDisplayLabel: '克',
          },
        },
      ],
    });
    prisma.procurementSku.findMany.mockResolvedValue([
      {
        id: 'proc-sku-1',
        name: '山姆猪里脊 2kg/包',
      },
    ]);

    const result = await service.createStocktake({
      note: '晚班盘点',
      applyImmediately: true,
      lines: [
        {
          ingredientId: 'ingredient-1',
          procurementSkuId: 'proc-sku-1',
          countedQuantityG: 10,
        },
      ],
    });

    expect(prisma.inventoryStocktakeLine.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            ingredientId: 'ingredient-1',
            procurementSkuId: 'proc-sku-1',
          }),
        ]),
      }),
    );
    expect(prisma.inventoryLedgerEntry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            ingredientId: 'ingredient-1',
            procurementSkuId: 'proc-sku-1',
            sourceType: InventorySourceType.STOCKTAKE,
          }),
        ]),
        skipDuplicates: true,
      }),
    );
    expect(prisma.procurementSku.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: {
            in: ['proc-sku-1'],
          },
        },
        select: {
          id: true,
          name: true,
        },
      }),
    );
    expect(prisma.inventoryStocktake.findUnique).toHaveBeenCalled();
    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        procurementSkuId: 'proc-sku-1',
        procurementSkuName: '山姆猪里脊 2kg/包',
      }),
    );
  });
});
