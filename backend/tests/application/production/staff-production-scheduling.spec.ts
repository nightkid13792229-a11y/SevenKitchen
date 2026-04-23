jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { StaffProductionService } from 'src/application/production/kitchen.service';
import { ProductionBatchStatus } from 'src/domain/production/enums';
import { PurchaseListKind, PurchaseListStatus } from 'src/domain/purchasing';

describe('StaffProductionService production scheduling gate', () => {
  function createService(
    purchaseLists: Array<{ id: string; kind: string; status: string }>,
  ) {
    const productionService = {
      createProductionBatch: jest.fn().mockResolvedValue({
        id: 'batch-1',
        productionDate: new Date('2026-04-20T00:00:00.000Z'),
        status: ProductionBatchStatus.IN_PRODUCTION,
        packagingUnits: [],
      }),
    };
    const purchaseListRepository = {
      findMany: jest.fn().mockImplementation((params) => {
        const filtered = params?.kind
          ? purchaseLists.filter((list) => list.kind === params.kind)
          : purchaseLists;

        return Promise.resolve({
          list: filtered,
          total: filtered.length,
        });
      }),
    };

    const service = new StaffProductionService(
      productionService as any,
      {} as any,
      {} as any,
      purchaseListRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, productionService, purchaseListRepository };
  }

  it('rejects auto scheduling when any order-demand purchase list for the date is still pending', async () => {
    const { service, productionService } = createService([
      {
        id: 'completed-list',
        kind: PurchaseListKind.ORDER_DEMAND,
        status: PurchaseListStatus.COMPLETED,
      },
      {
        id: 'pending-daily-list',
        kind: PurchaseListKind.ORDER_DEMAND,
        status: PurchaseListStatus.PENDING,
      },
    ]);

    await expect(
      service.autoScheduleToday({ startDate: '2026-04-20' }),
    ).rejects.toThrow('请先完成 2026-04-20 的所有采购任务后再进行排单');

    expect(productionService.createProductionBatch).not.toHaveBeenCalled();
  });

  it('allows auto scheduling when same-day stock replenishment lists are still pending', async () => {
    const { service, productionService, purchaseListRepository } =
      createService([
        {
          id: 'completed-daily-list',
          kind: PurchaseListKind.ORDER_DEMAND,
          status: PurchaseListStatus.COMPLETED,
        },
        {
          id: 'pending-stock-list',
          kind: PurchaseListKind.STOCK_REPLENISHMENT,
          status: PurchaseListStatus.PENDING,
        },
      ]);

    await expect(
      service.autoScheduleToday({ startDate: '2026-04-20' }),
    ).resolves.toMatchObject({
      id: 'batch-1',
      status: ProductionBatchStatus.IN_PRODUCTION,
    });

    expect(purchaseListRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: PurchaseListKind.ORDER_DEMAND,
      }),
    );
    expect(productionService.createProductionBatch).toHaveBeenCalledWith({
      productionDate: '2026-04-20',
      orderIds: undefined,
    });
  });
});
