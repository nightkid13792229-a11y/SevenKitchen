import { FinanceReportService } from '../../../src/application/finance/finance-report.service';

describe('FinanceReportService', () => {
  const prisma = {
    order: { findMany: jest.fn() },
    reimbursement: { findMany: jest.fn() },
    expenseBill: { findMany: jest.fn() },
    expenseBillPayment: { findMany: jest.fn() },
  } as any;

  let service: FinanceReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceReportService(prisma);
  });

  it('computes overview from paid orders, shipped orders, paid reimbursements, and expense bills', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([
        {
          id: 'o-1',
          amountTotal: 399,
          paidAt: new Date('2026-04-03T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'o-1',
          amountTotal: 399,
          shippedAt: new Date('2026-04-03T16:00:00.000Z'),
        },
      ]);
    prisma.reimbursement.findMany.mockResolvedValue([
      {
        id: 'r-1',
        totalActualCost: 220,
        paidAt: new Date('2026-04-03T11:00:00.000Z'),
        status: 'REIMBURSED',
      },
    ]);
    prisma.expenseBill.findMany.mockResolvedValue([
      {
        id: 'bill-1',
        category: 'RENT',
        amount: 3000,
        recognitionStart: new Date('2026-04-01'),
        recognitionEnd: new Date('2026-04-30'),
        dueAt: new Date('2026-04-05'),
        status: 'PENDING_PAYMENT',
      },
    ]);
    prisma.expenseBillPayment.findMany.mockResolvedValue([
      {
        billId: 'bill-1',
        paidAmount: 1000,
        paidAt: new Date('2026-04-03T12:00:00.000Z'),
      },
    ]);

    await expect(
      service.getOverview({ preset: 'TODAY', timezone: 'Asia/Shanghai' }),
    ).resolves.toMatchObject({
      cashIn: 399,
      operatingRevenue: 399,
      cashOut: 1220,
      pendingPayables: expect.any(Number),
    });
  });
});
