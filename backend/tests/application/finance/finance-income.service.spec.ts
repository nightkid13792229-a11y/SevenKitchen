import { FinanceIncomeService } from 'src/application/finance/finance-income.service';
import { monthRange } from 'src/application/finance/finance-period';

const period = monthRange('2026-11');

const sh = (iso: string) => new Date(`${iso}+08:00`);
const utc = (iso: string) => new Date(iso);

/**
 * 按 `where.refundedAt` 区分补剂「收入取数」与「退款取数」：
 * 真实 Prisma 会用 where 过滤，mock 里没有 where 就会把同一批数据喂给两次取数。
 */
const makePrisma = (data: any = {}) => ({
  order: { findMany: jest.fn().mockResolvedValue(data.orders ?? []) },
  supplementOrder: {
    findMany: jest.fn((args: any) =>
      Promise.resolve(
        args?.where?.refundedAt
          ? (data.supplementRefunds ?? data.supplements ?? [])
          : (data.supplements ?? []),
      ),
    ),
  },
  customRecipeOrder: {
    findMany: jest.fn().mockResolvedValue(data.customRecipes ?? []),
  },
  orderRefundRecord: {
    findMany: jest.fn().mockResolvedValue(data.orderRefunds ?? []),
  },
  orderOfflineRefund: {
    findMany: jest.fn().mockResolvedValue(data.offlineRefunds ?? []),
  },
});

describe('FinanceIncomeService', () => {
  it('区分线上与线下收款，线下不收手续费', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          amountTotal: 100,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
        {
          id: 'o2',
          amountTotal: 200,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T03:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.orderOnline).toBe(100);
    expect(r.orderOffline).toBe(200);
    expect(r.grossTotal).toBe(300);
    expect(r.fee).toBe(0.6);
  });

  it('排除 0 元单、补发单、重做单与 RESHIP', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'a',
          amountTotal: 0,
          paymentMethod: 'RESHIP',
          paidAt: utc('2026-11-03T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: 'x',
        },
        {
          id: 'b',
          amountTotal: 500,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-03T02:00:00Z'),
          remakeFromOrderId: 'y',
          reshipFromOrderId: null,
        },
        {
          id: 'c',
          amountTotal: 300,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-03T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
        {
          id: 'd',
          amountTotal: 0,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-03T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.orderOnline).toBe(300);
    expect(r.grossTotal).toBe(300);
  });

  it('补剂与定制食谱分别计入，退款冲减并区分历史订单退款', async () => {
    const prisma: any = makePrisma({
      supplements: [
        {
          id: 's1',
          amountTotal: 400,
          paidAt: utc('2026-11-04T02:00:00Z'),
        },
      ],
      customRecipes: [
        {
          id: 'c1',
          actualPaidAmount: 299,
          amount: 300,
          paymentConfirmedAt: utc('2026-11-04T03:00:00Z'),
        },
      ],
      orderRefunds: [
        {
          amount: 50,
          success: true,
          order: { paidAt: utc('2026-10-20T03:00:00Z') },
        },
        {
          amount: 20,
          success: true,
          order: { paidAt: utc('2026-11-01T03:00:00Z') },
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.supplement).toBe(400);
    expect(r.customRecipe).toBe(299);
    expect(r.grossTotal).toBe(699);
    expect(r.refundTotal).toBe(70);
    expect(r.historicalRefundTotal).toBe(50);
    expect(r.netTotal).toBe(629);
  });

  it('补剂退款冲减收入，手续费按线上基数计', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          amountTotal: 1000,
          paymentMethod: 'WECHAT_PAY',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      supplements: [
        {
          id: 's1',
          amountTotal: 400,
          paidAt: utc('2026-11-04T02:00:00Z'),
          refundAmount: 100,
          refundedAt: utc('2026-11-06T02:00:00Z'),
          paymentMethod: 'WECHAT_PAY',
        },
      ],
      orderRefunds: [
        {
          amount: 500,
          success: true,
          order: { paidAt: utc('2026-11-02T02:00:00Z') },
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.supplement).toBe(400);
    expect(r.refundTotal).toBe(600);
    // (1000 订单 + 400 补剂 − 500 订单退款 − 100 补剂退款) × 0.006 = 4.8
    expect(r.fee).toBe(4.8);
    expect(r.netTotal).toBe(800);
  });

  it('线下退款登记计入退款、区分历史退款，且不冲回手续费', async () => {
    const prisma: any = makePrisma({
      orders: [
        {
          id: 'o1',
          amountTotal: 200,
          paymentMethod: 'OFFLINE_WECHAT',
          paidAt: utc('2026-11-02T02:00:00Z'),
          remakeFromOrderId: null,
          reshipFromOrderId: null,
        },
      ],
      offlineRefunds: [
        {
          amount: 30,
          refundedAt: sh('2026-11-05T00:00:00'),
          order: { paidAt: utc('2026-11-02T02:00:00Z') },
        },
        {
          amount: 50,
          refundedAt: sh('2026-11-06T00:00:00'),
          order: { paidAt: utc('2026-10-20T02:00:00Z') },
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.orderOffline).toBe(200);
    expect(r.refundTotal).toBe(80);
    expect(r.historicalRefundTotal).toBe(50);
    expect(r.netTotal).toBe(120);
    expect(r.fee).toBe(0);
  });

  it('定制食谱赠送单不计收入，实收缺失时用报价，线下渠道不收手续费', async () => {
    const prisma: any = makePrisma({
      customRecipes: [
        {
          id: 'gift',
          amount: 299,
          actualPaidAmount: null,
          isGift: true,
          paymentChannel: null,
          paymentConfirmedAt: utc('2026-11-04T03:00:00Z'),
        },
        {
          id: 'offline',
          amount: 199,
          actualPaidAmount: 180,
          isGift: false,
          paymentChannel: 'OFFLINE_WECHAT',
          paymentConfirmedAt: utc('2026-11-05T03:00:00Z'),
        },
        {
          id: 'online',
          amount: 300,
          actualPaidAmount: null,
          isGift: false,
          paymentChannel: 'WECHAT_ONLINE',
          paymentConfirmedAt: utc('2026-11-06T03:00:00Z'),
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.customRecipe).toBe(480);
    expect(r.grossTotal).toBe(480);
    // 只有 300 的线上定制食谱计手续费
    expect(r.fee).toBe(1.8);
  });

  it('补剂历史订单退款单独归集，并按线上退款冲回手续费', async () => {
    const prisma: any = makePrisma({
      supplements: [],
      supplementRefunds: [
        {
          id: 's-old',
          refundAmount: 60,
          refundedAt: utc('2026-11-07T02:00:00Z'),
          paidAt: utc('2026-10-10T02:00:00Z'),
          paymentMethod: 'WECHAT_PAY',
        },
      ],
    });

    const r = await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    expect(r.supplement).toBe(0);
    expect(r.refundTotal).toBe(60);
    expect(r.historicalRefundTotal).toBe(60);
    expect(r.netTotal).toBe(-60);
    expect(r.fee).toBe(-0.36);
  });

  it('把期间与排除条件下推到查询，而不是全表捞回内存过滤', async () => {
    const prisma: any = makePrisma();
    await new FinanceIncomeService(prisma).getIncome(period, 0.006);

    const orderWhere = prisma.order.findMany.mock.calls[0][0].where;
    expect(orderWhere).toMatchObject({
      paidAt: { gte: period.from, lte: period.to },
      amountTotal: { gt: 0 },
      remakeFromOrderId: null,
      reshipFromOrderId: null,
    });
    expect(orderWhere.OR).toEqual([
      { paymentMethod: null },
      { paymentMethod: { not: 'RESHIP' } },
    ]);

    const supplementCalls = prisma.supplementOrder.findMany.mock.calls;
    expect(supplementCalls[0][0].where).toMatchObject({
      paidAt: { gte: period.from, lte: period.to },
      amountTotal: { gt: 0 },
    });
    expect(supplementCalls[1][0].where).toMatchObject({
      refundedAt: { gte: period.from, lte: period.to },
      refundAmount: { gt: 0 },
    });

    expect(
      prisma.customRecipeOrder.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      paymentConfirmedAt: { gte: period.from, lte: period.to },
      isGift: false,
    });
    expect(
      prisma.orderRefundRecord.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      success: true,
      successTime: { gte: period.from, lte: period.to },
    });
    expect(
      prisma.orderOfflineRefund.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      voidedAt: null,
      refundedAt: { gte: period.from, lte: period.to },
    });
  });
});
