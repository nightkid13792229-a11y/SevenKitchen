import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpenseBillService } from '../../../src/application/finance/expense-bill.service';
import { ExpenseTemplateService } from '../../../src/application/finance/expense-template.service';
import { TimezoneUtil } from '../../../src/utils/timezone.util';

/**
 * 固定费用（设计文档 §4.7 / §5.4 / §6.4）。
 *
 * 两条铁律：
 * 1. `recognitionStart/End` 是 `@db.Date`，一律 UTC 零点——写上海零点会落成前一天；
 * 2. 同一模板 + 同一费属起始月只生成一张，定时任务重跑、手动补生成都不能重复。
 */

/** `@db.Date` 落库形状：UTC 零点 */
const utcDateOnly = (dateKey: string): Date =>
  new Date(`${dateKey}T00:00:00.000Z`);

/** 一条启用中的模板（只覆盖用例关心的字段） */
const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: 't1',
  name: '房租',
  titleTemplate: '{{year}}年{{month}}月房租',
  category: 'RENT',
  payeeName: '房东',
  defaultAmount: 6000,
  interval: 'MONTHLY',
  dayOfMonth: 5,
  monthOfYear: null,
  servicePeriodMonths: 1,
  payerType: 'PERSONAL',
  payerUserId: 'u1',
  isActive: true,
  note: null,
  ...overrides,
});

const makeTemplatePrisma = (
  templates: any[] = [],
  existingTemplateIds: string[] = [],
) => {
  const prisma: any = {
    expenseTemplate: {
      findMany: jest.fn().mockResolvedValue(templates),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't-new', ...data })),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't1', ...data })),
    },
    expenseBill: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          existingTemplateIds.map((templateId) => ({ templateId })),
        ),
      createMany: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ count: data.length }),
        ),
    },
  };
  return prisma;
};

const makeBillPrisma = () => {
  const prisma: any = {
    expenseBill: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'b1', ...data })),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    expenseBillPayment: {
      create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
      // 默认「还没付过」；需要已付金额的用例再单独 mock
      aggregate: jest.fn().mockResolvedValue({ _sum: { paidAmount: 0 } }),
    },
  };
  return prisma;
};

const makeBill = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  billNumber: 'FB20261101001',
  title: '2026年11月房租',
  category: 'RENT',
  status: 'PENDING_PAYMENT',
  payeeName: '房东',
  amount: 6000,
  recognitionStart: utcDateOnly('2026-11-01'),
  recognitionEnd: utcDateOnly('2026-11-30'),
  dueAt: utcDateOnly('2026-11-05'),
  templateId: 't1',
  payerType: 'PERSONAL',
  payerUserId: 'u1',
  ...overrides,
});

describe('ExpenseTemplateService.generateForMonth', () => {
  it('按月模板生成整月账单：UTC 零点、模板金额、标题替换', async () => {
    const prisma = makeTemplatePrisma([makeTemplate()]);
    const service = new ExpenseTemplateService(prisma);

    const result = await service.generateForMonth('2026-11');

    expect(result).toEqual({ created: 1 });
    expect(prisma.expenseBill.createMany).toHaveBeenCalledTimes(1);
    const rows = prisma.expenseBill.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      templateId: 't1',
      title: '2026年11月房租',
      category: 'RENT',
      status: 'PENDING_PAYMENT',
      amount: 6000,
      payerType: 'PERSONAL',
      payerUserId: 'u1',
      createdById: 'system',
    });
    expect(rows[0].billNumber).toMatch(/^FB\d{8}/);
    expect(rows[0].recognitionStart.toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    expect(rows[0].recognitionEnd.toISOString()).toBe(
      '2026-11-30T00:00:00.000Z',
    );
    expect(rows[0].dueAt.toISOString()).toBe('2026-11-05T00:00:00.000Z');
  });

  it('同模板同费属起始月已有账单时跳过，保证幂等', async () => {
    const prisma = makeTemplatePrisma([makeTemplate()], ['t1']);
    const service = new ExpenseTemplateService(prisma);

    const result = await service.generateForMonth('2026-11');

    expect(result).toEqual({ created: 0 });
    expect(prisma.expenseBill.createMany).not.toHaveBeenCalled();
    // 只查本月（11-01 起、12-01 之前），其他月份的历史账单不影响
    expect(prisma.expenseBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recognitionStart: {
            gte: utcDateOnly('2026-11-01'),
            lt: utcDateOnly('2026-12-01'),
          },
        }),
      }),
    );
  });

  it('季度模板只在 1/4/7/10 月生成', async () => {
    const quarterly = makeTemplate({
      id: 'q1',
      interval: 'QUARTERLY',
      titleTemplate: '{{month}}月税费',
      servicePeriodMonths: 3,
    });

    const november = makeTemplatePrisma([quarterly]);
    await expect(
      new ExpenseTemplateService(november).generateForMonth('2026-11'),
    ).resolves.toEqual({ created: 0 });
    expect(november.expenseBill.createMany).not.toHaveBeenCalled();

    const october = makeTemplatePrisma([quarterly]);
    await expect(
      new ExpenseTemplateService(october).generateForMonth('2026-10'),
    ).resolves.toEqual({ created: 1 });
    expect(october.expenseBill.createMany).toHaveBeenCalledTimes(1);
  });

  it('年付模板只在 monthOfYear 指定月生成', async () => {
    const yearly = makeTemplate({
      id: 'y1',
      interval: 'YEARLY',
      titleTemplate: '{{year}}年域名续费',
      monthOfYear: 4,
      servicePeriodMonths: 12,
    });

    const november = makeTemplatePrisma([yearly]);
    await expect(
      new ExpenseTemplateService(november).generateForMonth('2026-11'),
    ).resolves.toEqual({ created: 0 });
    expect(november.expenseBill.createMany).not.toHaveBeenCalled();

    const april = makeTemplatePrisma([yearly]);
    await expect(
      new ExpenseTemplateService(april).generateForMonth('2026-04'),
    ).resolves.toEqual({ created: 1 });
    const row = april.expenseBill.createMany.mock.calls[0][0].data[0];
    expect(row.title).toBe('2026年域名续费');
    expect(row.recognitionStart.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(row.recognitionEnd.toISOString()).toBe('2027-03-31T00:00:00.000Z');
  });

  it('recognitionEnd 按 servicePeriodMonths 顺延（跨年）', async () => {
    const prisma = makeTemplatePrisma([
      makeTemplate({ servicePeriodMonths: 12 }),
    ]);

    await new ExpenseTemplateService(prisma).generateForMonth('2026-11');

    const row = prisma.expenseBill.createMany.mock.calls[0][0].data[0];
    expect(row.recognitionStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(row.recognitionEnd.toISOString()).toBe('2027-10-31T00:00:00.000Z');
  });

  it('只有符合周期的模板会被补生成', async () => {
    const prisma = makeTemplatePrisma([
      makeTemplate({ id: 'm1' }),
      makeTemplate({ id: 'q1', interval: 'QUARTERLY' }),
    ]);

    await new ExpenseTemplateService(prisma).generateForMonth('2026-11');

    const rows = prisma.expenseBill.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0].templateId).toBe('m1');
  });

  it('没有启用模板或入参月份不合法时不写库', async () => {
    const empty = makeTemplatePrisma([]);
    await expect(
      new ExpenseTemplateService(empty).generateForMonth('2026-11'),
    ).resolves.toEqual({ created: 0 });
    expect(empty.expenseBill.createMany).not.toHaveBeenCalled();

    const prisma = makeTemplatePrisma([makeTemplate()]);
    await expect(
      new ExpenseTemplateService(prisma).generateForMonth('2026-13'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      new ExpenseTemplateService(prisma).generateForMonth('2026/11'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ExpenseTemplateService.generateForMonth 并发幂等', () => {
  it('写库时带上 skipDuplicates，唯一约束冲突由数据库兜底', async () => {
    const prisma = makeTemplatePrisma([makeTemplate()]);
    await new ExpenseTemplateService(prisma).generateForMonth('2026-11');

    expect(prisma.expenseBill.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
  });

  it('并发撞唯一约束（P2002）时按幂等返回 created=0，不抛错', async () => {
    const prisma = makeTemplatePrisma([makeTemplate()]);
    prisma.expenseBill.createMany.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: 'P2002' }),
    );

    await expect(
      new ExpenseTemplateService(prisma).generateForMonth('2026-11'),
    ).resolves.toEqual({ created: 0 });
  });

  it('数据库跳过重复行时 created 以实际写入数为准', async () => {
    const prisma = makeTemplatePrisma([makeTemplate()]);
    prisma.expenseBill.createMany.mockResolvedValue({ count: 0 });

    await expect(
      new ExpenseTemplateService(prisma).generateForMonth('2026-11'),
    ).resolves.toEqual({ created: 0 });
  });

  it('ExpenseBill 对 (templateId, recognitionStart) 有唯一约束（迁移存在）', () => {
    const root = join(__dirname, '../../..');
    const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toMatch(/@@unique\(\[templateId, recognitionStart\]\)/);

    const migration = readFileSync(
      join(
        root,
        'prisma/migrations/20261119140000_expense_bill_template_period_unique/migration.sql',
      ),
      'utf8',
    );
    expect(migration).toContain('CREATE UNIQUE INDEX');
    expect(migration).toContain('"recognition_start"');
  });
});

describe('ExpenseTemplateService.create / update / deactivate', () => {
  it('create 接受季度与付款方，并补默认服务期 1 个月', async () => {
    const prisma = makeTemplatePrisma([]);
    const service = new ExpenseTemplateService(prisma);

    await service.create('u1', {
      name: '物业费',
      titleTemplate: '{{month}}月物业费',
      category: 'ADMINISTRATIVE',
      payeeName: '物业',
      defaultAmount: 300,
      interval: 'QUARTERLY',
      dayOfMonth: 10,
      payerType: 'COMPANY',
    });

    expect(prisma.expenseTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: 'u1',
        interval: 'QUARTERLY',
        payerType: 'COMPANY',
        servicePeriodMonths: 1,
        dayOfMonth: 10,
      }),
    });
  });

  it('create 拒绝不支持的周期、非法金额和缺 monthOfYear 的年付', async () => {
    const prisma = makeTemplatePrisma([]);
    const service = new ExpenseTemplateService(prisma);
    const base = {
      name: '房租',
      titleTemplate: '{{month}}月房租',
      category: 'RENT' as const,
      payeeName: '房东',
      defaultAmount: 6000,
      interval: 'MONTHLY' as const,
      dayOfMonth: 5,
    };

    await expect(
      service.create('u1', { ...base, interval: 'WEEKLY' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', { ...base, defaultAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create('u1', { ...base, interval: 'YEARLY' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseTemplate.create).not.toHaveBeenCalled();
  });

  it('update 合并原值后校验；停用只改 isActive，不动历史账单', async () => {
    const prisma = makeTemplatePrisma([]);
    prisma.expenseTemplate.findUnique.mockResolvedValue(makeTemplate());
    const service = new ExpenseTemplateService(prisma);

    await service.update('u1', 't1', { defaultAmount: 6500 });
    expect(prisma.expenseTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 't1' },
        data: expect.objectContaining({
          defaultAmount: 6500,
          interval: 'MONTHLY',
        }),
      }),
    );
    expect(prisma.expenseBill.createMany).not.toHaveBeenCalled();

    await service.deactivate('u1', 't1');
    expect(prisma.expenseTemplate.update).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { isActive: false },
    });
  });

  it('update / deactivate 找不到模板时报 404', async () => {
    const prisma = makeTemplatePrisma([]);
    prisma.expenseTemplate.findUnique.mockResolvedValue(null);
    const service = new ExpenseTemplateService(prisma);

    await expect(service.update('u1', 'nope', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deactivate('u1', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ExpenseBillService.listForMonth', () => {
  it('只取 recognitionStart 落在该月的应计账单（排除草稿/已取消）', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findMany.mockResolvedValue([makeBill()]);
    const service = new ExpenseBillService(prisma);

    const result = await service.listForMonth('2026-11');

    expect(result).toHaveLength(1);
    expect(prisma.expenseBill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recognitionStart: {
            gte: utcDateOnly('2026-11-01'),
            lt: utcDateOnly('2026-12-01'),
          },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        include: expect.objectContaining({ payments: expect.anything() }),
      }),
    );
  });

  it('月份格式非法时报 400', async () => {
    const service = new ExpenseBillService(makeBillPrisma());
    await expect(service.listForMonth('2026-11-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ExpenseBillService.pay', () => {
  it('部分付：写付款记录（UTC 零点）并置为 PARTIALLY_PAID，不改账单金额', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill());
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 0 },
    });
    const service = new ExpenseBillService(prisma);

    const result = await service.pay('u1', 'b1', {
      paidAmount: 2000,
      paidAt: '2026-11-05',
    });

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billId: 'b1',
        paidAmount: 2000,
        paidById: 'u1',
        paidAt: utcDateOnly('2026-11-05'),
        payerType: 'PERSONAL',
      }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PARTIALLY_PAID' },
    });
    expect(result).toMatchObject({ status: 'PARTIALLY_PAID' });
  });

  it('付满：按实际付款金额回写 bill.amount 并置为 PAID', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill());
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 0 },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {
      paidAmount: 6000,
      paidAt: '2026-11-05',
      payerType: 'COMPANY',
    });

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ payerType: 'COMPANY' }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6000 },
    });
  });

  it('实付与模板金额不同：付 6200 后账单金额回写为 6200', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill({ amount: 6000 }));
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 0 },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {
      paidAmount: 6200,
      paidAt: '2026-11-05',
    });

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paidAmount: 6200 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6200 },
    });
  });

  it('paidAmount 缺省用剩余应付，paidAt 缺省用今天（UTC 零点）', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill());
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 0 },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {});

    const expectedPaidAt = TimezoneUtil.toShanghaiDateOnly(new Date());
    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paidAmount: 6000,
        paidAt: expectedPaidAt,
      }),
    });
  });

  it('已部分付时缺省补齐剩余金额', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ status: 'PARTIALLY_PAID' }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 2000 },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {});

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paidAmount: 4000 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6000 },
    });
  });

  it('重复付款按累计金额判定状态', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill());
    prisma.expenseBillPayment.aggregate
      .mockResolvedValueOnce({ _sum: { paidAmount: 0 } })
      .mockResolvedValueOnce({ _sum: { paidAmount: 2000 } });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', { paidAmount: 2000, paidAt: '2026-11-05' });
    await service.pay('u1', 'b1', {
      paidAmount: 4000,
      paidAt: '2026-11-06',
    });

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledTimes(2);
    expect(prisma.expenseBill.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b1' },
      data: { status: 'PARTIALLY_PAID' },
    });
    expect(prisma.expenseBill.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6000 },
    });
  });

  it('尾款按整数分补齐：876.54 已付 500 后付 376.54 成功', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ amount: 876.54 }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: '500.00' },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {
      paidAmount: 376.54,
      paidAt: '2026-11-05',
    });

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paidAmount: 376.54 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 876.54 },
    });
  });

  it('尾款缺省金额也不因浮点误判超额：876.54 已付 500 直接补齐', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ amount: 876.54 }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: '500.00' },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {});

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paidAmount: 376.54 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 876.54 },
    });
  });

  it('6200.10 已付 0.03 时缺省付 6200.07 后 PAID', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ amount: 6200.1 }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: '0.03' },
    });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', {});

    expect(prisma.expenseBillPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ paidAmount: 6200.07 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6200.1 },
    });
  });

  it('两笔 0.1 + 0.2 合计精确等于 0.3，不出现浮点尾巴', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(makeBill({ amount: 0.3 }));
    prisma.expenseBillPayment.aggregate
      .mockResolvedValueOnce({ _sum: { paidAmount: 0 } })
      .mockResolvedValueOnce({ _sum: { paidAmount: '0.1' } });
    const service = new ExpenseBillService(prisma);

    await service.pay('u1', 'b1', { paidAmount: 0.1, paidAt: '2026-11-05' });
    await service.pay('u1', 'b1', { paidAmount: 0.2, paidAt: '2026-11-06' });

    expect(prisma.expenseBillPayment.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ paidAmount: 0.1 }),
    });
    expect(prisma.expenseBillPayment.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ paidAmount: 0.2 }),
    });
    expect(prisma.expenseBill.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'b1' },
      data: { status: 'PARTIALLY_PAID' },
    });
    expect(prisma.expenseBill.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 0.3 },
    });
  });

  it('剩余应付 <= 0 时直接置 PAID，不再写付款记录', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ status: 'PARTIALLY_PAID', amount: 6200.1 }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: '6200.10' },
    });
    const service = new ExpenseBillService(prisma);

    const result = await service.pay('u1', 'b1', {});

    expect(prisma.expenseBillPayment.create).not.toHaveBeenCalled();
    expect(prisma.expenseBill.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'PAID', amount: 6200.1 },
    });
    expect(result).toMatchObject({ status: 'PAID' });
  });

  it('部分付后再超额付直接 400，不写付款记录', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ status: 'PARTIALLY_PAID' }),
    );
    prisma.expenseBillPayment.aggregate.mockResolvedValue({
      _sum: { paidAmount: 2000 },
    });
    const service = new ExpenseBillService(prisma);

    await expect(
      service.pay('u1', 'b1', { paidAmount: 5000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseBillPayment.create).not.toHaveBeenCalled();
    expect(prisma.expenseBill.update).not.toHaveBeenCalled();
  });

  it('已付清的账单不能重复付款', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ status: 'PAID' }),
    );
    const service = new ExpenseBillService(prisma);

    await expect(
      service.pay('u1', 'b1', { paidAmount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseBillPayment.create).not.toHaveBeenCalled();
    expect(prisma.expenseBill.update).not.toHaveBeenCalled();
  });

  it('已取消的账单不能付', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(
      makeBill({ status: 'CANCELLED' }),
    );
    const service = new ExpenseBillService(prisma);

    await expect(
      service.pay('u1', 'b1', { paidAmount: 100 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseBillPayment.create).not.toHaveBeenCalled();
    expect(prisma.expenseBill.update).not.toHaveBeenCalled();
  });

  it('账单不存在时报 404；金额/日期/付款方非法时报 400', async () => {
    const prisma = makeBillPrisma();
    prisma.expenseBill.findUnique.mockResolvedValue(null);
    const service = new ExpenseBillService(prisma);

    await expect(service.pay('u1', 'nope', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.expenseBill.findUnique.mockResolvedValue(makeBill());
    await expect(
      service.pay('u1', 'b1', { paidAmount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.pay('u1', 'b1', { paidAt: '11-05' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.pay('u1', 'b1', { payerType: 'OTHER' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expenseBillPayment.create).not.toHaveBeenCalled();
  });
});
