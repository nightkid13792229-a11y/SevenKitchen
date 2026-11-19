import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  FinanceAccount,
  DEFAULT_FINANCE_ACCOUNT,
  FINANCE_INCOME_ACCOUNT,
  resolveFinanceAccount,
} from './finance-accounts';
import {
  FinanceIncomeCategory,
  OFFLINE_PAYMENT_METHODS,
} from './finance-categories';
import { computeFeeAmount } from './finance-fee';
import { FINANCE_START_DATE, FinancePeriod } from './finance-period';

/**
 * 收入汇总（元）。
 *
 * `supplement` / `customRecipe` 各自只有一个数，但计手续费时只取其中的线上部分；
 * `refundTotal` 含历史订单退款，`historicalRefundTotal` 是其中「原订单付款早于起账日」
 * 的那部分，供报表单独列示。
 *
 * `manualIncome` 是「记一笔」里手工登记的收入（类别固定 OTHER_INCOME）：
 * 它不进 `orderOnline/orderOffline` 等系统来源，但必须进 `grossTotal/netTotal`，
 * 否则明细里的手工收入会让「明细相加 ≠ 汇总」。
 */
export type FinanceIncome = {
  orderOnline: number;
  orderOffline: number;
  supplement: number;
  customRecipe: number;
  manualIncome: number;
  grossTotal: number;
  refundTotal: number;
  historicalRefundTotal: number;
  netTotal: number;
  fee: number;
};

/**
 * 收入明细行：一条 = 汇总里即将累加的一笔。
 *
 * 汇总服务把同一批行按来源累加，明细服务直接把行映射成 `FinanceEntry`，
 * 两边共用 `loadIncomeLines` / `summarizeIncome`，所以「明细相加 = 汇总」
 * 是构造上成立的，不靠两套代码各算一遍。
 */
export type FinanceIncomeLine = {
  /** 收入类别（退款行固定 REFUND） */
  category: FinanceIncomeCategory;
  /** 金额（元，带符号：收入为正、退款为负） */
  amount: number;
  occurredAt: Date;
  sourceType:
    | 'ORDER'
    | 'SUPPLEMENT_ORDER'
    | 'CUSTOM_RECIPE_ORDER'
    | 'ORDER_REFUND'
    | 'MANUAL';
  sourceId: string;
  /** 明细行的唯一 key（退款行用；不填则退回 sourceId） */
  rowId?: string;
  sourceNo?: string;
  /** 明细页标题；只对手工收入由录入人填写，其余来源由明细服务按类型生成 */
  title?: string;
  /**
   * 收款/退款账户（五个账户 code）：线上收款固定 `MERCHANT`；
   * 线下收款取订单登记的账户，没登记时缺省「我的微信」；
   * 退款行沿用原渠道：线上原路退回 → `MERCHANT`，线下退款登记 → 登记的账户。
   */
  payerAccount: FinanceAccount;
  isRefund: boolean;
  isHistorical: boolean;
  /** 线上收款（微信商户号），只有线上部分计手续费 */
  isOnline: boolean;
};

/** 线下收款方式：钱进个人账户，不产生微信手续费 */
const OFFLINE_METHODS: readonly string[] = OFFLINE_PAYMENT_METHODS;

/** 起账日 00:00（上海时间）；付款早于这一刻的订单，其退款算历史退款 */
const FINANCE_START_AT = new Date(
  `${FINANCE_START_DATE}T00:00:00+08:00`,
).getTime();

/**
 * 订单收入口径的排除条件（Task 4/6 的明细取数复用同一份，避免各写一份漂移）：
 * 0 元单、RESHIP（补发/赠送）、重做单（remakeFromOrderId）、补发单
 * （reshipFromOrderId）都不进收入。
 */
export const FINANCE_ORDER_INCOME_FILTER: Prisma.OrderWhereInput = {
  amountTotal: { gt: 0 },
  remakeFromOrderId: null,
  reshipFromOrderId: null,
  // null 的历史数据按正常单处理（SQL 的 NOT 条件会漏掉 NULL）
  OR: [{ paymentMethod: null }, { paymentMethod: { not: 'RESHIP' } }],
};

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

/** 收入侧取数用到的 Prisma 委托（便于单测直接传 mock，明细服务复用） */
type IncomePrisma = Pick<
  PrismaService,
  | 'order'
  | 'supplementOrder'
  | 'customRecipeOrder'
  | 'orderRefundRecord'
  | 'orderOfflineRefund'
  | 'financeManualEntry'
>;

/** 订单收入取数的最小字段（多取 id/单号供明细展示） */
const ORDER_INCOME_SELECT = {
  id: true,
  orderNo: true,
  amountTotal: true,
  paymentMethod: true,
  paidAt: true,
  payerAccount: true,
  remakeFromOrderId: true,
  reshipFromOrderId: true,
} satisfies Prisma.OrderSelect;

type OrderIncomeRow = Prisma.OrderGetPayload<{
  select: typeof ORDER_INCOME_SELECT;
}>;

const SUPPLEMENT_INCOME_SELECT = {
  id: true,
  orderNo: true,
  amountTotal: true,
  paymentMethod: true,
  paidAt: true,
} satisfies Prisma.SupplementOrderSelect;

type SupplementIncomeRow = Prisma.SupplementOrderGetPayload<{
  select: typeof SUPPLEMENT_INCOME_SELECT;
}>;

const CUSTOM_RECIPE_INCOME_SELECT = {
  id: true,
  orderId: true,
  amount: true,
  actualPaidAmount: true,
  paymentChannel: true,
  isGift: true,
  paymentConfirmedAt: true,
} satisfies Prisma.CustomRecipeOrderSelect;

type CustomRecipeIncomeRow = Prisma.CustomRecipeOrderGetPayload<{
  select: typeof CUSTOM_RECIPE_INCOME_SELECT;
}>;

const ORDER_REFUND_SELECT = {
  id: true,
  amount: true,
  success: true,
  successTime: true,
  order: { select: { id: true, orderNo: true, paidAt: true } },
} satisfies Prisma.OrderRefundRecordSelect;

type OrderRefundRow = Prisma.OrderRefundRecordGetPayload<{
  select: typeof ORDER_REFUND_SELECT;
}>;

const OFFLINE_REFUND_SELECT = {
  id: true,
  amount: true,
  voidedAt: true,
  refundedAt: true,
  payerAccount: true,
  order: { select: { id: true, orderNo: true, paidAt: true } },
} satisfies Prisma.OrderOfflineRefundSelect;

type OfflineRefundRow = Prisma.OrderOfflineRefundGetPayload<{
  select: typeof OFFLINE_REFUND_SELECT;
}>;

const SUPPLEMENT_REFUND_SELECT = {
  id: true,
  orderNo: true,
  refundAmount: true,
  refundedAt: true,
  paidAt: true,
  paymentMethod: true,
} satisfies Prisma.SupplementOrderSelect;

type SupplementRefundRow = Prisma.SupplementOrderGetPayload<{
  select: typeof SUPPLEMENT_REFUND_SELECT;
}>;

const CUSTOM_RECIPE_REFUND_SELECT = {
  id: true,
  orderId: true,
  refundAmount: true,
  refundedAt: true,
  paymentConfirmedAt: true,
} satisfies Prisma.CustomRecipeOrderSelect;

type CustomRecipeRefundRow = Prisma.CustomRecipeOrderGetPayload<{
  select: typeof CUSTOM_RECIPE_REFUND_SELECT;
}>;

const CUSTOM_RECIPE_OFFLINE_REFUND_SELECT = {
  id: true,
  orderId: true,
  offlineRefundAmount: true,
  offlineRefundedAt: true,
  paymentConfirmedAt: true,
} satisfies Prisma.CustomRecipeOrderSelect;

type CustomRecipeOfflineRefundRow = Prisma.CustomRecipeOrderGetPayload<{
  select: typeof CUSTOM_RECIPE_OFFLINE_REFUND_SELECT;
}>;

const MANUAL_INCOME_SELECT = {
  id: true,
  amount: true,
  occurredAt: true,
  incomeCategory: true,
  title: true,
  payerAccount: true,
} satisfies Prisma.FinanceManualEntrySelect;

type ManualIncomeRow = Prisma.FinanceManualEntryGetPayload<{
  select: typeof MANUAL_INCOME_SELECT;
}>;

function incomeLine(input: {
  category: FinanceIncomeCategory;
  amount: number;
  occurredAt: Date;
  sourceType: FinanceIncomeLine['sourceType'];
  sourceId: string;
  rowId?: string;
  sourceNo?: string | null;
  title?: string;
  payerAccount: FinanceAccount;
  isOnline: boolean;
}): FinanceIncomeLine {
  return {
    category: input.category,
    amount: input.amount,
    occurredAt: input.occurredAt,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    rowId: input.rowId ?? input.sourceId,
    sourceNo: input.sourceNo ?? undefined,
    title: input.title,
    payerAccount: input.payerAccount,
    isRefund: false,
    isHistorical: false,
    isOnline: input.isOnline,
  };
}

/**
 * 退款行：金额为负，账户**沿用原渠道**——退款是从同一个口袋里退回去的。
 *
 * 线上原路退回（微信商户号）→ `MERCHANT`；线下退款登记 → 登记账户。
 * 不写这一层的话，明细按账户筛选会把退款静默漏掉。
 */
function refundLine(input: {
  amount: number;
  occurredAt: Date;
  sourceType: FinanceIncomeLine['sourceType'];
  sourceId: string;
  rowId: string;
  sourceNo?: string | null;
  payerAccount: FinanceAccount;
  isOnline: boolean;
  isHistorical: boolean;
}): FinanceIncomeLine {
  return {
    category: 'REFUND',
    amount: -input.amount,
    occurredAt: input.occurredAt,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    rowId: input.rowId,
    sourceNo: input.sourceNo ?? undefined,
    payerAccount: input.payerAccount,
    isRefund: true,
    isHistorical: input.isHistorical,
    isOnline: input.isOnline,
  };
}

/** 订单收入：排除条件已在 SQL 下推，这里再兜一层，避免 mock/调用方漏执行 */
export function buildOrderIncomeLines(
  orders: OrderIncomeRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const order of orders) {
    if (order.paymentMethod === 'RESHIP') continue;
    if (order.remakeFromOrderId != null) continue;
    if (order.reshipFromOrderId != null) continue;
    const amount = toAmount(order.amountTotal);
    if (amount <= 0) continue;
    if (order.paidAt == null) continue;
    const online = !isOfflinePayment(order.paymentMethod);
    lines.push(
      incomeLine({
        category: online ? 'ONLINE_ORDER' : 'OFFLINE_ORDER',
        amount,
        occurredAt: order.paidAt,
        sourceType: 'ORDER',
        sourceId: order.id,
        sourceNo: order.orderNo,
        payerAccount: online
          ? FINANCE_INCOME_ACCOUNT
          : resolveFinanceAccount(order.payerAccount),
        isOnline: online,
      }),
    );
  }
  return lines;
}

/** 补剂单收入：0 元与 RESHIP 不算；收费渠道为空按线上（历史数据默认微信支付） */
export function buildSupplementIncomeLines(
  rows: SupplementIncomeRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    if (row.paymentMethod === 'RESHIP') continue;
    const amount = toAmount(row.amountTotal);
    if (amount <= 0) continue;
    if (row.paidAt == null) continue;
    const online = !isOfflinePayment(row.paymentMethod);
    lines.push(
      incomeLine({
        category: 'SUPPLEMENT',
        amount,
        occurredAt: row.paidAt,
        sourceType: 'SUPPLEMENT_ORDER',
        sourceId: row.id,
        sourceNo: row.orderNo,
        // 补剂单没有账户字段：线上落商户号，线下按渠道推「我的微信」
        payerAccount: online ? FINANCE_INCOME_ACCOUNT : DEFAULT_FINANCE_ACCOUNT,
        isOnline: online,
      }),
    );
  }
  return lines;
}

/** 定制食谱收入：赠送单不算；老订单可能只有报价、没有实收，按 `actualPaidAmount ?? amount` */
export function buildCustomRecipeIncomeLines(
  rows: CustomRecipeIncomeRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    if (row.isGift) continue;
    const amount = toAmount(row.actualPaidAmount ?? row.amount);
    if (amount <= 0) continue;
    if (row.paymentConfirmedAt == null) continue;
    const online = !isOfflinePayment(row.paymentChannel);
    lines.push(
      incomeLine({
        category: 'CUSTOM_RECIPE',
        amount,
        occurredAt: row.paymentConfirmedAt,
        sourceType: 'CUSTOM_RECIPE_ORDER',
        sourceId: row.orderId,
        rowId: row.id,
        sourceNo: row.orderId,
        // 定制食谱同样没有账户字段：线上落商户号，线下按渠道推「我的微信」
        payerAccount: online ? FINANCE_INCOME_ACCOUNT : DEFAULT_FINANCE_ACCOUNT,
        isOnline: online,
      }),
    );
  }
  return lines;
}

/** 手工收入：钱是老板自己收的，没有支付渠道，不计手续费 */
export function buildManualIncomeLines(
  rows: ManualIncomeRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    const amount = toAmount(row.amount);
    if (amount <= 0) continue;
    lines.push(
      incomeLine({
        category:
          (row.incomeCategory as FinanceIncomeCategory | null) ??
          'OTHER_INCOME',
        amount,
        occurredAt: row.occurredAt,
        sourceType: 'MANUAL',
        sourceId: row.id,
        title: row.title,
        payerAccount: resolveFinanceAccount(row.payerAccount),
        isOnline: false,
      }),
    );
  }
  return lines;
}

/** 微信原路退款：必然属于线上收款，手续费按比例冲回 */
export function buildOrderRefundLines(
  rows: OrderRefundRow[],
): FinanceIncomeLine[] {
  return rows
    .filter((row) => row.success !== false)
    .filter((row) => toAmount(row.amount) > 0)
    .map((row) =>
      refundLine({
        amount: toAmount(row.amount),
        occurredAt: row.successTime as Date,
        sourceType: 'ORDER',
        sourceId: row.order?.id ?? row.id,
        rowId: `refund:${row.id}`,
        sourceNo: row.order?.orderNo,
        // 微信原路退回，钱从微信商户号出
        payerAccount: FINANCE_INCOME_ACCOUNT,
        isOnline: true,
        isHistorical: isHistoricalPaidAt(row.order?.paidAt),
      }),
    );
}

/** 线下退款登记：减收入，但没有撤销微信支付，手续费不退 */
export function buildOfflineRefundLines(
  rows: OfflineRefundRow[],
): FinanceIncomeLine[] {
  return rows
    .filter((row) => row.voidedAt == null)
    .filter((row) => toAmount(row.amount) > 0)
    .map((row) =>
      refundLine({
        amount: toAmount(row.amount),
        occurredAt: row.refundedAt,
        sourceType: 'ORDER',
        sourceId: row.order?.id ?? row.id,
        rowId: `refund:offline:${row.id}`,
        sourceNo: row.order?.orderNo,
        // 线下退款从登记的那个账户出（没登记时缺省「我的微信」）
        payerAccount: resolveFinanceAccount(row.payerAccount),
        isOnline: false,
        isHistorical: isHistoricalPaidAt(row.order?.paidAt),
      }),
    );
}

/** 补剂退款：线上部分冲回手续费，按原单付款时间判历史退款 */
export function buildSupplementRefundLines(
  rows: SupplementRefundRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    const amount = toAmount(row.refundAmount);
    if (amount <= 0) continue;
    // 沿用原单付款渠道：线上→公司，线下→个人
    const online = !isOfflinePayment(row.paymentMethod);
    lines.push(
      refundLine({
        amount,
        occurredAt: row.refundedAt as Date,
        sourceType: 'SUPPLEMENT_ORDER',
        sourceId: row.id,
        rowId: `refund:supplement:${row.id}`,
        sourceNo: row.orderNo,
        payerAccount: online ? FINANCE_INCOME_ACCOUNT : DEFAULT_FINANCE_ACCOUNT,
        isOnline: online,
        isHistorical: isHistoricalPaidAt(row.paidAt),
      }),
    );
  }
  return lines;
}

/** 定制食谱线上退款走微信原路退回，手续费按比例冲回 */
export function buildCustomRecipeRefundLines(
  rows: CustomRecipeRefundRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    const amount = toAmount(row.refundAmount);
    if (amount <= 0) continue;
    lines.push(
      refundLine({
        amount,
        occurredAt: row.refundedAt as Date,
        sourceType: 'CUSTOM_RECIPE_ORDER',
        sourceId: row.orderId,
        rowId: `refund:online:${row.id}`,
        sourceNo: row.orderId,
        payerAccount: FINANCE_INCOME_ACCOUNT,
        isOnline: true,
        isHistorical: isHistoricalPaidAt(row.paymentConfirmedAt),
      }),
    );
  }
  return lines;
}

/** 定制食谱线下退款只减收入，不冲回手续费 */
export function buildCustomRecipeOfflineRefundLines(
  rows: CustomRecipeOfflineRefundRow[],
): FinanceIncomeLine[] {
  const lines: FinanceIncomeLine[] = [];
  for (const row of rows) {
    const amount = toAmount(row.offlineRefundAmount);
    if (amount <= 0) continue;
    lines.push(
      refundLine({
        amount,
        occurredAt: row.offlineRefundedAt as Date,
        sourceType: 'CUSTOM_RECIPE_ORDER',
        sourceId: row.orderId,
        rowId: `refund:offline:${row.id}`,
        sourceNo: row.orderId,
        // 定制食谱线下退款按渠道推「我的微信」（本期不加账户字段）
        payerAccount: DEFAULT_FINANCE_ACCOUNT,
        isOnline: false,
        isHistorical: isHistoricalPaidAt(row.paymentConfirmedAt),
      }),
    );
  }
  return lines;
}

/** 期间内全部收入明细行（取数条件与 Task 3 收入口径完全一致）。 */
export async function loadIncomeLines(
  prisma: IncomePrisma,
  period: FinancePeriod,
): Promise<FinanceIncomeLine[]> {
  const [
    orders,
    supplements,
    customRecipes,
    orderRefunds,
    offlineRefunds,
    supplementRefunds,
    customRecipeRefunds,
    customRecipeOfflineRefunds,
    manualIncomes,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        paidAt: { gte: period.from, lte: period.to },
        ...FINANCE_ORDER_INCOME_FILTER,
      },
      select: ORDER_INCOME_SELECT,
    }),
    prisma.supplementOrder.findMany({
      where: {
        paidAt: { gte: period.from, lte: period.to },
        amountTotal: { gt: 0 },
        OR: [{ paymentMethod: null }, { paymentMethod: { not: 'RESHIP' } }],
      },
      select: SUPPLEMENT_INCOME_SELECT,
    }),
    prisma.customRecipeOrder.findMany({
      where: {
        paymentConfirmedAt: { gte: period.from, lte: period.to },
        isGift: false,
        OR: [
          { actualPaidAmount: { gt: 0 } },
          { actualPaidAmount: null, amount: { gt: 0 } },
        ],
      },
      select: CUSTOM_RECIPE_INCOME_SELECT,
    }),
    prisma.orderRefundRecord.findMany({
      where: {
        success: true,
        successTime: { gte: period.from, lte: period.to },
        amount: { gt: 0 },
      },
      select: ORDER_REFUND_SELECT,
    }),
    prisma.orderOfflineRefund.findMany({
      where: {
        voidedAt: null,
        refundedAt: { gte: period.from, lte: period.to },
        amount: { gt: 0 },
      },
      select: OFFLINE_REFUND_SELECT,
    }),
    prisma.supplementOrder.findMany({
      where: {
        refundedAt: { gte: period.from, lte: period.to },
        refundAmount: { gt: 0 },
      },
      select: SUPPLEMENT_REFUND_SELECT,
    }),
    prisma.customRecipeOrder.findMany({
      where: {
        refundedAt: { gte: period.from, lte: period.to },
        refundAmount: { gt: 0 },
      },
      select: CUSTOM_RECIPE_REFUND_SELECT,
    }),
    prisma.customRecipeOrder.findMany({
      where: {
        offlineRefundedAt: { gte: period.from, lte: period.to },
        offlineRefundAmount: { gt: 0 },
      },
      select: CUSTOM_RECIPE_OFFLINE_REFUND_SELECT,
    }),
    prisma.financeManualEntry.findMany({
      where: {
        direction: 'INCOME',
        voidedAt: null,
        occurredAt: { gte: period.from, lte: period.to },
      },
      select: MANUAL_INCOME_SELECT,
    }),
  ]);

  return [
    ...buildOrderIncomeLines(orders),
    ...buildSupplementIncomeLines(supplements),
    ...buildCustomRecipeIncomeLines(customRecipes),
    ...buildOrderRefundLines(orderRefunds),
    ...buildOfflineRefundLines(offlineRefunds),
    ...buildSupplementRefundLines(supplementRefunds),
    ...buildCustomRecipeRefundLines(customRecipeRefunds),
    ...buildCustomRecipeOfflineRefundLines(customRecipeOfflineRefunds),
    ...buildManualIncomeLines(manualIncomes),
  ];
}

/**
 * 把手收入明细行汇总成收入接口的返回结构。
 *
 * 明细服务复用同一批行与同一个函数，因此「明细相加 = 汇总」不依赖调用顺序。
 */
export function summarizeIncome(
  lines: FinanceIncomeLine[],
  feeRate: number,
): FinanceIncome {
  let orderOnline = 0;
  let orderOffline = 0;
  let supplement = 0;
  let customRecipe = 0;
  let manualIncome = 0;
  let refundTotal = 0;
  let historicalRefundTotal = 0;
  /** 线上实收基数（只用于手续费，不单独出现在返回值里） */
  let onlinePaid = 0;
  /** 线上退款基数：只冲回微信原路退款与线上补剂/定制退款 */
  let onlineRefunded = 0;

  for (const line of lines) {
    if (line.isRefund) {
      const refunded = -line.amount;
      refundTotal += refunded;
      if (line.isOnline) onlineRefunded += refunded;
      if (line.isHistorical) historicalRefundTotal += refunded;
      continue;
    }

    switch (line.category) {
      case 'ONLINE_ORDER':
        orderOnline += line.amount;
        break;
      case 'OFFLINE_ORDER':
        orderOffline += line.amount;
        break;
      case 'SUPPLEMENT':
        supplement += line.amount;
        break;
      case 'CUSTOM_RECIPE':
        customRecipe += line.amount;
        break;
      case 'OTHER_INCOME':
        manualIncome += line.amount;
        break;
      default:
        break;
    }
    if (line.isOnline) onlinePaid += line.amount;
  }

  orderOnline = roundMoney(orderOnline);
  orderOffline = roundMoney(orderOffline);
  supplement = roundMoney(supplement);
  customRecipe = roundMoney(customRecipe);
  manualIncome = roundMoney(manualIncome);
  refundTotal = roundMoney(refundTotal);
  historicalRefundTotal = roundMoney(historicalRefundTotal);

  const grossTotal = roundMoney(
    orderOnline + orderOffline + supplement + customRecipe + manualIncome,
  );
  const netTotal = roundMoney(grossTotal - refundTotal);

  return {
    orderOnline,
    orderOffline,
    supplement,
    customRecipe,
    manualIncome,
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

/**
 * 收入聚合：订单 / 补剂 / 定制食谱 / 退款 / 手工收入五类来源，
 * 退款按成功日冲减当月，手续费只对线上实收与线上退款轧差后计一次。
 *
 * 所有期间与排除条件都写在 `where` 里；取数与汇总拆成
 * `loadIncomeLines` / `summarizeIncome`，明细服务复用同一套。
 */
@Injectable()
export class FinanceIncomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getIncome(
    period: FinancePeriod,
    feeRate: number,
  ): Promise<FinanceIncome> {
    const lines = await loadIncomeLines(this.prisma, period);
    return summarizeIncome(lines, feeRate);
  }
}
