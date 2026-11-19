import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceManualEntryService } from 'src/application/finance/finance-manual-entry.service';
import { monthRange } from 'src/application/finance/finance-period';
import { TimezoneUtil } from 'src/utils/timezone.util';

/**
 * 「记一笔」手工收支的校验与落库口径（设计文档 §5.3 / §6.2）。
 *
 * 校验顺序固定：金额 > 0（两位小数）→ 方向合法 → 类别齐全且合法
 * → 发生日落在 [起账日, 今天]。顺序写死是为了接口报错稳定，
 * 前端能按第一条错误直接定位到对应输入框。
 */

const TODAY = TimezoneUtil.shanghaiDateKey(new Date());
const TOMORROW = TimezoneUtil.shanghaiDateKey(
  TimezoneUtil.addDays(TimezoneUtil.toShanghaiDateOnly(new Date()), 1),
);

/**
 * `occurredAt` 落库形状：date-only 列按 UTC 零点存。
 *
 * Prisma 对 `@db.Date` 取 UTC 日期部分；写上海零点（`+08:00`）会变成 UTC 前一天，
 * 11-01 会落到 10-31 从而掉出 11 月区间（同类生产事故见
 * `custom-recipe.service.ts` 2026-10-19 的注释）。
 */
const utcDateOnly = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00.000Z`).toISOString();

/** 类别字典里「设备工具」那一行（支出落库会按它回填旧枚举 code） */
const EQUIPMENT_CATEGORY = {
  id: 'c-equip',
  name: '设备工具',
  code: 'EQUIPMENT',
  isSystem: false,
  isActive: true,
};

const makePrisma = (
  row: any = null,
  categoryRef: any = EQUIPMENT_CATEGORY,
) => ({
  financeManualEntry: {
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    findUnique: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ id: 'm1' }),
  },
  financeCategory: {
    findUnique: jest.fn().mockResolvedValue(categoryRef),
  },
});

/** 一条合法的支出（只覆盖要测的字段） */
const expenseInput = (overrides: Record<string, unknown> = {}) =>
  ({
    direction: 'EXPENSE',
    amount: 10,
    occurredAt: '2026-11-05',
    categoryId: 'c-equip',
    title: '封口机',
    ...overrides,
  }) as any;

const incomeInput = (overrides: Record<string, unknown> = {}) =>
  ({
    direction: 'INCOME',
    amount: 88,
    occurredAt: '2026-11-05',
    incomeCategory: 'OTHER_INCOME',
    title: '零星收入',
    ...overrides,
  }) as any;

/** 库里已存在的支出条目（update/void 用） */
const existingExpense = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  direction: 'EXPENSE',
  amount: 10,
  occurredAt: new Date('2026-11-05T00:00:00.000Z'),
  category: 'EQUIPMENT',
  categoryId: 'c-equip',
  incomeCategory: null,
  payerType: 'PERSONAL',
  payerAccount: 'PERSONAL_WECHAT',
  payerUserId: null,
  title: '封口机',
  note: null,
  proofKeys: [],
  createdById: 'u1',
  voidedAt: null,
  ...overrides,
});

describe('FinanceManualEntryService.create', () => {
  it('金额必须大于 0', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ amount: 0 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', expenseInput({ amount: -1 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('金额最多两位小数', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ amount: 10.005 })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', expenseInput({ amount: 10.05 })),
    ).resolves.toEqual({ id: 'new' });
  });

  it('方向只能是 INCOME 或 EXPENSE', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ direction: 'TRANSFER' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('支出必须有类别，收入必须有收入类别', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ categoryId: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', incomeInput({ incomeCategory: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('categoryId 不存在或已停用时拒绝 400', async () => {
    const missing = new FinanceManualEntryService(
      makePrisma(null, null) as any,
    );
    await expect(
      missing.create('u1', expenseInput({ categoryId: 'nope' })),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 已停用（含已合并）的类别不能再被选用
    const inactive = new FinanceManualEntryService(
      makePrisma(null, { ...EQUIPMENT_CATEGORY, isActive: false }) as any,
    );
    await expect(
      inactive.create('u1', expenseInput({ categoryId: 'c-equip' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('枚举/常量之外的收入类别被拒绝', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', incomeInput({ incomeCategory: 'BONUS' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('payerAccount 非法时报 400，不静默落默认账户', async () => {
    const prisma: any = makePrisma();
    const service = new FinanceManualEntryService(prisma);

    await expect(
      service.create('u1', expenseInput({ payerAccount: 'BANK' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeManualEntry.create).not.toHaveBeenCalled();
  });

  it('手工收入只允许「其他收入」，其他来源类别由系统自动记录', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    // ONLINE_ORDER / OFFLINE_ORDER / SUPPLEMENT / CUSTOM_RECIPE 都能被系统自动归类，
    // 手工标成这些类别既不计手续费、又不进订单口径，两边对不上，必须拒绝。
    await expect(
      service.create('u1', incomeInput({ incomeCategory: 'ONLINE_ORDER' })),
    ).rejects.toThrow(/系统自动记录/);

    // 其他收入通过
    await expect(
      service.create('u1', incomeInput({ incomeCategory: 'OTHER_INCOME' })),
    ).resolves.toEqual({ id: 'new' });
  });

  it('发生日早于起账日被拒绝', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ occurredAt: '2026-10-31' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('发生日晚于今天被拒绝', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ occurredAt: TOMORROW })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('创建时 occurredAt 按 UTC 零点落库，支出写 categoryId 并按 code 回填旧枚举', async () => {
    const prisma: any = makePrisma();

    await new FinanceManualEntryService(prisma).create(
      'u1',
      expenseInput({
        amount: 120.5,
        note: '买了封口机',
        proofKeys: ['finance/proof-1.jpg'],
      }),
    );

    const data = prisma.financeManualEntry.create.mock.calls[0][0].data;
    expect(data.occurredAt.toISOString()).toBe(utcDateOnly('2026-11-05'));
    expect(data.createdById).toBe('u1');
    expect(data.direction).toBe('EXPENSE');
    expect(data.amount).toBe(120.5);
    expect(data.categoryId).toBe('c-equip');
    expect(data.category).toBe('EQUIPMENT');
    expect(data.incomeCategory).toBeNull();
    expect(data.note).toBe('买了封口机');
    expect(data.proofKeys).toEqual(['finance/proof-1.jpg']);
  });

  it('「工具」「杂物」类别建条目：不抛，旧枚举列留 NULL', async () => {
    // 类别字典允许 code 长成 TOOLS / SUNDRIES（报销杂费映射用），
    // 它们不在 Prisma 的 FinanceExpenseCategory 里，直接回填旧列会 500。
    for (const [code, name] of [
      ['TOOLS', '工具'],
      ['SUNDRIES', '杂物'],
    ] as const) {
      const prisma: any = makePrisma(null, {
        id: `c-${code}`,
        name,
        code,
        isSystem: false,
        isActive: true,
      });

      await expect(
        new FinanceManualEntryService(prisma).create(
          'u1',
          expenseInput({ categoryId: `c-${code}` }),
        ),
      ).resolves.toEqual({ id: 'new' });

      const data = prisma.financeManualEntry.create.mock.calls[0][0].data;
      expect(data.categoryId).toBe(`c-${code}`);
      // 手工条目的旧列可空：枚举外 code 一律留 NULL
      expect(data.category).toBeNull();
    }
  });

  it('起账日当天的条目落在 11 月区间内（date-only 不得退成 10-31）', async () => {
    const prisma: any = makePrisma();

    await new FinanceManualEntryService(prisma).create(
      'u1',
      expenseInput({ occurredAt: '2026-11-01' }),
    );

    const occurredAt: Date =
      prisma.financeManualEntry.create.mock.calls[0][0].data.occurredAt;
    const { from, to } = monthRange('2026-11');
    // 读回来必须是 11-01（UTC 零点），否则 10-31 会掉出 11 月区间、
    // 这笔在收入/支出/明细/月报里全部消失。
    expect(occurredAt.toISOString()).toBe(utcDateOnly('2026-11-01'));
    expect(occurredAt.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(occurredAt.getTime()).toBeLessThanOrEqual(to.getTime());
  });

  it('创建收入时只写 incomeCategory，不查类别字典；账户缺省「我的微信」', async () => {
    const prisma: any = makePrisma();

    await new FinanceManualEntryService(prisma).create('u1', incomeInput());

    const data = prisma.financeManualEntry.create.mock.calls[0][0].data;
    expect(data.category).toBeNull();
    expect(data.categoryId).toBeNull();
    expect(data.incomeCategory).toBe('OTHER_INCOME');
    expect(data.payerType).toBe('PERSONAL');
    expect(data.payerAccount).toBe('PERSONAL_WECHAT');
    expect(prisma.financeCategory.findUnique).not.toHaveBeenCalled();
  });

  it('显式账户原样落库（支出从哪个账户出）', async () => {
    const prisma: any = makePrisma();

    await new FinanceManualEntryService(prisma).create(
      'u1',
      expenseInput({ payerAccount: 'CASH' }),
    );

    const data = prisma.financeManualEntry.create.mock.calls[0][0].data;
    expect(data.payerAccount).toBe('CASH');
  });
});

describe('FinanceManualEntryService.update', () => {
  it('已作废的条目不允许修改', async () => {
    const prisma: any = makePrisma(existingExpense({ voidedAt: new Date() }));

    await expect(
      new FinanceManualEntryService(prisma).update('u2', 'm1', {
        amount: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeManualEntry.update).not.toHaveBeenCalled();
  });

  it('条目不存在报找不到', async () => {
    const prisma: any = makePrisma(null);

    await expect(
      new FinanceManualEntryService(prisma).update('u2', 'missing', {
        amount: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('更新返回 id，并按合并后的值重新校验与落库', async () => {
    const prisma: any = makePrisma(existingExpense());

    const result = await new FinanceManualEntryService(prisma).update(
      'u2',
      'm1',
      { amount: 20, note: '改过' },
    );

    expect(result).toEqual({ id: 'm1' });
    const data = prisma.financeManualEntry.update.mock.calls[0][0].data;
    expect(data.amount).toBe(20);
    expect(data.note).toBe('改过');
    expect(data.category).toBe('EQUIPMENT');
    expect(data.categoryId).toBe('c-equip');
    expect(data.payerAccount).toBe('PERSONAL_WECHAT');
    // 没改日期时原样写回，不能每改一次就退一天
    expect(data.occurredAt.toISOString()).toBe(utcDateOnly('2026-11-05'));
  });

  it('类别后来被停用，仍可修改该条目的其他字段（停用只影响以后）', async () => {
    const prisma: any = makePrisma(existingExpense(), {
      ...EQUIPMENT_CATEGORY,
      isActive: false,
    });

    await expect(
      new FinanceManualEntryService(prisma).update('u2', 'm1', {
        note: '改备注',
      }),
    ).resolves.toEqual({ id: 'm1' });
  });

  it('更新时改账户：合法账户落库，非法账户 400 且不写库', async () => {
    const prisma: any = makePrisma(existingExpense());

    await new FinanceManualEntryService(prisma).update('u2', 'm1', {
      payerAccount: 'PERSONAL_ALIPAY',
    });
    expect(
      prisma.financeManualEntry.update.mock.calls[0][0].data.payerAccount,
    ).toBe('PERSONAL_ALIPAY');

    prisma.financeManualEntry.update.mockClear();
    await expect(
      new FinanceManualEntryService(prisma).update('u2', 'm1', {
        payerAccount: 'ALIPAY',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeManualEntry.update).not.toHaveBeenCalled();
  });

  it('更新时金额仍须大于 0', async () => {
    const prisma: any = makePrisma(existingExpense());

    await expect(
      new FinanceManualEntryService(prisma).update('u2', 'm1', { amount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeManualEntry.update).not.toHaveBeenCalled();
  });
});

describe('FinanceManualEntryService.void', () => {
  it('作废已作废的条目报找不到', async () => {
    const prisma: any = makePrisma(existingExpense({ voidedAt: new Date() }));

    await expect(
      new FinanceManualEntryService(prisma).void('u1', 'm1', '录错'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('作废不存在的条目报找不到', async () => {
    const prisma: any = makePrisma(null);

    await expect(
      new FinanceManualEntryService(prisma).void('u1', 'missing', '录错'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('作废写入 voidedAt 与原因', async () => {
    const prisma: any = makePrisma(existingExpense());

    const result = await new FinanceManualEntryService(prisma).void(
      'u1',
      'm1',
      '录错',
    );

    expect(result).toEqual({ id: 'm1' });
    expect(prisma.financeManualEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({
          voidedAt: expect.any(Date),
          voidReason: '录错',
        }),
      }),
    );
  });
});
