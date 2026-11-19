import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ExpensePayerType } from './expense-template.service';
import { normalizeFinanceAccount } from './finance-accounts';
import { centsToMoney, toCents } from './finance-expense.service';
import { monthDateOnlyRange } from './finance-period';
import { TimezoneUtil } from '../../utils/timezone.util';

/** 固定费用账单「标记已付」的入参（设计文档 §5.4） */
export type PayExpenseBillInput = {
  /** 本次实付金额；缺省 = 账单金额（水电这类实付和模板不一致时可改） */
  paidAmount?: number;
  /** 付款日 YYYY-MM-DD；缺省 = 今天（上海日历日） */
  paidAt?: string;
  /** 付款方；缺省继承账单上的 payerType */
  payerType?: ExpensePayerType;
  /** 本次从哪个账户出（MERCHANT / PERSONAL_WECHAT / ...）；缺省取账单上的账户 */
  payerAccount?: string | null;
};

const PAYER_TYPES: readonly ExpensePayerType[] = ['COMPANY', 'PERSONAL'];

/** 金额 > 0 且最多两位小数；返回整数分，后续比较/相加只在分上做 */
function parsePaidAmount(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    throw new BadRequestException('实付金额必须大于 0');
  }
  const cents = Math.round(input * 100);
  if (Math.abs(cents - input * 100) > 1e-6) {
    throw new BadRequestException('实付金额最多两位小数');
  }
  if (cents <= 0) {
    throw new BadRequestException('实付金额必须大于 0');
  }
  return cents;
}

/**
 * 付款日：`paid_at` 按 UTC 零点落库（设计文档 §4.7）。
 * 接受 `YYYY-MM-DD`；带时间的 ISO 串只取 UTC 日期部分，避免时区漂移。
 */
function parsePaidAt(input: unknown): Date {
  const raw = String(input ?? '').trim();
  const dateKey = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : '';
  if (!dateKey) throw new BadRequestException('付款日必须是 YYYY-MM-DD');
  try {
    return TimezoneUtil.parseDateOnly(dateKey);
  } catch {
    throw new BadRequestException('付款日必须是 YYYY-MM-DD');
  }
}

const normalizePayerType = (input: unknown): ExpensePayerType | null => {
  if (input === undefined || input === null || input === '') return null;
  if (!PAYER_TYPES.includes(input as ExpensePayerType)) {
    throw new BadRequestException('付款方必须是 COMPANY 或 PERSONAL');
  }
  return input as ExpensePayerType;
};

@Injectable()
export class ExpenseBillService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 某月应计固定费用账单（设计文档 §4.7）。
   *
   * 按「费用所属月」归集：只取 `recognitionStart` 落在该月的账单，
   * 而不是付款日；跨月账单在支出汇总里按月分摊（见 finance-expense.service）。
   * 草稿与已取消不计应计，直接排除。
   */
  async listForMonth(month: string) {
    const range = monthDateOnlyRange(month);

    return this.prisma.expenseBill.findMany({
      where: {
        recognitionStart: {
          gte: range.start,
          lt: range.endExclusive,
        },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      include: {
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: [{ recognitionStart: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * 标记已付（可改实付金额、可部分付）。
   *
   * - 账单必须存在且未取消；
   * - 写 `ExpenseBillPayment`（含本次付款方），再按累计实付更新状态：
   *   未付满 → `PARTIALLY_PAID`，付满/超付 → `PAID`；
   * - `paidAt` 按 UTC 零点落库，缺省今天（上海日历日）。
   */
  async pay(userId: string, billId: string, input: PayExpenseBillInput) {
    const bill = await this.prisma.expenseBill.findUnique({
      where: { id: billId },
    });
    if (!bill) throw new NotFoundException('账单不存在');
    if (bill.status === 'CANCELLED') {
      throw new BadRequestException('已取消的账单不能付款');
    }
    if (bill.status === 'PAID') {
      throw new BadRequestException('账单已付清，不能重复付款');
    }

    // 账户在写任何记录之前校验：非法值不能等到付款记录写了一半才报错。
    // 缺省取账单上的账户（模板带下来的）；老账单没有账户时缺省「我的微信」。
    const payerAccount = normalizeFinanceAccount(
      input.payerAccount !== undefined
        ? input.payerAccount
        : (bill.payerAccount ?? null),
    );

    // 金额一律换成整数分再比较/相加：Decimal(876.54) 直接做浮点减法会得到
    // 376.53999999999996，尾款永远判成「超额」；分上算完落库前再换回元。
    const paidBefore = await this.prisma.expenseBillPayment.aggregate({
      where: { billId },
      _sum: { paidAmount: true },
    });
    const billAmountCents = toCents(bill.amount);
    const alreadyPaidCents = toCents(paidBefore._sum.paidAmount);
    const remainingCents = billAmountCents - alreadyPaidCents;

    // 库里累计实付已经够了（历史浮点误差/并发补写都可能造成状态没同步）：
    // 直接结清，不再走「本次金额必须 > 0」的付款校验。
    if (remainingCents <= 0) {
      return this.prisma.expenseBill.update({
        where: { id: billId },
        data: {
          status: 'PAID',
          amount: centsToMoney(alreadyPaidCents),
        },
      });
    }

    const paidAmountCents =
      input.paidAmount === undefined
        ? remainingCents
        : parsePaidAmount(input.paidAmount);
    const paidAt =
      input.paidAt === undefined
        ? TimezoneUtil.toShanghaiDateOnly(new Date())
        : parsePaidAt(input.paidAt);
    const requestedPayerType = normalizePayerType(input.payerType);
    const payerType =
      requestedPayerType ??
      (bill.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL');

    // 已部分付的账单，本次不能超过剩余应付；首笔允许按实际金额覆盖模板金额
    //（§6.4：实付可能和模板不同，例如水电），付满后回写 bill.amount。
    if (alreadyPaidCents > 0 && paidAmountCents > remainingCents) {
      throw new BadRequestException('本次实付不能超过剩余应付金额');
    }

    await this.prisma.expenseBillPayment.create({
      data: {
        billId,
        paidAmount: centsToMoney(paidAmountCents),
        paidAt,
        paidById: userId,
        paymentMethod: 'OTHER',
        payerType,
        payerAccount,
        paymentProofUrls: [],
      },
    });

    const totalPaidCents = alreadyPaidCents + paidAmountCents;
    const isPaidOff = totalPaidCents >= billAmountCents;

    return this.prisma.expenseBill.update({
      where: { id: billId },
      data: isPaidOff
        ? // 付满时把模板金额改写成累计实付，汇总按实际支出算（§6.4）。
          { status: 'PAID', amount: centsToMoney(totalPaidCents) }
        : { status: 'PARTIALLY_PAID' },
    });
  }
}
