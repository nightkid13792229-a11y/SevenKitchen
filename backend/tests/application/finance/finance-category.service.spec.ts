import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceCategoryService } from 'src/application/finance/finance-category.service';

/**
 * 支出类别字典（2026-11-19 账户化 + 可编辑类别，设计文档 §2）。
 *
 * 口径：
 * - 输入即建；同名（忽略大小写与首尾空格）拒绝，避免「设备 / 设备工具」这类重复；
 * - 改名影响历史（记录按 categoryId 关联，显示类别当前名字）；
 * - 删除 = 停用，系统类别不能停用；合并把历史记录一起搬走；
 * - `usageCount` = 账单 + 模板 + 手工条目三处引用数相加。
 */

const category = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  name: '房租',
  code: 'RENT',
  isSystem: false,
  isActive: true,
  sortOrder: 60,
  mergedIntoId: null,
  createdById: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
});

const makePrisma = (rows: any[] = []) => {
  const prisma: any = {
    financeCategory: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: any) => rows.find((row) => row.id === where.id) ?? null,
        ),
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'c-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }: any) => ({
        id: where.id,
        ...data,
      })),
    },
    expenseBill: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    expenseTemplate: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    financeManualEntry: {
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
  return prisma;
};

describe('FinanceCategoryService.list', () => {
  it('默认只返回启用类别，usageCount = 账单 + 模板 + 手工条目引用数', async () => {
    const prisma = makePrisma([
      category(),
      category({
        id: 'c2',
        name: '食材',
        code: 'RAW_MATERIAL',
        isSystem: true,
      }),
    ]);
    prisma.expenseBill.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.categoryId === 'c1' ? 2 : 0),
    );
    prisma.expenseTemplate.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.categoryId === 'c1' ? 1 : 0),
    );
    prisma.financeManualEntry.count.mockImplementation(({ where }: any) =>
      Promise.resolve(where.categoryId === 'c1' ? 3 : 0),
    );

    const rows = await new FinanceCategoryService(prisma).list();

    expect(rows).toEqual([
      {
        id: 'c1',
        name: '房租',
        isSystem: false,
        isActive: true,
        usageCount: 6,
      },
      {
        id: 'c2',
        name: '食材',
        isSystem: true,
        isActive: true,
        usageCount: 0,
      },
    ]);
    expect(prisma.financeCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
  });

  it('includeInactive = true 时连停用/已合并的一起返回（管理页要显示）', async () => {
    const prisma = makePrisma([
      category(),
      category({ id: 'c2', name: '维修', isActive: false, mergedIntoId: 'c1' }),
    ]);

    const rows = await new FinanceCategoryService(prisma).list(true);

    expect(rows).toHaveLength(2);
    expect(prisma.financeCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('FinanceCategoryService.create', () => {
  it('去掉首尾空格后落库，自建类别 isSystem = false', async () => {
    const prisma = makePrisma();

    const result = await new FinanceCategoryService(prisma).create(
      'u1',
      '  维修  ',
    );

    expect(result).toEqual({ id: 'c-new', name: '维修' });
    expect(prisma.financeCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '维修',
        isSystem: false,
        createdById: 'u1',
      }),
    });
  });

  it('重名（忽略大小写与首尾空格）拒绝 400', async () => {
    const prisma = makePrisma();
    prisma.financeCategory.findFirst.mockResolvedValue(category());

    await expect(
      new FinanceCategoryService(prisma).create('u1', ' 房租 '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeCategory.findFirst).toHaveBeenCalledWith({
      where: { name: { equals: '房租', mode: 'insensitive' } },
    });
    expect(prisma.financeCategory.create).not.toHaveBeenCalled();
  });

  it('名称长度 1–60，空名/纯空格/超长都拒绝', async () => {
    const prisma = makePrisma();
    const service = new FinanceCategoryService(prisma);

    await expect(service.create('u1', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('u1', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.create('u1', 'a'.repeat(61))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.financeCategory.create).not.toHaveBeenCalled();
  });
});

describe('FinanceCategoryService.rename', () => {
  it('系统类别也允许改名', async () => {
    const prisma = makePrisma([
      category({ id: 'c2', name: '食材', isSystem: true }),
    ]);
    prisma.financeCategory.findFirst.mockResolvedValue(null);

    const result = await new FinanceCategoryService(prisma).rename(
      'c2',
      '  食材原料  ',
    );

    expect(result).toEqual({ id: 'c2', name: '食材原料' });
    expect(prisma.financeCategory.update).toHaveBeenCalledWith({
      where: { id: 'c2' },
      data: { name: '食材原料' },
    });
  });

  it('改成别的类别已有的名字时 400', async () => {
    const prisma = makePrisma([category({ id: 'c1', name: '房租' })]);
    prisma.financeCategory.findFirst.mockResolvedValue(
      category({ id: 'c9', name: '水电' }),
    );

    await expect(
      new FinanceCategoryService(prisma).rename('c1', '水电'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financeCategory.update).not.toHaveBeenCalled();
  });

  it('类别不存在报 404', async () => {
    const prisma = makePrisma();

    await expect(
      new FinanceCategoryService(prisma).rename('missing', '水电'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FinanceCategoryService.merge', () => {
  it('把三张表的 categoryId 搬到目标，源类别停用并记 mergedIntoId，返回搬移条数', async () => {
    const prisma = makePrisma([
      category({ id: 'c1', name: '维修' }),
      category({ id: 'c2', name: '设备工具' }),
    ]);
    prisma.expenseBill.updateMany.mockResolvedValue({ count: 3 });
    prisma.expenseTemplate.updateMany.mockResolvedValue({ count: 2 });
    prisma.financeManualEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await new FinanceCategoryService(prisma).merge('c1', 'c2');

    expect(result).toEqual({ sourceId: 'c1', targetId: 'c2', moved: 6 });
    for (const table of [
      prisma.expenseBill,
      prisma.expenseTemplate,
      prisma.financeManualEntry,
    ]) {
      expect(table.updateMany).toHaveBeenCalledWith({
        where: { categoryId: 'c1' },
        data: { categoryId: 'c2' },
      });
    }
    expect(prisma.financeCategory.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isActive: false, mergedIntoId: 'c2' },
    });
  });

  it('目标必须存在且不能是自己', async () => {
    const prisma = makePrisma([category({ id: 'c1' })]);

    await expect(
      new FinanceCategoryService(prisma).merge('c1', 'c1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      new FinanceCategoryService(prisma).merge('c1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.expenseBill.updateMany).not.toHaveBeenCalled();
  });
});

describe('FinanceCategoryService.deactivate', () => {
  it('系统类别不能停用（400，且不写库）', async () => {
    const prisma = makePrisma([
      category({ id: 'c2', name: '食材', isSystem: true }),
    ]);

    await expect(
      new FinanceCategoryService(prisma).deactivate('c2'),
    ).rejects.toThrow('系统类别不能停用');
    expect(prisma.financeCategory.update).not.toHaveBeenCalled();
  });

  it('已停用的类别幂等返回，不重复写库', async () => {
    const prisma = makePrisma([
      category({ id: 'c3', name: '维修', isActive: false }),
    ]);

    await expect(
      new FinanceCategoryService(prisma).deactivate('c3'),
    ).resolves.toEqual({ id: 'c3', isActive: false });
    expect(prisma.financeCategory.update).not.toHaveBeenCalled();
  });

  it('普通类别停用只改 isActive', async () => {
    const prisma = makePrisma([category({ id: 'c1' })]);

    await expect(
      new FinanceCategoryService(prisma).deactivate('c1'),
    ).resolves.toEqual({ id: 'c1', isActive: false });
    expect(prisma.financeCategory.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isActive: false },
    });
  });

  it('类别不存在报 404', async () => {
    const prisma = makePrisma();

    await expect(
      new FinanceCategoryService(prisma).deactivate('missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FinanceCategoryService.ensureByName', () => {
  it('已有同名类别（忽略大小写与首尾空格）时直接返回，不新建', async () => {
    const prisma = makePrisma([
      category({ id: 'c5', name: '工具', code: 'TOOLS' }),
    ]);
    prisma.financeCategory.findFirst.mockResolvedValue({
      id: 'c5',
      name: '工具',
      code: 'TOOLS',
    });

    const result = await new FinanceCategoryService(prisma).ensureByName(
      ' 工具 ',
      'TOOLS',
    );

    expect(result).toEqual({ id: 'c5', name: '工具' });
    expect(prisma.financeCategory.create).not.toHaveBeenCalled();
  });

  it('找不到就创建，并带上映射用的 code', async () => {
    const prisma = makePrisma();

    const result = await new FinanceCategoryService(prisma).ensureByName(
      '杂物',
      'SUNDRIES',
    );

    expect(result).toEqual({ id: 'c-new', name: '杂物' });
    expect(prisma.financeCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '杂物',
        code: 'SUNDRIES',
        isSystem: false,
        createdById: null,
      }),
    });
  });

  it('幂等：连续两次调用只建一条', async () => {
    const prisma = makePrisma();
    const created = {
      id: 'c-new',
      name: '工具',
      code: 'TOOLS',
      isSystem: false,
      isActive: true,
    };
    prisma.financeCategory.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created);
    prisma.financeCategory.create.mockResolvedValue(created);

    const service = new FinanceCategoryService(prisma);
    const first = await service.ensureByName('工具', 'TOOLS');
    const second = await service.ensureByName('工具', 'TOOLS');

    expect(first).toEqual({ id: 'c-new', name: '工具' });
    expect(second).toEqual({ id: 'c-new', name: '工具' });
    expect(prisma.financeCategory.create).toHaveBeenCalledTimes(1);
  });
});
