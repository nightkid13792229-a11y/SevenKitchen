jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { PrismaReimbursementRepository } from '../../../src/infrastructure/repositories/prisma-reimbursement.repository';
import {
  PurchaseItem,
  PurchaseList,
  PurchaseListStatus,
  Reimbursement,
  ReimbursementStatus,
} from '../../../src/domain/purchasing';

const createPrismaReimbursement = (
  overrides: Record<string, unknown> = {},
) => ({
  id: 'reimbursement-1',
  claimNumber: 'BX202606270001',
  status: 'PENDING_REVIEW',
  totalActualCost: 185,
  totalEstimatedCost: 180,
  receiptUrls: ['https://example.com/receipt.jpg'],
  receiptKeys: [],
  submittedById: 'staff-1',
  submittedAt: new Date('2026-06-27T02:00:00.000Z'),
  reviewedById: null,
  reviewedAt: null,
  reviewComment: null,
  createdAt: new Date('2026-06-27T02:00:00.000Z'),
  updatedAt: new Date('2026-06-27T03:00:00.000Z'),
  platformShippingFee: 0,
  platformPackagingFee: 0,
  customFees: [],
  paymentProofUrls: [],
  paymentProofKeys: [],
  purchaseLists: [],
  submittedBy: { id: 'staff-1', nickname: 'Staff', phone: '13800000000' },
  reviewedBy: null,
  ...overrides,
});

describe('PrismaReimbursementRepository', () => {
  it('replaces purchase-list links in the same transaction as reimbursement save', async () => {
    const purchaseList = new PurchaseList({
      id: 'purchase-list-2',
      targetDate: new Date('2026-06-27T04:00:00.000Z'),
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: 180,
      totalActualCost: 185,
      itemCount: 1,
      createdById: 'staff-1',
      sourceOrderIds: ['order-1'],
      reimbursementId: 'reimbursement-1',
      completedAt: new Date('2026-06-27T06:00:00.000Z'),
      items: [
        new PurchaseItem({
          id: 'item-1',
          purchaseListId: 'purchase-list-2',
          ingredientId: 'ingredient-1',
          ingredientName: '鸡胸肉',
          type: 'FOOD',
          quantityNeeded: 1,
          quantityUnit: 'kg',
          estimatedCost: 180,
        }),
      ],
    });
    const reimbursement = new Reimbursement({
      id: 'reimbursement-1',
      claimNumber: 'BX202606270001',
      status: ReimbursementStatus.PENDING_REVIEW,
      totalActualCost: 185,
      totalEstimatedCost: 180,
      receiptUrls: ['https://example.com/receipt.jpg'],
      submittedById: 'staff-1',
      submittedAt: new Date('2026-06-27T02:00:00.000Z'),
      purchaseLists: [purchaseList],
    });
    const completeRow = createPrismaReimbursement({
      purchaseLists: [
        {
          ...purchaseList.toPrisma(),
          items: purchaseList.items.map((item) => item.toPrisma()),
        },
      ],
    });
    const tx = {
      reimbursement: {
        upsert: jest.fn().mockResolvedValue(createPrismaReimbursement()),
        findUnique: jest.fn().mockResolvedValue(completeRow),
      },
      purchaseList: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    } as any;

    const repository = new PrismaReimbursementRepository(prisma);
    const result =
      await repository.saveWithPurchaseListReplacement(reimbursement);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.reimbursement.upsert).toHaveBeenCalledTimes(1);
    expect(tx.reimbursement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          reviewedById: null,
          reviewedAt: null,
          reviewComment: null,
        }),
      }),
    );
    expect(tx.purchaseList.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        reimbursementId: 'reimbursement-1',
        id: { notIn: ['purchase-list-2'] },
      },
      data: { reimbursementId: null },
    });
    expect(tx.purchaseList.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { in: ['purchase-list-2'] },
        OR: [{ reimbursementId: null }, { reimbursementId: 'reimbursement-1' }],
      },
      data: { reimbursementId: 'reimbursement-1' },
    });
    expect(result.id).toBe('reimbursement-1');
    expect(result.purchaseLists.map((list) => list.id)).toEqual([
      'purchase-list-2',
    ]);
  });
});
