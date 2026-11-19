import { FinanceEntriesService } from 'src/application/finance/finance-entries.service';
import { FinanceExpenseService } from 'src/application/finance/finance-expense.service';
import { FinanceIncomeService } from 'src/application/finance/finance-income.service';
import { monthRange } from 'src/application/finance/finance-period';
import { catId, financeCategoryMock } from './finance-category.fixture';

const period = monthRange('2026-11');

const utc = (iso: string) => new Date(iso);

/**
 * 一套 mock 同时喂给收入、支出、明细三个服务：
 * 三处都按 `where` 里的条件取数，mock 必须按条件路由，
 * 否则「同一张表被两个口径查两次」会拿到同一批数据、把一致性测试测成假的。
 */
const makePrisma = (data: any = {}) => ({
  financeCategory: financeCategoryMock(data.categories),
  order: {
    findMany: jest.fn((args: any) =>
      Promise.resolve(
        args?.where?.shippedAt
          ? (data.shippingOrders ?? [])
          : (data.orders ?? []),
      ),
    ),
  },
  supplementOrder: {
    findMany: jest.fn((args: any) =>
      Promise.resolve(
        args?.where?.refundedAt
          ? (data.supplementRefunds ?? [])
          : (data.supplements ?? []),
      ),
    ),
  },
  customRecipeOrder: {
    findMany: jest.fn((args: any) => {
      const where = args?.where ?? {};
      if (where.refundedAt)
        return Promise.resolve(data.customRecipeRefunds ?? []);
      if (where.offlineRefundedAt) {
        return Promise.resolve(data.customRecipeOfflineRefunds ?? []);
      }
      return Promise.resolve(data.customRecipes ?? []);
    }),
  },
  orderRefundRecord: {
    findMany: jest.fn().mockResolvedValue(data.orderRefunds ?? []),
  },
  orderOfflineRefund: {
    findMany: jest.fn().mockResolvedValue(data.offlineRefunds ?? []),
  },
  purchaseList: {
    findMany: jest.fn().mockResolvedValue(data.purchaseLists ?? []),
  },
  expenseBill: { findMany: jest.fn().mockResolvedValue(data.bills ?? []) },
  financeManualEntry: {
    findMany: jest.fn((args: any) =>
      Promise.resolve(
        args?.where?.direction === 'INCOME'
          ? (data.manualIncome ?? [])
          : (data.manualEntries ?? []),
      ),
    ),
  },
  reimbursement: {
    findMany: jest.fn().mockResolvedValue(data.reimbursements ?? []),
  },
});

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const sum = (rows: Array<{ amount: number }>) =>
  round2(rows.reduce((total, row) => total + row.amount, 0));

describe('FinanceEntriesService', () => {
  it('按时间倒序合并，退款是负的收入行', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 300,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      offlineRefunds: [
        {
          id: 'r1',
          amount: 100,
          voidedAt: null,
          refundedAt: utc('2026-11-03T02:00:00Z'),
          order: {
            orderNo: 'SK1',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
      manualEntries: [
        {
          id: 'm1',
          amount: 50,
          occurredAt: utc('2026-11-01T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
          title: '封口机',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_WECHAT',
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'refund:offline:r1',
      'o1',
      'm1',
    ]);

    expect(result.items[0]).toMatchObject({
      id: 'refund:offline:r1',
      direction: 'INCOME',
      categoryId: null,
      categoryLabel: '退款',
      amount: -100,
      isRefund: true,
      isHistorical: false,
      sourceType: 'ORDER',
      sourceNo: 'SK1',
      occurredAt: '2026-11-03T10:00:00.000+08:00',
    });
    expect(result.items[1]).toMatchObject({
      direction: 'INCOME',
      categoryId: null,
      categoryLabel: '线下订单',
      amount: 300,
      isRefund: false,
      sourceType: 'ORDER',
      sourceNo: 'SK1',
      payerAccount: 'PERSONAL_WECHAT',
      payerAccountLabel: '我的微信',
    });
    expect(result.items[2]).toMatchObject({
      direction: 'EXPENSE',
      categoryId: catId('EQUIPMENT'),
      categoryLabel: '设备工具',
      amount: 50,
      sourceType: 'MANUAL',
      payerAccount: 'PERSONAL_WECHAT',
      payerAccountLabel: '我的微信',
    });
    expect(result.items).toHaveLength(3);
  });

  it('分页在合并排序之后进行', async () => {
    const prisma: any = makePrisma({
      manualEntries: [1, 2, 3].map((n) => ({
        id: `m${n}`,
        amount: n,
        occurredAt: utc(`2026-11-0${n}T02:00:00Z`),
        categoryId: catId('OTHER'),
        title: `t${n}`,
        direction: 'EXPENSE',
        payerAccount: 'PERSONAL_WECHAT',
      })),
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      page: 2,
      pageSize: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual(['m1']);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('超过 5000 条截断并置 truncated', async () => {
    const manualEntries = Array.from({ length: 5001 }, (_, index) => ({
      id: `m${index}`,
      amount: 1,
      occurredAt: new Date(Date.UTC(2026, 10, 1) + index * 1000),
      categoryId: catId('OTHER'),
      title: `t${index}`,
      direction: 'EXPENSE',
      payerAccount: 'PERSONAL_WECHAT',
    }));
    const prisma: any = makePrisma({ manualEntries });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    expect(result.truncated).toBe(true);
    expect(result.total).toBe(5000);
    expect(result.items).toHaveLength(50);
  });

  it('手续费按收入净额计一行；退款大于实收时手续费为负', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 100,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      orderRefunds: [
        {
          id: 'r1',
          amount: 200,
          success: true,
          successTime: utc('2026-11-03T02:00:00Z'),
          order: {
            orderNo: 'SK1',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    const feeRow = result.items.find((item) => item.sourceType === 'FEE');
    expect(feeRow).toMatchObject({
      direction: 'EXPENSE',
      categoryId: catId('PAYMENT_FEE'),
      categoryLabel: '支付手续费',
      payerAccount: 'MERCHANT',
      amount: -0.6,
      isRefund: false,
    });
    expect(sum(result.items.filter((i) => i.direction === 'INCOME'))).toBe(
      -100,
    );
  });

  it('手续费率由注入的服务给出，不在明细里写死', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
    });
    const feeRateService = {
      getFeeRate: jest.fn().mockResolvedValue(0.01),
    };

    const result = await new FinanceEntriesService(
      prisma,
      feeRateService as any,
    ).list({ month: '2026-11' });

    expect(feeRateService.getFeeRate).toHaveBeenCalledTimes(1);
    expect(result.items.find((item) => item.sourceType === 'FEE')!.amount).toBe(
      10,
    );
  });

  it('退款来源都可追溯：线下登记、补剂、定制食谱，历史订单退款单独标记', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 200,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-10-20T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      offlineRefunds: [
        {
          id: 'orf1',
          amount: 30,
          voidedAt: null,
          refundedAt: utc('2026-11-05T03:00:00Z'),
          order: {
            id: 'o1',
            orderNo: 'SK1',
            paidAt: utc('2026-10-20T02:00:00Z'),
          },
        },
      ],
      supplements: [],
      supplementRefunds: [
        {
          id: 's-old',
          orderNo: 'SP9',
          refundAmount: 60,
          refundedAt: utc('2026-11-07T02:00:00Z'),
          paidAt: utc('2026-10-10T02:00:00Z'),
          paymentMethod: 'OFFLINE_WECHAT',
        },
      ],
      customRecipeOfflineRefunds: [
        {
          id: 'cr-uuid-1',
          orderId: 'CR20261108001',
          offlineRefundAmount: 200,
          offlineRefundedAt: utc('2026-11-08T03:00:00Z'),
          paymentConfirmedAt: utc('2026-11-03T03:00:00Z'),
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    const refundRows = result.items.filter((item) => item.isRefund);
    expect(refundRows).toHaveLength(3);
    expect(
      refundRows.map((row) => [
        row.sourceType,
        row.id,
        row.sourceId,
        row.sourceNo,
        row.amount,
        row.isHistorical,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['ORDER', 'refund:offline:orf1', 'o1', 'SK1', -30, true],
        [
          'SUPPLEMENT_ORDER',
          'refund:supplement:s-old',
          's-old',
          'SP9',
          -60,
          true,
        ],
        [
          'CUSTOM_RECIPE_ORDER',
          'refund:offline:cr-uuid-1',
          'CR20261108001',
          'CR20261108001',
          -200,
          false,
        ],
      ]),
    );
    // 线下退款是收入减项，不产生手续费行
    expect(result.items.some((item) => item.sourceType === 'FEE')).toBe(false);
  });

  it('线上退款行也指回各自订单，可跳详情', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      orderRefunds: [
        {
          id: 'r1',
          amount: 100,
          success: true,
          successTime: utc('2026-11-03T02:00:00Z'),
          order: {
            id: 'o1',
            orderNo: 'SK1',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
      supplementRefunds: [
        {
          id: 's1',
          orderNo: 'SP1',
          refundAmount: 50,
          refundedAt: utc('2026-11-06T02:00:00Z'),
          paidAt: utc('2026-11-04T02:00:00Z'),
          paymentMethod: 'WECHAT_PAY',
        },
      ],
      customRecipeRefunds: [
        {
          id: 'cr-uuid-2',
          orderId: 'CR20261107001',
          refundAmount: 40,
          refundedAt: utc('2026-11-07T02:00:00Z'),
          paymentConfirmedAt: utc('2026-11-05T02:00:00Z'),
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const refundRows = result.items.filter((item) => item.isRefund);

    expect(
      refundRows.map((row) => [
        row.id,
        row.sourceType,
        row.sourceId,
        row.sourceNo,
        row.amount,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['refund:r1', 'ORDER', 'o1', 'SK1', -100],
        ['refund:supplement:s1', 'SUPPLEMENT_ORDER', 's1', 'SP1', -50],
        [
          'refund:online:cr-uuid-2',
          'CUSTOM_RECIPE_ORDER',
          'CR20261107001',
          'CR20261107001',
          -40,
        ],
      ]),
    );
  });

  it('明细 id 唯一：同类别采购合并，不同退款渠道分行', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 300,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      orderRefunds: [
        {
          id: 'r1',
          amount: 100,
          success: true,
          successTime: utc('2026-11-03T02:00:00Z'),
          order: {
            id: 'o1',
            orderNo: 'SK1',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          orderNo: 'BH1',
          paidAmount: 250,
          personalAmount: 0,
          subtotalAmount: 250,
          shippingFee: 0,
          packagingFee: 50,
          discountAmount: 0,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: utc('2026-11-07T02:00:00Z'),
          completedAt: null,
          createdAt: utc('2026-11-07T02:00:00Z'),
          // 包材商品行与包装费同属 PACKAGING_SUPPLIES，必须合并成一行
          items: [
            { id: 'pi1', type: 'FOOD', estimatedCost: 100 },
            { id: 'pi2', type: 'PACKAGING', estimatedCost: 100 },
          ],
          records: [],
        },
      ],
      customRecipes: [
        {
          id: 'cr-uuid-3',
          orderId: 'CR20261104001',
          amount: 100,
          actualPaidAmount: 100,
          paymentChannel: 'OFFLINE_WECHAT',
          paymentConfirmedAt: utc('2026-11-04T02:00:00Z'),
          isGift: false,
        },
      ],
      customRecipeRefunds: [
        {
          id: 'cr-uuid-3',
          orderId: 'CR20261104001',
          refundAmount: 40,
          refundedAt: utc('2026-11-05T02:00:00Z'),
          paymentConfirmedAt: utc('2026-11-04T02:00:00Z'),
        },
      ],
      customRecipeOfflineRefunds: [
        {
          id: 'cr-uuid-3',
          orderId: 'CR20261104001',
          offlineRefundAmount: 30,
          offlineRefundedAt: utc('2026-11-06T02:00:00Z'),
          paymentConfirmedAt: utc('2026-11-04T02:00:00Z'),
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    const ids = result.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const packagingRows = result.items.filter(
      (item) => item.id === 'p1:PACKAGING_SUPPLIES',
    );
    expect(packagingRows).toHaveLength(1);
    expect(packagingRows[0].amount).toBe(150);

    expect(ids).toEqual(
      expect.arrayContaining([
        'cr-uuid-3',
        'refund:online:cr-uuid-3',
        'refund:offline:cr-uuid-3',
      ]),
    );
  });

  it('金额与采购记录都缺的采购单仍出一行 0 元提示，不静默消失', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          orderNo: 'BH1',
          paidAmount: null,
          personalAmount: null,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: utc('2026-11-07T02:00:00Z'),
          completedAt: null,
          createdAt: utc('2026-11-07T02:00:00Z'),
          items: [],
          records: [],
        },
        {
          // 日采单的采购单日期在期间外，但期间内有一条 0 元采购记录：
          // 占位行必须落在期间内（用记录的最近日期），否则明细里看不到
          id: 'p2',
          kind: 'ORDER_DEMAND',
          orderNo: null,
          paidAmount: null,
          personalAmount: null,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: null,
          completedAt: null,
          createdAt: utc('2026-10-05T02:00:00Z'),
          items: [],
          records: [
            {
              id: 'pr1',
              purchaseItemId: 'pi-x',
              actualCost: 0,
              purchasedAt: utc('2026-11-10T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const expense = await new FinanceExpenseService(prisma).getExpense(
      period,
      0,
    );

    expect(expense.total).toBe(0);
    expect(expense.byCategory).toEqual([]);

    expect(result.items).toHaveLength(2);
    const replenishment = result.items.find((item) => item.id === 'p1:OTHER');
    expect(replenishment).toMatchObject({
      direction: 'EXPENSE',
      categoryId: catId('OTHER'),
      categoryLabel: '其它',
      amount: 0,
      sourceType: 'PURCHASE',
      sourceNo: 'BH1',
    });
    expect(replenishment!.title).toContain('金额缺失');

    // 期间内的最近采购记录日期，而不是期间外的 createdAt
    expect(result.items.find((item) => item.id === 'p2:OTHER')).toMatchObject({
      amount: 0,
      occurredAt: '2026-11-10T10:00:00.000+08:00',
    });
  });

  it('手工收入进入明细并计入收入净额', async () => {
    const prisma: any = makePrisma({
      manualIncome: [
        {
          id: 'mi1',
          amount: 80,
          occurredAt: utc('2026-11-09T02:00:00Z'),
          incomeCategory: 'OTHER_INCOME',
          title: '广告返现',
          direction: 'INCOME',
          payerAccount: 'CASH',
        },
      ],
    });

    const entries = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const income = await new FinanceIncomeService(prisma).getIncome(
      period,
      0.006,
    );

    expect(entries.items.find((item) => item.id === 'mi1')).toMatchObject({
      direction: 'INCOME',
      categoryId: null,
      categoryLabel: '其他收入',
      amount: 80,
      sourceType: 'MANUAL',
      payerAccount: 'CASH',
      payerAccountLabel: '现金',
    });
    expect(income.manualIncome).toBe(80);
    expect(income.netTotal).toBe(80);
    expect(sum(entries.items.filter((i) => i.direction === 'INCOME'))).toBe(
      income.netTotal,
    );
  });

  it('采购按支出服务的同一条分摊路径出明细', async () => {
    const prisma: any = makePrisma({
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          orderNo: 'BH1',
          paidAmount: 200,
          personalAmount: 0,
          subtotalAmount: 200,
          shippingFee: 50,
          packagingFee: 50,
          discountAmount: 0,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: utc('2026-11-07T02:00:00Z'),
          completedAt: null,
          createdAt: utc('2026-11-07T02:00:00Z'),
          items: [{ id: 'pi1', type: 'FOOD', estimatedCost: 100 }],
          records: [],
        },
        {
          id: 'p2',
          kind: 'ORDER_DEMAND',
          orderNo: null,
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: null,
          completedAt: null,
          createdAt: utc('2026-11-10T02:00:00Z'),
          items: [
            { id: 'pi2', type: 'FOOD', estimatedCost: 0 },
            { id: 'pi3', type: 'SUPPLEMENT', estimatedCost: 0 },
          ],
          records: [
            {
              id: 'pr1',
              purchaseItemId: 'pi2',
              actualCost: 300,
              purchasedAt: utc('2026-11-10T02:00:00Z'),
            },
            {
              id: 'pr2',
              purchaseItemId: 'pi3',
              actualCost: 200,
              purchasedAt: utc('2026-11-11T02:00:00Z'),
            },
          ],
        },
      ],
    });

    const entries = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const expense = await new FinanceExpenseService(prisma).getExpense(
      period,
      0,
    );

    const purchaseRows = entries.items.filter(
      (item) => item.sourceType === 'PURCHASE',
    );
    expect(
      purchaseRows.map((row) => [row.categoryId, row.amount]).sort(),
    ).toEqual(
      [
        [catId('RAW_MATERIAL'), 300],
        [catId('LOGISTICS_DELIVERY'), 50],
        [catId('PACKAGING_SUPPLIES'), 50],
        [catId('RAW_MATERIAL'), 100],
        [catId('SUPPLEMENT'), 200],
      ].sort(),
    );
    expect(sum(purchaseRows)).toBe(expense.total);
  });

  it('固定费用账单按月摊成一行，带账单号与付款方', async () => {
    const prisma: any = makePrisma({
      bills: [
        {
          id: 'b1',
          billNumber: 'B202611',
          title: '11 月房租',
          amount: 1200,
          categoryId: catId('RENT'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-10-31T00:00:00Z'),
          payerAccount: 'PERSONAL_BANK',
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'b1:2026-11',
      direction: 'EXPENSE',
      categoryId: catId('RENT'),
      categoryLabel: '房租',
      amount: 100,
      sourceType: 'BILL',
      sourceNo: 'B202611',
      payerAccount: 'PERSONAL_BANK',
      payerAccountLabel: '我的银行卡',
      occurredAt: '2026-11-01T00:00:00.000+08:00',
    });
  });

  it('account 只返回指定账户的行（按账户筛，不再有「我垫的」）', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      manualIncome: [
        {
          id: 'mi1',
          amount: 80,
          occurredAt: utc('2026-11-09T02:00:00Z'),
          incomeCategory: 'OTHER_INCOME',
          title: '广告返现',
          direction: 'INCOME',
          payerAccount: 'CASH',
        },
      ],
      manualEntries: [
        {
          id: 'm-wechat',
          amount: 50,
          occurredAt: utc('2026-11-01T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
          title: '封口机',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_WECHAT',
        },
        {
          id: 'm-alipay',
          amount: 20,
          occurredAt: utc('2026-11-04T02:00:00Z'),
          categoryId: catId('OTHER'),
          title: '杂项',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_ALIPAY',
        },
      ],
      bills: [
        {
          id: 'b1',
          billNumber: 'B202611',
          title: '11 月房租',
          amount: 1200,
          categoryId: catId('RENT'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-10-31T00:00:00Z'),
          payerAccount: 'PERSONAL_BANK',
        },
      ],
    });

    const all = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const alipay = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      account: 'PERSONAL_ALIPAY',
    });
    const merchant = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      account: 'MERCHANT',
    });

    // 不传 account 时所有行都在（口径不变）
    expect(all.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'o1',
        'mi1',
        'm-wechat',
        'm-alipay',
        'b1:2026-11',
      ]),
    );
    expect(all.items.every((item) => item.payerAccountLabel.length > 0)).toBe(
      true,
    );

    expect(alipay.items.map((item) => item.id)).toEqual(['m-alipay']);
    expect(alipay.items[0]).toMatchObject({
      payerAccount: 'PERSONAL_ALIPAY',
      payerAccountLabel: '我的支付宝',
    });
    // 过滤发生在分页之前，total 也是过滤后的条数
    expect(alipay.total).toBe(1);

    // 线上收款与手续费都归「微信商户号」
    expect(merchant.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['o1']),
    );
    expect(merchant.items.some((item) => item.sourceType === 'FEE')).toBe(true);
    expect(merchant.items.some((item) => item.id === 'b1:2026-11')).toBe(false);
  });

  it('退款沿用原单账户、快递费从商户号出，按账户筛选不漏行', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o-online',
          orderNo: 'SK1',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
        {
          id: 'o-offline',
          orderNo: 'SK2',
          amountTotal: 300,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T03:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
          payerAccount: 'CASH',
        },
      ],
      // 线上原路退回：钱从微信商户号出
      orderRefunds: [
        {
          id: 'r1',
          amount: 100,
          success: true,
          successTime: utc('2026-11-03T02:00:00Z'),
          order: {
            id: 'o-online',
            orderNo: 'SK1',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
      // 线下退款登记：从登记的账户退出去（不是订单收款账户）
      offlineRefunds: [
        {
          id: 'orf1',
          amount: 50,
          voidedAt: null,
          refundedAt: utc('2026-11-04T02:00:00Z'),
          payerAccount: 'PERSONAL_ALIPAY',
          order: {
            id: 'o-offline',
            orderNo: 'SK2',
            paidAt: utc('2026-11-02T03:00:00Z'),
          },
        },
      ],
      shippingOrders: [
        {
          id: 'o-ship',
          orderNo: 'SK3',
          actualShippingFee: 86,
          shippedAt: utc('2026-11-05T02:00:00Z'),
        },
      ],
      supplements: [],
      supplementRefunds: [
        {
          // 2026-11 之前的老标记：线下收款 → 默认「我的微信」
          id: 's-refund-legacy',
          orderNo: 'SP0',
          refundAmount: 40,
          refundedAt: utc('2026-11-06T02:00:00Z'),
          paidAt: utc('2026-10-10T02:00:00Z'),
          paymentMethod: 'OFFLINE',
        },
        {
          id: 's-refund-online',
          orderNo: 'SP1',
          refundAmount: 30,
          refundedAt: utc('2026-11-07T02:00:00Z'),
          paidAt: utc('2026-11-01T02:00:00Z'),
          paymentMethod: 'WECHAT_PAY',
        },
      ],
    });

    const all = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const refundAccount = new Map(
      all.items
        .filter((item) => item.isRefund)
        .map((row) => [row.id, row.payerAccount]),
    );

    // 线下代客单收款用订单上登记的账户（没有才缺省「我的微信」）
    expect(all.items.find((item) => item.id === 'o-offline')).toMatchObject({
      categoryLabel: '线下订单',
      payerAccount: 'CASH',
      payerAccountLabel: '现金',
    });

    expect(refundAccount.get('refund:r1')).toBe('MERCHANT');
    expect(refundAccount.get('refund:offline:orf1')).toBe('PERSONAL_ALIPAY');
    expect(refundAccount.get('refund:supplement:s-refund-legacy')).toBe(
      'PERSONAL_WECHAT',
    );
    expect(refundAccount.get('refund:supplement:s-refund-online')).toBe(
      'MERCHANT',
    );

    const shippingRows = all.items.filter(
      (item) => item.sourceType === 'SHIPPING',
    );
    expect(shippingRows).toHaveLength(1);
    expect(shippingRows[0]).toMatchObject({
      id: 'o-ship:shipping',
      direction: 'EXPENSE',
      amount: 86,
      payerAccount: 'MERCHANT',
      payerAccountLabel: '微信商户号',
    });

    // 按支付宝筛：只有那笔线下退款（订单本身收在现金）
    const alipay = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      account: 'PERSONAL_ALIPAY',
    });
    expect(alipay.items.map((item) => item.id)).toEqual([
      'refund:offline:orf1',
    ]);

    const merchant = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      account: 'MERCHANT',
    });
    expect(merchant.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'o-online',
        'refund:r1',
        'refund:supplement:s-refund-online',
      ]),
    );
    expect(merchant.items.some((item) => item.sourceType === 'SHIPPING')).toBe(
      true,
    );
    expect(merchant.items.some((item) => item.id === 'o-offline')).toBe(false);
  });

  it('direction 与 category 在分页前过滤', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK1',
          amountTotal: 300,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      manualEntries: [
        {
          id: 'm1',
          amount: 50,
          occurredAt: utc('2026-11-01T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
          title: '封口机',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_WECHAT',
        },
        {
          id: 'm2',
          amount: 20,
          occurredAt: utc('2026-11-04T02:00:00Z'),
          categoryId: catId('OTHER'),
          title: '杂项',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_WECHAT',
        },
      ],
    });

    const onlyEquipment = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      category: catId('EQUIPMENT'),
    });
    expect(onlyEquipment.items.map((item) => item.id)).toEqual(['m1']);
    expect(onlyEquipment.total).toBe(1);

    const onlyIncome = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
      direction: 'INCOME',
    });
    expect(onlyIncome.items.map((item) => item.id)).toEqual(['o1']);
  });

  it('报销杂费出明细行：类别字典、标题、账户与提交月份', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        {
          id: 'rb1',
          claimNumber: 'BX202611001',
          status: 'PENDING_REVIEW',
          submittedAt: utc('2026-11-05T02:00:00Z'),
          customFees: [
            { category: 'TOOLS', description: '封口机配件', amount: 25 },
            { category: 'SUNDRIES', description: '清洁用品', amount: 12.5 },
            { category: 'OTHER', amount: 30 },
            { category: 'RENT', description: '房租', amount: 6000 },
          ],
        },
      ],
    });

    const result = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const rows = result.items.filter(
      (item) => item.sourceType === 'REIMBURSEMENT',
    );

    // 固定费用类别（RENT）由固定费用账单承担，不能在这里再出一行
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'rb1:TOOLS:0',
          occurredAt: '2026-11-05T10:00:00.000+08:00',
          direction: 'EXPENSE',
          categoryId: catId('TOOLS'),
          categoryLabel: '工具',
          amount: 25,
          title: '报销杂费 · 封口机配件',
          sourceType: 'REIMBURSEMENT',
          sourceId: 'rb1',
          sourceNo: 'BX202611001',
          payerAccount: 'PERSONAL_WECHAT',
          payerAccountLabel: '我的微信',
          isRefund: false,
          isHistorical: false,
        }),
        expect.objectContaining({
          id: 'rb1:SUNDRIES:1',
          categoryId: catId('SUNDRIES'),
          categoryLabel: '杂物',
          amount: 12.5,
          title: '报销杂费 · 清洁用品',
        }),
        expect.objectContaining({
          // 没填描述时退回类别文案
          id: 'rb1:OTHER:2',
          categoryId: catId('OTHER'),
          categoryLabel: '其它',
          amount: 30,
          title: '报销杂费 · 其它',
        }),
      ]),
    );
    // 固定费用类别（房租）由账单承担，不会出现在报销杂费行里
    expect(rows.every((row) => row.categoryId !== catId('RENT'))).toBe(true);
  });

  it('报销杂费：明细相加等于支出汇总，且分类金额一致', async () => {
    const prisma: any = makePrisma({
      reimbursements: [
        {
          id: 'rb1',
          claimNumber: 'BX202611001',
          status: 'REIMBURSED',
          submittedAt: utc('2026-11-05T02:00:00Z'),
          customFees: [
            { category: 'TOOLS', description: '封口机配件', amount: 25 },
            { category: 'SUNDRIES', description: '清洁用品', amount: 12.5 },
            { category: 'OTHER', description: '临时搬运费', amount: 30 },
          ],
        },
      ],
    });

    const entries = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });
    const expense = await new FinanceExpenseService(prisma).getExpense(
      period,
      0,
    );

    const rows = entries.items.filter(
      (item) =>
        item.direction === 'EXPENSE' && item.sourceType === 'REIMBURSEMENT',
    );
    expect(rows).toHaveLength(3);
    expect(sum(rows)).toBe(expense.total);
    expect(expense.total).toBe(67.5);
    expect(sum(rows.filter((row) => row.categoryId === catId('TOOLS')))).toBe(
      expense.byCategory.find((c) => c.categoryId === catId('TOOLS'))!.amount,
    );
    expect(
      sum(rows.filter((row) => row.categoryId === catId('SUNDRIES'))),
    ).toBe(
      expense.byCategory.find((c) => c.categoryId === catId('SUNDRIES'))!
        .amount,
    );
    expect(sum(rows.filter((row) => row.categoryId === catId('OTHER')))).toBe(
      expense.byCategory.find((c) => c.categoryId === catId('OTHER'))!.amount,
    );
  });

  /**
   * 关键回归：同一份数据喂给三个服务，明细相加必须等于汇总。
   * 任何一处改口径（漏一张表、改排除条件、改分摊）都会在这里炸。
   */
  it('跨服务一致性：明细收入之和 = 收入净额，明细支出之和 = 支出合计', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          orderNo: 'SK001',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
        {
          id: 'o2',
          orderNo: 'SK002',
          amountTotal: 200,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T03:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      shippingOrders: [
        {
          id: 'o3',
          orderNo: 'SK003',
          actualShippingFee: 86,
          shippedAt: utc('2026-11-05T02:00:00Z'),
        },
      ],
      supplements: [
        {
          id: 's1',
          orderNo: 'SP001',
          amountTotal: 400,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-04T02:00:00Z'),
        },
      ],
      supplementRefunds: [
        {
          id: 's1',
          orderNo: 'SP001',
          refundAmount: 100,
          refundedAt: utc('2026-11-06T02:00:00Z'),
          paidAt: utc('2026-11-04T02:00:00Z'),
          paymentMethod: 'WECHAT_PAY',
        },
      ],
      customRecipes: [
        {
          id: 'c-uuid-4',
          orderId: 'CR20261104002',
          amount: 300,
          actualPaidAmount: 299,
          paymentChannel: 'WECHAT_ONLINE',
          paymentConfirmedAt: utc('2026-11-04T03:00:00Z'),
          isGift: false,
        },
      ],
      customRecipeRefunds: [
        {
          id: 'c-uuid-4',
          orderId: 'CR20261104002',
          refundAmount: 50,
          refundedAt: utc('2026-11-08T03:00:00Z'),
          paymentConfirmedAt: utc('2026-11-04T03:00:00Z'),
        },
      ],
      orderRefunds: [
        {
          id: 'r1',
          amount: 500,
          success: true,
          successTime: utc('2026-11-03T02:00:00Z'),
          order: {
            orderNo: 'SK001',
            paidAt: utc('2026-11-02T02:00:00Z'),
          },
        },
      ],
      offlineRefunds: [
        {
          id: 'orf1',
          amount: 30,
          voidedAt: null,
          refundedAt: utc('2026-11-05T03:00:00Z'),
          order: {
            orderNo: 'SK002',
            paidAt: utc('2026-11-02T03:00:00Z'),
          },
        },
      ],
      purchaseLists: [
        {
          id: 'p1',
          kind: 'STOCK_REPLENISHMENT',
          orderNo: 'BH001',
          paidAmount: 200,
          personalAmount: 0,
          subtotalAmount: 200,
          shippingFee: 50,
          packagingFee: 50,
          discountAmount: 0,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: utc('2026-11-07T02:00:00Z'),
          completedAt: null,
          createdAt: utc('2026-11-07T02:00:00Z'),
          items: [{ id: 'pi1', type: 'FOOD', estimatedCost: 100 }],
          records: [],
        },
        {
          id: 'p2',
          kind: 'ORDER_DEMAND',
          orderNo: null,
          paidAmount: null,
          personalAmount: 0,
          subtotalAmount: null,
          shippingFee: null,
          packagingFee: null,
          discountAmount: null,
          payerAccount: 'PERSONAL_WECHAT',
          orderPlacedAt: null,
          completedAt: null,
          createdAt: utc('2026-11-10T02:00:00Z'),
          items: [
            { id: 'pi2', type: 'FOOD', estimatedCost: 0 },
            { id: 'pi3', type: 'SUPPLEMENT', estimatedCost: 0 },
          ],
          records: [
            {
              id: 'pr1',
              purchaseItemId: 'pi2',
              actualCost: 300,
              purchasedAt: utc('2026-11-10T02:00:00Z'),
            },
            {
              id: 'pr2',
              purchaseItemId: 'pi2',
              actualCost: 100,
              purchasedAt: utc('2026-11-12T02:00:00Z'),
            },
            {
              id: 'pr3',
              purchaseItemId: 'pi3',
              actualCost: 200,
              purchasedAt: utc('2026-11-11T02:00:00Z'),
            },
          ],
        },
      ],
      bills: [
        {
          id: 'b1',
          billNumber: 'B202611',
          title: '11 月房租',
          amount: 1200,
          categoryId: catId('RENT'),
          recognitionStart: new Date('2026-11-01T00:00:00Z'),
          recognitionEnd: new Date('2027-10-31T00:00:00Z'),
          payerAccount: 'PERSONAL_BANK',
        },
      ],
      manualEntries: [
        {
          id: 'm1',
          amount: 50,
          occurredAt: utc('2026-11-06T02:00:00Z'),
          categoryId: catId('EQUIPMENT'),
          title: '封口机',
          direction: 'EXPENSE',
          payerAccount: 'PERSONAL_WECHAT',
        },
      ],
      reimbursements: [
        {
          id: 'rb1',
          claimNumber: 'BX202611001',
          status: 'PENDING_REVIEW',
          submittedAt: utc('2026-11-05T02:00:00Z'),
          customFees: [
            { category: 'TOOLS', description: '封口机配件', amount: 25 },
            { category: 'SUNDRIES', description: '清洁用品', amount: 12.5 },
            { category: 'OTHER', description: '临时搬运费', amount: 30 },
          ],
        },
      ],
      manualIncome: [
        {
          id: 'mi1',
          amount: 80,
          occurredAt: utc('2026-11-09T02:00:00Z'),
          incomeCategory: 'OTHER_INCOME',
          title: '广告返现',
          direction: 'INCOME',
          payerAccount: 'CASH',
        },
      ],
    });

    const income = await new FinanceIncomeService(prisma).getIncome(
      period,
      0.006,
    );
    const expense = await new FinanceExpenseService(prisma).getExpense(
      period,
      income.fee,
    );
    const entries = await new FinanceEntriesService(prisma).list({
      month: '2026-11',
    });

    // 先把三个服务各自的期望值钉死，避免「两边一起错」也判绿
    expect(income).toMatchObject({
      orderOnline: 1000,
      orderOffline: 200,
      supplement: 400,
      customRecipe: 299,
      manualIncome: 80,
      grossTotal: 1979,
      refundTotal: 680,
      netTotal: 1299,
      fee: 6.29,
    });
    expect(expense.total).toBe(1109.79);

    const incomeRows = entries.items.filter(
      (item) => item.direction === 'INCOME',
    );
    const expenseRows = entries.items.filter(
      (item) => item.direction === 'EXPENSE',
    );

    expect(sum(incomeRows)).toBe(income.netTotal);
    expect(sum(expenseRows)).toBe(expense.total);

    // 手续费那一条单独确认在明细里，金额来自收入口径
    const feeRows = entries.items.filter((item) => item.sourceType === 'FEE');
    expect(feeRows).toHaveLength(1);
    expect(feeRows[0]).toMatchObject({
      direction: 'EXPENSE',
      categoryId: catId('PAYMENT_FEE'),
      categoryLabel: '支付手续费',
      amount: income.fee,
    });

    // 每一类来源都真的出现了，不是靠某一类凑数
    const sourceTypes = new Set(entries.items.map((item) => item.sourceType));
    expect(sourceTypes).toEqual(
      new Set([
        'ORDER',
        'SUPPLEMENT_ORDER',
        'CUSTOM_RECIPE_ORDER',
        'PURCHASE',
        'SHIPPING',
        'BILL',
        'FEE',
        'MANUAL',
        'REIMBURSEMENT',
      ]),
    );
  });
});
