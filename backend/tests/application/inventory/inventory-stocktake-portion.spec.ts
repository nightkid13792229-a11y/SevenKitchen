import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryService,
} from 'src/application/inventory/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

/**
 * 盘点明细点（2026-11-11）：食材按商品录、可分批，汇总到原料；
 * 期初盘点（OPENING）不看容差，全部直接入账。
 */
describe('InventoryService stocktake portions', () => {
  let service: InventoryService;
  let prisma: any;

  const ingredient = (overrides: Record<string, any> = {}) => ({
    id: 'i1',
    name: '鸡胸肉',
    type: 'FOOD',
    baseUnit: 'G',
    unitDisplayLabel: '克',
    ...overrides,
  });

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
      name: '鸡胸肉',
      type: 'FOOD',
      baseUnit: 'G',
      unitDisplayLabel: '克',
    },
    portions: [],
    ...overrides,
  });

  const stocktake = (lines: any[], overrides: Record<string, any> = {}) => ({
    id: 's1',
    type: 'ROUTINE',
    status: 'DRAFT',
    createdBy: 'u1',
    note: null,
    createdAt: new Date('2026-11-11T10:00:00.000Z'),
    appliedAt: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    lines,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      ingredient: { findMany: jest.fn() },
      inventoryLedgerEntry: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      inventoryStocktake: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryStocktakeLine: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
        {
          provide: INVENTORY_REPOSITORY,
          useValue: {
            recordEntries: jest.fn(),
            existsBySourceAndIngredient: jest.fn(),
            existsBySourceVersionAndIngredient: jest.fn(),
            getCurrentBalanceByIngredient: jest.fn(),
            findBySource: jest.fn(),
          },
        },
        { provide: PRODUCTION_BATCH_REPOSITORY, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('食材按商品各生成一个明细点，补剂/包材只有一个点', async () => {
    prisma.ingredient.findMany.mockResolvedValue([
      ingredient({ id: 'i1', name: '鸡胸肉', type: 'FOOD' }),
      ingredient({
        id: 'i2',
        name: '鱼油',
        type: 'SUPPLEMENT',
        baseUnit: 'PCS',
        unitDisplayLabel: '粒',
      }),
    ]);
    prisma.procurementSku.findMany.mockResolvedValue([
      { id: 'sku-a', ingredientId: 'i1' },
      { id: 'sku-b', ingredientId: 'i1' },
    ]);
    prisma.inventoryStocktake.findUnique.mockResolvedValue(stocktake([]));

    await service.startStocktake({ userId: 'u1' });

    const lineRows = prisma.inventoryStocktakeLine.createMany.mock.calls[0][0]
      .data;
    const portionRows =
      prisma.inventoryStocktakePortion.createMany.mock.calls[0][0].data;

    expect(lineRows).toHaveLength(2);
    const chickenLine = lineRows.find(
      (row: any) => row.ingredientId === 'i1',
    );
    const oilLine = lineRows.find((row: any) => row.ingredientId === 'i2');

    const chickenPortions = portionRows.filter(
      (row: any) => row.lineId === chickenLine.id,
    );
    const oilPortions = portionRows.filter(
      (row: any) => row.lineId === oilLine.id,
    );

    expect(chickenPortions).toHaveLength(2);
    expect(chickenPortions.map((row: any) => row.procurementSkuId).sort()).toEqual(
      ['sku-a', 'sku-b'],
    );
    expect(oilPortions).toHaveLength(1);
    expect(oilPortions[0].procurementSkuId).toBeNull();

    // 明细点里的空商品 ID 不能混进名称查询，否则 Prisma 会报 in: [null]
    const skuQueryIds = prisma.procurementSku.findMany.mock.calls
      .map((call: any[]) => call[0]?.where?.id?.in ?? [])
      .flat();
    expect(skuQueryIds).not.toContain(null);
  });

  it('盲盘 DTO 带上盘点类型，前端才知道是期初', async () => {
    prisma.ingredient.findMany.mockResolvedValue([ingredient()]);
    prisma.inventoryStocktake.findUnique.mockResolvedValue(
      stocktake([line()], { type: 'OPENING' }),
    );

    const draft: any = await service.startStocktake({
      userId: 'u1',
      type: 'OPENING',
    });

    expect(draft.type).toBe('OPENING');
    expect(draft.lines[0]).not.toHaveProperty('expectedQuantityG');
  });

  it('同一原材料的多个明细点汇总成行实盘，差异只算一次', async () => {
    prisma.inventoryStocktake.findUnique.mockResolvedValue(
      stocktake([line({ portions: [] })]),
    );
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      { id: 'line-1', ingredientId: 'i1', expectedQuantityG: 1000 },
    ]);
    prisma.inventoryStocktakePortion.findMany
      // 第一次：查已有点（save 前）
      .mockResolvedValueOnce([
        { id: 'p1', lineId: 'line-1' },
        { id: 'p2', lineId: 'line-1' },
      ])
      // 汇总时：两个点的实盘
      .mockResolvedValueOnce([
        { countedQuantityG: 500 },
        { countedQuantityG: 300 },
      ]);

    await service.saveStocktakeLines(
      's1',
      {
        portions: [
          { id: 'p1', countedQuantityG: 500 },
          { id: 'p2', countedQuantityG: 300 },
        ],
      },
      'u1',
    );

    expect(prisma.inventoryStocktakeLine.update).toHaveBeenCalledWith({
      where: { id: 'line-1' },
      data: {
        countedQuantityG: 800,
        deltaG: -200,
        countedAt: expect.any(Date),
      },
    });
  });

  it('期初盘点不看容差：全部入账，流水记为「期初结转」', async () => {
    prisma.inventoryStocktake.findUnique.mockResolvedValue(
      stocktake([], { type: 'OPENING' }),
    );
    prisma.inventoryStocktakeLine.findMany.mockResolvedValue([
      {
        id: 'line-1',
        ingredientId: 'i1',
        procurementSkuId: null,
        expectedQuantityG: 0,
        countedQuantityG: 5000,
        deltaG: 5000,
        ingredient: { baseUnit: 'G' },
      },
    ]);
    prisma.inventoryStocktake.findUnique.mockResolvedValueOnce(
      stocktake([line()], { type: 'OPENING' }),
    );

    await service.submitStocktake('s1', 'u1');

    expect(prisma.inventoryStocktake.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: 'DRAFT', createdBy: 'u1' },
      data: expect.objectContaining({ status: 'APPLIED' }),
    });
    const ledgerRows =
      prisma.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0]).toEqual(
      expect.objectContaining({
        ingredientId: 'i1',
        deltaG: 5000,
        sourceType: 'OPENING_BALANCE',
      }),
    );
  });
});
