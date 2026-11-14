/**
 * 报销单号不得复用（2026-11-14）
 *
 * 事故背景：单号原来是「今天已有几张 + 1」。今天先建了 BX202611140001、
 * 又建了 BX202611140002；用户把 0001 删掉后重交，计数回到 1，于是又生成
 * BX202611140002，撞上唯一约束，手机上只剩一句 Prisma 英文报错。
 *
 * 规则：流水号取「当天已用过的最大号 + 1」，并允许撞号重试。
 */

jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000001',
}));

import { ReimbursementService } from '../reimbursement.service';

function buildService(claimNumbers: string[] | (() => string[]) = []) {
  const list: any = {
    id: 'list-1',
    status: 'COMPLETED',
    kind: 'ORDER_DEMAND',
    totalEstimatedCost: 10,
    totalActualCost: 10,
    reimbursementId: null,
    voidedAt: null,
    items: [],
    sourceOrderIds: [],
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
    findClaimNumbersByPrefix: jest.fn(async () =>
      typeof claimNumbers === 'function' ? claimNumbers() : claimNumbers,
    ),
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

  return { service, prisma, reimbursementRepository, pricing };
}

const dto = {
  purchaseListIds: ['list-1'],
  receiptUrls: ['https://example.com/receipt.jpg'],
  receiptKeys: [],
  totalActualCost: 10,
  platformShippingFee: 0,
  platformPackagingFee: 0,
};

/** 2026-11-14 16:45 上海时间（UTC 08:45） */
const SUBMIT_AT = new Date('2026-11-14T08:45:00Z');

function claimNumberConflict(claimNumber: string) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: ['claim_number'] },
    clientVersion: 'test',
    claimNumber,
  });
}

describe('报销单号生成（2026-11-14 撞号事故）', () => {
  it('当天只删掉较早的一张时，新单号接着最大号往后排，不复用已有单号', async () => {
    // 0001 已删，0002 还在
    const { service } = buildService(['BX202611140002']);

    await expect(service.generateClaimNumber(SUBMIT_AT)).resolves.toBe(
      'BX202611140003',
    );
  });

  it('当天完全没有单据时，从 0001 开始', async () => {
    const { service } = buildService([]);

    await expect(service.generateClaimNumber(SUBMIT_AT)).resolves.toBe(
      'BX202611140001',
    );
  });

  it('忽略同前缀下格式不规整的历史值，不因此算错流水号', async () => {
    const { service } = buildService([
      'BX202611140002',
      'BX202611140002-OLD',
      'BX20261114',
    ]);

    await expect(service.generateClaimNumber(SUBMIT_AT)).resolves.toBe(
      'BX202611140003',
    );
  });

  it('单号按上海日历日编号，凌晨提交不会写成前一天', async () => {
    // 2026-11-14 00:30 上海时间（UTC 11-13 16:30）
    const { service, reimbursementRepository } = buildService([]);

    await expect(
      service.generateClaimNumber(new Date('2026-11-13T16:30:00Z')),
    ).resolves.toBe('BX202611140001');
    expect(
      reimbursementRepository.findClaimNumbersByPrefix,
    ).toHaveBeenCalledWith('BX20261114');
  });

  it('两个人同时提交撞到同一个号时，自动换号重提，不把英文报错丢给用户', async () => {
    let reads = 0;
    const { service, reimbursementRepository } = buildService(() => {
      reads += 1;
      // 第一次读：只有 0002 → 生成 0003；紧接着别人抢先占了 0003
      return reads === 1
        ? ['BX202611140002']
        : ['BX202611140002', 'BX202611140003'];
    });

    const firstSave = reimbursementRepository.save;
    firstSave
      .mockImplementationOnce(async () => {
        throw claimNumberConflict('BX202611140003');
      })
      .mockImplementationOnce(async (reimbursement: any) => reimbursement);

    const saved: any = await service.submitReimbursement(dto as any, 'user-1');

    expect(reimbursementRepository.save).toHaveBeenCalledTimes(2);
    expect(saved.claimNumber).toBe('BX202611140004');
  });

  it('撞号重试也有上限，其他错误不重试', async () => {
    const { service, reimbursementRepository } = buildService([
      'BX202611140002',
    ]);

    reimbursementRepository.save.mockImplementation(async () => {
      throw claimNumberConflict('BX202611140003');
    });

    await expect(
      service.submitReimbursement(dto as any, 'user-1'),
    ).rejects.toThrow('Unique constraint failed');
    expect(reimbursementRepository.save).toHaveBeenCalledTimes(3);
  });
});
