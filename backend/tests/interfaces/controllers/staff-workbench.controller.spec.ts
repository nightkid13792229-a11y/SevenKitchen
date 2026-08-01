jest.mock('@prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  AftersaleType: { REFUND: 'REFUND' },
  InventoryStocktakeStatus: { DRAFT: 'DRAFT' },
  OrderStatus: { FREEZING: 'FREEZING', AFTERSALE: 'AFTERSALE' },
  PackagingUnitStatus: { PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS' },
  PurchaseListStatus: { PENDING: 'PENDING' },
  ReimbursementStatus: {
    PENDING_REVIEW: 'PENDING_REVIEW',
    REQUIRES_RESUBMIT: 'REQUIRES_RESUBMIT',
  },
}));

import { StaffWorkbenchController } from '../../../src/interfaces/controllers/staff-workbench.controller';

describe('StaffWorkbenchController summary', () => {
  const createController = () => {
    const prisma = {
      order: {
        count: jest
          .fn()
          .mockResolvedValueOnce(12)
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(2),
      },
      purchaseList: { count: jest.fn().mockResolvedValue(3) },
      packagingUnit: { count: jest.fn().mockResolvedValue(5) },
      reimbursement: { count: jest.fn().mockResolvedValue(1) },
      inventoryStocktake: { count: jest.fn().mockResolvedValue(6) },
    };

    return new StaffWorkbenchController(prisma as any);
  };

  it('folds pending refunds into the administrator order badge exactly once', async () => {
    const response = await createController().getSummary('admin-1', 'ADMIN');

    expect(response.data.badges).toEqual({
      purchasing: 3,
      production: 5,
      orders: 7,
      reimbursement: 1,
      inventory: 6,
    });
    expect(response.data.pendingTasks).toBe(22);
  });

  it('does not expose refund work to staff', async () => {
    const response = await createController().getSummary('staff-1', 'STAFF');

    expect(response.data.badges.orders).toBe(5);
    expect(response.data.pendingTasks).toBe(20);
    expect(response.data.badges).not.toHaveProperty('refunds');
  });
});
