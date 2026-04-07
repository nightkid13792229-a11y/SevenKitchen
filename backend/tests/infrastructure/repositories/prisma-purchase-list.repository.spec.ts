import { PrismaPurchaseListRepository } from '../../../src/infrastructure/repositories/prisma-purchase-list.repository';

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
});
