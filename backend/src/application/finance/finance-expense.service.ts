import { Injectable } from '@nestjs/common';
import type { ExpenseBillStatus } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import {
  FINANCE_EXPENSE_CATEGORY_LABELS,
  FinanceExpenseCategory,
} from './finance-categories';
import { FinancePeriod } from './finance-period';

/**
 * 支出汇总（元）。
 *
 * 只有五个来源：采购单实付、订单真实快递费、固定费用账单、支付手续费、手工支出。
 * 订单本身不产生支出——食材成本在采购那一步已经花了（设计文档 §4.4）。
 */
export type FinanceExpenseCategoryAmount = {
  category: FinanceExpenseCategory;
  label: string;
  amount: number;
};

export type FinanceExpense = {
  total: number;
  byCategory: FinanceExpenseCategoryAmount[];
};

/** 草稿与已取消的账单不计支出（其余状态：待付/部分付/已付都算）。 */
const NON_EXPENSE_BILL_STATUSES: ExpenseBillStatus[] = ['DRAFT', 'CANCELLED'];

/** 采购商品行类型 → 支出分类 */
const PURCHASE_ITEM_CATEGORY: Record<string, FinanceExpenseCategory> = {
  FOOD: 'RAW_MATERIAL',
  SUPPLEMENT: 'SUPPLEMENT',
  PACKAGING: 'PACKAGING_SUPPLIES',
};

/** 采购分摊用的明细行：商品行按类型归并，运费/包装费单独成行 */
type ExpenseLine = {
  category: FinanceExpenseCategory;
  weightCents: number;
  /** 非商品行（运费/包装费），个人消费优先从这些行冲减 */
  isExtra: boolean;
};

/** Prisma Decimal / null 统一转成整数分，四舍五入到分 */
function toCents(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** 整数分转元，保证接口只出现两位小数 */
function centsToMoney(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

/** 上海日历月 `YYYY-MM`（账单日期是 date-only，加 8 小时后仍是同一天） */
function monthKey(input: Date): string {
  return TimezoneUtil.shanghaiDateKey(input).slice(0, 7);
}

function monthIndex(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + (month - 1);
}

function monthKeyFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** 首尾日期（含）覆盖到的所有上海日历月 */
function monthKeysBetween(from: Date, to: Date): string[] {
  const start = monthIndex(monthKey(from));
  const end = monthIndex(monthKey(to));
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, offset) =>
    monthKeyFromIndex(start + offset),
  );
}

/** 把整数分按权重拆分，余数按小数部分从大到小补，保证各项相加等于 total */
function allocateCents(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalCents <= 0 || weightSum <= 0) return weights.map(() => 0);

  const quotas = weights.map((weight) => (totalCents * weight) / weightSum);
  const shares = quotas.map((quota) => Math.floor(quota));
  const remainder = totalCents - shares.reduce((sum, share) => sum + share, 0);

  const order = quotas
    .map((quota, index) => ({ index, fraction: quota - shares[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i += 1) {
    shares[order[i % order.length].index] += 1;
  }
  return shares;
}

function addCents(
  bucket: Map<FinanceExpenseCategory, number>,
  category: FinanceExpenseCategory,
  cents: number,
): void {
  if (cents === 0) return;
  bucket.set(category, (bucket.get(category) ?? 0) + cents);
}

/**
 * 支出聚合：按业务源表实时取数，按分类累加。
 *
 * 所有期间与排除条件都写在 `where` 里；采购的分摊在内存里按分计算，
 * 保证「合计 = 各分类相加」且不出现浮点尾巴。
 */
@Injectable()
export class FinanceExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async getExpense(
    period: FinancePeriod,
    fee: number,
  ): Promise<FinanceExpense> {
    const bucket = new Map<FinanceExpenseCategory, number>();

    await Promise.all([
      this.addPurchaseExpenses(period, bucket),
      this.addShippingExpenses(period, bucket),
      this.addBillExpenses(period, bucket),
      this.addManualExpenses(period, bucket),
    ]);

    // 支付手续费由收入侧算好后传进来，可以为负（退款冲回）
    addCents(bucket, 'PAYMENT_FEE', toCents(fee));

    const byCategory = Array.from(bucket.entries())
      .map(([category, cents]) => ({
        category,
        label: FINANCE_EXPENSE_CATEGORY_LABELS[category] ?? category,
        amount: centsToMoney(cents),
      }))
      .filter((row) => row.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

    return {
      total: centsToMoney(
        Array.from(bucket.values()).reduce((sum, cents) => sum + cents, 0),
      ),
      byCategory,
    };
  }

  /**
   * 采购支出：实付 − 个人消费；实付为空时按
   * `小计 + 运费 + 包装费 − 优惠` 兜底。
   *
   * 商品行按 `type` 的 `estimatedCost` 占比拆到食材/补剂/包材，运费归物流、
   * 包装费归包材；优惠体现在「实付小于各明细行之和」的差额里，按行占比摊减。
   */
  private async addPurchaseExpenses(
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): Promise<void> {
    const lists = await this.prisma.purchaseList.findMany({
      where: {
        isDraft: false,
        voidedAt: null,
        // 归月用 completedAt ?? createdAt；completedAt 为空时退回 createdAt
        OR: [
          { completedAt: { gte: period.from, lte: period.to } },
          {
            completedAt: null,
            createdAt: { gte: period.from, lte: period.to },
          },
        ],
      },
      select: {
        paidAmount: true,
        personalAmount: true,
        subtotalAmount: true,
        shippingFee: true,
        packagingFee: true,
        discountAmount: true,
        items: { select: { type: true, estimatedCost: true } },
      },
    });

    for (const list of lists) {
      const grossCents =
        list.paidAmount != null
          ? toCents(list.paidAmount)
          : toCents(list.subtotalAmount) +
            toCents(list.shippingFee) +
            toCents(list.packagingFee) -
            toCents(list.discountAmount);
      const personalCents = toCents(list.personalAmount);

      // 四项都缺（且没有实付）时按 0 计，不产生支出行
      if (grossCents <= 0 || grossCents <= personalCents) continue;

      const itemWeights = new Map<FinanceExpenseCategory, number>();
      for (const item of list.items) {
        const category = this.resolvePurchaseItemCategory(item.type);
        itemWeights.set(
          category,
          (itemWeights.get(category) ?? 0) + toCents(item.estimatedCost),
        );
      }

      const lines: ExpenseLine[] = Array.from(itemWeights.entries())
        .filter(([, weightCents]) => weightCents > 0)
        .map(([category, weightCents]) => ({
          category,
          weightCents,
          isExtra: false,
        }));

      const shippingCents = toCents(list.shippingFee);
      if (shippingCents > 0) {
        lines.push({
          category: 'LOGISTICS_DELIVERY',
          weightCents: shippingCents,
          isExtra: true,
        });
      }
      const packagingCents = toCents(list.packagingFee);
      if (packagingCents > 0) {
        lines.push({
          category: 'PACKAGING_SUPPLIES',
          weightCents: packagingCents,
          isExtra: true,
        });
      }

      // 有实付却没有任何明细行：按食材采购兜底，避免金额凭空消失
      if (lines.length === 0) {
        lines.push({
          category: 'RAW_MATERIAL',
          weightCents: grossCents,
          isExtra: false,
        });
      }

      const shares = allocateCents(
        grossCents,
        lines.map((line) => line.weightCents),
      );

      // 个人消费先从运费/包装费冲减，不足部分再按占比冲减商品行：
      // 商品行代表货物本身的成本，个人消费不应改变公司为货物付的钱。
      let personalLeft = personalCents;
      for (let i = 0; i < lines.length && personalLeft > 0; i += 1) {
        if (!lines[i].isExtra) continue;
        const deduction = Math.min(shares[i], personalLeft);
        shares[i] -= deduction;
        personalLeft -= deduction;
      }
      if (personalLeft > 0) {
        const itemIndexes = lines
          .map((line, index) => (line.isExtra ? -1 : index))
          .filter((index) => index >= 0);
        const deductions = allocateCents(
          personalLeft,
          itemIndexes.map((index) => shares[index]),
        );
        itemIndexes.forEach((index, offset) => {
          shares[index] -= deductions[offset];
        });
      }

      lines.forEach((line, index) => {
        addCents(bucket, line.category, shares[index]);
      });
    }
  }

  /** 历史日采明细没有 type，按食材处理；未知类型不硬塞进食材 */
  private resolvePurchaseItemCategory(
    type: string | null | undefined,
  ): FinanceExpenseCategory {
    const key = (type ?? '').trim().toUpperCase();
    if (!key) return 'RAW_MATERIAL';
    return PURCHASE_ITEM_CATEGORY[key] ?? 'OTHER';
  }

  /** 订单真实快递费：按发货时间归月，取人工录入的 `actualShippingFee` */
  private async addShippingExpenses(
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        shippedAt: { gte: period.from, lte: period.to },
        actualShippingFee: { not: null },
      },
      select: { actualShippingFee: true },
    });

    for (const order of orders) {
      addCents(bucket, 'LOGISTICS_DELIVERY', toCents(order.actualShippingFee));
    }
  }

  /**
   * 固定费用：按服务期月数平均分摊到每个月，取与本期间重叠月份之和。
   * 例如 1200 元、12 个月的账单，任意一个月看到的就是 100 元。
   */
  private async addBillExpenses(
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): Promise<void> {
    const bills = await this.prisma.expenseBill.findMany({
      where: {
        status: { notIn: NON_EXPENSE_BILL_STATUSES },
        recognitionStart: { lte: period.to },
        recognitionEnd: { gte: period.from },
      },
      select: {
        amount: true,
        category: true,
        recognitionStart: true,
        recognitionEnd: true,
      },
    });

    const periodMonths = new Set(monthKeysBetween(period.from, period.to));

    for (const bill of bills) {
      const serviceMonths = monthKeysBetween(
        bill.recognitionStart,
        bill.recognitionEnd,
      );
      if (serviceMonths.length === 0) continue;

      const amountCents = toCents(bill.amount);
      const sign = amountCents < 0 ? -1 : 1;
      const absCents = Math.abs(amountCents);
      const base = Math.floor(absCents / serviceMonths.length);
      const remainder = absCents - base * serviceMonths.length;

      serviceMonths.forEach((key, index) => {
        if (!periodMonths.has(key)) return;
        const share = base + (index < remainder ? 1 : 0);
        addCents(bucket, bill.category, sign * share);
      });
    }
  }

  /** 一次性手工支出：发生日落在期间、未作废，按类别归集 */
  private async addManualExpenses(
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): Promise<void> {
    const entries = await this.prisma.financeManualEntry.findMany({
      where: {
        direction: 'EXPENSE',
        voidedAt: null,
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: { amount: true, category: true },
    });

    for (const entry of entries) {
      addCents(bucket, entry.category ?? 'OTHER', toCents(entry.amount));
    }
  }
}
