import { FinanceExpenseService } from 'src/application/finance/finance-expense.service';
import { monthRange } from 'src/application/finance/finance-period';

const period = monthRange('2026-11');

const makePrisma = (data: any = {}) => ({
  purchaseList: {
    findMany: jest.fn().mockResolvedValue(data.purchaseLists ?? []),
  },
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  expenseBill: { findMany: jest.fn().mockResolvedValue(data.bills ?? []) },
  financeManualEntry: {
    findMany: jest.fn().mockResolvedValue(data.manualEntries ?? []),
  },
});

describe('FinanceExpenseService', () => {
  it('采购按类型分到食材/补剂/包材，并剔除个人消费', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          paidAmount: 1000,
          personalAmount: 100,
          subtotalAmount: 900,
          shippingFee: 100,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 900 }],
        },
        {
          id: 'p2',
          paidAmount: 200,
          personalAmount: 0,
          subtotalAmount: 200,
          shippingFee: 0,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ type: 'PACKAGING', estimatedCost: 200 }],
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(
      r.byCategory.find((c) => c.category === 'RAW_MATERIAL')!.amount,
    ).toBe(900);
    expect(
      r.byCategory.find((c) => c.category === 'PACKAGING_SUPPLIES')!.amount,
    ).toBe(200);
    expect(r.total).toBe(1100);
  });

  it('paidAmount 为空时用四项兜底，四舍五入到分', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: 99.99,
          shippingFee: 0.01,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 99.99 }],
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(r.total).toBe(100);
  });

  it('快递费按实际运费计入物流', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          actualShippingFee: 86,
          shippedAt: new Date('2026-11-05T02:00:00Z'),
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(
      r.byCategory.find((c) => c.category === 'LOGISTICS_DELIVERY')!.amount,
    ).toBe(86);
  });

  it('跨月账单按服务期平均分摊，本月只摊应得部分', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          amount: 1200,
          category: 'NETWORK_COMMUNICATION',
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-10-31T00:00:00Z'),
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(
      r.byCategory.find((c) => c.category === 'NETWORK_COMMUNICATION')!.amount,
    ).toBe(100);
  });

  it('手续费作为一类支出合并，可为负', async () => {
    const prisma: any = makePrisma({});

    const r = await new FinanceExpenseService(prisma).getExpense(period, -3);

    expect(r.byCategory.find((c) => c.category === 'PAYMENT_FEE')!.amount).toBe(
      -3,
    );
  });

  it('结果按金额倒序，合计等于分类相加', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          actualShippingFee: 10,
          shippedAt: new Date('2026-11-05T02:00:00Z'),
        },
      ],
      manualEntries: [
        {
          id: 'm1',
          amount: 99,
          occurredAt: new Date('2026-11-06T02:00:00Z'),
          category: 'EQUIPMENT',
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(r.byCategory.map((c) => c.category)).toEqual([
      'EQUIPMENT',
      'LOGISTICS_DELIVERY',
    ]);
    expect(r.total).toBe(
      Number(r.byCategory.reduce((s, c) => s + c.amount, 0).toFixed(2)),
    );
  });

  it('采购运费归物流、包装费归包材，优惠按行占比摊减', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: 60,
          shippingFee: 20,
          packagingFee: 20,
          discountAmount: 10,
          items: [{ type: 'FOOD', estimatedCost: 60 }],
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(
      r.byCategory.find((c) => c.category === 'RAW_MATERIAL')!.amount,
    ).toBe(54);
    expect(
      r.byCategory.find((c) => c.category === 'LOGISTICS_DELIVERY')!.amount,
    ).toBe(18);
    expect(
      r.byCategory.find((c) => c.category === 'PACKAGING_SUPPLIES')!.amount,
    ).toBe(18);
    expect(r.total).toBe(90);
  });

  it('跨月账单只计入与本期间重叠的月份', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          amount: 300,
          category: 'RENT',
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-01-31T00:00:00Z'),
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(
      monthRange('2026-12'),
      0,
    );

    expect(r.byCategory.find((c) => c.category === 'RENT')!.amount).toBe(100);
    expect(r.total).toBe(100);
  });

  it('快递费为空的订单不产生支出', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          actualShippingFee: null,
          shippedAt: new Date('2026-11-05T02:00:00Z'),
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, 0);

    expect(r.byCategory).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('同类支出合并为一行，负手续费计入合计', async () => {
    const prisma: any = makePrisma({
      manualEntries: [
        {
          id: 'm1',
          amount: 50,
          occurredAt: new Date('2026-11-06T02:00:00Z'),
          category: 'EQUIPMENT',
        },
        {
          id: 'm2',
          amount: 25.5,
          occurredAt: new Date('2026-11-07T02:00:00Z'),
          category: 'EQUIPMENT',
        },
      ],
    });

    const r = await new FinanceExpenseService(prisma).getExpense(period, -3);

    expect(r.byCategory.map((c) => [c.category, c.amount])).toEqual([
      ['EQUIPMENT', 75.5],
      ['PAYMENT_FEE', -3],
    ]);
    expect(r.total).toBe(72.5);
  });
});
