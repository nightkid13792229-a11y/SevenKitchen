import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryService,
} from 'src/application/inventory/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

describe('InventoryService stocktake review', () => {
  let service: InventoryService;
  let prisma: any;

  const inventoryRepository = {
    recordEntries: jest.fn(),
    existsBySourceAndIngredient: jest.fn(),
    existsBySourceVersionAndIngredient: jest.fn(),
    getCurrentBalanceByIngredient: jest.fn(),
    findBySource: jest.fn(),
  };

  const line = (overrides: Record<string, any> = {}) => ({
    id: 'line-1',
    stocktakeId: 's1',
    ingredientId: 'i1',
    procurementSkuId: null,
    expectedQuantityG: 1000,
    countedQuantityG: null,
    deltaG: null,
    countedAt: null,
    ingredient: {
      id: 'i1',
      name: '冷冻三文鱼',
      baseUnit: 'G',
      unitDisplayLabel: '克',
    },
    ...overrides,
  });

  const stocktake = (lines: any[], status = 'DRAFT') => ({
    id: 's1',
    status,
    note: null,
    createdAt: new Date('2026-11-10T10:00:00.000Z'),
    appliedAt: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    lines,
  });

  beforeEach(async () => {
    prisma = {
      ingredient: { findMany: jest.fn() },
      inventoryLedgerEntry: {
        groupBy: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryStocktake: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      inventoryStocktakeLine: {
        findMany: jest.fn(),
        groupBy: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      inventoryStocktakePortion: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      procurementSku: {
        findMany: jest.fn().mockResolvedValue([]),
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

  it('开单返回盲盘，不暴露账面和差额', async () => {
    prisma.inventoryStocktake.findFirst.mockResolvedValue(null);
    prisma.ingredient.findMany.mockResolvedValue([
      {
        id: 'i1',
        name: '冷冻三文鱼',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
      },
    ]);
    prisma.inventoryLedgerEntry.groupBy.mockResolvedValue([
      { ingredientId: 'i1', _sum: { deltaG: 1000 } },
    ]);
    prisma.inventoryLedgerEntry.findMany.mockResolvedValue([]);
    prisma.inventoryStocktakeLine.groupBy.mockResolvedValue([]);
    prisma.inventoryStocktake.findUnique.mockResolvedValue(
      stocktake([line({ expectedQuantityG: 1000 })]),
    );

    const result = await service.startStocktake({ userId: 'u1' });

    expect(prisma.inventoryStocktake.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'DRAFT',
        createdBy: 'u1',
      }),
    });
    expect(
      prisma.inventoryStocktakeLine.createMany.mock.calls[0][0].data[0],
    ).toEqual(
      expect.objectContaining({
        expectedQuantityG: 1000,
        countedQuantityG: null,
        deltaG: null,
      }),
    );
    expect(result.lines[0]).not.toHaveProperty('expectedQuantityG');
    expect(result.lines[0]).not.toHaveProperty('deltaG');
    expect(result.lines[0].isCounted).toBe(false);
  });

  it('有未盘行时预览必须显式确认', async () => {
    prisma.inventoryStocktake.findUnique.mockResolvedValue({
      id: 's1',
      status: 'DRAFT',
      createdBy: 'u1',
    });
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      line(),
      line({ id: 'line-2', ingredientId: 'i2' }),
    ]);

    await expect(
      service.previewStocktake('s1', 'u1'),
    ).rejects.toThrow('还有 2 项未盘');

    await expect(
      service.previewStocktake('s1', 'u1', { confirmPartial: true }),
    ).resolves.toEqual(
      expect.objectContaining({ countedCount: 0, skippedCount: 2 }),
    );

    const preview = await service.previewStocktake('s1', 'u1', {
      confirmPartial: true,
    });
    expect(preview.lines.every((line: any) => line.expectedQuantityG === null)).toBe(
      true,
    );
  });

  it('预览按单位把行分成容差内和超容差', async () => {
    prisma.inventoryStocktake.findUnique.mockResolvedValue({
      id: 's1',
      status: 'DRAFT',
      createdBy: 'u1',
    });
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      line({ countedQuantityG: 960, deltaG: -40 }),
      line({ id: 'line-2', ingredientId: 'i2', countedQuantityG: 800 }),
    ]);

    const result = await service.previewStocktake('s1', 'u1');

    expect(result.countedCount).toBe(2);
    expect(result.withinCount).toBe(1);
    expect(result.overCount).toBe(1);
  });

  it('混合提交：容差内先入账，超容差进待复核', async () => {
    prisma.inventoryStocktake.findUnique
      .mockResolvedValueOnce({
        id: 's1',
        status: 'DRAFT',
        createdBy: 'u1',
      })
      .mockResolvedValueOnce(
        stocktake(
          [line({ countedQuantityG: 960, deltaG: -40 }), line({ id: 'line-2', ingredientId: 'i2', countedQuantityG: 800 })],
          'SUBMITTED',
        ),
      );
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      line({ countedQuantityG: 960 }),
      line({ id: 'line-2', ingredientId: 'i2', countedQuantityG: 800 }),
    ]);
    prisma.inventoryStocktake.updateMany.mockResolvedValue({ count: 1 });

    await service.submitStocktake('s1', 'u1');

    expect(prisma.inventoryStocktake.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 's1', status: 'DRAFT' }),
      data: expect.objectContaining({ status: 'SUBMITTED' }),
    });
    const rows =
      prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ ingredientId: 'i1', deltaG: -40 }),
    );
  });

  it('复核通过补写超容差行', async () => {
    prisma.inventoryStocktake.findUnique
      .mockResolvedValueOnce({ id: 's1', status: 'SUBMITTED' })
      .mockResolvedValueOnce(
        stocktake(
          [line({ countedQuantityG: 800, deltaG: -200 })],
          'APPLIED',
        ),
      );
    prisma.inventoryStocktake.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      line({ countedQuantityG: 800, deltaG: -200 }),
    ]);

    await service.reviewStocktake('s1', { approve: true }, 'admin-1');

    expect(prisma.inventoryStocktake.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 's1', status: 'SUBMITTED' }),
      data: expect.objectContaining({
        status: 'APPLIED',
        reviewedBy: 'admin-1',
      }),
    });
    const rows =
      prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows[0]).toEqual(
      expect.objectContaining({ ingredientId: 'i1', deltaG: -200 }),
    );
  });

  it('驳回必须填原因，且不写流水', async () => {
    prisma.inventoryStocktake.findUnique
      .mockResolvedValueOnce({ id: 's1', status: 'SUBMITTED' })
      .mockResolvedValueOnce(
        stocktake([line({ countedQuantityG: 800, deltaG: -200 })], 'REJECTED'),
      );

    await expect(
      service.reviewStocktake('s1', { approve: false }, 'admin-1'),
    ).rejects.toThrow('驳回必须填写原因');

    prisma.inventoryStocktake.updateMany.mockResolvedValue({ count: 1 });
    await service.reviewStocktake(
      's1',
      { approve: false, note: '数量差太多' },
      'admin-1',
    );

    expect(prisma.inventoryStocktake.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'REJECTED',
          reviewNote: '数量差太多',
        }),
      }),
    );
    expect(prisma.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('驳回把提交时自动入账的行冲回去', async () => {
    prisma.inventoryLedgerEntry.findMany.mockResolvedValue([
      { ingredientId: 'i1', procurementSkuId: null, deltaG: -40 },
    ]);
    prisma.inventoryStocktake.findUnique
      .mockResolvedValueOnce({ id: 's1', status: 'SUBMITTED' })
      .mockResolvedValueOnce(
        stocktake([line({ countedQuantityG: 960, deltaG: -40 })], 'REJECTED'),
      );
    prisma.inventoryStocktake.updateMany.mockResolvedValue({ count: 1 });

    await service.reviewStocktake(
      's1',
      { approve: false, note: '盘错单了' },
      'admin-1',
    );

    const rows = prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({
        ingredientId: 'i1',
        deltaG: 40,
        sourceId: 's1:reject',
        sourceType: 'STOCKTAKE',
      }),
    ]);
  });

  it('未盘一项都没有时不能提交', async () => {
    prisma.inventoryStocktake.findUnique.mockResolvedValue({
      id: 's1',
      status: 'DRAFT',
      createdBy: 'u1',
    });
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([line()]);

    await expect(service.submitStocktake('s1', 'u1')).rejects.toThrow(
      '至少盘一项',
    );
  });
});
