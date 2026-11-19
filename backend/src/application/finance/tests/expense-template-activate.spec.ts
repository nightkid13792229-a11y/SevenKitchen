/**
 * 固定费用「停用后重新启用」（2026-11-19）
 *
 * 之前只有停用、没有启用：老板点错一次，只能新建一条代替。
 * 现在抽屉里对称地给「启用」，只翻转 `isActive`，不补生成历史账单，
 * 也不碰已经付过的账单。
 */

import { NotFoundException } from '@nestjs/common';
import { ExpenseTemplateService } from '../expense-template.service';

function buildService(existing: any) {
  const prisma: any = {
    expenseTemplate: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockResolvedValue({}),
    },
    expenseBill: {
      update: jest.fn(),
      createMany: jest.fn(),
    },
  };
  return { service: new ExpenseTemplateService(prisma), prisma };
}

describe('固定费用模板启用', () => {
  it('只把 isActive 翻回 true，不动账单', async () => {
    const { service, prisma } = buildService({
      id: 'tpl-1',
      name: '房租',
      isActive: false,
    });

    const result = await service.activate('user-1', 'tpl-1');

    expect(result).toEqual({ id: 'tpl-1' });
    expect(prisma.expenseTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { isActive: true },
    });
    expect(prisma.expenseBill.update).not.toHaveBeenCalled();
    expect(prisma.expenseBill.createMany).not.toHaveBeenCalled();
  });

  it('模板不存在时给 404，不静默成功', async () => {
    const { service } = buildService(null);
    await expect(service.activate('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('重复启用是幂等的：已启用的模板再点一次也不报错', async () => {
    const { service, prisma } = buildService({
      id: 'tpl-1',
      name: '房租',
      isActive: true,
    });
    await expect(service.activate('user-1', 'tpl-1')).resolves.toEqual({
      id: 'tpl-1',
    });
    expect(prisma.expenseTemplate.update).toHaveBeenCalledWith({
      where: { id: 'tpl-1' },
      data: { isActive: true },
    });
  });
});
