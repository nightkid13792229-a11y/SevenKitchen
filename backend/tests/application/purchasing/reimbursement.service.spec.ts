import { BadRequestException } from '@nestjs/common';
import { ReimbursementService } from '../../../src/application/purchasing/reimbursement.service';
import { Reimbursement, ReimbursementStatus } from '../../../src/domain/purchasing';
import { OrderStatus } from '../../../src/domain';

jest.mock('uuid', () => ({
  v4: () => 'uuid-fixed',
}));

describe('ReimbursementService payment semantics', () => {
  const reimbursementRepository = {
    findById: jest.fn(),
    save: jest.fn(),
    countByDate: jest.fn(),
  } as any;

  const purchaseListRepository = {
    findById: jest.fn(),
    clearReimbursementId: jest.fn(),
  } as any;

  const orderRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  } as any;

  const statusHistoryRepository = {
    append: jest.fn(),
  } as any;

  const cosService = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://cos.example.com/payment-proof-1.jpg',
      key: 'payment-proof-1.jpg',
    }),
  } as any;

  let service: ReimbursementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReimbursementService(
      reimbursementRepository,
      purchaseListRepository,
      orderRepository,
      statusHistoryRepository,
      cosService,
    );
  });

  it('rejects APPROVE review because payment proof is the only path to REIMBURSED', async () => {
    reimbursementRepository.findById.mockResolvedValue(
      new Reimbursement({
        id: 'reim-1',
        claimNumber: 'BX202604030001',
        status: ReimbursementStatus.PENDING_REVIEW,
        totalActualCost: 320,
        totalEstimatedCost: 300,
        receiptUrls: ['https://cos.example.com/receipt-1.jpg'],
        submittedById: 'staff-1',
        submittedAt: new Date('2026-04-03T08:00:00.000Z'),
      }),
    );

    await expect(
      service.reviewReimbursement('reim-1', 'admin-1', {
        decision: 'APPROVE',
        comment: 'looks good',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks reimbursement reimbursed only after payment proof upload and unlocks production', async () => {
    reimbursementRepository.findById.mockResolvedValue(
      new Reimbursement({
        id: 'reim-1',
        claimNumber: 'BX202604030001',
        status: ReimbursementStatus.PENDING_REVIEW,
        totalActualCost: 320,
        totalEstimatedCost: 300,
        receiptUrls: ['https://cos.example.com/receipt-1.jpg'],
        submittedById: 'staff-1',
        submittedAt: new Date('2026-04-03T08:00:00.000Z'),
        purchaseLists: [
          {
            id: 'pl-1',
            sourceOrderIds: ['order-1'],
            status: 'COMPLETED',
          },
        ] as any,
      }),
    );
    reimbursementRepository.save.mockImplementation(async (entity: Reimbursement) => entity);
    orderRepository.findById.mockResolvedValue({
      id: 'order-1',
      status: OrderStatus.PAID,
      transitionTo(nextStatus: OrderStatus) {
        this.status = nextStatus;
      },
    });

    const result = await service.uploadPaymentProofFiles(
      'reim-1',
      'admin-1',
      [
        {
          originalname: 'proof.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('proof'),
        },
      ] as Express.Multer.File[],
    );

    expect(result.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(result.paidById).toBe('admin-1');
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(orderRepository.save).toHaveBeenCalledTimes(1);
    expect(statusHistoryRepository.append).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.PAID,
      OrderStatus.PURCHASING,
      'system',
      null,
      expect.objectContaining({
        reimbursementId: 'reim-1',
        claimNumber: 'BX202604030001',
        triggeredBy: 'reimbursement_paid',
      }),
    );
  });
});
