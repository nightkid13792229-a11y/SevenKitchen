/**
 * 采购清单：团队共享（2026-11-25）
 *
 * 老板原话：「我在小程序里生成的日采清单，员工看不到。」
 *
 * 原来 GET /staff/purchasing/lists 对员工强制加 createdById = 自己，
 * 老板先建了那天的日采清单之后，员工这天的活全堵死：
 *   · 列表里没有这张单（采购页是空的，工作台却挂着红点）；
 *   · 他自己点「生成日采清单」被 409「该日期已存在待采购清单，请进入现有清单」拦住；
 *   · 要排产又被「请先完成 X 月 X 日的采购任务」拦住。
 *
 * 现在清单对管理员和员工一律可见，谁建的都一样。
 */

// uuid 13 是纯 ESM，jest 的 CommonJS 运行时加载不了；这两个用例不依赖随机 id。
jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000001',
}));

import { StaffPurchasingController } from '../staff-purchasing.controller';

function buildController() {
  const listCalls: any[] = [];
  const purchasingService: any = {
    getPurchaseLists: async (params: any) => {
      listCalls.push(params);
      return { list: [], total: 0 };
    },
  };
  const purchaseOrderImportService: any = {
    countByPurchaseLists: async () => ({}),
  };

  const controller = new StaffPurchasingController(
    purchasingService,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    purchaseOrderImportService,
    {} as any,
  );

  return { controller, listCalls };
}

describe('采购清单列表：员工也能看到全团队的清单', () => {
  it('员工（STAFF）查列表时不再按创建人过滤', async () => {
    const { controller, listCalls } = buildController();

    await controller.getPurchaseLists(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'staff-user-1',
      'STAFF',
    );

    expect(listCalls).toHaveLength(1);
    expect(listCalls[0].createdById).toBeUndefined();
  });

  it('管理员（ADMIN）同样看全部，行为没有被这次改动带偏', async () => {
    const { controller, listCalls } = buildController();

    await controller.getPurchaseLists(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'admin-user-1',
      'ADMIN',
    );

    expect(listCalls[0].createdById).toBeUndefined();
  });
});
