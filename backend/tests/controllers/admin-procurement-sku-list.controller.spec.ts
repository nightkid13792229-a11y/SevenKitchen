jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProcurementSkuController } from '../../src/interfaces/controllers/procurement-sku.controller';
import { AdminProcurementSkuListController } from '../../src/interfaces/controllers/admin-procurement-sku-list.controller';
import { AdminGuard } from '../../src/interfaces/guards/role.guard';

const guardsOf = (handler: unknown): unknown[] =>
  (Reflect.getMetadata(GUARDS_METADATA, handler as any) as unknown[]) ?? [];

describe('后台采购商品列表', () => {
  it('把查询参数原样转给服务层', async () => {
    const procurementSkuService = {
      listStaffCreated: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    } as any;
    const controller = new AdminProcurementSkuListController(
      procurementSkuService,
    );

    const result = await controller.list({
      ingredientId: 'ing-1',
      page: 2,
      pageSize: 10,
    });

    expect(procurementSkuService.listStaffCreated).toHaveBeenCalledWith({
      ingredientId: 'ing-1',
      page: 2,
      pageSize: 10,
    });
    expect(result.data).toEqual({ items: [], total: 0 });
  });
});

describe('采购商品写操作的权限', () => {
  const controller = new ProcurementSkuController({} as any);

  it('编辑只允许管理员', () => {
    expect(guardsOf(controller.update)).toContain(AdminGuard);
  });

  it('删除只允许管理员', () => {
    expect(guardsOf(controller.remove)).toContain(AdminGuard);
  });

  it('改价回滚只允许管理员', () => {
    expect(guardsOf(controller.rollbackPrice)).toContain(AdminGuard);
  });
});
