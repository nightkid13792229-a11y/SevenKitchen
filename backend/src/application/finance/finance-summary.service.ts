import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { FinanceFeeRateService } from './finance-fee-rate.service';
import {
  FinanceExpense,
  FinanceExpenseService,
} from './finance-expense.service';
import { FinanceIncome, FinanceIncomeService } from './finance-income.service';
import { FinancePeriod, monthRange, resolvePeriod } from './finance-period';

/** 首页/月报的期间参数：`month` 优先，否则用 `from`/`to`（都缺省 = 本月至今） */
export type FinanceSummaryQuery = {
  month?: string;
  from?: string;
  to?: string;
};

/**
 * 首页汇总。
 *
 * `range` 输出带 `+08:00` 的上海时区字符串（而不是 UTC 的 `Z`）：
 * 小程序直接把「2026-11-01T00:00:00.000+08:00」显示成 11 月 1 日即可，
 * 不用自己再做一次时区换算。
 */
export type FinanceSummary = {
  range: { from: string; to: string };
  income: FinanceIncome;
  expense: FinanceExpense;
  balance: number;
  pendingOfflineConfirmCount: number;
};

/** 上海时区 ISO 字符串（带 +08:00），毫秒精度与 Prisma 的 Date 对齐 */
function toShanghaiIso(input: Date): string {
  const shifted = new Date(input.getTime() + 8 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 23)}+08:00`;
}

/** 金额保留两位小数，避免浮点尾差进到接口 */
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * 财务首页汇总：收入、支出、结余（收入净额 − 支出）、线下待确认收款数。
 *
 * 收入与支出各自的口径完全交给 Task 3/4 的服务，本服务只负责：
 * 1. 定期间（月 → `monthRange`，否则 `resolvePeriod`）；
 * 2. 取固定费率算收入，再把收入侧算出的手续费传给支出；
 * 3. 两数相减得到结余，并统计线下待确认收款。
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly incomeService: FinanceIncomeService,
    private readonly expenseService: FinanceExpenseService,
    private readonly prisma: PrismaService,
    private readonly feeRateService: FinanceFeeRateService,
  ) {}

  async getSummary(
    query: FinanceSummaryQuery = {},
    now: Date = new Date(),
  ): Promise<FinanceSummary> {
    const period = this.resolveQueryPeriod(query, now);
    const feeRate = await this.feeRateService.getFeeRate();

    // 待确认收款与收入聚合互不依赖，并行取数
    const [income, pendingOfflineConfirmCount] = await Promise.all([
      this.incomeService.getIncome(period, feeRate),
      this.countPendingOfflineConfirm(),
    ]);
    const expense = await this.expenseService.getExpense(period, income.fee);

    return {
      range: {
        from: toShanghaiIso(period.from),
        to: toShanghaiIso(period.to),
      },
      income,
      expense,
      balance: roundMoney(income.netTotal - expense.total),
      pendingOfflineConfirmCount,
    };
  }

  private resolveQueryPeriod(
    query: FinanceSummaryQuery,
    now: Date,
  ): FinancePeriod {
    if (query?.month) return monthRange(query.month);
    return resolvePeriod(query?.from, query?.to, now);
  }

  /**
   * 线下收款待确认：**代客下单**、还没登记 `paidAt`、也没取消的订单数。
   *
   * 不能按 `paymentMethod ∈ OFFLINE_*` 过滤：代客下单关掉「已收款」时
   * 订单的 `paymentMethod` 就是 null，恰好把最该提醒的那批单漏掉。
   * 代客单的身份以审计日志 `ASSISTED_ORDER` 为准。
   */
  private countPendingOfflineConfirm(): Promise<number> {
    return this.prisma.order.count({
      where: {
        paidAt: null,
        cancelledAt: null,
        operationLogs: { some: { action: 'ASSISTED_ORDER' } },
      },
    });
  }
}
