import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseOrderImportService } from '../../../src/application/purchasing/purchase-order-import.service';
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('PurchaseOrderImportService · 删行', () => {
  const service = (status = 'DRAFT') => {
    const prisma: any = {
      purchaseOrderImportLine: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'line-1',
          purchaseItemId: null,
          import: { status, uploadedById: 'user-1' },
        }),
        delete: jest.fn().mockResolvedValue({}),
      },
      purchaseRecord: { deleteMany: jest.fn() },
      purchaseItem: { deleteMany: jest.fn() },
    };
    return {
      prisma,
      instance: new PurchaseOrderImportService(
        prisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      ),
    };
  };

  it('deletes a draft line', async () => {
    const { instance, prisma } = service();
    await instance.deleteLine('import-1', 'line-1', 'user-1');
    expect(prisma.purchaseOrderImportLine.delete).toHaveBeenCalledWith({
      where: { id: 'line-1' },
    });
  });

  it('rejects a confirmed import or another user', async () => {
    const confirmed = service('CONFIRMED');
    await expect(
      confirmed.instance.deleteLine('import-1', 'line-1', 'user-1'),
    ).rejects.toThrow('不能再删行');

    const other = service();
    await expect(
      other.instance.deleteLine('import-1', 'line-1', 'other'),
    ).rejects.toThrow('只能修改自己');
  });
});

describe('ReplenishmentService · 删项', () => {
  const list = () => {
    const value = new PurchaseList({
      id: 'rec-1',
      targetDate: new Date('2026-11-11T12:00:00'),
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 80,
      itemCount: 2,
      createdById: 'user-1',
      sourceOrderIds: [],
      isDraft: true,
      paidAmount: 100,
      personalAmount: 0,
    });
    value.isDraft = false;
    return value;
  };

  const build = () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(list()),
      save: jest.fn(async (value: any) => value),
    };
    const prisma: any = {
      purchaseItem: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'item-1', estimatedCost: 50 },
            { id: 'item-2', estimatedCost: 30 },
          ])
          .mockResolvedValueOnce([{ id: 'item-2', estimatedCost: 30 }]),
        delete: jest.fn().mockResolvedValue({}),
      },
      purchaseRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new ReplenishmentService(
      repository as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
    );
    return { service, repository, prisma };
  };

  it('deletes an item and recalculates the amounts', async () => {
    const { service, prisma, repository } = build();
    const saved = await service.deleteRecordItem(
      'rec-1',
      'item-1',
      'user-1',
      'STAFF',
    );

    expect(prisma.purchaseItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
    expect(saved.itemCount).toBe(1);
    expect(saved.totalEstimatedCost).toBe(30);
    expect(saved.reimbursementAmount).toBe(100);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('refuses to delete the last item or an arrived record', async () => {
    const { service } = build();
    // first findMany returns two; second returns one, but the last-item guard
    // is based on the first read. Point it at a single-item list.
    const single = new ReplenishmentService(
      {
        findById: jest.fn().mockResolvedValue(list()),
        save: jest.fn(),
      } as any,
      {} as any,
      {
        purchaseItem: {
          findMany: jest.fn().mockResolvedValue([{ id: 'item-1' }]),
        },
        purchaseRecord: { findMany: jest.fn().mockResolvedValue([]) },
      } as any,
      {} as any,
      {} as any,
    );
    await expect(
      single.deleteRecordItem('rec-1', 'item-1', 'user-1', 'STAFF'),
    ).rejects.toThrow('只剩这一项');

    const arrived = list();
    arrived.arrivedAt = new Date();
    const arrivedService = new ReplenishmentService(
      { findById: jest.fn().mockResolvedValue(arrived) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      arrivedService.deleteRecordItem('rec-1', 'item-1', 'user-1', 'STAFF'),
    ).rejects.toThrow('撤销到货');
    // keep the unused variable out of lint noise
    expect(service).toBeDefined();
  });
});

describe('ReplenishmentService · 订单号查重', () => {
  it('finds a saved record with the same order number', async () => {
    const prisma: any = {
      purchaseList: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'rec-1',
          channel: '盒马鲜生',
          orderPlacedAt: new Date('2026-11-10T12:00:00'),
          paidAmount: 100,
        }),
      },
    };
    const service = new ReplenishmentService(
      {} as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
    );

    const result = await service.findDuplicateOrder({
      orderNo: '1234',
      channel: '盒马鲜生',
    });

    expect(result?.id).toBe('rec-1');
    expect(prisma.purchaseList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orderNo: '1234',
          channel: '盒马鲜生',
          isDraft: false,
          voidedAt: null,
        }),
      }),
    );
  });
});
