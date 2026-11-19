import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { OFFLINE_PAYMENT_METHODS } from '../finance/finance-categories';
import { centsToMoney, toCents } from '../finance/finance-expense.service';

/** 线下退款方式（对应 `order_offline_refund.method`） */
export const OFFLINE_REFUND_METHODS = [
  'WECHAT',
  'ALIPAY',
  'CASH',
  'OTHER',
] as const;

export type OfflineRefundMethod = (typeof OFFLINE_REFUND_METHODS)[number];

/**
 * 线下退款登记入参。
 *
 * `refundedAt` 是**退款成功日**（`YYYY-MM-DD`）：财务按这一天归月，
 * 与微信原路退款（`OrderRefundRecord.successTime`）同一口径。
 */
export type RegisterOfflineRefundInput = {
  /** 本次退款金额（元，最多两位小数） */
  amount: number;
  /** 退款日 `YYYY-MM-DD` */
  refundedAt: string;
  method: OfflineRefundMethod;
  note?: string;
  /** 退款凭证（COS key） */
  proofKeys?: string[];
};

export type RegisterOfflineRefundResult = {
  id: string;
  /** 该订单累计已退（未作废部分，含本次） */
  totalRefunded: number;
  /** 该订单还可退（实收 − 累计已退） */
  remaining: number;
};

/** 订单详情里展示的一条线下退款登记 */
export type OfflineRefundView = {
  id: string;
  amount: number;
  /** 退款日 `YYYY-MM-DD`（数据库是 date-only，不能按 ISO 串直接展示） */
  refundedAt: string;
  method: string;
  note: string | null;
  proofKeys: string[];
  createdById: string;
  createdAt: Date;
};

const OFFLINE_METHODS: readonly string[] = OFFLINE_PAYMENT_METHODS;

const OFFLINE_REFUND_LIST_SELECT = {
  id: true,
  amount: true,
  refundedAt: true,
  method: true,
  note: true,
  proofKeys: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.OrderOfflineRefundSelect;

type OfflineRefundRow = Prisma.OrderOfflineRefundGetPayload<{
  select: typeof OFFLINE_REFUND_LIST_SELECT;
}>;

const ORDER_REFUND_CHECK_SELECT = {
  id: true,
  amountTotal: true,
  paidAt: true,
  paymentMethod: true,
} satisfies Prisma.OrderSelect;

type OrderRefundCheckRow = Prisma.OrderGetPayload<{
  select: typeof ORDER_REFUND_CHECK_SELECT;
}>;

/**
 * 金额 > 0 且最多两位小数；返回整数分。
 *
 * 后续「累计退款 ≤ 实收」只在分上比较：`776.54 + 100 = 876.5400000000001`
 * 这类浮点误差会把刚好退满的合法登记误判成超额，2026-10 已经踩过一次。
 */
function parseAmountCents(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    throw new BadRequestException('退款金额必须大于 0');
  }
  const cents = Math.round(input * 100);
  if (Math.abs(cents - input * 100) > 1e-6) {
    throw new BadRequestException('退款金额最多两位小数');
  }
  if (cents <= 0) {
    throw new BadRequestException('退款金额必须大于 0');
  }
  return cents;
}

/**
 * 退款日：`refunded_at` 按 **UTC 零点**落库（设计文档 §4.7）。
 * 写上海零点会落成前一天，11-01 的退款会掉进 10 月、从 11 月账里消失。
 */
function parseRefundedAt(input: unknown): Date {
  const raw = String(input ?? '').trim();
  const dateKey = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
  if (!dateKey) throw new BadRequestException('退款日必须是 YYYY-MM-DD');
  try {
    return TimezoneUtil.parseDateOnly(dateKey);
  } catch {
    throw new BadRequestException('退款日必须是 YYYY-MM-DD');
  }
}

function parseMethod(input: unknown): OfflineRefundMethod {
  if (
    typeof input !== 'string' ||
    !OFFLINE_REFUND_METHODS.includes(input as OfflineRefundMethod)
  ) {
    throw new BadRequestException(
      '退款方式必须是 WECHAT / ALIPAY / CASH / OTHER',
    );
  }
  return input as OfflineRefundMethod;
}

function parseProofKeys(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((key): key is string => typeof key === 'string')
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

/** 整数分 → 报错文案里的「元.角分」 */
function formatCents(cents: number): string {
  return centsToMoney(cents).toFixed(2);
}

/**
 * 鲜食单的线下退款登记（设计文档 §4.2 / §6.6，Task 9）。
 *
 * 口径：
 * - 只对「已付款 + 线下收款（`OFFLINE_PAYMENT_METHODS`）」的订单登记；
 *   线上支付的退款走微信原路退回（`OrderRefundRecord`），不进这张表。
 * - 同一订单累计（未作废）退款金额 ≤ 该单实收；低于实收时可以多次登记。
 * - 登记只是财务动作，**不改订单状态**：要取消订单仍走现有取消流程。
 * - 登记错了置 `voidedAt` 作废，不物理删除；作废后不再计入累计与财务统计。
 *
 * 财务侧（`FinanceIncomeService` / `FinanceEntriesService`）按 `refundedAt`
 * 落在期间、`voidedAt` 为空取数，作为收入减项；本服务只负责写入与校验，
 * 所有金额比较都换算成整数分。
 */
@Injectable()
export class OrderOfflineRefundService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    operatorId: string,
    orderId: string,
    input: RegisterOfflineRefundInput,
  ): Promise<RegisterOfflineRefundResult> {
    const order = (await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_REFUND_CHECK_SELECT,
    })) as OrderRefundCheckRow | null;

    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    if (!order.paidAt) {
      throw new BadRequestException('订单未付款，不能登记退款');
    }
    if (
      !order.paymentMethod ||
      !OFFLINE_METHODS.includes(order.paymentMethod)
    ) {
      throw new BadRequestException(
        '线上支付的订单请走微信原路退款，不能登记线下退款',
      );
    }

    const amountCents = parseAmountCents(input?.amount);
    const refundedAt = parseRefundedAt(input?.refundedAt);
    const method = parseMethod(input?.method);

    const refundedBefore = await this.prisma.orderOfflineRefund.aggregate({
      where: { orderId, voidedAt: null },
      _sum: { amount: true },
    });
    const refundedBeforeCents = toCents(refundedBefore?._sum?.amount);
    const totalCents = refundedBeforeCents + amountCents;
    const amountTotalCents = toCents(order.amountTotal);

    if (totalCents > amountTotalCents) {
      throw new BadRequestException(
        `累计退款 ${formatCents(totalCents)} 元超过该单实收 ${formatCents(
          amountTotalCents,
        )} 元（已退 ${formatCents(refundedBeforeCents)} 元）`,
      );
    }

    const note = input?.note?.trim();

    const created = await this.prisma.orderOfflineRefund.create({
      data: {
        orderId,
        amount: centsToMoney(amountCents),
        refundedAt,
        method,
        note: note ? note : null,
        proofKeys: parseProofKeys(input?.proofKeys),
        createdById: operatorId,
      },
    });

    return {
      id: created.id,
      totalRefunded: centsToMoney(totalCents),
      remaining: centsToMoney(amountTotalCents - totalCents),
    };
  }

  /** 订单的线下退款登记（未作废），按退款日倒序 */
  async list(orderId: string): Promise<OfflineRefundView[]> {
    const rows = (await this.prisma.orderOfflineRefund.findMany({
      where: { orderId, voidedAt: null },
      orderBy: [{ refundedAt: 'desc' }, { createdAt: 'desc' }],
      select: OFFLINE_REFUND_LIST_SELECT,
    })) as OfflineRefundRow[];

    return rows.map((row) => ({
      id: row.id,
      amount: centsToMoney(toCents(row.amount)),
      refundedAt: row.refundedAt.toISOString().slice(0, 10),
      method: row.method,
      note: row.note ?? null,
      proofKeys: row.proofKeys ?? [],
      createdById: row.createdById,
      createdAt: row.createdAt,
    }));
  }
}
