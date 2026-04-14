jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { ORDER_REPOSITORY } from '../../../src/application/order/order.service';
import {
  ORDER_STATUS_HISTORY_REPOSITORY,
} from '../../../src/application/order/order.service';
import { ReimbursementService } from '../../../src/application/purchasing/reimbursement.service';
import {
  PURCHASE_LIST_REPOSITORY,
  REIMBURSEMENT_REPOSITORY,
} from '../../../src/application/purchasing/purchasing.service.tokens';
import {
  Reimbursement,
  ReimbursementStatus,
} from '../../../src/domain/purchasing';
import { TencentCosService } from '../../../src/infrastructure/services/tencent-cos.service';

describe('ReimbursementService', () => {
  let service: ReimbursementService;

  const mockReimbursementRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  } as any;

  const mockPurchaseListRepository = {
    unlockProductionByReimbursementId: jest.fn(),
  } as any;

  const mockOrderRepository = {} as any;
  const mockStatusHistoryRepository = {} as any;
  const mockCosService = {
    uploadImage: jest.fn(),
  } as any;

  const mockIngredientPricingService = {
    getPriceChangesForReimbursement: jest.fn(),
    applyApprovedChangesForReimbursement: jest.fn(),
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
    mockCosService.uploadImage.mockResolvedValue({
      url: 'https://example.com/payment-proof-1.jpg',
      key: 'payment-proof-1',
    });
    mockIngredientPricingService.applyApprovedChangesForReimbursement.mockResolvedValue(
      [],
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

  it('blocks payment proof upload while ingredient price changes are still pending review', async () => {
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

    await expect(
      service.uploadPaymentProof('reimbursement-1', [
        'https://example.com/payment-proof-1.jpg',
      ]),
    ).rejects.toThrow(
      new BadRequestException('存在待人工审核的价格变更，请先审核报销单'),
    );

    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
  });

  it('blocks payment proof file upload while ingredient price changes are still pending review', async () => {
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

    await expect(
      service.uploadPaymentProofFiles('reimbursement-1', [
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
      ]),
    ).rejects.toThrow(
      new BadRequestException('存在待人工审核的价格变更，请先审核报销单'),
    );

    expect(mockCosService.uploadImage).not.toHaveBeenCalled();
    expect(mockReimbursementRepository.save).not.toHaveBeenCalled();
    expect(
      mockIngredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
  });
});
