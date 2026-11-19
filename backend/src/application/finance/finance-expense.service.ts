import { Injectable } from '@nestjs/common';
import type { ExpenseBillStatus, Prisma } from '@prisma/client';
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

/** 采购取数的最小字段（两种采购单共用一次查询，再按 kind 分流） */
const PURCHASE_LIST_SELECT = {
  kind: true,
  paidAmount: true,
  personalAmount: true,
  subtotalAmount: true,
  shippingFee: true,
  packagingFee: true,
  discountAmount: true,
  items: { select: { id: true, type: true, estimatedCost: true } },
  records: {
    select: { purchaseItemId: true, actualCost: true, purchasedAt: true },
  },
} satisfies Prisma.PurchaseListSelect;

type PurchaseListRow = Prisma.PurchaseListGetPayload<{
  select: typeof PURCHASE_LIST_SELECT;
}>;

/** 采购分摊用的明细行：商品行按类型归并，运费/包装费单独成行 */
type ExpenseLine = {
  category: FinanceExpenseCategory;
  weightCents: number;
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
      .sort(
        (a, b) =>
          b.amount - a.amount || a.label.localeCompare(b.label, 'zh-CN'),
      );

    return {
      total: centsToMoney(
        Array.from(bucket.values()).reduce((sum, cents) => sum + cents, 0),
      ),
      byCategory,
    };
  }

  /**
   * 采购支出：两种采购单用同一批排除条件取回，再按 `kind` 分流，
   * 同一条单只会走一条路，不会把实付和采购记录重复相加。
   *
   * - `STOCK_REPLENISHMENT`：按单据实付，归月用 `orderPlacedAt ?? completedAt ?? createdAt`
   * - `ORDER_DEMAND`：按 `PurchaseRecord.actualCost` 之和，归月用各记录的 `purchasedAt`
   */
  private async addPurchaseExpenses(
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): Promise<void> {
    const lists = await this.prisma.purchaseList.findMany({
      where: {
        isDraft: false,
        voidedAt: null,
        OR: [
          {
            kind: 'STOCK_REPLENISHMENT',
            // 钱一般在下单那天付的，没有下单时间再退回完成/创建时间
            OR: [
              { orderPlacedAt: { gte: period.from, lte: period.to } },
              {
                orderPlacedAt: null,
                completedAt: { gte: period.from, lte: period.to },
              },
              {
                orderPlacedAt: null,
                completedAt: null,
                createdAt: { gte: period.from, lte: period.to },
              },
            ],
          },
          {
            kind: 'ORDER_DEMAND',
            records: {
              some: { purchasedAt: { gte: period.from, lte: period.to } },
            },
          },
        ],
      },
      select: PURCHASE_LIST_SELECT,
    });

    for (const list of lists) {
      if (list.kind === 'ORDER_DEMAND') {
        this.addDailyPurchaseExpense(list, period, bucket);
      } else {
        this.addReplenishmentExpense(list, bucket);
      }
    }
  }

  /**
   * 补货单：金额 = 实付 − 个人消费；实付为空时按
   * `小计 + 运费 + 包装费 − 优惠` 兜底。
   *
   * 可分摊额 base 已扣掉个人消费，再按「商品行 + 实际运费 + 实际包装费」的
   * 权重整体摊到各行：优惠自然按行占比摊减；个人消费不专项冲减运费/包装费。
   * base 小于运费与包装费合计时，按权重摊分只会同比例调小，不会出现负数。
   */
  private addReplenishmentExpense(
    list: PurchaseListRow,
    bucket: Map<FinanceExpenseCategory, number>,
  ): void {
    const grossCents =
      list.paidAmount != null
        ? toCents(list.paidAmount)
        : toCents(list.subtotalAmount) +
          toCents(list.shippingFee) +
          toCents(list.packagingFee) -
          toCents(list.discountAmount);
    const baseCents = grossCents - toCents(list.personalAmount);

    // 四项都缺（且没有实付）时按 0 计，不产生支出行
    if (grossCents <= 0 || baseCents <= 0) return;

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
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, weightCents]) => ({ category, weightCents }));

    const shippingCents = toCents(list.shippingFee);
    if (shippingCents > 0) {
      lines.push({
        category: 'LOGISTICS_DELIVERY',
        weightCents: shippingCents,
      });
    }
    const packagingCents = toCents(list.packagingFee);
    if (packagingCents > 0) {
      lines.push({
        category: 'PACKAGING_SUPPLIES',
        weightCents: packagingCents,
      });
    }

    // 有实付却没有任何明细行：按食材采购兜底，避免金额凭空消失
    if (lines.length === 0) {
      lines.push({ category: 'RAW_MATERIAL', weightCents: baseCents });
    }

    const shares = allocateCents(
      baseCents,
      lines.map((line) => line.weightCents),
    );
    lines.forEach((line, index) => {
      addCents(bucket, line.category, shares[index]);
    });
  }

  /**
   * 日采单：订单需求采购只有采购记录、没有单据级实付，
   * 金额取各条 `PurchaseRecord.actualCost` 之和，按对应商品行的 `type` 归类。
   *
   * `PurchaseRecord` 没有作废字段，作废以采购单 `voidedAt` 为准（查询已排除）。
   */
  private addDailyPurchaseExpense(
    list: PurchaseListRow,
    period: FinancePeriod,
    bucket: Map<FinanceExpenseCategory, number>,
  ): void {
    const itemTypes = new Map(
      list.items.map((item) => [item.id, item.type] as const),
    );
    const categoryCents = new Map<FinanceExpenseCategory, number>();

    for (const record of list.records) {
      // mock 不执行 where 时兜底过滤；真实查询已下推
      if (
        record.purchasedAt.getTime() < period.from.getTime() ||
        record.purchasedAt.getTime() > period.to.getTime()
      ) {
        continue;
      }
      const category = this.resolvePurchaseItemCategory(
        itemTypes.get(record.purchaseItemId),
      );
      categoryCents.set(
        category,
        (categoryCents.get(category) ?? 0) + toCents(record.actualCost),
      );
    }

    const categories = Array.from(categoryCents.entries())
      .filter(([, cents]) => cents > 0)
      .sort(([left], [right]) => left.localeCompare(right));
    const totalCents = categories.reduce((sum, [, cents]) => sum + cents, 0);
    const baseCents = totalCents - toCents(list.personalAmount);

    if (totalCents <= 0 || baseCents <= 0) return;

    const shares = allocateCents(
      baseCents,
      categories.map(([, cents]) => cents),
    );
    categories.forEach(([category], index) => {
      addCents(bucket, category, shares[index]);
    });
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
   *
   * 说明：这里按 `recognitionStart/End` 触及的自然月数分摊，而不是模板的
   * `servicePeriodMonths`。模板生成的账单对齐月末，两者目前一致；
   * 若将来出现月中生效/月中失效的账单，再单独处理（本期不改逻辑）。
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
