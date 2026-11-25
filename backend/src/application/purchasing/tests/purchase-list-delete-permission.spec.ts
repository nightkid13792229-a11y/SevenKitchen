/**
 * 采购清单删除权限（2026-11-25）
 *
 * 清单改成团队共享之后，员工能看到彼此的清单。删单不再是谁都能做：
 * 别人可能正拿着这张单在超市里采购，删掉会把订单状态退回「已付款」。
 * 所以只有创建人自己和管理员能删。
 */

// uuid 13 是纯 ESM，jest 的 CommonJS 运行时加载不了；这两个用例不依赖随机 id。
jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000001',
}));

import { ForbiddenException } from '@nestjs/common';
import { PurchasingService } from '../purchasing.service';

function buildService(purchaseList: any) {
  const deleted: string[] = [];
  const purchaseListRepository: any = {
    findById: async () => purchaseList,
    delete: async (id: string) => {
      deleted.push(id);
    },
  };
  const inventoryService: any = {
    releaseAllocationsForPurchaseList: async () => undefined,
  };

  const service = new PurchasingService(
    {} as any, // orderRepository
    {} as any, // statusHistoryRepository
    {} as any, // ingredientRepository
    {} as any, // recommendedProductService
    inventoryService,
    {} as any, // procurementSkuService
    purchaseListRepository,
    {} as any, // purchaseRecordRepository
    {} as any, // platformOptions
    {} as any, // prisma
  );

  return { service, deleted };
}

const bossList = {
  id: 'list-1',
  status: 'PENDING',
  reimbursementId: null,
  createdById: 'boss-user',
  sourceOrderIds: [],
};

describe('删除采购清单：只有创建人和管理员', () => {
  it('员工不能删别人建的清单', async () => {
    const { service, deleted } = buildService(bossList);

    await expect(
      service.deletePurchaseList('list-1', 'staff-user', 'STAFF'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deleted).toEqual([]);
  });

  it('员工可以删自己建的清单', async () => {
    const { service, deleted } = buildService({
      ...bossList,
      createdById: 'staff-user',
    });

    const result = await service.deletePurchaseList(
      'list-1',
      'staff-user',
      'STAFF',
    );

    expect(result.deletedId).toBe('list-1');
    expect(deleted).toEqual(['list-1']);
  });

  it('管理员可以删别人建的清单', async () => {
    const { service, deleted } = buildService(bossList);

    const result = await service.deletePurchaseList(
      'list-1',
      'admin-user',
      'ADMIN',
    );

    expect(result.deletedId).toBe('list-1');
    expect(deleted).toEqual(['list-1']);
  });
});
