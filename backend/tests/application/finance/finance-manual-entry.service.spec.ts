import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceManualEntryService } from 'src/application/finance/finance-manual-entry.service';
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

/** 上海当天零点（occurredAt 落库形状） */
const shanghaiMidnight = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00+08:00`).toISOString();

const makePrisma = (row: any = null) => ({
  financeManualEntry: {
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    findUnique: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ id: 'm1' }),
  },
});

/** 一条合法的支出（只覆盖要测的字段） */
const expenseInput = (overrides: Record<string, unknown> = {}) =>
  ({
    direction: 'EXPENSE',
    amount: 10,
    occurredAt: '2026-11-05',
    category: 'EQUIPMENT',
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
  occurredAt: new Date('2026-11-05T00:00:00+08:00'),
  category: 'EQUIPMENT',
  incomeCategory: null,
  payerType: 'PERSONAL',
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
      service.create('u1', expenseInput({ category: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', incomeInput({ incomeCategory: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('枚举/常量之外的类别被拒绝', async () => {
    const service = new FinanceManualEntryService(makePrisma() as any);

    await expect(
      service.create('u1', expenseInput({ category: 'SALARY' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', incomeInput({ incomeCategory: 'BONUS' })),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('创建时 occurredAt 落库为当天上海零点，支出只写 category', async () => {
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
    expect(data.occurredAt.toISOString()).toBe(shanghaiMidnight('2026-11-05'));
    expect(data.createdById).toBe('u1');
    expect(data.direction).toBe('EXPENSE');
    expect(data.amount).toBe(120.5);
    expect(data.category).toBe('EQUIPMENT');
    expect(data.incomeCategory).toBeNull();
    expect(data.note).toBe('买了封口机');
    expect(data.proofKeys).toEqual(['finance/proof-1.jpg']);
  });

  it('创建收入时只写 incomeCategory，付款方缺省为个人', async () => {
    const prisma: any = makePrisma();

    await new FinanceManualEntryService(prisma).create('u1', incomeInput());

    const data = prisma.financeManualEntry.create.mock.calls[0][0].data;
    expect(data.category).toBeNull();
    expect(data.incomeCategory).toBe('OTHER_INCOME');
    expect(data.payerType).toBe('PERSONAL');
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
