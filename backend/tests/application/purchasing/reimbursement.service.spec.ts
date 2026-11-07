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
    );
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '系统在上传报销凭证后自动标记已报销并应用价格变更',
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
    );
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).toHaveBeenCalledWith(
      'reimbursement-1',
      'admin-1',
      '系统在上传报销凭证后自动标记已报销并应用价格变更',
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

  it('refuses to approve without a payment proof (2026-11-07 split)', async () => {
    mockReimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );

    await expect(
      service.reviewReimbursement('reimbursement-1', 'admin-1', {
        decision: 'APPROVE',
        comment: '通过',
      }),
    ).rejects.toThrow('请先上传付款凭证，再审核通过');

    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
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
});
