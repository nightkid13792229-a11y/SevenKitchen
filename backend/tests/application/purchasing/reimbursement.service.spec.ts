jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { Test, TestingModule } from '@nestjs/testing';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { ORDER_REPOSITORY } from '../../../src/application/order/order.service';
import { ORDER_STATUS_HISTORY_REPOSITORY } from '../../../src/application/order/order.service';
import { ReimbursementService } from '../../../src/application/purchasing/reimbursement.service';
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

  const mockIngredientPricingService = {
    getPriceChangesForReimbursement: jest.fn(),
    syncPendingChangesForReimbursement: jest.fn(),
    autoApproveEligibleChangesForReimbursement: jest.fn(),
    applyApprovedChangesForReimbursement: jest.fn(),
    rejectChangesForReimbursement: jest.fn(),
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
      ],
    }).compile();

    service = module.get(ReimbursementService);
    jest.clearAllMocks();
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

  it('does not unlock production from reimbursement approval', async () => {
    const reimbursement = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202604140001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 180,
      totalEstimatedCost: 180,
      receiptUrls: ['https://example.com/receipt-1.jpg'],
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
    ).toHaveBeenCalledWith('reimbursement-1', 'admin-1', '已报销');
    expect(mockOrderRepository.findById).not.toHaveBeenCalled();
    expect(mockOrderRepository.save).not.toHaveBeenCalled();
    expect(mockStatusHistoryRepository.append).not.toHaveBeenCalled();
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
