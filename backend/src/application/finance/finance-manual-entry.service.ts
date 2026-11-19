import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinanceExpenseCategory as FinanceExpenseCategoryEnum } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import {
  FINANCE_INCOME_CATEGORY_LABELS,
  MANUAL_INCOME_CATEGORIES,
  MANUAL_INCOME_ONLY_MESSAGE,
  FinanceExpenseCategory,
  FinanceIncomeCategory,
} from './finance-categories';
import { FINANCE_START_DATE } from './finance-period';

/**
 * 「记一笔」手工收支（设计文档 §5.3 / §6.2）。
 *
 * 手工条目是唯一由人直接写入财务的来源，所以校验顺序写死：
 * 金额 > 0（最多两位小数）→ 方向合法 → 类别齐全且合法 → 发生日落在
 * `[起账日, 今天]`。接口报错稳定，小程序能按第一条错误定位输入框。
 *
 * 落库口径：
 * - `occurredAt` 是 date-only（`@db.Date`），按 UTC 零点存：Prisma 对 DATE 列
 *   取 UTC 日期部分，写上海零点（`+08:00`）会退成前一天，11-01 会掉出 11 月区间
 *   （同类生产事故见 custom-recipe.service.ts 2026-10-19 的注释）；
 * - 支出只写 `category`、收入只写 `incomeCategory`，另一侧留 NULL，
 *   避免明细/汇总两侧各读一个字段时出现双重归类；
 * - 手工收入只允许「其他收入」：其余收入类别由系统按来源自动记录，
 *   手工标上去会导致手续费与订单口径对不上（§6.2）；
 * - 作废不物理删除：只写 `voidedAt` / `voidReason`，明细查询已按
 *   `voidedAt: null` 排除（见 finance-income / finance-expense 服务）。
 */

export type ManualEntryDirection = 'INCOME' | 'EXPENSE';

export type ManualEntryPayerType = 'COMPANY' | 'PERSONAL';

export type CreateManualEntryInput = {
  direction: ManualEntryDirection;
  /** 金额（元，正数，最多两位小数） */
  amount: number;
  /** 发生日（YYYY-MM-DD，上海日历日） */
  occurredAt: string;
  /** 支出类别；支出必填、收入忽略 */
  category?: string | null;
  /** 收入类别；收入必填、支出忽略 */
  incomeCategory?: string | null;
  payerType?: ManualEntryPayerType;
  payerUserId?: string | null;
  /** 一句话说明（必填，例：封口机） */
  title: string;
  note?: string | null;
  proofKeys?: string[];
};

/** 校验后的落库形状（两边类别已经按方向归一） */
type NormalizedManualEntry = {
  direction: ManualEntryDirection;
  amount: number;
  occurredAt: Date;
  category: FinanceExpenseCategory | null;
  incomeCategory: FinanceIncomeCategory | null;
  payerType: ManualEntryPayerType;
  payerUserId: string | null;
  title: string;
  note: string | null;
  proofKeys: string[];
};

/**
 * 支出分类只认 `FinanceExpenseCategory` 枚举内（数据库 enum）的值。
 * 直接取 Prisma 生成的运行时枚举：迁移新增分类并 `prisma generate` 后自动并入，
 * 不会出现「标签表漏加一项就写不进去」的问题。
 */
const EXPENSE_CATEGORY_CODES = new Set<string>(
  Object.values(FinanceExpenseCategoryEnum),
);

/** 收入分类只认 `FINANCE_INCOME_CATEGORY_LABELS` 的 key（不建 enum，见 §6.2） */
const INCOME_CATEGORY_CODES = new Set<string>(
  Object.keys(FINANCE_INCOME_CATEGORY_LABELS),
);

/** 手工收入只允许「其他收入」，其余来源由系统按业务表自动记录 */
const MANUAL_INCOME_CATEGORY_CODES = new Set<string>(MANUAL_INCOME_CATEGORIES);

/** 金额：必须 > 0 且最多两位小数；返回按分取整后的元 */
function parseAmount(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input) || input <= 0) {
    throw new BadRequestException('金额必须大于 0');
  }
  const cents = Math.round(input * 100);
  if (Math.abs(cents - input * 100) > 1e-6) {
    throw new BadRequestException('金额最多两位小数');
  }
  return cents / 100;
}

function parseDirection(input: unknown): ManualEntryDirection {
  if (input !== 'INCOME' && input !== 'EXPENSE') {
    throw new BadRequestException('方向必须是 INCOME 或 EXPENSE');
  }
  return input;
}

/** 按方向校验类别，并把另一侧的类别清空 */
function resolveCategory(
  direction: ManualEntryDirection,
  category: unknown,
  incomeCategory: unknown,
): Pick<NormalizedManualEntry, 'category' | 'incomeCategory'> {
  if (direction === 'EXPENSE') {
    if (!category) {
      throw new BadRequestException('支出必须选择类别');
    }
    if (!EXPENSE_CATEGORY_CODES.has(String(category))) {
      throw new BadRequestException('支出类别不合法');
    }
    return {
      category: category as FinanceExpenseCategory,
      incomeCategory: null,
    };
  }

  if (!incomeCategory) {
    throw new BadRequestException('收入必须选择收入类别');
  }
  if (!INCOME_CATEGORY_CODES.has(String(incomeCategory))) {
    throw new BadRequestException('收入类别不合法');
  }
  if (!MANUAL_INCOME_CATEGORY_CODES.has(String(incomeCategory))) {
    throw new BadRequestException(MANUAL_INCOME_ONLY_MESSAGE);
  }
  return {
    category: null,
    incomeCategory: incomeCategory as FinanceIncomeCategory,
  };
}

/** 发生日：不早于起账日、不晚于今天；date-only 列按 UTC 零点落库 */
function parseOccurredAt(input: unknown): Date {
  let dateOnly: Date;
  try {
    dateOnly = TimezoneUtil.parseDateOnly(String(input ?? ''));
  } catch {
    throw new BadRequestException('发生日必须是 YYYY-MM-DD');
  }

  const dateKey = dateOnly.toISOString().slice(0, 10);
  if (dateKey < FINANCE_START_DATE) {
    throw new BadRequestException(
      `发生日不能早于起账日（${FINANCE_START_DATE}）`,
    );
  }
  // 上海日历日字符串比较即可（同为 YYYY-MM-DD）
  if (dateKey > TimezoneUtil.shanghaiDateKey(new Date())) {
    throw new BadRequestException('发生日不能晚于今天');
  }

  // `@db.Date` 取 UTC 日期部分：必须是 `2026-11-05T00:00:00.000Z`，
  // 不是上海零点（后者等于 UTC 前一天，11-01 会落到 10-31）。
  return TimezoneUtil.parseDateOnly(dateKey);
}

/** 校验顺序固定：金额 → 方向 → 类别 → 日期 */
function normalizeInput(input: CreateManualEntryInput): NormalizedManualEntry {
  const amount = parseAmount(input.amount);
  const direction = parseDirection(input.direction);
  const { category, incomeCategory } = resolveCategory(
    direction,
    input.category,
    input.incomeCategory,
  );
  const occurredAt = parseOccurredAt(input.occurredAt);

  return {
    direction,
    amount,
    occurredAt,
    category,
    incomeCategory,
    payerType: input.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
    payerUserId: input.payerUserId ?? null,
    title: input.title,
    note: input.note ?? null,
    proofKeys: input.proofKeys ?? [],
  };
}

@Injectable()
export class FinanceManualEntryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateManualEntryInput,
  ): Promise<{ id: string }> {
    const data = normalizeInput(input);
    const created = await this.prisma.financeManualEntry.create({
      data: { ...data, createdById: userId },
      select: { id: true },
    });
    return { id: created.id };
  }

  /**
   * 修改手工条目：先按「合并后的结果」重新校验，再整条写回。
   * 已作废的条目视为不可再改（作废保留历史，不允许改完再复活）。
   */
  async update(
    userId: string,
    id: string,
    input: Partial<CreateManualEntryInput>,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.financeManualEntry.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('手工条目不存在');
    }
    if (existing.voidedAt) {
      throw new BadRequestException('已作废的条目不能修改');
    }

    const merged: CreateManualEntryInput = {
      direction: (input.direction ??
        existing.direction) as ManualEntryDirection,
      amount: input.amount ?? Number(existing.amount),
      // DATE 列读回来就是 UTC 零点，直接取 UTC 日期部分；
      // 再走一次上海时区换算会每改一次退一天。
      occurredAt:
        input.occurredAt ?? existing.occurredAt.toISOString().slice(0, 10),
      category:
        input.category !== undefined ? input.category : existing.category,
      incomeCategory:
        input.incomeCategory !== undefined
          ? input.incomeCategory
          : existing.incomeCategory,
      payerType: (input.payerType ??
        existing.payerType) as ManualEntryPayerType,
      payerUserId:
        input.payerUserId !== undefined
          ? input.payerUserId
          : existing.payerUserId,
      title: input.title ?? existing.title,
      note: input.note !== undefined ? input.note : existing.note,
      proofKeys: input.proofKeys ?? existing.proofKeys,
    };

    const data = normalizeInput(merged);
    await this.prisma.financeManualEntry.update({
      where: { id },
      data,
      select: { id: true },
    });
    return { id };
  }

  /** 作废：写 voidedAt + 原因，不物理删除；已作废的再作废按找不到处理 */
  async void(
    userId: string,
    id: string,
    reason: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.financeManualEntry.findUnique({
      where: { id },
    });
    if (!existing || existing.voidedAt) {
      throw new NotFoundException('手工条目不存在或已作废');
    }

    await this.prisma.financeManualEntry.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: reason },
    });
    return { id };
  }
}
