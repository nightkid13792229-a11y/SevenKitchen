jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { ORDER_REPOSITORY } from '../../../src/application/order/order.service';
import { ORDER_STATUS_HISTORY_REPOSITORY } from '../../../src/application/order/order.service';
import { ReimbursementService } from '../../../src/application/purchasing/reimbursement.service';
import { PurchaseOrderImportService } from '../../../src/application/purchasing/purchase-order-import.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import {
  PURCHASE_LIST_REPOSITORY,
  REIMBURSEMENT_REPOSITORY,
} from '../../../src/application/purchasing/purchasing.service.tokens';
import {
  PurchaseItem,
  PurchaseList,
  PurchaseListKind,
  PurchaseListStatus,
  Reimbursement,
  ReimbursementStatus,
} from '../../../src/domain/purchasing';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

describe('ReimbursementService', () => {
  let service: ReimbursementService;

  const mockReimbursementRepository = {
    findById: jest.fn(),
    countByDate: jest.fn(),
    save: jest.fn(),
    saveWithPurchaseListReplacement: jest.fn(),
  } as any;

  const mockPurchaseListRepository = {
    findById: jest.fn(),
    clearReimbursementId: jest.fn(),
    unlockProductionByReimbursementId: jest.fn(),
  } as any;

  const mockOrderRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  } as any;
  const mockStatusHistoryRepository = {
    append: jest.fn(),
  } as any;
  const mockCosService = {
    uploadImage: jest.fn(),
  } as any;

  const mockPurchaseOrderImportService = {
    getAllowedReceiptKeys: jest.fn(),
  } as any;

  // 2026-11-07：审核/撤销改成事务 + 事件表，这里给一个能跑通事务的假 prisma
  const mockPrisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(mockPrisma)),
    user: { findUnique: jest.fn().mockResolvedValue({ nickname: '管理员' }) },
    reimbursementReviewEvent: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    purchaseRecord: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    purchaseList: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ingredient: {
      findUnique: jest.fn(),
    },
    ingredientPriceChange: {
      findUnique: jest.fn(),
    },
  };

  const mockIngredientPricingService = {
    getPriceChangesForReimbursement: jest.fn(),
    syncPendingChangesForReimbursement: jest.fn(),
    autoApproveEligibleChangesForReimbursement: jest.fn(),
    applyApprovedChangesForReimbursement: jest.fn(),
    rejectChangesForReimbursement: jest.fn(),
    revertApprovedChangesForReimbursement: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReimbursementService,
        {
          provide: REIMBURSEMENT_REPOSITORY,
          useValue: mockReimbursementRepository,
        },
        {
          provide: PURCHASE_LIST_REPOSITORY,
          useValue: mockPurchaseListRepository,
        },
        {
          provide: ORDER_REPOSITORY,
          useValue: mockOrderRepository,
        },
        {
          provide: ORDER_STATUS_HISTORY_REPOSITORY,
          useValue: mockStatusHistoryRepository,
        },
        {
          provide: TencentCosService,
          useValue: mockCosService,
        },
        {
          provide: IngredientPricingService,
          useValue: mockIngredientPricingService,
        },
        {
          provide: PurchaseOrderImportService,
          useValue: mockPurchaseOrderImportService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get(ReimbursementService);
    jest.clearAllMocks();
    mockPurchaseOrderImportService.getAllowedReceiptKeys.mockResolvedValue(
      new Set(),
    );
    mockReimbursementRepository.save.mockImplementation(
      async (value: unknown) => value,
    );
    mockReimbursementRepository.saveWithPurchaseListReplacement.mockImplementation(
      async (value: unknown) => value,
    );
    mockCosService.uploadImage.mockResolvedValue({
      url: 'https://example.com/payment-proof-1.jpg',
      key: 'payment-proof-1',
    });
    mockIngredientPricingService.applyApprovedChangesForReimbursement.mockResolvedValue(
      [],
    );
    mockIngredientPricingService.syncPendingChangesForReimbursement.mockResolvedValue(
      undefined,
    );
    mockIngredientPricingService.autoApproveEligibleChangesForReimbursement.mockResolvedValue(
      undefined,
    );
    mockIngredientPricingService.rejectChangesForReimbursement.mockResolvedValue(
      undefined,
    );
    mockIngredientPricingService.revertApprovedChangesForReimbursement.mockResolvedValue(
      undefined,
    );
    mockPrisma.reimbursementReviewEvent.create.mockResolvedValue({});
    mockPurchaseListRepository.clearReimbursementId.mockResolvedValue(
      undefined,
    );
  });

  const createPendingReviewReimbursement = () =>
    new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202604140001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 180,
      totalEstimatedCost: 180,
      receiptUrls: ['https://example.com/receipt-1.jpg'],
      submittedById: 'user-1',
      submittedAt: new Date('2026-04-14T00:00:00.000Z'),
      purchaseLists: [],
    });

  it('uses the replenishment reimbursement amount instead of the record sum', async () => {
    const list = new PurchaseList({
      id: 'rec-1',
      targetDate: new Date('2026-11-10T12:00:00'),
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 100,
      itemCount: 0,
      createdById: 'user-1',
      sourceOrderIds: [],
      isDraft: true,
    });
    list.isDraft = false;
    list.totalActualCost = 100;
    list.reimbursementAmount = 113.03;
    mockPurchaseListRepository.findById.mockResolvedValue(list);

    const result = await (service as any).prepareReimbursementSubmission({
      purchaseListIds: ['rec-1'],
      totalActualCost: 113.03,
      platformShippingFee: 0,
      platformPackagingFee: 0,
      receiptUrls: ['https://example.com/receipt-1.jpg'],
      receiptKeys: [],
      customFees: [],
    });

    expect(result.purchaseListsTotal).toBe(113.03);
    expect(result.calculatedTotal).toBe(113.03);
  });

  it('rejects a voided replenishment record', async () => {
    const list = new PurchaseList({
      id: 'rec-1',
      targetDate: new Date('2026-11-10T12:00:00'),
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 100,
      itemCount: 0,
      createdById: 'user-1',
      sourceOrderIds: [],
      isDraft: true,
    });
    list.isDraft = false;
    list.voidedAt = new Date('2026-11-10T13:00:00');
    list.reimbursementAmount = 113.03;
    mockPurchaseListRepository.findById.mockResolvedValue(list);

    await expect(
      (service as any).prepareReimbursementSubmission({
        purchaseListIds: ['rec-1'],
        totalActualCost: 113.03,
        platformShippingFee: 0,
        platformPackagingFee: 0,
        receiptUrls: ['https://example.com/receipt-1.jpg'],
        receiptKeys: [],
        customFees: [],
      }),
    ).rejects.toThrow('已作废');
  });

  it('unlocks purchase lists when a claim is rejected', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    await service.reviewReimbursement('reimbursement-1', 'admin-1', {
      decision: 'REJECT',
      comment: '金额不对',
    });

    expect(mockPrisma.purchaseList.updateMany).toHaveBeenCalledWith({
      where: { reimbursementId: 'reimbursement-1' },
      data: { reimbursementId: null },
    });
  });

  it('accepts pending price changes when payment proof URLs complete reimbursement', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );
    mockIngredientPricingService.getPriceChangesForReimbursement.mockResolvedValue(
      [
        {
          id: 'change-1',
          ingredientId: 'ingredient-1',
          ingredientName: '牛霖',
          reimbursementId: 'reimbursement-1',
          purchaseRecordId: 'record-1',
          purchaseUnit: 'kg',
          sourceQuantity: 1.258,
          sourcePricePerPurchaseUnit: 14.15,
          previousCurrentPricePerPurchaseUnit: 80,
          previousEffectivePrice: 80,
          proposedEffectivePrice: 14.15,
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          deltaRate: -0.8231,
          status: 'PENDING',
          approvalMode: 'MANUAL_REQUIRED',
          reviewReasons: ['价格波动过大，需人工确认'],
          reviewComment: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: '2026-04-14T00:00:00.000Z',
        },
      ],
    );

    const result = await service.uploadPaymentProof(
      'reimbursement-1',
      ['https://example.com/payment-proof-1.jpg'],
      'admin-1',
    );

    expect(result.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(result.paymentProofUrls).toEqual([
      'https://example.com/payment-proof-1.jpg',
    ]);
    expect(mockReimbursementRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ReimbursementStatus.REIMBURSED,
        reviewedById: 'admin-1',
        paymentProofUrls: ['https://example.com/payment-proof-1.jpg'],
      }),
      expect.anything(),
    );
    // 2026-11-07 终验 P1-1：电脑端「上传即完成」也要进事务并写审核事件
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '上传付款凭证后完成报销',
      expect.anything(),
    );
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reimbursementId: 'reimbursement-1',
          action: 'APPROVE',
        }),
      }),
    );
  });

  it('uploads payment proof files and completes reimbursement even when price changes are pending', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );
    mockIngredientPricingService.getPriceChangesForReimbursement.mockResolvedValue(
      [
        {
          id: 'change-1',
          ingredientId: 'ingredient-1',
          ingredientName: '西兰花',
          reimbursementId: 'reimbursement-1',
          purchaseRecordId: 'record-1',
          purchaseUnit: '袋',
          sourceQuantity: 0.69,
          sourcePricePerPurchaseUnit: 5.94,
          previousCurrentPricePerPurchaseUnit: 5.99,
          previousEffectivePrice: 5.99,
          proposedEffectivePrice: 5.94,
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          deltaRate: -0.0083,
          status: 'PENDING',
          approvalMode: 'MANUAL_REQUIRED',
          reviewReasons: ['首次动态采购调价，需人工确认'],
          reviewComment: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: '2026-04-14T00:00:00.000Z',
        },
      ],
    );

    const result = await service.uploadPaymentProofFiles(
      'reimbursement-1',
      [
        {
          fieldname: 'file',
          originalname: 'payment-proof-1.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1,
          stream: undefined as any,
          destination: '',
          filename: 'payment-proof-1.jpg',
          path: '/tmp/payment-proof-1.jpg',
          buffer: Buffer.from('proof'),
        } as Express.Multer.File,
      ],
      'admin-1',
    );

    expect(result.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(result.paymentProofUrls).toEqual([
      'https://example.com/payment-proof-1.jpg',
    ]);
    expect(mockCosService.uploadImage).toHaveBeenCalled();
    expect(mockReimbursementRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ReimbursementStatus.REIMBURSED,
        reviewedById: 'admin-1',
        paymentProofUrls: ['https://example.com/payment-proof-1.jpg'],
        paymentProofKeys: ['payment-proof-1'],
      }),
      expect.anything(),
    );
    // 2026-11-07 终验 P1-1：电脑端「上传即完成」也要进事务并写审核事件
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '上传付款凭证后完成报销',
      expect.anything(),
    );
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reimbursementId: 'reimbursement-1',
          action: 'APPROVE',
        }),
      }),
    );
  });

  it('only attaches the payment proof when autoComplete is false (2026-11-07 split)', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    const result = await service.uploadPaymentProofFiles(
      'reimbursement-1',
      [
        {
          fieldname: 'file',
          originalname: 'payment-proof-1.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1,
          stream: undefined as any,
          destination: '',
          filename: 'payment-proof-1.jpg',
          path: '/tmp/payment-proof-1.jpg',
          buffer: Buffer.from('proof'),
        } as Express.Multer.File,
      ],
      'admin-1',
      { autoComplete: false },
    );

    expect(result.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(result.paymentProofUrls).toEqual([
      'https://example.com/payment-proof-1.jpg',
    ]);
    expect(result.reviewedAt).toBeUndefined();
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
  });

  it('does not unlock production from reimbursement approval', async () => {
    const reimbursement = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202604140001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 180,
      totalEstimatedCost: 180,
      receiptUrls: ['https://example.com/receipt-1.jpg'],
      paymentProofUrls: ['https://example.com/proof-1.jpg'],
      submittedById: 'user-1',
      submittedAt: new Date('2026-04-14T00:00:00.000Z'),
      purchaseLists: [
        new PurchaseList({
          id: 'purchase-list-1',
          targetDate: new Date('2026-04-14T04:00:00.000Z'),
          status: PurchaseListStatus.COMPLETED,
          totalEstimatedCost: 180,
          itemCount: 1,
          createdById: 'staff-1',
          sourceOrderIds: ['order-1'],
          completedAt: new Date('2026-04-14T06:00:00.000Z'),
          items: [
            new PurchaseItem({
              id: 'item-1',
              purchaseListId: 'purchase-list-1',
              ingredientId: 'ingredient-1',
              ingredientName: '牛霖',
              type: 'FOOD',
              quantityNeeded: 1,
              quantityUnit: 'kg',
              estimatedCost: 180,
            }),
          ],
        }),
      ],
    });
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);

    await service.reviewReimbursement('reimbursement-1', 'admin-1', {
      decision: 'APPROVE',
      comment: '已报销',
    });

    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '已报销',
      expect.anything(),
    );

    // 2026-11-07：审核动作要留事件，供「处理进度」还原
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reimbursementId: 'reimbursement-1',
          action: 'APPROVE',
          actorId: 'admin-1',
        }),
      }),
    );
    expect(mockOrderRepository.findById).not.toHaveBeenCalled();
    expect(mockOrderRepository.save).not.toHaveBeenCalled();
    expect(mockStatusHistoryRepository.append).not.toHaveBeenCalled();
  });

  it('别人审、又没有转账凭证时不能通过', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    await expect(
      service.reviewReimbursement('reimbursement-1', 'admin-1', {
        decision: 'APPROVE',
        comment: '通过',
      }),
    ).rejects.toThrow('请先上传报销转账凭证，再审核通过');

    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('自己的单没有转账凭证也能通过（本人审核）', async () => {
    const reimbursement = createPendingReviewReimbursement();
    // submittedById = user-1，改用 user-1 审核
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);

    const saved = await service.reviewReimbursement(
      'reimbursement-1',
      'user-1',
      { decision: 'APPROVE' },
    );

    expect(saved.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(saved.reviewComment).toBe('本人审核通过（无转账凭证）');
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'APPROVE',
          actorId: 'user-1',
          comment: '本人审核通过（无转账凭证）',
        }),
      }),
    );
  });

  it('驳回走 REJECT：状态变已驳回、价格变更作废、写事件', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    const saved = await service.reviewReimbursement(
      'reimbursement-1',
      'admin-1',
      { decision: 'REJECT', comment: '凭证金额与订单不一致' },
    );

    expect(saved.status).toBe(ReimbursementStatus.REJECTED);
    expect(
      mockIngredientPricingService.rejectChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '凭证金额与订单不一致',
      expect.anything(),
    );
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REJECT',
          comment: '凭证金额与订单不一致',
        }),
      }),
    );
  });

  it('驳回必须写明原因，否则不接受', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    await expect(
      service.reviewReimbursement('reimbursement-1', 'admin-1', {
        decision: 'REJECT',
        comment: '   ',
      }),
    ).rejects.toThrow('必须写明原因');

    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('应用价格失败时整体回滚，不会留下「已报销但价格没生效」', async () => {
    const reimbursement = createPendingReviewReimbursement();
    reimbursement.paymentProofUrls.push('https://example.com/proof-1.jpg');
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);
    mockIngredientPricingService.applyApprovedChangesForReimbursement.mockRejectedValue(
      new Error('price apply failed'),
    );

    await expect(
      service.reviewReimbursement('reimbursement-1', 'admin-1', {
        decision: 'APPROVE',
      }),
    ).rejects.toThrow('price apply failed');

    // 价格没应用成功，单据就不能被存成已报销
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
    expect(mockPrisma.reimbursementReviewEvent.create).not.toHaveBeenCalled();
  });

  it('撤销时价格回退失败，整体回滚（单据仍是已报销）', async () => {
    const reimbursement = createPendingReviewReimbursement();
    reimbursement.review('admin-1', 'APPROVE', '同意');
    reimbursement.paymentProofUrls.push('https://example.com/proof-1.jpg');
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);
    mockIngredientPricingService.revertApprovedChangesForReimbursement.mockRejectedValue(
      new Error('revert failed'),
    );

    await expect(
      service.revertReimbursement('reimbursement-1', 'admin-1'),
    ).rejects.toThrow('revert failed');

    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('reverts an approved reimbursement back to pending within 24h', async () => {
    const reimbursement = createPendingReviewReimbursement();
    reimbursement.review('admin-1', 'APPROVE', '同意');
    reimbursement.paymentProofUrls.push('https://example.com/proof-1.jpg');
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);

    const result = await service.revertReimbursement(
      'reimbursement-1',
      'admin-1',
      '金额录错了',
    );

    expect(
      mockIngredientPricingService.revertApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith('reimbursement-1', 'admin-1', expect.anything());
    expect(mockPrisma.reimbursementReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reimbursementId: 'reimbursement-1',
          action: 'REVERT',
          actorId: 'admin-1',
          comment: '金额录错了',
        }),
      }),
    );
    expect(result.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(result.reviewComment).toBe('审核已撤销：金额录错了');
    // 保留上次审核人和时间，页面要显示「上次审核」
    expect(result.reviewedById).toBe('admin-1');
    expect(result.reviewedAt).toBeInstanceOf(Date);
  });

  it('refuses to revert after the 24h window', async () => {
    const reimbursement = createPendingReviewReimbursement();
    reimbursement.review('admin-1', 'APPROVE', '同意');
    reimbursement.reviewedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockReimbursementRepository.findById.mockResolvedValue(reimbursement);

    await expect(
      service.revertReimbursement('reimbursement-1', 'admin-1'),
    ).rejects.toThrow('已超过 24 小时撤销窗口');

    expect(
      mockIngredientPricingService.revertApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('updates editable reimbursement details on resubmit', async () => {
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REQUIRES_RESUBMIT,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
      reviewedById: 'admin-1',
      reviewedAt: new Date('2026-06-26T03:00:00.000Z'),
      reviewComment: '请补充金额明细',
      customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);

    const result = await service.resubmitReimbursement('reimbursement-1', {
      purchaseListIds: [],
      receiptUrls: ['https://example.com/old.jpg'],
      totalActualCost: 260,
      platformShippingFee: 10,
      platformPackagingFee: 0,
      customFees: [
        { category: 'RENT', description: '6月房租', amount: 200 },
        { category: 'UTILITIES', description: '6月水电', amount: 50 },
      ],
    }, 'staff-1');

    expect(result.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(result.reviewedById).toBeUndefined();
    expect(result.reviewedAt).toBeUndefined();
    expect(result.reviewComment).toBeUndefined();
    expect(result.receiptUrls).toEqual(['https://example.com/old.jpg']);
    expect(result.totalActualCost).toBe(260);
    expect(result.platformShippingFee).toBe(10);
    expect(result.platformPackagingFee).toBe(0);
    expect(result.customFees).toEqual([
      { category: 'RENT', description: '6月房租', amount: 200 },
      { category: 'UTILITIES', description: '6月水电', amount: 50 },
    ]);
  });

  it('rejects resubmission when total does not match details', async () => {
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REJECTED,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
      customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);

    await expect(
      service.resubmitReimbursement('reimbursement-1', {
        purchaseListIds: [],
        receiptUrls: ['https://example.com/old.jpg'],
        totalActualCost: 260,
        platformShippingFee: 10,
        platformPackagingFee: 0,
        customFees: [
          { category: 'RENT', description: '6月房租', amount: 200 },
          { category: 'UTILITIES', description: '6月水电', amount: 40 },
        ],
      }, 'staff-1'),
    ).rejects.toThrow('报销总金额与费用明细不匹配');
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('rejects resubmission by someone other than the original submitter', async () => {
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REQUIRES_RESUBMIT,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);

    await expect(
      service.resubmitReimbursement(
        'reimbursement-1',
        {
          purchaseListIds: [],
          receiptUrls: ['https://example.com/old.jpg'],
          totalActualCost: 120,
          customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
        },
        'staff-2',
      ),
    ).rejects.toThrow('只能重新提交本人创建的报销单');
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('rejects duplicate purchase lists when resubmitting', async () => {
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REQUIRES_RESUBMIT,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);

    await expect(
      service.resubmitReimbursement(
        'reimbursement-1',
        {
          purchaseListIds: ['purchase-list-2', 'purchase-list-2'],
          receiptUrls: ['https://example.com/old.jpg'],
          totalActualCost: 120,
          customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
        },
        'staff-1',
      ),
    ).rejects.toThrow('同一采购清单不能重复提交');
    expect(mockPurchaseListRepository.findById).not.toHaveBeenCalled();
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('requires receipt changes to use receipt management instead of resubmission', async () => {
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REQUIRES_RESUBMIT,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      receiptKeys: ['old-receipt-key'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);

    await expect(
      service.resubmitReimbursement(
        'reimbursement-1',
        {
          purchaseListIds: [],
          receiptUrls: ['https://example.com/new.jpg'],
          totalActualCost: 120,
          customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
        },
        'staff-1',
      ),
    ).rejects.toThrow(
      '重新提交时请通过凭证管理单独增删凭证，不能直接替换凭证链接',
    );
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
  });

  it('allows resubmission to replace selected purchase lists owned by the same reimbursement', async () => {
    const selectedPurchaseList = new PurchaseList({
      id: 'purchase-list-2',
      targetDate: new Date('2026-06-26T04:00:00.000Z'),
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 180,
      totalActualCost: 185,
      itemCount: 1,
      createdById: 'staff-1',
      sourceOrderIds: ['order-2'],
      reimbursementId: 'reimbursement-1',
      completedAt: new Date('2026-06-26T06:00:00.000Z'),
      items: [
        new PurchaseItem({
          id: 'item-2',
          purchaseListId: 'purchase-list-2',
          ingredientId: 'ingredient-2',
          ingredientName: '鸡胸肉',
          type: 'FOOD',
          quantityNeeded: 1,
          quantityUnit: 'kg',
          estimatedCost: 180,
        }),
      ],
    });
    const rejected = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606260001',
      status: ReimbursementStatus.REQUIRES_RESUBMIT,
      totalActualCost: 120,
      totalEstimatedCost: 0,
      receiptUrls: ['https://example.com/old.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-26T02:00:00.000Z'),
      customFees: [{ category: 'OTHER', description: '旧费用', amount: 120 }],
    });
    mockReimbursementRepository.findById.mockResolvedValue(rejected);
    mockPurchaseListRepository.findById.mockResolvedValue(selectedPurchaseList);

    const result = await service.resubmitReimbursement('reimbursement-1', {
      purchaseListIds: ['purchase-list-2'],
      receiptUrls: ['https://example.com/old.jpg'],
      totalActualCost: 185,
      platformShippingFee: 0,
      platformPackagingFee: 0,
      customFees: [],
    }, 'staff-1');

    expect(result.purchaseLists).toEqual([selectedPurchaseList]);
    expect(
      mockPurchaseListRepository.clearReimbursementId,
    ).not.toHaveBeenCalled();
    expect(
      mockReimbursementRepository.saveWithPurchaseListReplacement,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'reimbursement-1',
        purchaseLists: [selectedPurchaseList],
      }),
    );
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
    expect(
      mockIngredientPricingService.syncPendingChangesForReimbursement,
    ).toHaveBeenCalledWith('reimbursement-1', ['purchase-list-2']);
  });

  it('shows the current purchase against every historical price, same ingredient and same sku', async () => {
    const currentRecord = {
      id: 'record-current',
      ingredientId: 'ingredient-1',
      procurementSkuId: 'sku-240',
      procurementSkuName: '西葫芦片 约240g',
      productModel: '240g',
      purchaseChannelName: '盒马鲜生',
      actualCost: 2.99,
      actualBaseQuantity: 240,
      actualBaseUnit: 'G',
      purchasedAt: new Date('2026-11-09T16:10:00.000Z'),
      purchaseList: {
        reimbursement: {
          id: 'reimbursement-1',
          submittedById: 'user-1',
          status: 'PENDING_REVIEW',
        },
      },
    };

    const history = (id: string, overrides: Record<string, unknown> = {}) => ({
      id,
      ingredientId: 'ingredient-1',
      procurementSkuId: 'sku-750',
      procurementSkuName: '西葫芦',
      productModel: '750g/份',
      purchaseChannelName: '盒马鲜生',
      actualCost: 4.99,
      actualBaseQuantity: 750,
      actualBaseUnit: 'G',
      purchasedAt: new Date('2026-08-26T00:00:00.000Z'),
      purchaseList: { reimbursement: { status: 'REIMBURSED' } },
      ...overrides,
    });

    mockPrisma.purchaseRecord.findUnique.mockResolvedValue(currentRecord);
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: '西葫芦',
      baseUnit: 'G',
      purchaseUnit: 'g',
      unitDisplayLabel: null,
      purchaseToBaseRatio: 1,
    });
    mockPrisma.ingredientPriceChange.findUnique.mockResolvedValue({
      previousEffectivePrice: 0.006653,
      deltaRate: 0.8725,
    });
    mockPrisma.purchaseRecord.findMany
      .mockResolvedValueOnce([
        history('record-1108', {
          procurementSkuId: 'sku-240',
          procurementSkuName: '西葫芦片 约240g',
          productModel: '240g',
          actualCost: 2.99,
          actualBaseQuantity: 240,
          purchasedAt: new Date('2026-11-08T10:00:00.000Z'),
        }),
      ])
      .mockResolvedValueOnce([
        history('record-0826'),
        history('record-0726', {
          actualCost: 4.81,
          purchasedAt: new Date('2026-07-26T00:00:00.000Z'),
        }),
        history('record-0721', {
          actualCost: 3.98,
          purchasedAt: new Date('2026-07-21T00:00:00.000Z'),
        }),
        history('record-0714', {
          actualCost: 4.81,
          purchasedAt: new Date('2026-07-14T00:00:00.000Z'),
        }),
        history('record-0622', {
          procurementSkuId: 'sku-kg',
          productModel: '散称',
          actualCost: 6.8,
          actualBaseQuantity: 755,
          purchasedAt: new Date('2026-06-22T00:00:00.000Z'),
        }),
        history('record-0604', {
          actualCost: 3.6,
          actualBaseQuantity: 450,
          purchasedAt: new Date('2026-06-04T00:00:00.000Z'),
        }),
      ]);

    const result = await service.getPurchaseRecordPriceComparison(
      'record-current',
      { requesterId: 'user-1', isAdmin: false },
    );

    expect(result.current.priceText).toBe('¥6.23/500g');
    expect(result.current.previousPriceText).toBe('¥3.33/500g');
    expect(result.current.deltaRate).toBe(0.8725);

    expect(
      result.sameIngredientOthers.map((row: any) => row.recordId),
    ).toEqual([
      'record-0826',
      'record-0726',
      'record-0721',
      'record-0714',
      'record-0622',
    ]);
    expect(result.sameIngredientOthers[0].priceText).toBe('¥3.33/500g');
    expect(result.sameIngredientOthers[0].deltaRate).toBe(0.8725);
    expect(result.sameIngredientOthers[0].isBaseline).toBe(true);
    expect(result.sameIngredientOthers[1].deltaRate).toBe(0.9426);
    expect(result.sameIngredientOthers[4].deltaRate).toBe(0.3831);

    expect(result.sameSkuHistory.map((row: any) => row.recordId)).toEqual([
      'record-1108',
    ]);
    expect(result.sameSkuHistory[0].deltaRate).toBe(0);
    expect(result.sameSkuHistory[0].isBaseline).toBe(false);

    const historyCalls = mockPrisma.purchaseRecord.findMany.mock.calls;
    expect(historyCalls).toHaveLength(2);
    expect(historyCalls[0][0].take).toBe(5);
    expect(historyCalls[1][0].take).toBe(5);
    expect(
      historyCalls[0][0].where.purchaseList.reimbursement.is.status.not,
    ).toBe('REJECTED');
    expect(
      historyCalls[1][0].where.purchaseList.reimbursement.is.status.not,
    ).toBe('REJECTED');
  });

  it('falls back to actualQuantity × ratio when actualBaseQuantity is missing', async () => {
    mockPrisma.purchaseRecord.findUnique.mockResolvedValue({
      id: 'record-current',
      ingredientId: 'ingredient-1',
      procurementSkuId: 'sku-240',
      procurementSkuName: '西葫芦片 约240g',
      productModel: '240g',
      purchaseChannel: '盒马鲜生',
      purchaseChannelName: null,
      actualCost: 2.99,
      actualQuantity: 120,
      actualBaseQuantity: null,
      purchasedAt: new Date('2026-11-09T16:10:00.000Z'),
      purchaseList: {
        reimbursement: {
          id: 'reimbursement-1',
          submittedById: 'user-1',
          status: 'PENDING_REVIEW',
        },
      },
    });
    mockPrisma.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      name: '西葫芦',
      baseUnit: 'G',
      purchaseUnit: 'g',
      unitDisplayLabel: null,
      purchaseToBaseRatio: 2,
      type: 'SUPPLEMENT',
    });
    mockPrisma.ingredientPriceChange.findUnique.mockResolvedValue(null);
    mockPrisma.purchaseRecord.findMany.mockResolvedValue([]);

    const result = await service.getPurchaseRecordPriceComparison(
      'record-current',
      { requesterId: 'user-1', isAdmin: false },
    );

    expect(result.current.priceText).toBe('¥6.23/500g');
    expect(result.current.deltaRate).toBeNull();
    expect(result.current.previousPriceText).toBeNull();
    expect(result.current.purchaseChannelName).toBe('盒马鲜生');
    expect(result.sameIngredientOthers).toEqual([]);
    expect(result.sameSkuHistory).toEqual([]);
  });

  it('rejects a requester who cannot view the owning reimbursement', async () => {
    mockPrisma.purchaseRecord.findUnique.mockResolvedValue({
      id: 'record-current',
      ingredientId: 'ingredient-1',
      purchaseList: {
        reimbursement: {
          id: 'reimbursement-1',
          submittedById: 'user-1',
          status: 'PENDING_REVIEW',
        },
      },
    });

    await expect(
      service.getPurchaseRecordPriceComparison('record-current', {
        requesterId: 'user-2',
        isAdmin: false,
      }),
    ).rejects.toThrow('只能查看自己提交的报销单');
  });
});
