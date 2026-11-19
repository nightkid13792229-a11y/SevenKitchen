import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CreateExpenseTemplateDto } from '../../interfaces/dto/finance/create-expense-template.dto';
import {
  FINANCE_EXPENSE_CATEGORY_LABELS,
  FinanceExpenseCategory,
} from './finance-categories';
import { monthDateOnlyRange } from './finance-period';
import { TimezoneUtil } from '../../utils/timezone.util';

/**
 * 固定费用模板（设计文档 §4.7 / §5.4 / §6.4）。
 *
 * 生成规则：
 * - `MONTHLY` 每月生成；`QUARTERLY` 只在 1/4/7/10 月；`YEARLY` 只在 `monthOfYear`；
 * - 同一模板 + 同一费属起始月只生成一张（`createMany` 前先按
 *   `recognitionStart ∈ [当月 1 日, 下月 1 日)` 排重），定时任务重跑不会重复；
 * - `recognitionStart` 是 `@db.Date`，一律 UTC 零点；`recognitionEnd` 按
 *   `servicePeriodMonths` 顺延后再减一天（年付 12 个月 = 次年同月起前一天）；
 * - 账单金额取模板 `defaultAmount`，付款方继承模板默认值；
 * - 停用只影响以后：只改 `isActive`，不动已生成的历史账单。
 */

export type ExpenseTemplateInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export type ExpensePayerType = 'COMPANY' | 'PERSONAL';

const TEMPLATE_INTERVALS: readonly ExpenseTemplateInterval[] = [
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
];

const PAYER_TYPES: readonly ExpensePayerType[] = ['COMPANY', 'PERSONAL'];

/** 新建/编辑模板的入参（HTTP DTO 与单测共用） */
export type CreateExpenseTemplateInput = {
  name: string;
  titleTemplate: string;
  category: FinanceExpenseCategory;
  payeeName: string;
  defaultAmount: number;
  interval: ExpenseTemplateInterval;
  dayOfMonth?: number;
  monthOfYear?: number | null;
  servicePeriodMonths?: number;
  payerType?: ExpensePayerType;
  payerUserId?: string | null;
  note?: string | null;
};

/** 校验后的落库形状 */
type NormalizedTemplate = {
  name: string;
  titleTemplate: string;
  category: FinanceExpenseCategory;
  payeeName: string;
  defaultAmount: number;
  interval: ExpenseTemplateInterval;
  dayOfMonth: number;
  monthOfYear: number | null;
  servicePeriodMonths: number;
  payerType: ExpensePayerType;
  payerUserId: string | null;
  note: string | null;
};

const EXPENSE_CATEGORY_CODES = new Set<string>(
  Object.keys(FINANCE_EXPENSE_CATEGORY_LABELS),
);

/** 非空字符串，否则 400 */
function requireText(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${field}不能为空`);
  return text;
}

/** 金额 > 0 且最多两位小数 */
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

function parseInteger(
  input: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const value = Number(input);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${field}必须是 ${min}-${max} 的整数`);
  }
  return value;
}

function parseInterval(input: unknown): ExpenseTemplateInterval {
  if (!TEMPLATE_INTERVALS.includes(input as ExpenseTemplateInterval)) {
    throw new BadRequestException('周期必须是 MONTHLY / QUARTERLY / YEARLY');
  }
  return input as ExpenseTemplateInterval;
}

function parsePayerType(input: unknown): ExpensePayerType {
  if (!PAYER_TYPES.includes(input as ExpensePayerType)) {
    throw new BadRequestException('付款方必须是 COMPANY 或 PERSONAL');
  }
  return input as ExpensePayerType;
}

/**
 * 合并默认值并校验。`current` 用于编辑：未提交的字段沿用库里的值，
 * 这样「只改金额」不会把周期、服务期等字段冲成默认值。
 */
function normalizeTemplateInput(
  input: Partial<CreateExpenseTemplateInput>,
  current?: {
    name: string;
    titleTemplate: string;
    category: string;
    payeeName: string;
    defaultAmount: unknown;
    interval: string;
    dayOfMonth: number | null;
    monthOfYear: number | null;
    servicePeriodMonths: number;
    payerType: string;
    payerUserId: string | null;
    note: string | null;
  },
): NormalizedTemplate {
  const interval = parseInterval(
    input.interval ?? current?.interval ?? 'MONTHLY',
  );

  const category = String(input.category ?? current?.category ?? '');
  if (!EXPENSE_CATEGORY_CODES.has(category)) {
    throw new BadRequestException('支出类别不合法');
  }

  const monthOfYearInput =
    input.monthOfYear !== undefined
      ? input.monthOfYear
      : (current?.monthOfYear ?? null);
  let monthOfYear: number | null = null;
  if (interval === 'YEARLY') {
    if (monthOfYearInput === null || monthOfYearInput === undefined) {
      throw new BadRequestException('年付模板必须指定月份（monthOfYear）');
    }
    monthOfYear = parseInteger(monthOfYearInput, '月份', 1, 12);
  }

  return {
    name: requireText(input.name ?? current?.name, '名称'),
    titleTemplate: requireText(
      input.titleTemplate ?? current?.titleTemplate,
      '标题模板',
    ),
    category: category as FinanceExpenseCategory,
    payeeName: requireText(input.payeeName ?? current?.payeeName, '收款方'),
    defaultAmount: parseAmount(
      input.defaultAmount ?? Number(current?.defaultAmount ?? NaN),
    ),
    interval,
    dayOfMonth: parseInteger(
      input.dayOfMonth ?? current?.dayOfMonth ?? 1,
      '几号',
      1,
      31,
    ),
    monthOfYear,
    servicePeriodMonths: parseInteger(
      input.servicePeriodMonths ?? current?.servicePeriodMonths ?? 1,
      '服务期月数',
      1,
      120,
    ),
    payerType: parsePayerType(
      input.payerType ?? current?.payerType ?? 'PERSONAL',
    ),
    payerUserId:
      input.payerUserId !== undefined
        ? input.payerUserId
        : (current?.payerUserId ?? null),
    note: input.note !== undefined ? input.note : (current?.note ?? null),
  };
}

/** 该模板在指定月份是否应生成账单 */
function isTemplateDueInMonth(
  template: { interval: string; monthOfYear: number | null },
  month: number,
): boolean {
  if (template.interval === 'MONTHLY') return true;
  if (template.interval === 'QUARTERLY') return (month - 1) % 3 === 0;
  if (template.interval === 'YEARLY')
    return Number(template.monthOfYear) === month;
  return false;
}

/** 账单号：FB + 年月日 + 批次序号 + 随机尾号（≤ 24 位） */
function buildTemplateBillNumber(
  dateKey: string,
  index: number,
  now: Date = new Date(),
): string {
  const suffix = `${String(index + 1).padStart(2, '0')}${now
    .getTime()
    .toString()
    .slice(-3)}`;
  return `FB${dateKey.replace(/-/g, '')}${suffix}`;
}

@Injectable()
export class ExpenseTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** 旧后台接口沿用：原样落库（不做新校验，避免改变旧行为） */
  createTemplate(createdById: string, dto: CreateExpenseTemplateDto) {
    return this.prisma.expenseTemplate.create({
      data: {
        ...dto,
        createdById,
      },
    });
  }

  /** 新建固定费用模板（后台接口 / 小程序固定费用页共用） */
  async create(userId: string, input: CreateExpenseTemplateInput) {
    const data = normalizeTemplateInput(input);
    return this.prisma.expenseTemplate.create({
      data: { ...data, createdById: userId },
    });
  }

  /** 编辑模板：只影响以后生成的账单，不改历史账单 */
  async update(
    _userId: string,
    id: string,
    input: Partial<CreateExpenseTemplateInput>,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.expenseTemplate.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('固定费用模板不存在');

    const data = normalizeTemplateInput(input, existing);
    await this.prisma.expenseTemplate.update({ where: { id }, data });
    return { id };
  }

  /** 停用：只改 isActive，不物理删除、不动已生成账单 */
  async deactivate(_userId: string, id: string): Promise<{ id: string }> {
    const existing = await this.prisma.expenseTemplate.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('固定费用模板不存在');

    await this.prisma.expenseTemplate.update({
      where: { id },
      data: { isActive: false },
    });
    return { id };
  }

  listTemplates(options: { includeInactive?: boolean } = {}) {
    return this.prisma.expenseTemplate.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: [{ interval: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * 为指定月份补生成固定费用账单（幂等）。
   *
   * `month` 形如 `2026-11`；重复调用、定时任务重跑都只会在第一次写库。
   */
  async generateForMonth(
    month: string,
    createdById = 'system',
  ): Promise<{ created: number }> {
    const range = monthDateOnlyRange(month);
    const templates = await this.prisma.expenseTemplate.findMany({
      where: { isActive: true },
    });

    const dueTemplates = templates.filter((template) =>
      isTemplateDueInMonth(template, range.month),
    );
    if (dueTemplates.length === 0) return { created: 0 };

    const existing = await this.prisma.expenseBill.findMany({
      where: {
        templateId: { in: dueTemplates.map((template) => template.id) },
        recognitionStart: {
          gte: range.start,
          lt: range.endExclusive,
        },
      },
      select: { templateId: true },
    });
    const existingTemplateIds = new Set(
      existing.map((bill) => bill.templateId),
    );

    const dateKey = `${range.monthKey}-01`;
    const rows = dueTemplates
      .filter((template) => !existingTemplateIds.has(template.id))
      .map((template, index) => {
        const serviceMonths = Math.max(
          1,
          Number(template.servicePeriodMonths ?? 1),
        );
        // 服务期 N 个月 = [本月 1 日, N 个月后的 1 日) 的最后一天；
        // 全部用 Date.UTC 计算，避免本地时区把 UTC 零点推回前一天。
        const recognitionStart = range.start;
        const recognitionEnd = new Date(
          Date.UTC(range.year, range.month - 1 + serviceMonths, 0),
        );
        const dayOfMonth = Math.min(
          Math.max(1, Number(template.dayOfMonth ?? 1)),
          range.daysInMonth,
        );
        const dueAt = new Date(
          Date.UTC(range.year, range.month - 1, dayOfMonth),
        );
        const title = String(template.titleTemplate)
          .replace(/\{\{year\}\}/g, String(range.year))
          .replace(/\{\{month\}\}/g, String(range.month));

        return {
          billNumber: buildTemplateBillNumber(dateKey, index, new Date()),
          title,
          category: template.category,
          status: 'PENDING_PAYMENT' as const,
          payeeName: template.payeeName,
          amount: Number(template.defaultAmount),
          recognitionStart,
          recognitionEnd,
          dueAt,
          note: template.note ?? null,
          templateId: template.id,
          payerType: template.payerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
          payerUserId: template.payerUserId ?? null,
          createdById,
        };
      });

    if (rows.length === 0) return { created: 0 };

    try {
      // 已有账单的排重靠「先查」，并发竞态由 (templateId, recognitionStart)
      // 唯一约束兜底：skipDuplicates 让数据库直接跳过撞键的行。
      const result = await this.prisma.expenseBill.createMany({
        data: rows,
        skipDuplicates: true,
      });
      return { created: result.count };
    } catch (error) {
      // 老库/驱动不支持 skipDuplicates 时，唯一键冲突等价于「已经生成过」，
      // 仍然返回 created=0，不让定时任务或补生成接口报 500。
      if ((error as { code?: string } | null)?.code === 'P2002') {
        return { created: 0 };
      }
      throw error;
    }
  }

  /**
   * 每日定时任务入口：按上海当前月份调用 `generateForMonth`。
   * 保留方法名给旧调度器/测试用，返回值从「账单数组」改为 `{ created }`。
   */
  generateDueBills(now: Date, createdById: string) {
    const month = TimezoneUtil.shanghaiDateKey(now).slice(0, 7);
    return this.generateForMonth(month, createdById);
  }
}
