import { PrismaPurchaseListRepository } from '../../../src/infrastructure/repositories/prisma-purchase-list.repository';
import {
  PurchaseItem,
  PurchaseList,
  PurchaseListStatus,
} from '../../../src/domain/purchasing';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

describe('PrismaPurchaseListRepository', () => {
  const mockPrismaService = {
    purchaseList: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    ingredient: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses an exclusive upper bound when filtering by target date range', async () => {
    mockPrismaService.purchaseList.findMany.mockResolvedValue([]);
    mockPrismaService.purchaseList.count.mockResolvedValue(0);

    const repository = new PrismaPurchaseListRepository(mockPrismaService);
    const startDate = new Date('2026-04-05T04:00:00.000Z');
    const endDate = new Date('2026-04-06T04:00:00.000Z');

    await repository.findMany({
      startDate,
      endDate,
      page: 1,
      pageSize: 20,
    });

    expect(mockPrismaService.purchaseList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          targetDate: {
            gte: startDate,
            lt: endDate,
          },
        },
      }),
    );
    expect(mockPrismaService.purchaseList.count).toHaveBeenCalledWith({
      where: {
        targetDate: {
          gte: startDate,
          lt: endDate,
        },
      },
    });
  });

  it('falls back when item ingredient relations are inconsistent', async () => {
    const inconsistentRelationError = new Error(
      'Inconsistent query result: Field ingredient is required to return data, got `null` instead.',
    );

    mockPrismaService.purchaseList.findMany
      .mockRejectedValueOnce(inconsistentRelationError)
      .mockResolvedValueOnce([
        {
          id: 'list-1',
          targetDate: new Date('2026-04-05T04:00:00.000Z'),
          status: 'COMPLETED',
          totalEstimatedCost: 88.5,
          itemCount: 1,
          createdById: 'user-1',
          createdBy: {
            id: 'user-1',
            nickname: 'Tester',
            phone: null,
          },
          sourceOrderIds: ['order-1'],
          orderDateSnapshot: null,
          reimbursementId: null,
          createdAt: new Date('2026-04-05T01:00:00.000Z'),
          updatedAt: new Date('2026-04-05T01:00:00.000Z'),
          startedAt: null,
          completedAt: new Date('2026-04-05T02:00:00.000Z'),
          records: [],
          items: [
            {
              id: 'item-1',
              purchaseListId: 'list-1',
              ingredientId: 'missing-ingredient',
              ingredientName: '缺失原料',
              type: 'FOOD',
              quantityNeeded: 1,
              quantityUnit: 'kg',
              estimatedCost: 10,
              purchaseChannel: '历史渠道',
              productModel: '历史规格',
              displayUnit: 'kg',
              notes: null,
              createdAt: new Date('2026-04-05T01:00:00.000Z'),
            },
          ],
        },
      ]);
    mockPrismaService.purchaseList.count.mockResolvedValue(1);
    mockPrismaService.ingredient.findMany.mockResolvedValue([]);

    const repository = new PrismaPurchaseListRepository(mockPrismaService);
    const result = await repository.findMany({
      page: 1,
      pageSize: 20,
    });

    expect(result.total).toBe(1);
    expect(result.list).toHaveLength(1);
    expect(result.list[0].items).toHaveLength(1);
    expect(result.list[0].items[0].ingredient).toBeUndefined();
    expect(mockPrismaService.purchaseList.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrismaService.ingredient.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['missing-ingredient'],
        },
      },
      include: {
        procurementSkus: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  });

  it('falls back when finding a purchase list by id with a missing ingredient relation', async () => {
    const inconsistentRelationError = new Error(
      'Inconsistent query result: Field ingredient is required to return data, got `null` instead.',
    );
    const listData = {
      id: 'list-1',
      targetDate: new Date('2026-04-05T04:00:00.000Z'),
      status: 'COMPLETED',
      totalEstimatedCost: 88.5,
      itemCount: 1,
      createdById: 'user-1',
      createdBy: {
        id: 'user-1',
        nickname: 'Tester',
        phone: null,
      },
      sourceOrderIds: ['order-1'],
      orderDateSnapshot: null,
      reimbursementId: null,
      createdAt: new Date('2026-04-05T01:00:00.000Z'),
      updatedAt: new Date('2026-04-05T01:00:00.000Z'),
      startedAt: null,
      completedAt: new Date('2026-04-05T02:00:00.000Z'),
      records: [],
      items: [
        {
          id: 'item-1',
          purchaseListId: 'list-1',
          ingredientId: 'missing-ingredient',
          ingredientName: '历史西兰花',
          type: 'FOOD',
          quantityNeeded: 1,
          quantityUnit: 'kg',
          estimatedCost: 10,
          purchaseChannel: '历史渠道',
          productModel: '历史规格',
          displayUnit: 'kg',
          notes: null,
          createdAt: new Date('2026-04-05T01:00:00.000Z'),
        },
      ],
    };
    const prisma = {
      purchaseList: {
        findUnique: jest
          .fn()
          .mockRejectedValueOnce(inconsistentRelationError)
          .mockResolvedValueOnce(listData),
      },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as any;

    const repository = new PrismaPurchaseListRepository(prisma);
    const result = await repository.findById('list-1');

    expect(result?.id).toBe('list-1');
    expect(result?.items[0]).toEqual(
      expect.objectContaining({
        ingredientName: '历史西兰花',
        ingredient: undefined,
      }),
    );
    expect(prisma.purchaseList.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['missing-ingredient'],
        },
      },
      include: {
        procurementSkus: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  });

  it('persists purchase stock offset metadata when saving list items', async () => {
    const tx = {
      purchaseList: {
        findUnique: jest.fn().mockResolvedValue({ id: 'list-1' }),
        update: jest.fn().mockResolvedValue({ id: 'list-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'list-1',
          targetDate: new Date('2026-04-05T04:00:00.000Z'),
          status: 'PENDING',
          totalEstimatedCost: 6,
          itemCount: 1,
          createdById: 'user-1',
          createdBy: {
            id: 'user-1',
            nickname: 'Tester',
            phone: null,
          },
          sourceOrderIds: ['order-1'],
          orderDateSnapshot: null,
          reimbursementId: null,
          createdAt: new Date('2026-04-05T01:00:00.000Z'),
          updatedAt: new Date('2026-04-05T01:00:00.000Z'),
          startedAt: null,
          completedAt: null,
          records: [],
          items: [
            {
              id: 'item-1',
              purchaseListId: 'list-1',
              ingredientId: 'spinach',
              ingredientName: '菠菜',
              type: 'FOOD',
              quantityNeeded: 600,
              quantityUnit: 'G',
              estimatedCost: 6,
              grossQuantityNeeded: 900,
              stockDeductedQuantity: 300,
              purchaseShortageQuantity: 600,
              onHandQuantity: 500,
              allocatedQuantity: 100,
              availableQuantity: 400,
              usesInventory: true,
              purchaseChannel: null,
              productModel: null,
              displayUnit: 'G',
              notes: null,
              createdAt: new Date('2026-04-05T01:00:00.000Z'),
            },
          ],
        }),
      },
      purchaseItem: {
        upsert: jest.fn().mockResolvedValue({ id: 'item-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any;
    const repository = new PrismaPurchaseListRepository(prisma);
    const purchaseList = new PurchaseList({
      id: 'list-1',
      targetDate: new Date('2026-04-05T04:00:00.000Z'),
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 6,
      itemCount: 1,
      createdById: 'user-1',
      sourceOrderIds: ['order-1'],
      items: [
        new PurchaseItem({
          id: 'item-1',
          purchaseListId: 'list-1',
          ingredientId: 'spinach',
          ingredientName: '菠菜',
          type: 'FOOD',
          quantityNeeded: 600,
          quantityUnit: 'G',
          estimatedCost: 6,
          grossQuantityNeeded: 900,
          stockDeductedQuantity: 300,
          purchaseShortageQuantity: 600,
          onHandQuantity: 500,
          allocatedQuantity: 100,
          availableQuantity: 400,
          usesInventory: true,
        } as any),
      ],
    });

    const saved = await repository.save(purchaseList);

    expect(tx.purchaseItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          grossQuantityNeeded: 900,
          stockDeductedQuantity: 300,
          purchaseShortageQuantity: 600,
          onHandQuantity: 500,
          allocatedQuantity: 100,
          availableQuantity: 400,
          usesInventory: true,
        }),
      }),
    );
    expect(saved.items[0]).toEqual(
      expect.objectContaining({
        grossQuantityNeeded: 900,
        stockDeductedQuantity: 300,
        purchaseShortageQuantity: 600,
        onHandQuantity: 500,
        allocatedQuantity: 100,
        availableQuantity: 400,
        usesInventory: true,
      }),
    );
  });

  it('hydrates active procurement SKU brand and price metadata for purchase detail display', () => {
    const item = PurchaseItem.fromPrisma({
      id: 'item-1',
      purchaseListId: 'list-1',
      ingredientId: 'seaweed',
      ingredientName: '海藻粉',
      type: 'SUPPLEMENT',
      procurementSkuId: 'sku-1',
      procurementSkuName: '海藻粉 450mcg碘/平勺',
      quantityNeeded: 2.91,
      quantityUnit: '平勺',
      estimatedCost: 0.1,
      purchaseChannel: '天猫旗舰店',
      productModel: '227g/瓶',
      displayUnit: '平勺',
      notes: null,
      createdAt: new Date('2026-04-05T01:00:00.000Z'),
      ingredient: {
        productModel: null,
        purchaseChannel: null,
        purchaseUnit: 'g',
        baseUnit: 'PCS',
        unitDisplayLabel: '平勺',
        purchaseToBaseRatio: 1,
        properties: {},
        procurementSkus: [
          {
            id: 'sku-1',
            name: '海藻粉 450mcg碘/平勺',
            brand: 'NOW FOODS',
            purchaseChannel: '天猫旗舰店',
            productModel: '227g/瓶',
            purchaseUnit: '瓶',
            purchaseToBaseRatio: 2522,
            currentPurchasePrice: 89.4,
            referencePricePerPurchaseUnit: 89.4,
            isActive: true,
          },
        ],
      },
    });

    expect(item.ingredient?.procurementSkus?.[0]).toEqual(
      expect.objectContaining({
        id: 'sku-1',
        brand: 'NOW FOODS',
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 2522,
        currentPurchasePrice: 89.4,
        referencePricePerPurchaseUnit: 89.4,
      }),
    );
  });
});
