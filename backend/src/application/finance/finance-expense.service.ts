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
export const NON_EXPENSE_BILL_STATUSES: ExpenseBillStatus[] = [
  'DRAFT',
  'CANCELLED',
];

/** 采购商品行类型 → 支出分类 */
export const PURCHASE_ITEM_CATEGORY: Record<string, FinanceExpenseCategory> = {
  FOOD: 'RAW_MATERIAL',
  SUPPLEMENT: 'SUPPLEMENT',
  PACKAGING: 'PACKAGING_SUPPLIES',
};

/** 采购取数的最小字段（两种采购单共用一次查询，再按 kind 分流） */
export const PURCHASE_LIST_SELECT = {
  id: true,
  kind: true,
  orderNo: true,
  orderPlacedAt: true,
  completedAt: true,
  createdAt: true,
  payerType: true,
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

export type PurchaseListRow = Prisma.PurchaseListGetPayload<{
  select: typeof PURCHASE_LIST_SELECT;
}>;

/**
 * 支出明细行：一条 = 汇总里即将累加的一笔。
 *
 * 汇总服务把同一批行按分类累加，明细服务直接把行映射成 `FinanceEntry`，
 * 两边共用 `loadXxxExpenseLines`，所以「明细相加 = 汇总」是构造上成立的，
 * 不靠两套代码各算一遍再对账。
 */
export type FinanceExpenseLine = {
  /** 支出分类（同时是明细行的 category） */
  category: FinanceExpenseCategory;
  /** 金额（整数分，带符号；账单允许负数） */
  amountCents: number;
  /** 归月日期：采购按下单/采购时间，快递按发货时间，账单按服务月，手工按发生日 */
  occurredAt: Date;
  sourceType: 'PURCHASE' | 'SHIPPING' | 'BILL' | 'MANUAL';
  sourceId: string;
  sourceNo?: string;
  /** 人话标题，明细页直接显示 */
  title: string;
  payerType?: 'COMPANY' | 'PERSONAL';
};

/** 支出侧取数用到的 Prisma 委托（便于单测直接传 mock） */
type ExpensePrisma = Pick<
  PrismaService,
  'purchaseList' | 'order' | 'expenseBill' | 'financeManualEntry'
>;

/** 采购分摊用的明细行：商品行按类型归并，运费/包装费单独成行 */
type ExpenseLine = {
  category: FinanceExpenseCategory;
  weightCents: number;
};

/** Prisma Decimal / null 统一转成整数分，四舍五入到分 */
export function toCents(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

/** 整数分转元，保证接口只出现两位小数 */
export function centsToMoney(cents: number): number {
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
export function monthKeysBetween(from: Date, to: Date): string[] {
  const start = monthIndex(monthKey(from));
  const end = monthIndex(monthKey(to));
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, offset) =>
    monthKeyFromIndex(start + offset),
  );
}

/** 上海某月 1 日 00:00（返回 UTC 时刻） */
function startOfShanghaiMonth(key: string): Date {
  return new Date(`${key}-01T00:00:00+08:00`);
}

/** 把整数分按权重拆分，余数按小数部分从大到小补，保证各项相加等于 total */
export function allocateCents(totalCents: number, weights: number[]): number[] {
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

/** 补货采购的归月日期：下单日 → 完成日 → 创建日（与查询条件同序） */
function purchaseOccurredAt(list: PurchaseListRow): Date {
  return list.orderPlacedAt ?? list.completedAt ?? list.createdAt;
}

function purchaseTitle(list: PurchaseListRow): string {
  const label = list.kind === 'ORDER_DEMAND' ? '日采采购' : '补货采购';
  return list.orderNo ? `${label} ${list.orderNo}` : label;
}

function purchaseLine(
  list: PurchaseListRow,
  category: FinanceExpenseCategory,
  amountCents: number,
  occurredAt: Date,
): FinanceExpenseLine {
  return {
    category,
    amountCents,
    occurredAt,
    sourceType: 'PURCHASE',
    sourceId: list.id,
    sourceNo: list.orderNo ?? undefined,
    title: purchaseTitle(list),
    payerType: list.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
  };
}

/** 历史日采明细没有 type，按食材处理；未知类型不硬塞进食材 */
function resolvePurchaseItemCategory(
  type: string | null | undefined,
): FinanceExpenseCategory {
  const key = (type ?? '').trim().toUpperCase();
  if (!key) return 'RAW_MATERIAL';
  return PURCHASE_ITEM_CATEGORY[key] ?? 'OTHER';
}

/**
 * 金额、采购记录都拿不到的非草稿采购单：仍出一行 0 元占位，
 * 标题写明「金额缺失」，让老板能在明细里发现并补录（设计文档 Review Focus #4）。
 * 汇总侧 `addCents` 会跳过 0 元，所以不影响支出合计。
 */
function missingAmountPurchaseLine(list: PurchaseListRow): FinanceExpenseLine {
  const category =
    list.items.length > 0
      ? resolvePurchaseItemCategory(list.items[0].type)
      : 'OTHER';
  const line = purchaseLine(list, category, 0, purchaseOccurredAt(list));
  return { ...line, title: `${line.title}（金额缺失，请补录）` };
}

/**
 * 采购支出明细行：两种采购单按 kind 分流，同一张单只走一条路。
 *
 * - `STOCK_REPLENISHMENT`：`实付 − 个人消费` 按「商品行 + 运费 + 包装费」权重摊；
 *   实付为空时用 `小计 + 运费 + 包装费 − 优惠` 兜底；
 * - `ORDER_DEMAND`（以及拿不到单据金额的补货单）：按 `PurchaseRecord.actualCost`
 *   之和，按商品行类型归类，个人消费从合计里按权重摊减。
 *
 * 同一类别的多笔金额（例如包材商品行 + 包装费）合并成一行：
 * 明细的 id 是「单据 id + 类别」，同一来源同一类别必须只有一个行 key。
 */
export function buildPurchaseExpenseLines(
  list: PurchaseListRow,
  period: FinancePeriod,
): FinanceExpenseLine[] {
  const grossCents =
    list.paidAmount != null
      ? toCents(list.paidAmount)
      : toCents(list.subtotalAmount) +
        toCents(list.shippingFee) +
        toCents(list.packagingFee) -
        toCents(list.discountAmount);

  if (grossCents <= 0 || list.kind === 'ORDER_DEMAND') {
    const recordLines = buildPurchaseRecordLines(list, period);
    return recordLines.length > 0
      ? recordLines
      : [missingAmountPurchaseLine(list)];
  }

  const baseCents = grossCents - toCents(list.personalAmount);

  // 个人消费抵掉全部实付时不产生公司支出
  if (baseCents <= 0) return [];

  const occurredAt = purchaseOccurredAt(list);
  const itemWeights = new Map<FinanceExpenseCategory, number>();
  for (const item of list.items) {
    const category = resolvePurchaseItemCategory(item.type);
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

  // 包材商品行与包装费同属 PACKAGING_SUPPLIES，必须合并成一行（id 才不会重复）
  const mergedCents = new Map<FinanceExpenseCategory, number>();
  lines.forEach((line, index) => {
    mergedCents.set(
      line.category,
      (mergedCents.get(line.category) ?? 0) + shares[index],
    );
  });

  return Array.from(mergedCents.entries())
    .map(([category, cents]) => purchaseLine(list, category, cents, occurredAt))
    .filter((line) => line.amountCents !== 0);
}

/**
 * 按采购记录取数（日采单，以及缺单据实付的补货单）：
 * 金额取各条 `PurchaseRecord.actualCost` 之和，按对应商品行的 `type` 归类，
 * 记录按各自的 `purchasedAt` 归月，个人消费从商品合计里扣。
 *
 * `PurchaseRecord` 没有作废字段，作废以采购单 `voidedAt` 为准（查询已排除）。
 */
function buildPurchaseRecordLines(
  list: PurchaseListRow,
  period: FinancePeriod,
): FinanceExpenseLine[] {
  const itemTypes = new Map(
    list.items.map((item) => [item.id, item.type] as const),
  );
  const categoryCents = new Map<FinanceExpenseCategory, number>();
  const categoryLatestAt = new Map<FinanceExpenseCategory, Date>();

  for (const record of list.records) {
    // mock 不执行 where 时兜底过滤；真实查询已下推
    if (
      record.purchasedAt.getTime() < period.from.getTime() ||
      record.purchasedAt.getTime() > period.to.getTime()
    ) {
      continue;
    }
    const category = resolvePurchaseItemCategory(
      itemTypes.get(record.purchaseItemId),
    );
    categoryCents.set(
      category,
      (categoryCents.get(category) ?? 0) + toCents(record.actualCost),
    );
    const latest = categoryLatestAt.get(category);
    if (!latest || record.purchasedAt.getTime() > latest.getTime()) {
      categoryLatestAt.set(category, record.purchasedAt);
    }
  }

  const categories = Array.from(categoryCents.entries())
    .filter(([, cents]) => cents > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const totalCents = categories.reduce((sum, [, cents]) => sum + cents, 0);
  const baseCents = totalCents - toCents(list.personalAmount);

  if (totalCents <= 0 || baseCents <= 0) return [];

  const shares = allocateCents(
    baseCents,
    categories.map(([, cents]) => cents),
  );
  return categories
    .map(([category], index) =>
      purchaseLine(
        list,
        category,
        shares[index],
        categoryLatestAt.get(category) ?? purchaseOccurredAt(list),
      ),
    )
    .filter((line) => line.amountCents !== 0);
}

/** 采购支出：两种采购单用同一批排除条件取回，再按 `kind` 分流 */
export async function loadPurchaseExpenseLines(
  prisma: ExpensePrisma,
  period: FinancePeriod,
): Promise<FinanceExpenseLine[]> {
  const lists = await prisma.purchaseList.findMany({
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

  return lists.flatMap((list) => buildPurchaseExpenseLines(list, period));
}

/** 订单真实快递费的取数条件（汇总与明细共用） */
export const SHIPPING_EXPENSE_WHERE = (
  period: FinancePeriod,
): Prisma.OrderWhereInput => ({
  shippedAt: { gte: period.from, lte: period.to },
  actualShippingFee: { not: null },
});

/** 快递费取数的最小字段（多取 id/单号供明细展示） */
const SHIPPING_ORDER_SELECT = {
  id: true,
  orderNo: true,
  actualShippingFee: true,
  shippedAt: true,
} satisfies Prisma.OrderSelect;

/** 订单真实快递费：按发货时间归月，取人工录入的 `actualShippingFee` */
export async function loadShippingExpenseLines(
  prisma: ExpensePrisma,
  period: FinancePeriod,
): Promise<FinanceExpenseLine[]> {
  const orders = await prisma.order.findMany({
    where: SHIPPING_EXPENSE_WHERE(period),
    select: SHIPPING_ORDER_SELECT,
  });

  return orders
    .map((order): FinanceExpenseLine => {
      const orderNo = order.orderNo ?? undefined;
      return {
        category: 'LOGISTICS_DELIVERY',
        amountCents: toCents(order.actualShippingFee),
        occurredAt: order.shippedAt as Date,
        sourceType: 'SHIPPING',
        sourceId: order.id,
        sourceNo: orderNo,
        title: orderNo ? `订单快递费 ${orderNo}` : '订单快递费',
      };
    })
    .filter((line) => line.amountCents !== 0);
}

/** 固定费用账单取数的最小字段 */
const EXPENSE_BILL_SELECT = {
  id: true,
  billNumber: true,
  title: true,
  amount: true,
  category: true,
  recognitionStart: true,
  recognitionEnd: true,
  payerType: true,
} satisfies Prisma.ExpenseBillSelect;

type ExpenseBillRow = Prisma.ExpenseBillGetPayload<{
  select: typeof EXPENSE_BILL_SELECT;
}>;

/**
 * 固定费用按服务期月数平均分摊到每个月，取与本期间重叠月份之和。
 * 例如 1200 元、12 个月的账单，任意一个月看到的就是 100 元。
 */
export function buildBillExpenseLines(
  bill: ExpenseBillRow,
  period: FinancePeriod,
): FinanceExpenseLine[] {
  const serviceMonths = monthKeysBetween(
    bill.recognitionStart,
    bill.recognitionEnd,
  );
  if (serviceMonths.length === 0) return [];

  const periodMonths = new Set(monthKeysBetween(period.from, period.to));
  const amountCents = toCents(bill.amount);
  if (amountCents === 0) return [];
  const sign = amountCents < 0 ? -1 : 1;
  const absCents = Math.abs(amountCents);
  const base = Math.floor(absCents / serviceMonths.length);
  const remainder = absCents - base * serviceMonths.length;

  return serviceMonths.flatMap((key, index) => {
    if (!periodMonths.has(key)) return [];
    const share = base + (index < remainder ? 1 : 0);
    if (share === 0) return [];
    const monthStart = startOfShanghaiMonth(key);
    return [
      {
        category: bill.category,
        amountCents: sign * share,
        occurredAt:
          monthStart.getTime() < period.from.getTime()
            ? period.from
            : monthStart,
        sourceType: 'BILL' as const,
        sourceId: bill.id,
        sourceNo: bill.billNumber,
        title: bill.title,
        payerType:
          bill.payerType === 'COMPANY'
            ? ('COMPANY' as const)
            : ('PERSONAL' as const),
      },
    ];
  });
}

/** 固定费用支出：按 `recognitionStart/End` 与期间重叠的账单取数 */
export async function loadBillExpenseLines(
  prisma: ExpensePrisma,
  period: FinancePeriod,
): Promise<FinanceExpenseLine[]> {
  const bills = await prisma.expenseBill.findMany({
    where: {
      status: { notIn: NON_EXPENSE_BILL_STATUSES },
      recognitionStart: { lte: period.to },
      recognitionEnd: { gte: period.from },
    },
    select: EXPENSE_BILL_SELECT,
  });

  return bills.flatMap((bill) => buildBillExpenseLines(bill, period));
}

/** 手工支出取数的最小字段 */
const MANUAL_EXPENSE_SELECT = {
  id: true,
  amount: true,
  category: true,
  occurredAt: true,
  title: true,
  payerType: true,
} satisfies Prisma.FinanceManualEntrySelect;

type ManualEntryRow = Prisma.FinanceManualEntryGetPayload<{
  select: typeof MANUAL_EXPENSE_SELECT;
}>;

/** 手工支出的取数条件（汇总与明细共用） */
export const MANUAL_EXPENSE_WHERE = (
  period: FinancePeriod,
): Prisma.FinanceManualEntryWhereInput => ({
  direction: 'EXPENSE',
  voidedAt: null,
  occurredAt: { gte: period.from, lte: period.to },
});

export function buildManualExpenseLines(
  entries: ManualEntryRow[],
): FinanceExpenseLine[] {
  return entries
    .map(
      (entry): FinanceExpenseLine => ({
        category: entry.category ?? 'OTHER',
        amountCents: toCents(entry.amount),
        occurredAt: entry.occurredAt,
        sourceType: 'MANUAL',
        sourceId: entry.id,
        title: entry.title,
        payerType:
          entry.payerType === 'COMPANY'
            ? ('COMPANY' as const)
            : ('PERSONAL' as const),
      }),
    )
    .filter((line) => line.amountCents !== 0);
}

/** 一次性手工支出：发生日落在期间、未作废，按类别归集 */
export async function loadManualExpenseLines(
  prisma: ExpensePrisma,
  period: FinancePeriod,
): Promise<FinanceExpenseLine[]> {
  const entries = await prisma.financeManualEntry.findMany({
    where: MANUAL_EXPENSE_WHERE(period),
    select: MANUAL_EXPENSE_SELECT,
  });
  return buildManualExpenseLines(entries);
}

/** 期间内全部支出明细行（不含手续费：手续费由收入侧算好传入） */
export async function loadExpenseLines(
  prisma: ExpensePrisma,
  period: FinancePeriod,
): Promise<FinanceExpenseLine[]> {
  const [purchaseLines, shippingLines, billLines, manualLines] =
    await Promise.all([
      loadPurchaseExpenseLines(prisma, period),
      loadShippingExpenseLines(prisma, period),
      loadBillExpenseLines(prisma, period),
      loadManualExpenseLines(prisma, period),
    ]);

  return [...purchaseLines, ...shippingLines, ...billLines, ...manualLines];
}

/**
 * 支出聚合：按业务源表实时取数，按分类累加。
 *
 * 取数与分摊全部走 `loadExpenseLines`（明细服务复用同一批行），
 * 本服务只负责按分类累加与排序，所以「合计 = 各分类相加」且「明细相加 = 汇总」
 * 都是构造上成立的，不靠两套代码各算一遍。
 */
@Injectable()
export class FinanceExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async getExpense(
    period: FinancePeriod,
    fee: number,
  ): Promise<FinanceExpense> {
    const bucket = new Map<FinanceExpenseCategory, number>();

    const lines = await loadExpenseLines(this.prisma, period);
    for (const line of lines) {
      addCents(bucket, line.category, line.amountCents);
    }

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
}
