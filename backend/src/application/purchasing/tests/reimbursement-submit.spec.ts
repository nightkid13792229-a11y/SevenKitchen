/**
 * 报销提交：建单与价格同步必须同生共死（2026-11-14）
 *
 * 事故背景：BX202611140002 的价格同步撞唯一约束时，报销单已经落库。
 * 前端看到失败、用户重试又被「已关联到报销单」拦住，钱和价格两头对不上。
 * 现在两件事放进一个事务，同步失败整笔回滚；重复提交的提示也改成人话 + 单号。
 */

// uuid 13 是纯 ESM，jest 的 CommonJS 运行时加载不了；
// 这个用例不依赖随机 id，换成固定值即可。
jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000001',
}));

import { ReimbursementService } from '../reimbursement.service';

function buildService(listOverrides: Record<string, any> = {}) {
  const list: any = {
    id: 'list-1',
    status: 'COMPLETED',
    kind: 'ORDER_DEMAND',
    totalEstimatedCost: 10,
    totalActualCost: 10,
    reimbursementId: null,
    targetDate: new Date('2026-11-14T04:00:00Z'),
    sourceOrderIds: [],
    items: [],
    voidedAt: null,
    ...listOverrides,
  };

  const tx: any = {};
  const prisma: any = {
    $transaction: jest.fn(async (callback: any) => callback(tx)),
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    reimbursementReviewEvent: { create: jest.fn().mockResolvedValue({}) },
  };

  const reimbursementRepository: any = {
    save: jest.fn(async (reimbursement: any) => reimbursement),
    findById: jest.fn().mockResolvedValue(null),
    countByDate: jest.fn().mockResolvedValue(0),
  };
  const purchaseListRepository: any = {
    findById: jest.fn().mockResolvedValue(list),
  };
  const pricing: any = {
    syncPendingChangesForReimbursement: jest.fn().mockResolvedValue([]),
    autoApproveEligibleChangesForReimbursement: jest.fn().mockResolvedValue([]),
  };
  const purchaseOrderImportService: any = {
    getAllowedReceiptKeys: jest.fn().mockResolvedValue(new Set()),
  };

  const service = new ReimbursementService(
    reimbursementRepository,
    purchaseListRepository,
    {} as any,
    pricing,
    purchaseOrderImportService,
    prisma,
  );

  return {
    service,
    prisma,
    tx,
    reimbursementRepository,
    purchaseListRepository,
    pricing,
  };
}

const dto = {
  purchaseListIds: ['list-1'],
  receiptUrls: ['https://example.com/receipt.jpg'],
  totalActualCost: 10,
  platformShippingFee: 0,
  platformPackagingFee: 0,
};

describe('报销提交事务', () => {
  it('建单和价格同步在同一个事务里，并把事务客户端传下去', async () => {
    const { service, prisma, tx, reimbursementRepository, pricing } =
      buildService();

    await service.submitReimbursement(dto, 'user-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reimbursementRepository.save).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
    expect(
      pricing.syncPendingChangesForReimbursement,
    ).toHaveBeenCalledWith(expect.any(String), ['list-1'], tx);
  });

  it('价格同步失败时整笔抛错，不会再往前走到自动定价', async () => {
    const { service, pricing } = buildService();
    pricing.syncPendingChangesForReimbursement.mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`purchase_record_id`)'),
    );

    await expect(
      service.submitReimbursement(dto, 'user-1'),
    ).rejects.toThrow(/purchase_record_id/);
    expect(
      pricing.autoApproveEligibleChangesForReimbursement,
    ).not.toHaveBeenCalled();
  });

  it('清单已经提交过报销时，提示里带单号并说明下一步', async () => {
    const { service, prisma, reimbursementRepository } = buildService({
      reimbursementId: 'old-reimb',
    });
    reimbursementRepository.findById.mockImplementation(async (id: string) =>
      id === 'old-reimb' ? { id, claimNumber: 'BX202611140001' } : null,
    );

    await expect(
      service.submitReimbursement(dto, 'user-1'),
    ).rejects.toThrow(/BX202611140001/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('清单还没确认完成时，提示先完成采购而不是抛一串编号', async () => {
    const { service } = buildService({ status: 'PENDING' });

    await expect(
      service.submitReimbursement(dto, 'user-1'),
    ).rejects.toThrow(/确认采购完成/);
  });
});
