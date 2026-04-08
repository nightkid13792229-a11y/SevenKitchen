import { Test } from '@nestjs/testing';
import { ExpenseBillService } from '../../../src/application/finance/expense-bill.service';
import { ExpenseTemplateService } from '../../../src/application/finance/expense-template.service';
import { FinanceAlertService } from '../../../src/application/finance/finance-alert.service';
import { FinanceReportService } from '../../../src/application/finance/finance-report.service';
import { AuthGuard } from '../../../src/interfaces/auth';
import { AdminFinanceController } from '../../../src/interfaces/controllers/admin-finance.controller';

describe('AdminFinanceController', () => {
  it('exposes overview, expense bill, analysis, and contribution endpoints', async () => {
    const module = await Test.createTestingModule({
      controllers: [AdminFinanceController],
      providers: [
        {
          provide: ExpenseBillService,
          useValue: {
            createBill: jest.fn(),
            recordPayment: jest.fn(),
            listBills: jest.fn(),
          },
        },
        {
          provide: ExpenseTemplateService,
          useValue: { createTemplate: jest.fn(), listTemplates: jest.fn() },
        },
        {
          provide: FinanceReportService,
          useValue: {
            getOverview: jest.fn(),
            getExpenseAnalysis: jest.fn(),
            getContributionAnalysis: jest.fn(),
          },
        },
        {
          provide: FinanceAlertService,
          useValue: { getAlerts: jest.fn() },
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    const controller = module.get(AdminFinanceController);
    expect(controller).toBeDefined();
    expect(typeof controller.getOverview).toBe('function');
    expect(typeof controller.createExpenseBill).toBe('function');
    expect(typeof controller.recordExpensePayment).toBe('function');
    expect(typeof controller.getExpenseAnalysis).toBe('function');
    expect(typeof controller.getContributionAnalysis).toBe('function');
  });
});
