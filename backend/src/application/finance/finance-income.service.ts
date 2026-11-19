import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { OFFLINE_PAYMENT_METHODS } from './finance-categories';
import { computeFeeAmount } from './finance-fee';
import { FINANCE_START_DATE, FinancePeriod } from './finance-period';

/**
 * 收入汇总（元）。
 *
 * `supplement` / `customRecipe` 各自只有一个数，但计手续费时只取其中的线上部分；
 * `refundTotal` 含历史订单退款，`historicalRefundTotal` 是其中「原订单付款早于起账日」
 * 的那部分，供报表单独列示。
 */
export type FinanceIncome = {
  orderOnline: number;
  orderOffline: number;
  supplement: number;
  customRecipe: number;
  grossTotal: number;
  refundTotal: number;
  historicalRefundTotal: number;
  netTotal: number;
  fee: number;
};

/** 线下收款方式：钱进个人账户，不产生微信手续费 */
const OFFLINE_METHODS: readonly string[] = OFFLINE_PAYMENT_METHODS;

/** 起账日 00:00（上海时间）；付款早于这一刻的订单，其退款算历史退款 */
const FINANCE_START_AT = new Date(
  `${FINANCE_START_DATE}T00:00:00+08:00`,
).getTime();

function isOfflinePayment(method: string | null | undefined): boolean {
  return method != null && OFFLINE_METHODS.includes(method);
}

/** Prisma Decimal / null 统一转成有限数字 */
function toAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

/** 汇总金额保留两位小数，避免浮点尾差出现在接口里 */
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isHistoricalPaidAt(paidAt: Date | null | undefined): boolean {
  return paidAt != null && paidAt.getTime() < FINANCE_START_AT;
}

/**
 * 收入聚合：订单 / 补剂 / 定制食谱三类来源，退款按成功日冲减当月，
 * 手续费只对线上实收与线上退款轧差后计一次。
 *
 * 所有期间与排除条件都写在 `where` 里；`select` 只取聚合需要的列。
 */
@Injectable()
export class FinanceIncomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getIncome(
    period: FinancePeriod,
    feeRate: number,
  ): Promise<FinanceIncome> {
    const [
      orders,
      supplements,
      customRecipes,
      orderRefunds,
      offlineRefunds,
      supplementRefunds,
    ] = await Promise.all([
      this.loadOrders(period),
      this.loadSupplements(period),
      this.loadCustomRecipes(period),
      this.loadOrderRefunds(period),
      this.loadOfflineRefunds(period),
      this.loadSupplementRefunds(period),
    ]);

    let orderOnline = 0;
    let orderOffline = 0;
    let supplement = 0;
    let customRecipe = 0;
    /** 线上实收基数（只用于手续费，不单独出现在返回值里） */
    let onlinePaid = 0;

    for (const order of orders) {
      // 0 元单、重做单、补发单、RESHIP 不进收入。条件已下推到 SQL，
      // 这里再兜一层：聚合层的口径不依赖调用方是否完整执行了 where。
      if (order.paymentMethod === 'RESHIP') continue;
      if (order.remakeFromOrderId != null) continue;
      if (order.reshipFromOrderId != null) continue;
      const amount = toAmount(order.amountTotal);
      if (amount <= 0) continue;
      if (isOfflinePayment(order.paymentMethod)) {
        orderOffline += amount;
      } else {
        orderOnline += amount;
        onlinePaid += amount;
      }
    }

    for (const row of supplements) {
      if (row.paymentMethod === 'RESHIP') continue;
      const amount = toAmount(row.amountTotal);
      if (amount <= 0) continue;
      supplement += amount;
      if (!isOfflinePayment(row.paymentMethod)) onlinePaid += amount;
    }

    for (const row of customRecipes) {
      if (row.isGift) continue;
      // 老订单可能只有报价、没有实收；按 `actualPaidAmount ?? amount` 取
      const amount = toAmount(row.actualPaidAmount ?? row.amount);
      if (amount <= 0) continue;
      customRecipe += amount;
      if (!isOfflinePayment(row.paymentChannel)) onlinePaid += amount;
    }

    let refundTotal = 0;
    let historicalRefundTotal = 0;
    /** 线上退款基数：只冲回微信原路退款与线上补剂退款 */
    let onlineRefunded = 0;

    for (const refund of orderRefunds) {
      if (refund.success === false) continue;
      const amount = toAmount(refund.amount);
      if (amount <= 0) continue;
      refundTotal += amount;
      // `OrderRefundRecord` 记的是微信原路退回，必然属于线上收款
      onlineRefunded += amount;
      if (isHistoricalPaidAt(refund.order?.paidAt)) {
        historicalRefundTotal += amount;
      }
    }

    for (const refund of offlineRefunds) {
      if (refund.voidedAt != null) continue;
      const amount = toAmount(refund.amount);
      if (amount <= 0) continue;
      refundTotal += amount;
      // 线下转账退款没有撤销微信支付，手续费不退（设计文档 §4.3）
      if (isHistoricalPaidAt(refund.order?.paidAt)) {
        historicalRefundTotal += amount;
      }
    }

    for (const refund of supplementRefunds) {
      const amount = toAmount(refund.refundAmount);
      if (amount <= 0) continue;
      refundTotal += amount;
      if (!isOfflinePayment(refund.paymentMethod)) onlineRefunded += amount;
      if (isHistoricalPaidAt(refund.paidAt)) {
        historicalRefundTotal += amount;
      }
    }

    orderOnline = roundMoney(orderOnline);
    orderOffline = roundMoney(orderOffline);
    supplement = roundMoney(supplement);
    customRecipe = roundMoney(customRecipe);
    refundTotal = roundMoney(refundTotal);
    historicalRefundTotal = roundMoney(historicalRefundTotal);

    const grossTotal = roundMoney(
      orderOnline + orderOffline + supplement + customRecipe,
    );
    const netTotal = roundMoney(grossTotal - refundTotal);

    return {
      orderOnline,
      orderOffline,
      supplement,
      customRecipe,
      grossTotal,
      refundTotal,
      historicalRefundTotal,
      netTotal,
      fee: computeFeeAmount(
        roundMoney(onlinePaid),
        roundMoney(onlineRefunded),
        feeRate,
      ),
    };
  }

  private loadOrders(period: FinancePeriod) {
    return this.prisma.order.findMany({
      where: {
        paidAt: { gte: period.from, lte: period.to },
        amountTotal: { gt: 0 },
        remakeFromOrderId: null,
        reshipFromOrderId: null,
        // 补发/赠送单不计收入；null 的历史数据按正常单处理（不能因为 NOT 丢掉）
        OR: [{ paymentMethod: null }, { paymentMethod: { not: 'RESHIP' } }],
      },
      select: {
        amountTotal: true,
        paymentMethod: true,
        remakeFromOrderId: true,
        reshipFromOrderId: true,
      },
    });
  }

  private loadSupplements(period: FinancePeriod) {
    return this.prisma.supplementOrder.findMany({
      where: {
        paidAt: { gte: period.from, lte: period.to },
        amountTotal: { gt: 0 },
        OR: [{ paymentMethod: null }, { paymentMethod: { not: 'RESHIP' } }],
      },
      select: {
        amountTotal: true,
        paymentMethod: true,
      },
    });
  }

  private loadCustomRecipes(period: FinancePeriod) {
    return this.prisma.customRecipeOrder.findMany({
      where: {
        paymentConfirmedAt: { gte: period.from, lte: period.to },
        isGift: false,
        OR: [
          { actualPaidAmount: { gt: 0 } },
          { actualPaidAmount: null, amount: { gt: 0 } },
        ],
      },
      select: {
        amount: true,
        actualPaidAmount: true,
        paymentChannel: true,
        isGift: true,
      },
    });
  }

  private loadOrderRefunds(period: FinancePeriod) {
    return this.prisma.orderRefundRecord.findMany({
      where: {
        success: true,
        successTime: { gte: period.from, lte: period.to },
        amount: { gt: 0 },
      },
      select: {
        amount: true,
        success: true,
        order: { select: { paidAt: true } },
      },
    });
  }

  private loadOfflineRefunds(period: FinancePeriod) {
    return this.prisma.orderOfflineRefund.findMany({
      where: {
        voidedAt: null,
        refundedAt: { gte: period.from, lte: period.to },
        amount: { gt: 0 },
      },
      select: {
        amount: true,
        voidedAt: true,
        order: { select: { paidAt: true } },
      },
    });
  }

  private loadSupplementRefunds(period: FinancePeriod) {
    return this.prisma.supplementOrder.findMany({
      where: {
        refundedAt: { gte: period.from, lte: period.to },
        refundAmount: { gt: 0 },
      },
      select: {
        refundAmount: true,
        paidAt: true,
        paymentMethod: true,
      },
    });
  }
}
