import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import {
  FINANCE_EXPENSE_CATEGORY_LABELS,
  FINANCE_INCOME_CATEGORY_LABELS,
} from './finance-categories';
import {
  FinanceExpenseLine,
  centsToMoney,
  loadExpenseLines,
} from './finance-expense.service';
import { DEFAULT_WECHAT_FEE_RATE } from './finance-fee';
import { FinanceFeeRateService } from './finance-fee-rate.service';
import {
  FinanceIncomeLine,
  loadIncomeLines,
  summarizeIncome,
} from './finance-income.service';
import { FinancePeriod, monthRange, resolvePeriod } from './finance-period';

/**
 * 收支明细的一条。
 *
 * 金额是**带符号**的：收入为正；退款行 `direction = 'INCOME'`、金额为负；
 * 手续费冲回行 `direction = 'EXPENSE'`、金额为负。UI 只按符号显示，不再二次判断。
 */
export type FinanceEntry = {
  id: string;
  /** 上海时区 ISO 字符串（带 +08:00），与汇总接口的 range 一致 */
  occurredAt: string;
  direction: 'INCOME' | 'EXPENSE';
  category: string;
  label: string;
  amount: number;
  title: string;
  sourceType:
    | 'ORDER'
    | 'SUPPLEMENT_ORDER'
    | 'CUSTOM_RECIPE_ORDER'
    | 'ORDER_REFUND'
    | 'PURCHASE'
    | 'SHIPPING'
    | 'BILL'
    | 'REIMBURSEMENT'
    | 'FEE'
    | 'MANUAL';
  sourceId: string;
  sourceNo?: string;
  payerType?: 'COMPANY' | 'PERSONAL';
  isRefund: boolean;
  isHistorical: boolean;
};

export type FinanceEntriesQuery = {
  from?: string;
  to?: string;
  month?: string;
  direction?: 'INCOME' | 'EXPENSE';
  category?: string;
  /**
   * 按付款方筛选：`PERSONAL` = 「我垫的」。
   *
   * 只做**行级**过滤，不动任何口径：已作废的退款记录本来就不出行，
   * 采购/账单的 0 元占位行仍按原样出现（它自己带 payerType）。
   * `payerType` 由收入/支出明细行自带：退款沿用原单（线上→COMPANY，
   * 线下→PERSONAL），快递费固定 COMPANY；手续费合计行没有付款方
   * （公司账户扣的），两个值都不会把它带出来。
   */
  payerType?: 'COMPANY' | 'PERSONAL';
  page?: number;
  pageSize?: number;
};

export type FinanceEntriesPage = {
  items: FinanceEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** 合并后的总条数超过 5000，已截断（提示用户缩小日期范围） */
  truncated: boolean;
};

/** 内存分页默认值与上限 */
export const DEFAULT_ENTRIES_PAGE_SIZE = 50;
export const MAX_ENTRIES_PAGE_SIZE = 200;
/** 合并后的行数上限：单月通常 < 500 条，超过这个数说明区间太大，直接截断 */
export const MAX_ENTRIES = 5000;

/** 内部行：保留 Date 用于排序，对外输出字符串（避免时区二次换算） */
type DatedEntry = { occurredAt: Date; entry: FinanceEntry };

/** 上海时区 ISO 字符串（带 +08:00），与 FinanceSummaryService 的输出一致 */
function toShanghaiIso(input: Date): string {
  const shifted = new Date(input.getTime() + 8 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 23)}+08:00`;
}

/** 金额保留两位小数，避免浮点尾差进到接口 */
function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 正整数参数兜底：非法/缺省都回到默认值，不把 NaN 带进分页 */
function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const truncated = Math.trunc(parsed);
  return truncated >= 1 ? truncated : fallback;
}

/**
 * 收支明细：把收入与支出的**同一批行**（`loadIncomeLines` / `loadExpenseLines`）
 * 映射成统一的行结构，合并后倒序排序、内存分页。
 *
 * 不重新实现任何口径：取数、排除条件、采购分摊、退款归属月份全部复用
 * 汇总服务的函数；手续费也由 `summarizeIncome` 算出的 `fee` 生成一行，
 * 所以「明细相加 = 汇总」是构造上成立的，跨服务一致性测试再兜一次底。
 */
@Injectable()
export class FinanceEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feeRateService?: FinanceFeeRateService,
  ) {}

  async list(query: FinanceEntriesQuery = {}): Promise<FinanceEntriesPage> {
    const period = this.resolveQueryPeriod(query);
    const feeRate = this.feeRateService
      ? await this.feeRateService.getFeeRate()
      : DEFAULT_WECHAT_FEE_RATE;

    const [incomeLines, expenseLines] = await Promise.all([
      loadIncomeLines(this.prisma, period),
      loadExpenseLines(this.prisma, period),
    ]);

    const fee = summarizeIncome(incomeLines, feeRate).fee;

    let rows: DatedEntry[] = [
      ...incomeLines.map((line) => this.toIncomeEntry(line)),
      ...expenseLines.map((line) => this.toExpenseEntry(line)),
    ];

    // 手续费合计一行；为 0 时不出现（与支出汇总的「0 不进分类」一致）
    if (fee !== 0) {
      rows.push(this.buildFeeEntry(fee, period));
    }

    if (query.direction) {
      rows = rows.filter((row) => row.entry.direction === query.direction);
    }
    if (query.category) {
      rows = rows.filter((row) => row.entry.category === query.category);
    }
    if (query.payerType) {
      rows = rows.filter((row) => row.entry.payerType === query.payerType);
    }

    // 倒序；同一时刻用 id 兜底，保证分页结果稳定
    rows.sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        left.entry.id.localeCompare(right.entry.id),
    );

    const truncated = rows.length > MAX_ENTRIES;
    const capped = truncated ? rows.slice(0, MAX_ENTRIES) : rows;

    const page = normalizePositiveInt(query.page, 1);
    const pageSize = Math.min(
      MAX_ENTRIES_PAGE_SIZE,
      normalizePositiveInt(query.pageSize, DEFAULT_ENTRIES_PAGE_SIZE),
    );
    const start = (page - 1) * pageSize;

    return {
      items: capped.slice(start, start + pageSize).map((row) => row.entry),
      total: capped.length,
      page,
      pageSize,
      truncated,
    };
  }

  private resolveQueryPeriod(query: FinanceEntriesQuery): FinancePeriod {
    if (query?.month) return monthRange(query.month);
    return resolvePeriod(query?.from, query?.to);
  }

  /**
   * 来源表 id 直接当明细 id；退款行用 `rowId`（退款记录 id 加渠道前缀），
   * 保证同一张单的「收款 + 多笔退款」各自有唯一的行 key。
   */
  private incomeEntryId(line: FinanceIncomeLine): string {
    return line.rowId ?? line.sourceId;
  }

  private incomeTitle(line: FinanceIncomeLine): string {
    const no = line.sourceNo ? ` ${line.sourceNo}` : '';
    if (line.isRefund) {
      switch (line.sourceType) {
        case 'ORDER':
          return line.isHistorical ? `历史订单退款${no}` : `订单退款${no}`;
        case 'SUPPLEMENT_ORDER':
          return `补剂退款${no}`;
        case 'CUSTOM_RECIPE_ORDER':
          return '定制食谱退款';
        default:
          return '退款';
      }
    }

    switch (line.sourceType) {
      case 'ORDER':
        return `订单收入${no}`;
      case 'SUPPLEMENT_ORDER':
        return `补剂订单${no}`;
      case 'CUSTOM_RECIPE_ORDER':
        return '定制食谱订单';
      case 'MANUAL':
        return line.title ?? '手工收入';
      default:
        return '收入';
    }
  }

  private toIncomeEntry(line: FinanceIncomeLine): DatedEntry {
    return {
      occurredAt: line.occurredAt,
      entry: {
        id: this.incomeEntryId(line),
        occurredAt: toShanghaiIso(line.occurredAt),
        direction: 'INCOME',
        category: line.category,
        label:
          FINANCE_INCOME_CATEGORY_LABELS[line.category] ??
          String(line.category),
        amount: roundMoney(line.amount),
        title: this.incomeTitle(line),
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        sourceNo: line.sourceNo,
        payerType: line.payerType,
        isRefund: line.isRefund,
        isHistorical: line.isHistorical,
      },
    };
  }

  /**
   * 明细 id：单行来源直接用表 id；一张单拆成多行（采购按分类、账单按月、
   * 报销按自定义费条目）时加后缀，保证列表 key 唯一、同时间排序也稳定。
   */
  private expenseEntryId(line: FinanceExpenseLine): string {
    // 取数侧已经算好稳定 key 的（如同一张报销单的多笔同类杂费）直接用它
    if (line.rowId) return line.rowId;
    switch (line.sourceType) {
      case 'PURCHASE':
        return `${line.sourceId}:${line.category}`;
      case 'SHIPPING':
        return `${line.sourceId}:shipping`;
      case 'BILL': {
        const monthKey = TimezoneUtil.shanghaiDateKey(line.occurredAt).slice(
          0,
          7,
        );
        return `${line.sourceId}:${monthKey}`;
      }
      default:
        return line.sourceId;
    }
  }

  private toExpenseEntry(line: FinanceExpenseLine): DatedEntry {
    return {
      occurredAt: line.occurredAt,
      entry: {
        id: this.expenseEntryId(line),
        occurredAt: toShanghaiIso(line.occurredAt),
        direction: 'EXPENSE',
        category: line.category,
        label:
          FINANCE_EXPENSE_CATEGORY_LABELS[line.category] ??
          String(line.category),
        amount: centsToMoney(line.amountCents),
        title: line.title,
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        sourceNo: line.sourceNo,
        payerType: line.payerType,
        isRefund: false,
        isHistorical: false,
      },
    };
  }

  /**
   * 支付手续费合计一行：金额来自收入侧 `summarizeIncome`，为负数表示退款冲回。
   * 放在期间起点，月视图里沉在最下面，不抢正常流水的第一条。
   */
  private buildFeeEntry(fee: number, period: FinancePeriod): DatedEntry {
    const id = `fee:${period.from.toISOString()}`;
    return {
      occurredAt: period.from,
      entry: {
        id,
        occurredAt: toShanghaiIso(period.from),
        direction: 'EXPENSE',
        category: 'PAYMENT_FEE',
        label: FINANCE_EXPENSE_CATEGORY_LABELS.PAYMENT_FEE,
        amount: roundMoney(fee),
        title: '支付手续费',
        sourceType: 'FEE',
        sourceId: id,
        isRefund: false,
        isHistorical: false,
      },
    };
  }
}
