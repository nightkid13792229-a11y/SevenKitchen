import { ExpenseBillService } from '../../../src/application/finance/expense-bill.service';
import { ExpenseTemplateService } from '../../../src/application/finance/expense-template.service';

describe('ExpenseBillService', () => {
  const prisma = {
    expenseBill: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    expenseBillPayment: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    expenseTemplate: {
      findMany: jest.fn(),
    },
  } as any;

  let service: ExpenseBillService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExpenseBillService(prisma);
  });

  it('creates a company-payable expense bill with recognition window and due date', async () => {
    prisma.expenseBill.create.mockResolvedValue({
      id: 'bill-1',
      billNumber: 'FB20260403001',
      status: 'PENDING_PAYMENT',
      title: '2026年4月房租',
      category: 'RENT',
      amount: 5000,
      recognitionStart: new Date('2026-04-01T00:00:00.000Z'),
      recognitionEnd: new Date('2026-04-30T23:59:59.999Z'),
      dueAt: new Date('2026-04-05T12:00:00.000Z'),
    });

    await expect(
      service.createBill('admin-1', {
        title: '2026年4月房租',
        category: 'RENT',
        amount: 5000,
        payeeName: '房东',
        recognitionStart: '2026-04-01',
        recognitionEnd: '2026-04-30',
        dueAt: '2026-04-05T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      status: 'PENDING_PAYMENT',
      category: 'RENT',
    });
  });

  it('marks a bill PARTIALLY_PAID and then PAID as payments accumulate', async () => {
    prisma.expenseBill.findUnique.mockResolvedValue({
      id: 'bill-1',
      amount: 5000,
      status: 'PENDING_PAYMENT',
      paymentProofUrls: [],
    });
    prisma.expenseBill.findUniqueOrThrow.mockResolvedValue({
      id: 'bill-1',
      amount: 5000,
      status: 'PENDING_PAYMENT',
    });
    prisma.expenseBillPayment.aggregate
      .mockResolvedValueOnce({ _sum: { paidAmount: 2000 } })
      .mockResolvedValueOnce({ _sum: { paidAmount: 5000 } });
    prisma.expenseBillPayment.create.mockResolvedValue({ id: 'payment-1' });
    prisma.expenseBill.update
      .mockResolvedValueOnce({ id: 'bill-1', status: 'PARTIALLY_PAID' })
      .mockResolvedValueOnce({ id: 'bill-1', status: 'PAID' });

    await service.recordPayment('bill-1', 'admin-1', {
      paidAmount: 2000,
      paidAt: '2026-04-05T12:00:00.000Z',
      paymentMethod: 'BANK_TRANSFER',
      paymentProofUrls: ['https://cos.example.com/rent-proof-1.jpg'],
    });

    await expect(
      service.recordPayment('bill-1', 'admin-1', {
        paidAmount: 3000,
        paidAt: '2026-04-08T12:00:00.000Z',
        paymentMethod: 'BANK_TRANSFER',
        paymentProofUrls: ['https://cos.example.com/rent-proof-2.jpg'],
      }),
    ).resolves.toMatchObject({ status: 'PAID' });
  });
});

describe('ExpenseTemplateService recurring drafts', () => {
  const prisma = {
    expenseBill: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    expenseTemplate: {
      findMany: jest.fn(),
    },
  } as any;

  let templateService: ExpenseTemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    templateService = new ExpenseTemplateService(prisma);
  });

  it('creates due monthly and yearly expense drafts exactly once', async () => {
    prisma.expenseTemplate.findMany.mockResolvedValue([
      {
        id: 'tpl-rent',
        name: '房租',
        titleTemplate: '{{year}}年{{month}}月房租',
        category: 'RENT',
        payeeName: '房东',
        defaultAmount: 5000,
        interval: 'MONTHLY',
        dayOfMonth: 1,
        monthOfYear: null,
        servicePeriodMonths: 1,
        isActive: true,
      },
      {
        id: 'tpl-domain',
        name: '域名续费',
        titleTemplate: '{{year}}年域名续费',
        category: 'TECHNICAL_SERVICES',
        payeeName: '阿里云',
        defaultAmount: 180,
        interval: 'YEARLY',
        dayOfMonth: 3,
        monthOfYear: 4,
        servicePeriodMonths: 12,
        isActive: true,
      },
    ]);
    prisma.expenseBill.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.expenseBill.create.mockResolvedValue({ id: 'bill-created' });

    await expect(
      templateService.generateDueBills(
        new Date('2026-04-03T02:00:00.000Z'),
        'system',
      ),
    ).resolves.toHaveLength(2);
  });
});
