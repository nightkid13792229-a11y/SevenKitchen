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
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-07T12:00:00.000Z'));
    service = new FinanceReportService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
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
      cashOut: 220,
      pendingPayables: expect.any(Number),
    });
  });

  it('excludes previously paid bills from pending payables without counting them in today cash out', async () => {
    prisma.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.reimbursement.findMany.mockResolvedValue([]);
    prisma.expenseBill.findMany.mockResolvedValue([
      {
        id: 'bill-paid-earlier',
        category: 'RENT',
        amount: 3000,
        recognitionStart: new Date('2026-04-01'),
        recognitionEnd: new Date('2026-04-30'),
        dueAt: new Date('2026-04-05'),
        status: 'PAID',
      },
    ]);
    prisma.expenseBillPayment.findMany.mockResolvedValue([
      {
        billId: 'bill-paid-earlier',
        paidAmount: 3000,
        paidAt: new Date('2026-04-05T10:00:00.000Z'),
      },
    ]);

    await expect(
      service.getOverview({ preset: 'TODAY', timezone: 'Asia/Shanghai' }),
    ).resolves.toMatchObject({
      cashOut: 0,
      pendingPayables: 0,
      actualExpense: 100,
    });
  });
});
