import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryService,
} from 'src/application/inventory/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService scrap / internal use (C7)', () => {
  let service: InventoryService;
  let prisma: any;

  const inventoryRepository = {
    recordEntries: jest.fn(),
    existsBySourceAndIngredient: jest.fn(),
    existsBySourceVersionAndIngredient: jest.fn(),
    getCurrentBalanceByIngredient: jest.fn().mockResolvedValue(5000),
    findBySource: jest.fn(),
  };

  const ingredient = {
    id: 'i1',
    name: '冷冻三文鱼',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    purchaseToBaseRatio: 1000,
    currentPricePerPurchaseUnit: 60,
  };

  const adjustmentRow = (overrides: Record<string, any> = {}) => ({
    id: 'a1',
    ingredientId: 'i1',
    procurementSkuId: null,
    adjustmentMode: 'DELTA',
    quantityBeforeG: 5000,
    quantityAfterG: 4000,
    deltaG: -1000,
    reason: '过期报废',
    note: null,
    category: 'EXPIRED',
    reviewStatus: 'PENDING',
    costAmount: 60,
    createdBy: 'u1',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    reversesAdjustmentId: null,
    createdAt: new Date('2026-11-10T10:00:00.000Z'),
    ingredient: { name: '冷冻三文鱼', baseUnit: 'G', unitDisplayLabel: '克' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      ingredient: { findUnique: jest.fn().mockResolvedValue(ingredient) },
      inventoryLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { deltaG: 5000 } }),
        create: jest.fn(),
      },
      inventoryAdjustment: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(adjustmentRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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

  it('内部领用免审批，直接入账并快照金额', async () => {
    const result = await service.createManualAdjustment(
      {
        ingredientId: 'i1',
        adjustmentMode: 'DELTA' as any,
        quantity: -300,
        reason: '内部领用',
        category: 'INTERNAL_USE' as any,
      },
      'u1',
    );

    expect(result.reviewStatus).toBe('NONE');
    expect(result.costAmount).toBe(18);
    expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: 'INTERNAL_USE',
        reviewStatus: 'NONE',
        costAmount: 18,
        createdBy: 'u1',
      }),
    });
    expect(prisma.inventoryLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deltaG: -300 }),
    });
  });

  it('报废超 50 元进待复核，但仍然先入账', async () => {
    const result = await service.createManualAdjustment({
      ingredientId: 'i1',
      adjustmentMode: 'DELTA' as any,
      quantity: -1000,
      reason: '过期报废',
      category: 'EXPIRED' as any,
    });

    expect(result.reviewStatus).toBe('PENDING');
    expect(result.costAmount).toBe(60);
    expect(prisma.inventoryLedgerEntry.create).toHaveBeenCalled();
  });

  it('缺价一律待复核', async () => {
    prisma.ingredient.findUnique.mockResolvedValueOnce({
      ...ingredient,
      currentPricePerPurchaseUnit: 0,
    });

    const result = await service.createManualAdjustment({
      ingredientId: 'i1',
      adjustmentMode: 'DELTA' as any,
      quantity: -100,
      reason: '破损污染',
      category: 'DAMAGED' as any,
    });

    expect(result.costAmount).toBeNull();
    expect(result.reviewStatus).toBe('PENDING');
  });

  it('驳回写一笔反向调整，把扣掉的加回来', async () => {
    await service.reviewAdjustment(
      'a1',
      { approve: false, note: '数量不对' },
      'admin-1',
    );

    expect(prisma.inventoryAdjustment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewStatus: 'REJECTED',
          reviewedBy: 'admin-1',
        }),
      }),
    );
    const reversal = prisma.inventoryAdjustment.create.mock.calls[0][0].data;
    expect(reversal).toEqual(
      expect.objectContaining({
        deltaG: 1000,
        reversesAdjustmentId: 'a1',
        reviewStatus: 'NONE',
      }),
    );
    expect(prisma.inventoryLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ deltaG: 1000, sourceId: reversal.id }),
    });
  });

  it('驳回必须填原因', async () => {
    await expect(
      service.reviewAdjustment('a1', { approve: false }, 'admin-1'),
    ).rejects.toThrow('驳回必须填写原因');
  });
});
