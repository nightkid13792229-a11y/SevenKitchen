import { FinanceCategoryService } from 'src/application/finance/finance-category.service';
import { FinanceExpenseService } from 'src/application/finance/finance-expense.service';
import { monthRange } from 'src/application/finance/finance-period';
import {
  catId,
  categoryRows,
  financeCategoryMock,
} from './finance-category.fixture';

const period = monthRange('2026-11');

/** 支出汇总按类别字典 id 分组，断言用 fixture 的稳定 id */
const makeService = (prisma: any) =>
  new FinanceExpenseService(prisma, new FinanceCategoryService(prisma));

const findCategory = (r: any, code: string) =>
  r.byCategory.find((c: any) => c.categoryId === catId(code));

const makePrisma = (data: any = {}) => ({
  financeCategory: financeCategoryMock(data.categories),
  purchaseList: {
    findMany: jest.fn().mockResolvedValue(data.purchaseLists ?? []),
  },
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  expenseBill: { findMany: jest.fn().mockResolvedValue(data.bills ?? []) },
  financeManualEntry: {
    findMany: jest.fn().mockResolvedValue(data.manualEntries ?? []),
  },
  reimbursement: {
    findMany: jest.fn().mockResolvedValue(data.reimbursements ?? []),
  },
});

/** 报销单：只覆盖支出取数关心的字段 */
const reimbursementRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'rb1',
  claimNumber: 'BX202611001',
  status: 'PENDING_REVIEW',
  submittedAt: new Date('2026-11-05T02:00:00Z'),
  customFees: [],
  ...overrides,
});

describe('FinanceExpenseService', () => {
  it('采购按类型分到食材/补剂/包材，并剔除个人消费', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          // 实际形状：小计 900（商品 800 + 个人 100）+ 运费 100 = 实付 1000
          paidAmount: 1000,
          personalAmount: 100,
          subtotalAmount: 900,
          shippingFee: 100,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 800 }],
        },
        {
          id: 'p2',
          kind: 'STOCK_REPLENISHMENT',
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

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(800);
    expect(findCategory(r, 'LOGISTICS_DELIVERY')!.amount).toBe(100);
    expect(findCategory(r, 'PACKAGING_SUPPLIES')!.amount).toBe(200);
    expect(r.total).toBe(1100);
  });

  it('paidAmount 为空时用四项兜底，四舍五入到分', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
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

    const r = await makeService(prisma).getExpense(period, 0);

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

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'LOGISTICS_DELIVERY')!.amount).toBe(86);
  });

  it('跨月账单按服务期平均分摊，本月只摊应得部分', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          amount: 1200,
          categoryId: catId('NETWORK_COMMUNICATION'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-10-31T00:00:00Z'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'NETWORK_COMMUNICATION')!.amount).toBe(100);
  });

  it('手续费作为一类支出合并，可为负', async () => {
    const prisma: any = makePrisma({});

    const r = await makeService(prisma).getExpense(period, -3);

    expect(findCategory(r, 'PAYMENT_FEE')!.amount).toBe(-3);
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
          categoryId: catId('EQUIPMENT'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(r.byCategory.map((c) => c.categoryId)).toEqual([
      catId('EQUIPMENT'),
      catId('LOGISTICS_DELIVERY'),
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
          kind: 'STOCK_REPLENISHMENT',
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

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(54);
    expect(findCategory(r, 'LOGISTICS_DELIVERY')!.amount).toBe(18);
    expect(findCategory(r, 'PACKAGING_SUPPLIES')!.amount).toBe(18);
    expect(r.total).toBe(90);
  });

  it('日采单按采购记录实付计入，3 条记录合计 500', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'd1',
          kind: 'ORDER_DEMAND',
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          items: [
            { id: 'i1', type: 'FOOD', estimatedCost: 200 },
            { id: 'i2', type: 'FOOD', estimatedCost: 200 },
            { id: 'i3', type: 'FOOD', estimatedCost: 100 },
          ],
          records: [
            {
              purchaseItemId: 'i1',
              actualCost: 200,
              purchasedAt: new Date('2026-11-01T02:00:00Z'),
            },
            {
              purchaseItemId: 'i2',
              actualCost: 200,
              purchasedAt: new Date('2026-11-05T02:00:00Z'),
            },
            {
              purchaseItemId: 'i3',
              actualCost: 100,
              purchasedAt: new Date('2026-11-10T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(500);
    expect(r.total).toBe(500);
  });

  it('日采单个人消费从商品合计扣减，并按商品类型拆分', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'd1',
          kind: 'ORDER_DEMAND',
          paidAmount: null,
          personalAmount: 100,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          items: [
            { id: 'i1', type: 'FOOD', estimatedCost: 300 },
            { id: 'i2', type: 'SUPPLEMENT', estimatedCost: 200 },
          ],
          records: [
            {
              purchaseItemId: 'i1',
              actualCost: 300,
              purchasedAt: new Date('2026-11-05T02:00:00Z'),
            },
            {
              purchaseItemId: 'i2',
              actualCost: 200,
              purchasedAt: new Date('2026-11-06T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(240);
    expect(findCategory(r, 'SUPPLEMENT')!.amount).toBe(160);
    expect(r.total).toBe(400);
  });

  it('同一张采购单只按 kind 走一条取数路径，不重复计入', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'd1',
          kind: 'ORDER_DEMAND',
          paidAmount: 1000,
          personalAmount: 0,
          subtotalAmount: 1000,
          shippingFee: 0,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ id: 'i1', type: 'FOOD', estimatedCost: 500 }],
          records: [
            {
              purchaseItemId: 'i1',
              actualCost: 500,
              purchasedAt: new Date('2026-11-05T02:00:00Z'),
            },
          ],
        },
        {
          id: 's1',
          kind: 'STOCK_REPLENISHMENT',
          paidAmount: 300,
          personalAmount: 0,
          subtotalAmount: 300,
          shippingFee: 0,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ id: 'i2', type: 'FOOD', estimatedCost: 300 }],
          records: [
            {
              purchaseItemId: 'i2',
              actualCost: 999,
              purchasedAt: new Date('2026-11-06T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(800);
    expect(r.total).toBe(800);
  });

  it('补货单仍按实付口径计入', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          paidAmount: 120,
          personalAmount: 20,
          subtotalAmount: 120,
          shippingFee: 0,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ id: 'i1', type: 'FOOD', estimatedCost: 120 }],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(100);
    expect(r.total).toBe(100);
  });

  it('补货单缺实付金额时退回采购记录成本', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 's1',
          kind: 'STOCK_REPLENISHMENT',
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          items: [
            { id: 'i1', type: 'FOOD', estimatedCost: 0 },
            { id: 'i2', type: 'FOOD', estimatedCost: 0 },
          ],
          records: [
            {
              purchaseItemId: 'i1',
              actualCost: 150,
              purchasedAt: new Date('2026-11-03T02:00:00Z'),
            },
            {
              purchaseItemId: 'i2',
              actualCost: 250,
              purchasedAt: new Date('2026-11-08T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RAW_MATERIAL')!.amount).toBe(400);
    expect(r.total).toBe(400);
  });

  it('跨月账单只计入与本期间重叠的月份', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          amount: 300,
          categoryId: catId('RENT'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-01-31T00:00:00Z'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(monthRange('2026-12'), 0);

    expect(findCategory(r, 'RENT')!.amount).toBe(100);
    expect(r.total).toBe(100);
  });

  it('fixedCostTotal = 本期固定费用账单分摊之和，类别改名不影响', async () => {
    const make = (rentName: string) =>
      makePrisma({
        categories: categoryRows({ RENT: { name: rentName } }),
        bills: [
          {
            id: 'b1',
            amount: 1200,
            categoryId: catId('RENT'),
            recognitionStart: new Date('2026-11-01T00:00:00Z'),
            recognitionEnd: new Date('2027-01-31T00:00:00Z'),
          },
        ],
        // 手工条目也挂在同一类别上：固定费用合计只认账单，不按类别兜
        manualEntries: [
          {
            id: 'm1',
            amount: 50,
            categoryId: catId('RENT'),
            occurredAt: new Date('2026-11-03T00:00:00Z'),
            title: '房租押金补差',
            payerAccount: 'PERSONAL_WECHAT',
          },
        ],
      });

    const before = await makeService(make('房租')).getExpense(period, 0);
    const after = await makeService(make('店铺租金')).getExpense(period, 0);

    // 账单 1200 分 3 个月 = 每月 400；老板改名前后都必须是 400
    expect(before).toMatchObject({ total: 450, fixedCostTotal: 400 });
    expect(after).toMatchObject({ total: 450, fixedCostTotal: 400 });
    // 改名只影响展示名字，金额与固定费用合计不变
    expect(findCategory(after, 'RENT')).toMatchObject({
      label: '店铺租金',
      amount: 450,
    });
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

    const r = await makeService(prisma).getExpense(period, 0);

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
          categoryId: catId('EQUIPMENT'),
        },
        {
          id: 'm2',
          amount: 25.5,
          occurredAt: new Date('2026-11-07T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, -3);

    expect(r.byCategory.map((c) => [c.categoryId, c.amount])).toEqual([
      [catId('EQUIPMENT'), 75.5],
      [catId('PAYMENT_FEE'), -3],
    ]);
    expect(r.total).toBe(72.5);
  });

  it('金额相同时按 label 兜底排序，避免顺序不稳定', async () => {
    const prisma: any = makePrisma({
      manualEntries: [
        {
          id: 'm1',
          amount: 100,
          occurredAt: new Date('2026-11-06T02:00:00Z'),
          categoryId: catId('ADMINISTRATIVE'),
        },
        {
          id: 'm2',
          amount: 100,
          occurredAt: new Date('2026-11-07T02:00:00Z'),
          categoryId: catId('RENT'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    // 金额相同按类别名兜底：「房租」排在「行政费用」前
    expect(r.byCategory.map((c) => c.categoryId)).toEqual([
      catId('RENT'),
      catId('ADMINISTRATIVE'),
    ]);
    expect(r.total).toBe(200);
  });

  it('报销杂费映射到类别字典：TOOLS→工具、SUNDRIES→杂物、OTHER→其它', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        reimbursementRow({
          customFees: [
            { category: 'TOOLS', description: '封口机配件', amount: 25 },
            { category: 'SUNDRIES', description: '清洁用品', amount: 12.5 },
            { category: 'OTHER', description: '临时搬运费', amount: 30 },
          ],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'TOOLS')).toMatchObject({
      categoryId: catId('TOOLS'),
      label: '工具',
      amount: 25,
    });
    expect(findCategory(r, 'SUNDRIES')).toMatchObject({
      label: '杂物',
      amount: 12.5,
    });
    expect(findCategory(r, 'OTHER')).toMatchObject({
      label: '其它',
      amount: 30,
    });
    expect(r.total).toBe(67.5);
  });

  it('没有账单时，报销里的房租/水电/工资照常计入支出（钱不会凭空消失）', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        reimbursementRow({
          customFees: [
            { category: 'RENT', description: '11 月房租', amount: 6000 },
            { category: 'UTILITIES', description: '水电燃气', amount: 400 },
            { category: 'PAYROLL', description: '工资', amount: 5000 },
          ],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'RENT')).toMatchObject({
      categoryId: catId('RENT'),
      label: '房租',
      amount: 6000,
    });
    expect(findCategory(r, 'UTILITIES')).toMatchObject({
      label: '水电',
      amount: 400,
    });
    expect(findCategory(r, 'PAYROLL')).toMatchObject({
      label: '工资',
      amount: 5000,
    });
    expect(r.total).toBe(11400);
  });

  it('同月已有固定费用账单时，同类别的报销跳过（以账单为准，不双算）', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          amount: 6000,
          categoryId: catId('RENT'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2026-11-30T00:00:00Z'),
        },
      ],
      reimbursements: [
        reimbursementRow({
          customFees: [
            { category: 'RENT', description: '11 月房租', amount: 6000 },
            { category: 'UTILITIES', description: '水电燃气', amount: 400 },
          ],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    // 房租只认账单那 6000；水电没有账单，报销的 400 仍然计入
    expect(findCategory(r, 'RENT')).toMatchObject({ amount: 6000 });
    expect(findCategory(r, 'UTILITIES')).toMatchObject({ amount: 400 });
    expect(r.total).toBe(6400);
  });

  it('社保/税费仍由固定费用账单承担，报销里的这两类不计入', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        reimbursementRow({
          customFees: [
            { category: 'SOCIAL_INSURANCE', description: '社保', amount: 1200 },
            { category: 'TAX', description: '税费', amount: 300 },
          ],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(r.byCategory).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('驳回、要求重提与零金额的报销单不计入，已报销的计入', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        reimbursementRow({
          id: 'rb-rejected',
          status: 'REJECTED',
          customFees: [{ category: 'TOOLS', amount: 99 }],
        }),
        reimbursementRow({
          id: 'rb-resubmit',
          status: 'REQUIRES_RESUBMIT',
          customFees: [{ category: 'TOOLS', amount: 88 }],
        }),
        reimbursementRow({
          id: 'rb-zero',
          status: 'PENDING_REVIEW',
          customFees: [
            { category: 'TOOLS', amount: 0 },
            { category: 'SUNDRIES', amount: -5 },
          ],
        }),
        reimbursementRow({
          id: 'rb-paid',
          status: 'REIMBURSED',
          submittedAt: new Date('2026-11-18T02:00:00Z'),
          customFees: [{ category: 'TOOLS', description: '扳手', amount: 20 }],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    // 报销杂费 TOOLS 现在进「工具」类别（不是旧的行政费用）
    expect(findCategory(r, 'TOOLS')!.amount).toBe(20);
    expect(r.total).toBe(20);
  });

  it('报销杂费按 submittedAt 归月，10 月提交的不进 11 月', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        reimbursementRow({
          id: 'rb-oct',
          submittedAt: new Date('2026-10-31T02:00:00Z'),
          customFees: [{ category: 'SUNDRIES', amount: 66 }],
        }),
        reimbursementRow({
          id: 'rb-nov',
          submittedAt: new Date('2026-11-01T02:00:00Z'),
          customFees: [{ category: 'SUNDRIES', amount: 30 }],
        }),
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(findCategory(r, 'SUNDRIES')!.amount).toBe(30);
    expect(r.total).toBe(30);
  });

  it('系统类别按 code 命中：老板把「食材」改名后，报表用新名字、id 不变', async () => {
    const prisma: any = makePrisma({
      categories: categoryRows({
        RAW_MATERIAL: { name: '食材原料' },
      }),
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          paidAmount: 120,
          personalAmount: 0,
          subtotalAmount: 120,
          shippingFee: 0,
          packagingFee: 0,
          discountAmount: 0,
          items: [{ type: 'FOOD', estimatedCost: 120 }],
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(r.byCategory).toEqual([
      { categoryId: catId('RAW_MATERIAL'), label: '食材原料', amount: 120 },
    ]);
  });

  it('用户录入的类别按 categoryId 分组：同一 id 合并、label 取类别当前名字', async () => {
    const prisma: any = makePrisma({
      categories: categoryRows({
        EQUIPMENT: { name: '设备工具（改名）' },
      }),
      manualEntries: [
        {
          id: 'm1',
          amount: 50,
          occurredAt: new Date('2026-11-06T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
        },
        {
          id: 'm2',
          amount: 25.5,
          occurredAt: new Date('2026-11-07T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
        },
        {
          id: 'm3',
          amount: 10,
          occurredAt: new Date('2026-11-08T02:00:00Z'),
          categoryId: catId('RENT'),
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(r.byCategory).toEqual([
      {
        categoryId: catId('EQUIPMENT'),
        label: '设备工具（改名）',
        amount: 75.5,
      },
      { categoryId: catId('RENT'), label: '房租', amount: 10 },
    ]);
  });

  it('没有类别引用的支出归入「未分类」，不丢金额', async () => {
    const prisma: any = makePrisma({
      manualEntries: [
        {
          id: 'm1',
          amount: 9.9,
          occurredAt: new Date('2026-11-06T02:00:00Z'),
          categoryId: null,
        },
      ],
    });

    const r = await makeService(prisma).getExpense(period, 0);

    expect(r.byCategory).toEqual([
      { categoryId: null, label: '未分类', amount: 9.9 },
    ]);
    expect(r.total).toBe(9.9);
  });
});
