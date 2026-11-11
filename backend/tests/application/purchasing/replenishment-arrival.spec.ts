import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const createSavedList = () => {
  const list = new PurchaseList({
    id: 'rec-1',
    targetDate: new Date('2026-11-10T12:00:00'),
    kind: PurchaseListKind.STOCK_REPLENISHMENT,
    status: PurchaseListStatus.COMPLETED,
    totalEstimatedCost: 37.39,
    itemCount: 0,
    createdById: 'user-1',
    sourceOrderIds: [],
    // 先按草稿构造，避开 itemCount 校验；再模拟「已保存」。
    isDraft: true,
    paidAmount: 37.39,
    personalAmount: 0,
    reimbursementAmount: 37.39,
  });
  list.isDraft = false;
  list.completedAt = new Date('2026-11-10T12:00:00');
  return list;
};

const createService = (options?: { list?: PurchaseList; records?: any[] }) => {
  const list = options?.list ?? createSavedList();
  const records = options?.records ?? [{ id: 'record-1' }];
  const repository = {
    findById: jest.fn().mockResolvedValue(list),
    save: jest.fn(async (value: any) => value),
  };
  const recordRepository = {
    findByPurchaseListId: jest.fn().mockResolvedValue(records),
  };
  const prisma: any = {
    purchaseList: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    reimbursement: { findUnique: jest.fn().mockResolvedValue(null) },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', nickname: '张三' }),
    },
  };
  const importService = {
    confirm: jest.fn(),
    listByPurchaseList: jest.fn().mockResolvedValue([]),
  };
  const inventory = {
    inboundFromPurchaseRecords: jest
      .fn()
      .mockResolvedValue({ createdCount: 1, skippedCount: 0 }),
    getBalanceByIngredient: jest.fn().mockResolvedValue(1500),
    reversePurchaseRecordInboundsForPurchaseList: jest
      .fn()
      .mockResolvedValue({ reversedCount: 1 }),
  };
  const service = new ReplenishmentService(
    repository as any,
    recordRepository as any,
    prisma,
    importService as any,
    inventory as any,
  );
  return { service, list, repository, recordRepository, prisma, importService, inventory };
};

describe('ReplenishmentService · 到货 / 作废 / 列表', () => {
  it('inbounds once on arrival and is idempotent', async () => {
    const { service, list, inventory } = createService();

    const first = await service.confirmArrival('rec-1', 'user-1', 'STAFF');
    const second = await service.confirmArrival('rec-1', 'user-1', 'STAFF');

    expect(first.createdCount).toBe(1);
    expect(second.createdCount).toBe(0);
    expect(inventory.inboundFromPurchaseRecords).toHaveBeenCalledTimes(1);
    expect(list.arrivedAt).toBeInstanceOf(Date);
  });

  it('reverses arrival and returns to in-transit', async () => {
    const { service, list, inventory } = createService();
    list.arrivedAt = new Date();
    inventory.getBalanceByIngredient.mockResolvedValue(1500);

    const result = await service.revokeArrival('rec-1', 'user-1', 'STAFF');

    expect(result.arrivedAt).toBeNull();
    expect(
      inventory.reversePurchaseRecordInboundsForPurchaseList,
    ).toHaveBeenCalledTimes(1);
  });

  it('refuses to reverse arrival when the goods were already used', async () => {
    const { service, list, inventory, recordRepository } = createService();
    list.arrivedAt = new Date();
    recordRepository.findByPurchaseListId.mockResolvedValue([
      {
        id: 'record-1',
        ingredientId: 'ing-1',
        actualBaseQuantity: 1500,
      },
    ]);
    inventory.getBalanceByIngredient.mockResolvedValue(100);

    await expect(
      service.revokeArrival('rec-1', 'user-1', 'STAFF'),
    ).rejects.toThrow('已经用掉');
  });

  it('refuses to reverse arrival after reimbursement', async () => {
    const { service, list } = createService();
    list.arrivedAt = new Date();
    list.reimbursementId = 'reimb-1';

    await expect(
      service.revokeArrival('rec-1', 'user-1', 'STAFF'),
    ).rejects.toThrow('报销单');
  });

  it('rejects voiding an arrived record', async () => {
    const { service, list } = createService();
    list.arrivedAt = new Date();

    await expect(
      service.voidRecord('rec-1', 'user-1', 'STAFF'),
    ).rejects.toThrow(BadRequestException);
  });

  it('only lets the creator or an admin operate the record', async () => {
    const { service } = createService();

    await expect(
      service.voidRecord('rec-1', 'user-2', 'STAFF'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.voidRecord('rec-1', 'user-2', 'ADMIN'),
    ).resolves.toBeTruthy();
  });

  it('filters in-transit and unsubmitted records independently', async () => {
    const { service, prisma } = createService();
    prisma.purchaseList.findMany.mockResolvedValue([
      {
        id: 'rec-1',
        channel: 'HEMA',
        orderNo: '261109',
        orderPlacedAt: new Date('2026-11-09T10:50:10'),
        expectedDeliveryAt: null,
        arrivedAt: null,
        voidedAt: null,
        itemCount: 1,
        records: [{ id: 'record-1', actualCost: 37.39 }],
        paidAmount: 37.39,
        personalAmount: 0,
        reimbursementAmount: 37.39,
        reimbursementId: null,
        reimbursement: null,
        createdAt: new Date('2026-11-10T12:00:00'),
      },
    ]);
    prisma.purchaseList.count.mockResolvedValue(1);

    const result = await service.listRecords(
      { arrival: 'IN_TRANSIT', claim: 'UNSUBMITTED' },
      'user-1',
      'STAFF',
    );

    expect(prisma.purchaseList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          kind: 'STOCK_REPLENISHMENT',
          isDraft: false,
          voidedAt: null,
          arrivedAt: null,
          reimbursementId: null,
        }),
      }),
    );
    expect(result.total).toBe(1);
    expect(result.list[0]).toMatchObject({
      id: 'rec-1',
      recordsCount: 1,
      reimbursementAmount: 37.39,
      reimbursementStatus: null,
    });
  });

  it('returns records, imports and the linked reimbursement in detail', async () => {
    const { service, list, prisma, importService, recordRepository } =
      createService();
    list.reimbursementId = 'reimb-1';
    recordRepository.findByPurchaseListId.mockResolvedValue([
      { id: 'record-1', actualCost: 37.39 },
    ]);
    importService.listByPurchaseList.mockResolvedValue([
      { id: 'import-1', orderNo: '261109' },
    ]);
    prisma.reimbursement.findUnique.mockResolvedValue({
      id: 'reimb-1',
      claimNumber: 'BX202611100001',
      status: 'PENDING_REVIEW',
    });

    const detail = await service.getRecord('rec-1');

    expect(detail.records).toHaveLength(1);
    expect(detail.imports).toHaveLength(1);
    expect(detail.reimbursement).toMatchObject({
      claimNumber: 'BX202611100001',
      status: 'PENDING_REVIEW',
    });
  });
});
