import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryService,
} from 'src/application/inventory/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import type { InventoryRepository } from 'src/domain/inventory';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService allocations', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<InventoryRepository>;
  let prisma: any;

  beforeEach(async () => {
    inventoryRepository = {
      recordEntries: jest.fn(),
      existsBySourceAndIngredient: jest.fn(),
      getCurrentBalanceByIngredient: jest.fn(),
      findBySource: jest.fn(),
    };
    prisma = {
      inventoryAllocation: {
        create: jest.fn().mockResolvedValue({ id: 'allocation-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryAllocationLine: {
        groupBy: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: INVENTORY_REPOSITORY, useValue: inventoryRepository },
        { provide: PRODUCTION_BATCH_REPOSITORY, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('calculates available stock from on-hand minus active allocations', async () => {
    inventoryRepository.getCurrentBalanceByIngredient
      .mockResolvedValueOnce(5000)
      .mockResolvedValueOnce(800);
    prisma.inventoryAllocationLine.groupBy.mockResolvedValue([
      { ingredientId: 'beef', _sum: { quantityG: 1200 } },
    ]);

    const result = await service.getAvailabilityByIngredientIds([
      'beef',
      'spinach',
    ]);

    expect(result.get('beef')).toEqual({
      ingredientId: 'beef',
      onHandQuantityG: 5000,
      allocatedQuantityG: 1200,
      availableQuantityG: 3800,
    });
    expect(result.get('spinach')).toEqual({
      ingredientId: 'spinach',
      onHandQuantityG: 800,
      allocatedQuantityG: 0,
      availableQuantityG: 800,
    });
  });

  it('creates an allocation header and lines without requiring a purchase list', async () => {
    const targetDate = new Date('2026-04-20T12:00:00.000Z');

    const result = await service.createAllocationForOrderDemand({
      targetDate,
      purchaseListId: null,
      sourceOrderIds: ['order-1'],
      createdById: 'admin-1',
      lines: [
        {
          ingredientId: 'beef',
          procurementSkuId: 'sku-beef',
          quantityG: 1500,
        },
      ],
    });

    expect(result).toEqual({ id: 'allocation-1' });
    expect(prisma.inventoryAllocation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetDate,
        purchaseListId: null,
        sourceOrderIds: ['order-1'],
        createdById: 'admin-1',
        status: 'ACTIVE',
      }),
      select: { id: true },
    });
    expect(prisma.inventoryAllocationLine.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          allocationId: 'allocation-1',
          ingredientId: 'beef',
          procurementSkuId: 'sku-beef',
          quantityG: 1500,
        }),
      ],
    });
  });

  it('releases active allocations by purchase list id', async () => {
    await service.releaseAllocationsForPurchaseList('purchase-list-1');

    expect(prisma.inventoryAllocation.updateMany).toHaveBeenCalledWith({
      where: {
        purchaseListId: 'purchase-list-1',
        status: 'ACTIVE',
      },
      data: {
        status: 'RELEASED',
        releasedAt: expect.any(Date),
      },
    });
  });
});
