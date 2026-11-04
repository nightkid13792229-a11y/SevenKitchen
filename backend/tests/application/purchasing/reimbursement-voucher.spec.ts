jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReimbursementService } from '../../../src/application/purchasing/reimbursement.service';
import {
  Reimbursement,
  ReimbursementStatus,
} from '../../../src/domain/purchasing';

describe('ReimbursementService — 凭证金额与费用归属（2026-11-04）', () => {
  const repo: any = {
    save: jest.fn(),
    countByDate: jest.fn(),
    findById: jest.fn(),
  };
  const listRepo: any = { findById: jest.fn() };
  const cos: any = { getSignedUrl: jest.fn(), uploadImage: jest.fn() };
  const pricing: any = {
    syncPendingChangesForReimbursement: jest.fn(),
    autoApproveEligibleChangesForReimbursement: jest.fn(),
    applyApprovedChangesForReimbursement: jest.fn(),
    rejectChangesForReimbursement: jest.fn(),
  };
  const importService: any = {
    getAllowedReceiptKeys: jest.fn(),
  };

  const service = new ReimbursementService(
    repo,
    listRepo,
    cos,
    pricing,
    importService,
  );

  const dailyList = {
    id: 'list-1',
    status: 'COMPLETED',
    kind: 'ORDER_DEMAND',
    totalEstimatedCost: 28,
    totalActualCost: 31.46,
    reimbursementId: null,
  };

  const payload = (overrides: Record<string, unknown> = {}) => ({
    purchaseListIds: ['list-1'],
    receiptUrls: ['https://img.example.com/a.jpg'],
    receiptKeys: [],
    totalActualCost: 32.46,
    platformShippingFee: 1,
    platformPackagingFee: 0,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    listRepo.findById.mockResolvedValue(dailyList);
    repo.countByDate.mockResolvedValue(0);
    repo.save.mockImplementation(async (entity: any) => entity);
    pricing.syncPendingChangesForReimbursement.mockResolvedValue([]);
    pricing.autoApproveEligibleChangesForReimbursement.mockResolvedValue([]);
    pricing.applyApprovedChangesForReimbursement.mockResolvedValue([]);
    importService.getAllowedReceiptKeys.mockResolvedValue(
      new Set(['purchase-order-screenshots/a.jpg']),
    );
  });

  it('报销金额超过凭证金额 → 拒绝（差额不能为负）', async () => {
    await expect(
      service.submitReimbursement(
        payload({ voucherAmount: 30 }) as any,
        'user-1',
      ),
    ).rejects.toThrow('不能超过凭证金额');
  });

  it('凭证金额与报销金额的差额被算出来并保存', async () => {
    await service.submitReimbursement(
      payload({ voucherAmount: 44.06, differenceNote: '含个人采购 ¥11.60' }) as any,
      'user-1',
    );

    const saved = repo.save.mock.calls[0][0];
    expect(saved.voucherAmount).toBe(44.06);
    expect(saved.differenceAmount).toBe(11.6);
    expect(saved.differenceNote).toBe('含个人采购 ¥11.60');
  });

  it('只有私有凭证 key 也算有凭证', async () => {
    await service.submitReimbursement(
      payload({
        receiptUrls: [],
        receiptKeys: ['purchase-order-screenshots/a.jpg'],
      }) as any,
      'user-1',
    );

    const saved = repo.save.mock.calls[0][0];
    expect(saved.receiptKeys).toEqual(['purchase-order-screenshots/a.jpg']);
    expect(saved.receiptUrls).toEqual([]);
  });

  it('补货/包材清单不能填运费和包装费', async () => {
    listRepo.findById.mockResolvedValue({
      ...dailyList,
      kind: 'STOCK_REPLENISHMENT',
      totalActualCost: 20,
    });

    await expect(
      service.submitReimbursement(
        payload({ totalActualCost: 25, platformShippingFee: 5 }) as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.submitReimbursement(
        payload({ totalActualCost: 25, platformShippingFee: 5 }) as any,
        'user-1',
      ),
    ).rejects.toThrow('补货/包材清单不能填运费和包装费');
  });

  it('日采 + 补货混单时可以填运费', async () => {
    listRepo.findById.mockImplementation(async (id: string) =>
      id === 'list-1'
        ? dailyList
        : { ...dailyList, id: 'list-2', kind: 'STOCK_REPLENISHMENT', totalActualCost: 20 },
    );

    await service.submitReimbursement(
      payload({
        purchaseListIds: ['list-1', 'list-2'],
        totalActualCost: 53.46,
        platformShippingFee: 2,
      }) as any,
      'user-1',
    );

    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('上传打款凭证不会清掉凭证金额、差额和私有凭证', async () => {
    const entity = new Reimbursement({
      claimNumber: 'BX202611040001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 10,
      totalEstimatedCost: 10,
      receiptUrls: [],
      receiptKeys: ['purchase-order-screenshots/a.jpg'],
      voucherAmount: 20,
      differenceAmount: 10,
      differenceNote: '含个人采购',
      submittedById: 'user-1',
      submittedAt: new Date(),
    });
    repo.findById.mockResolvedValue(entity);
    cos.uploadImage = jest.fn().mockResolvedValue({
      url: 'https://img.example.com/proof.jpg',
      key: 'reimbursement-payment-proofs/proof.jpg',
    });

    await service.uploadPaymentProof('reimb-1', [
      'https://img.example.com/proof.jpg',
    ]);

    const saved = repo.save.mock.calls[0][0];
    expect(saved.voucherAmount).toBe(20);
    expect(saved.differenceAmount).toBe(10);
    expect(saved.differenceNote).toBe('含个人采购');
    expect(saved.receiptKeys).toEqual(['purchase-order-screenshots/a.jpg']);
  });

  it('私有凭证 key 不在本次清单的已确认截图里 → 拒绝', async () => {
    importService.getAllowedReceiptKeys.mockResolvedValue(new Set());

    await expect(
      service.submitReimbursement(
        payload({
          receiptUrls: [],
          receiptKeys: ['purchase-order-screenshots/other.jpg'],
        }) as any,
        'user-1',
      ),
    ).rejects.toThrow('不属于本次采购清单');
  });

  it('差 1 分钱也按负数差额拒绝，而不是 500', async () => {
    await expect(
      service.submitReimbursement(
        payload({ voucherAmount: 32.45 }) as any,
        'user-1',
      ),
    ).rejects.toThrow('不能超过凭证金额');
  });

  it('只能查看自己提交的报销单', async () => {
    repo.findById.mockResolvedValue({ submittedById: 'someone-else' });

    await expect(
      service.getReimbursementDetail('reimb-1', { requesterId: 'user-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('已有 5 张私有凭证时，再追加 6 张会被 10 张上限拦住', async () => {
    repo.findById.mockResolvedValue({
      id: 'reimb-1',
      status: 'PENDING_REVIEW',
      submittedById: 'user-1',
      receiptUrls: [],
      receiptKeys: Array.from(
        { length: 5 },
        (_, i) => `purchase-order-screenshots/${i}.jpg`,
      ),
    });

    await expect(
      service.appendReceiptUrls(
        'reimb-1',
        Array.from({ length: 6 }, (_, i) => ({
          originalname: `${i}.jpg`,
          buffer: Buffer.from('x'),
        })) as any,
        'user-1',
        false,
      ),
    ).rejects.toThrow('最多只能上传10张图片');
    expect(cos.uploadImage).not.toHaveBeenCalled();
  });

  it('删公开凭证不会误删订单截图（即使两个数组长度相同）', async () => {
    const entity = new Reimbursement({
      claimNumber: 'BX202611040002',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 10,
      totalEstimatedCost: 10,
      receiptUrls: ['https://img.example.com/reimbursement-receipts/a.jpg'],
      receiptKeys: ['purchase-order-screenshots/s.jpg'],
      submittedById: 'user-1',
      submittedAt: new Date(),
    });
    repo.findById.mockResolvedValue(entity);
    cos.deleteImageByUrlStrict = jest.fn().mockResolvedValue(undefined);
    cos.deleteImage = jest.fn().mockResolvedValue(undefined);

    await service.removeReceiptUrl('reimb-1', 0, 'user-1', false);

    expect(cos.deleteImageByUrlStrict).toHaveBeenCalledWith(
      'https://img.example.com/reimbursement-receipts/a.jpg',
    );
    expect(cos.deleteImage).not.toHaveBeenCalled();
    const saved = repo.save.mock.calls[0][0];
    expect(saved.receiptKeys).toEqual(['purchase-order-screenshots/s.jpg']);
  });

  it('只删私有凭证时按 key 段处理，订单截图仍然保留', async () => {
    const entity = new Reimbursement({
      claimNumber: 'BX202611040003',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 10,
      totalEstimatedCost: 10,
      receiptUrls: [],
      receiptKeys: [
        'purchase-order-screenshots/s.jpg',
        'reimbursement-receipts/x.jpg',
      ],
      submittedById: 'user-1',
      submittedAt: new Date(),
    });
    repo.findById.mockResolvedValue(entity);
    cos.deleteImage = jest.fn().mockResolvedValue(undefined);

    await service.removeReceiptUrl('reimb-1', 1, 'user-1', false);

    expect(cos.deleteImage).toHaveBeenCalledWith('reimbursement-receipts/x.jpg');
    const saved = repo.save.mock.calls[0][0];
    expect(saved.receiptKeys).toEqual(['purchase-order-screenshots/s.jpg']);
  });

  it('清空付款凭证会把「已报销」退回「待报销」', async () => {
    const entity = new Reimbursement({
      claimNumber: 'BX202611040004',
      status: ReimbursementStatus.REIMBURSED,
      totalActualCost: 10,
      totalEstimatedCost: 10,
      receiptUrls: [],
      receiptKeys: [],
      submittedById: 'user-1',
      submittedAt: new Date(),
      reviewedById: 'admin-1',
      reviewedAt: new Date(),
      paymentProofUrls: ['https://img.example.com/proof.jpg'],
      paymentProofKeys: ['reimbursement-payment-proofs/proof.jpg'],
    });
    repo.findById.mockResolvedValue(entity);
    cos.deleteImage = jest.fn().mockResolvedValue(undefined);

    const saved = await service.clearPaymentProof('reimb-1');

    expect(saved.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(saved.reviewedAt).toBeUndefined();
    expect(saved.reviewedById).toBeUndefined();
    expect(saved.reviewComment).toContain('退回待报销');
    // 已生效的价格变更要一起回滚
    expect(pricing.rejectChangesForReimbursement).toHaveBeenCalledWith(
      'reimb-1',
      undefined,
      expect.stringContaining('回滚'),
    );
  });

  it('对「待报销」单据清空凭证：不改状态、不动原审核备注', async () => {
    const entity = new Reimbursement({
      claimNumber: 'BX202611040005',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 10,
      totalEstimatedCost: 10,
      receiptUrls: [],
      receiptKeys: [],
      submittedById: 'user-1',
      submittedAt: new Date(),
      reviewComment: '原来审核员写的意见',
    });
    repo.findById.mockResolvedValue(entity);
    cos.deleteImage = jest.fn().mockResolvedValue(undefined);

    const saved = await service.clearPaymentProof('reimb-1');

    expect(saved.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(saved.reviewComment).toBe('原来审核员写的意见');
    expect(pricing.rejectChangesForReimbursement).not.toHaveBeenCalled();
  });
});
