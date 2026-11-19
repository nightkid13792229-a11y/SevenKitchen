import { FinanceSummaryService } from 'src/application/finance/finance-summary.service';
import { monthRange } from 'src/application/finance/finance-period';

/**
 * 汇总服务只做三件事：定期间、把收入与支出相加、数一下线下待确认收款。
 * 收入/支出各自的取数由 Task 3/4 的服务负责，这里用 mock 隔离，断言的是
 * 「汇总 = 明细相加」「负结余保留符号」「期间与费率确实传给了下游」。
 */
describe('FinanceSummaryService', () => {
  const income = {
    orderOnline: 1000,
    orderOffline: 200,
    supplement: 0,
    customRecipe: 0,
    grossTotal: 1200,
    refundTotal: 200,
    historicalRefundTotal: 0,
    netTotal: 1000,
    fee: 6,
  };
  const expense = {
    total: 700,
    fixedCostTotal: 300,
    byCategory: [
      { categoryId: 'cat-RAW_MATERIAL', label: '食材', amount: 700 },
    ],
  };

  /**
   * 假 Prisma `order.count`：按服务下推的 where 过滤订单。
   * 只实现本服务用到的三个条件，用来验证「哪类订单会被数到」的真实语义，
   * 而不是只断言 where 的字面形状。
   */
  const matchesPendingOrder = (order: any, where: any): boolean => {
    if (where.paidAt === null && order.paidAt !== null) return false;
    if (where.cancelledAt === null && order.cancelledAt !== null) return false;
    const action = where.operationLogs?.some?.action;
    if (
      action &&
      !(order.operationLogs ?? []).some((log: any) => log.action === action)
    ) {
      return false;
    }
    return true;
  };

  /** 造一个只依赖 mock 的汇总服务，返回各个 mock 供断言调用参数 */
  const makeService = (
    options: {
      income?: typeof income;
      expense?: typeof expense;
      count?: number;
      orders?: any[];
      feeRate?: number;
    } = {},
  ) => {
    const incomeService = {
      getIncome: jest.fn().mockResolvedValue(options.income ?? income),
    };
    const expenseService = {
      getExpense: jest.fn().mockResolvedValue(options.expense ?? expense),
    };
    const prisma = {
      order: {
        count: jest.fn((args: any) =>
          Promise.resolve(
            options.orders
              ? options.orders.filter((order) =>
                  matchesPendingOrder(order, args?.where),
                ).length
              : (options.count ?? 0),
          ),
        ),
      },
    };
    const feeRateService = {
      getFeeRate: jest.fn().mockResolvedValue(options.feeRate ?? 0.006),
    };

    return {
      service: new FinanceSummaryService(
        incomeService as any,
        expenseService as any,
        prisma as any,
        feeRateService as any,
      ),
      incomeService,
      expenseService,
      prisma,
      feeRateService,
    };
  };

  it('结余 = 收入净额 − 支出合计；待确认收款按线下未付款单数统计', async () => {
    const { service, incomeService, expenseService, prisma, feeRateService } =
      makeService({ count: 2 });

    const result = await service.getSummary({ month: '2026-11' });

    expect(result.balance).toBe(300);
    // 固定费用合计由支出服务算好，汇总原样透出
    expect(result.expense).toMatchObject({ fixedCostTotal: 300 });
    expect(result.pendingOfflineConfirmCount).toBe(2);
    // 接口里的日期带 +08:00，前端不用再猜时区
    expect(result.range.from).toBe('2026-11-01T00:00:00.000+08:00');
    expect(result.range.to).toBe('2026-11-30T23:59:59.999+08:00');

    // 期间只解析一次，收入/支出拿到的是同一个区间；费率由费率服务给出，手续费再传给支出
    const period = monthRange('2026-11');
    expect(incomeService.getIncome).toHaveBeenCalledWith(period, 0.006);
    expect(expenseService.getExpense).toHaveBeenCalledWith(period, income.fee);
    expect(feeRateService.getFeeRate).toHaveBeenCalledTimes(1);

    // 待确认 = 代客下单 + 未付款 + 未取消；不能再按 paymentMethod 过滤：
    // 代客单关掉「已收款」时 paymentMethod 就是 null，按它过滤会永远数不到。
    expect(prisma.order.count).toHaveBeenCalledTimes(1);
    expect(prisma.order.count.mock.calls[0][0].where).toEqual({
      paidAt: null,
      cancelledAt: null,
      operationLogs: { some: { action: 'ASSISTED_ORDER' } },
    });
  });

  it('代客单未收款会被数到，普通未付款单不会被数到', async () => {
    const { service } = makeService({
      orders: [
        {
          id: 'assisted-unpaid',
          // 关掉「已收款」的代客单：paymentMethod 是 null
          paymentMethod: null,
          paidAt: null,
          cancelledAt: null,
          operationLogs: [{ action: 'ASSISTED_ORDER' }],
        },
        {
          id: 'assisted-paid',
          paidAt: new Date('2026-11-02T02:00:00Z'),
          cancelledAt: null,
          operationLogs: [{ action: 'ASSISTED_ORDER' }],
        },
        {
          id: 'assisted-cancelled',
          paidAt: null,
          cancelledAt: new Date('2026-11-03T02:00:00Z'),
          operationLogs: [{ action: 'ASSISTED_ORDER' }],
        },
        {
          id: 'normal-unpaid',
          paymentMethod: 'WECHAT_PAY',
          paidAt: null,
          cancelledAt: null,
          operationLogs: [],
        },
        {
          id: 'price-adjust-unpaid',
          paidAt: null,
          cancelledAt: null,
          operationLogs: [{ action: 'PRICE_ADJUST' }],
        },
      ],
    });

    const result = await service.getSummary({ month: '2026-11' });

    expect(result.pendingOfflineConfirmCount).toBe(1);
  });

  it('支出大于收入时结余为负，不取绝对值', async () => {
    const { service } = makeService({
      income: {
        orderOnline: 100,
        orderOffline: 0,
        supplement: 0,
        customRecipe: 0,
        grossTotal: 100,
        refundTotal: 0,
        historicalRefundTotal: 0,
        netTotal: 100,
        fee: 0.6,
      },
      expense: { total: 500, fixedCostTotal: 0, byCategory: [] },
    });

    const result = await service.getSummary({ month: '2026-11' });

    expect(result.balance).toBe(-400);
    expect(result.pendingOfflineConfirmCount).toBe(0);
  });

  it('没给月份时用 from/to，起点裁到起账日', async () => {
    const { service, incomeService } = makeService();
    const now = new Date('2026-11-19T10:00:00+08:00');

    const result = await service.getSummary(
      { from: '2026-10-01', to: '2026-11-05' },
      now,
    );

    // 起点早于起账日 → 11-01；终点按传入日期收口
    expect(result.range.from).toBe('2026-11-01T00:00:00.000+08:00');
    expect(result.range.to).toBe('2026-11-05T23:59:59.999+08:00');
    expect(incomeService.getIncome).toHaveBeenCalledWith(
      {
        from: new Date('2026-11-01T00:00:00+08:00'),
        to: new Date('2026-11-05T23:59:59.999+08:00'),
      },
      0.006,
    );
  });
});
