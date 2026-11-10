import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const createList = () => {
  const list = new PurchaseList({
    id: 'rec-1',
    targetDate: new Date('2026-11-10T12:00:00'),
    kind: PurchaseListKind.STOCK_REPLENISHMENT,
    status: PurchaseListStatus.COMPLETED,
    totalEstimatedCost: 37.39,
    itemCount: 0,
    createdById: 'user-1',
    sourceOrderIds: [],
    isDraft: true,
    paidAmount: 37.39,
    personalAmount: 0,
    reimbursementAmount: 37.39,
  });
  list.isDraft = false;
  list.completedAt = new Date('2026-11-10T12:00:00');
  return list;
};

const createService = (list = createList()) => {
  const repository = {
    findById: jest.fn().mockResolvedValue(list),
    save: jest.fn(async (value: any) => value),
  };
  const prisma: any = {
    purchaseItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          purchaseListId: 'rec-1',
          ingredientId: 'ing-1',
          ingredientName: '羊心',
          quantityNeeded: 3,
          quantityUnit: '斤',
          estimatedCost: 37.39,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    purchaseRecord: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'record-1',
          purchaseItemId: 'item-1',
          ingredientId: 'ing-1',
          actualPackageSize: 1,
          actualPackageUnit: '斤',
          actualBaseUnit: 'G',
          actualBaseQuantity: 1500,
          actualQuantity: 3,
          actualCost: 37.39,
        },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new ReplenishmentService(
    repository as any,
    {} as any,
    prisma,
    {} as any,
    {} as any,
  );
  return { service, list, repository, prisma };
};

describe('ReplenishmentService · 保存后改明细', () => {
  it('updates a weight line and recalculates the reimbursement amount', async () => {
    const { service, prisma, repository } = createService();
    const updatedItem = {
      id: 'item-1',
      purchaseListId: 'rec-1',
      ingredientId: 'ing-1',
      ingredientName: '羊心',
      quantityNeeded: 4,
      quantityUnit: '斤',
      estimatedCost: 49.84,
    };
    prisma.purchaseItem.findMany
      .mockResolvedValueOnce([
        {
          id: 'item-1',
          purchaseListId: 'rec-1',
          ingredientId: 'ing-1',
          ingredientName: '羊心',
          quantityNeeded: 3,
          quantityUnit: '斤',
          estimatedCost: 37.39,
        },
      ])
      .mockResolvedValueOnce([updatedItem]);

    const saved = await service.updateRecord(
      'rec-1',
      {
        items: [{ itemId: 'item-1', quantity: 4, unitPrice: 12.46 }],
        paidAmount: 49.84,
        shippingFee: 0,
        packagingFee: 0,
      },
      'user-1',
      'STAFF',
    );

    expect(prisma.purchaseItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: expect.objectContaining({
        quantityNeeded: 4,
        estimatedCost: 49.84,
      }),
    });
    expect(prisma.purchaseRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      data: expect.objectContaining({
        actualQuantity: 4,
        actualBaseQuantity: 2000,
        actualCost: 49.84,
      }),
    });
    expect(saved.reimbursementAmount).toBe(49.84);
    expect(saved.paidAmount).toBe(49.84);
    // repository.save 拿到的是刷新后的明细，不能把旧数量/旧单价盖回去。
    const savedItems = repository.save.mock.calls[0][0].items;
    expect(savedItems[0].quantityNeeded).toBe(4);
    expect(savedItems[0].estimatedCost).toBe(49.84);
  });

  it('rejects editing an arrived record', async () => {
    const list = createList();
    list.arrivedAt = new Date();
    const { service } = createService(list);

    await expect(
      service.updateRecord(
        'rec-1',
        { items: [{ itemId: 'item-1', quantity: 4, unitPrice: 12.46 }] },
        'user-1',
        'STAFF',
      ),
    ).rejects.toThrow('撤销到货');
  });

  it('rejects editing a reimbursed record', async () => {
    const list = createList();
    list.reimbursementId = 'reimb-1';
    const { service } = createService(list);

    await expect(
      service.updateRecord(
        'rec-1',
        { items: [{ itemId: 'item-1', quantity: 4, unitPrice: 12.46 }] },
        'user-1',
        'STAFF',
      ),
    ).rejects.toThrow('报销单');
  });
});
