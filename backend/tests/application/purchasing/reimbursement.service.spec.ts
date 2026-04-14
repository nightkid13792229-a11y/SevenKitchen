jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { BadRequestException } from '@nestjs/common';
import { ReimbursementService } from 'src/application/purchasing/reimbursement.service';
import { Reimbursement, ReimbursementStatus } from 'src/domain/purchasing';

describe('ReimbursementService payment proof safeguards', () => {
  function createPendingReviewReimbursement() {
    return new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202604140001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 128,
      totalEstimatedCost: 120,
      receiptUrls: ['https://example.com/receipt.jpg'],
      submittedById: 'user-1',
      submittedAt: new Date('2026-04-14T00:00:00.000Z'),
      createdAt: new Date('2026-04-14T00:00:00.000Z'),
      updatedAt: new Date('2026-04-14T00:00:00.000Z'),
      purchaseLists: [],
    });
  }

  function createService() {
    const reimbursementRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      countByDate: jest.fn(),
    } as any;
    const purchaseListRepository = {} as any;
    const orderRepository = {} as any;
    const statusHistoryRepository = {} as any;
    const cosService = {
      uploadImage: jest.fn(),
    } as any;
    const ingredientPricingService = {
      getPriceChangesForReimbursement: jest.fn().mockResolvedValue([]),
      applyApprovedChangesForReimbursement: jest.fn(),
    } as any;

    const service = new ReimbursementService(
      reimbursementRepository,
      purchaseListRepository,
      orderRepository,
      statusHistoryRepository,
      cosService,
      ingredientPricingService,
    );

    return {
      service,
      reimbursementRepository,
      cosService,
      ingredientPricingService,
    };
  }

  it('rejects plain payment proof uploads when manual price review is still required', async () => {
    const {
      service,
      reimbursementRepository,
      ingredientPricingService,
    } = createService();
    reimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );
    ingredientPricingService.getPriceChangesForReimbursement.mockResolvedValue([
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
    ]);

    await expect(
      service.uploadPaymentProof('reimbursement-1', [
        'https://example.com/payment-proof.jpg',
      ]),
    ).rejects.toThrow(
      new BadRequestException('存在待人工审核的价格变更，请先审核报销单'),
    );

    expect(reimbursementRepository.save).not.toHaveBeenCalled();
    expect(
      ingredientPricingService.applyApprovedChangesForReimbursement,
    ).not.toHaveBeenCalled();
  });

  it('rejects file uploads when manual price review is still required', async () => {
    const {
      service,
      reimbursementRepository,
      cosService,
      ingredientPricingService,
    } = createService();
    reimbursementRepository.findById.mockResolvedValue(
      createPendingReviewReimbursement(),
    );
    ingredientPricingService.getPriceChangesForReimbursement.mockResolvedValue([
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
    ]);

    await expect(
      service.uploadPaymentProofFiles('reimbursement-1', [
        {
          fieldname: 'file',
          originalname: 'proof.jpg',
          encoding: '7bit',
          mimetype: 'image/jpeg',
          size: 1,
          stream: undefined as any,
          destination: '',
          filename: 'proof.jpg',
          path: '/tmp/proof.jpg',
          buffer: Buffer.from('proof'),
        },
      ]),
    ).rejects.toThrow(
      new BadRequestException('存在待人工审核的价格变更，请先审核报销单'),
    );

    expect(cosService.uploadImage).not.toHaveBeenCalled();
    expect(reimbursementRepository.save).not.toHaveBeenCalled();
  });
});
