import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import {
  FINANCE_INCOME_CATEGORY_LABELS,
  MANUAL_INCOME_CATEGORIES,
  MANUAL_INCOME_ONLY_MESSAGE,
  FinanceExpenseCategory,
  FinanceIncomeCategory,
} from './finance-categories';
import { FinanceAccount, normalizeFinanceAccount } from './finance-accounts';
import { toLegacyExpenseCategory } from './finance-legacy-category';
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
 * - 支出写 `categoryId`（类别字典，必须是启用类别），旧枚举列 `category`
 *   按类别 `code` 回填一版兼容；自建类别没有 code，旧列留 NULL；
 * - 收入只写 `incomeCategory`，支出侧两个类别字段都留 NULL，
 *   避免明细/汇总两侧各读一个字段时出现双重归类；
 * - `payerAccount` 是「钱从哪个账户进出」，空值缺省「我的微信」，非法值 400；
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
  /** 支出类别 id（类别字典）；支出必填、收入忽略 */
  categoryId?: string | null;
  /** 收入类别；收入必填、支出忽略 */
  incomeCategory?: string | null;
  payerType?: ManualEntryPayerType;
  payerUserId?: string | null;
  /** 出账/入账账户；缺省 PERSONAL_WECHAT */
  payerAccount?: string | null;
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
  /** 类别字典引用（支出必填） */
  categoryId: string | null;
  /** 旧枚举列：按类别 code 回填一版兼容，自建类别为 NULL */
  category: FinanceExpenseCategory | null;
  incomeCategory: FinanceIncomeCategory | null;
  payerType: ManualEntryPayerType;
  payerUserId: string | null;
  payerAccount: FinanceAccount;
  title: string;
  note: string | null;
  proofKeys: string[];
};

/** 类别字典里的一行（只取校验/回填需要的字段） */
type FinanceCategoryRef = {
  id: string;
  code: string | null;
  isActive: boolean;
};

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

/** 收入类别校验：只认常量表，且手工只允许「其他收入」 */
function resolveIncomeCategory(incomeCategory: unknown): FinanceIncomeCategory {
  if (!incomeCategory) {
    throw new BadRequestException('收入必须选择收入类别');
  }
  if (!INCOME_CATEGORY_CODES.has(String(incomeCategory))) {
    throw new BadRequestException('收入类别不合法');
  }
  if (!MANUAL_INCOME_CATEGORY_CODES.has(String(incomeCategory))) {
    throw new BadRequestException(MANUAL_INCOME_ONLY_MESSAGE);
  }
  return incomeCategory as FinanceIncomeCategory;
}

/**
 * 支出类别：必填、必须存在且启用。
 *
 * `currentCategoryId` 是编辑时库里的值：沿用一个后来被停用的类别时放行，
 * 否则一条老记录连备注都改不了（停用/合并只影响以后，不该锁死历史记录）。
 */
async function resolveExpenseCategory(
  prisma: PrismaService,
  categoryId: unknown,
  currentCategoryId: string | null,
): Promise<FinanceCategoryRef> {
  const id = typeof categoryId === 'string' ? categoryId.trim() : '';
  if (!id) {
    throw new BadRequestException('支出必须选择类别');
  }
  const ref = await prisma.financeCategory.findUnique({ where: { id } });
  if (!ref) {
    throw new BadRequestException('支出类别不合法');
  }
  if (!ref.isActive && ref.id !== currentCategoryId) {
    throw new BadRequestException('支出类别已停用，请重新选择');
  }
  return ref;
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

/**
 * 校验顺序固定：金额 → 方向 → 类别 → 日期 → 账户。
 *
 * 类别要查库（必须是启用类别），所以整体是异步的。
 */
async function normalizeInput(
  prisma: PrismaService,
  input: CreateManualEntryInput,
  current?: { categoryId: string | null },
): Promise<NormalizedManualEntry> {
  const amount = parseAmount(input.amount);
  const direction = parseDirection(input.direction);

  let categoryId: string | null = null;
  let category: FinanceExpenseCategory | null = null;
  let incomeCategory: FinanceIncomeCategory | null = null;
  if (direction === 'EXPENSE') {
    const ref = await resolveExpenseCategory(
      prisma,
      input.categoryId,
      current?.categoryId ?? null,
    );
    categoryId = ref.id;
    // 旧枚举列只回填 Prisma 枚举真实值；自建类别 / TOOLS / SUNDRIES 留 NULL
    category = toLegacyExpenseCategory(ref.code);
  } else {
    incomeCategory = resolveIncomeCategory(input.incomeCategory);
  }

  const occurredAt = parseOccurredAt(input.occurredAt);

  return {
    direction,
    amount,
    occurredAt,
    categoryId,
    category,
    incomeCategory,
    payerType: input.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
    payerUserId: input.payerUserId ?? null,
    payerAccount: normalizeFinanceAccount(input.payerAccount),
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
    const data = await normalizeInput(this.prisma, input);
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
      categoryId:
        input.categoryId !== undefined ? input.categoryId : existing.categoryId,
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
      payerAccount:
        input.payerAccount !== undefined
          ? input.payerAccount
          : existing.payerAccount,
      title: input.title ?? existing.title,
      note: input.note !== undefined ? input.note : existing.note,
      proofKeys: input.proofKeys ?? existing.proofKeys,
    };

    const data = await normalizeInput(this.prisma, merged, {
      categoryId: existing.categoryId,
    });
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
