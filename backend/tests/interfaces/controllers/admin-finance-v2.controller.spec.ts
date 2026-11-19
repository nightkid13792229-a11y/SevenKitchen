import { ForbiddenException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AuthGuard } from 'src/interfaces/auth';
import { AdminGuard } from 'src/interfaces/guards/role.guard';
import { ApiResponseDto } from 'src/interfaces/dto/common/response.dto';
import { AdminFinanceV2Controller } from 'src/interfaces/controllers/admin-finance-v2.controller';
import { TimezoneUtil } from 'src/utils/timezone.util';

/** 造一个最小的 ExecutionContext：只带 `request.user`，够 AdminGuard 判断 */
const ctx = (role?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as any;

describe('财务接口权限', () => {
  it('STAFF 被拒绝', () =>
    expect(() => new AdminGuard().canActivate(ctx('STAFF'))).toThrow(
      ForbiddenException,
    ));

  it('未登录被拒绝', () =>
    expect(() => new AdminGuard().canActivate(ctx())).toThrow(
      ForbiddenException,
    ));

  it('ADMIN 放行', () =>
    expect(new AdminGuard().canActivate(ctx('ADMIN'))).toBe(true));
});

describe('AdminFinanceV2Controller', () => {
  const summary = {
    range: {
      from: '2026-11-01T00:00:00.000+08:00',
      to: '2026-11-30T23:59:59.999+08:00',
    },
    income: { netTotal: 1000, fee: 6 },
    expense: { total: 700, byCategory: [] },
    balance: 300,
    pendingOfflineConfirmCount: 2,
  };

  it('dashboard 挂在 admin/finance 下、先登录再验管理员', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminFinanceV2Controller)).toBe(
      'api/v1/admin/finance',
    );
    // 只有 AdminGuard 不够：AuthGuard 才会把 request.user 填上（没有全局守卫）
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminFinanceV2Controller),
    ).toEqual([AuthGuard, AdminGuard]);

    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminFinanceV2Controller.prototype.getDashboard,
      ),
    ).toBe('dashboard');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminFinanceV2Controller.prototype.getDashboard,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('dashboard 把查询参数交给汇总服务并包成统一响应', async () => {
    const summaryService = {
      getSummary: jest.fn().mockResolvedValue(summary),
    };
    const controller = new AdminFinanceV2Controller(
      summaryService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await controller.getDashboard({ month: '2026-11' });

    expect(summaryService.getSummary).toHaveBeenCalledWith({
      month: '2026-11',
    });
    expect(result).toBeInstanceOf(ApiResponseDto);
    expect(result.code).toBe(0);
    expect(result.data).toBe(summary);
  });

  it('entries 挂在 finance 下、GET 方法，查询参数原样交给明细服务', async () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminFinanceV2Controller.prototype.getEntries,
      ),
    ).toBe('entries');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminFinanceV2Controller.prototype.getEntries,
      ),
    ).toBe(RequestMethod.GET);

    const page = {
      items: [],
      total: 0,
      page: 2,
      pageSize: 20,
      truncated: false,
    };
    const entriesService = { list: jest.fn().mockResolvedValue(page) };
    const controller = new AdminFinanceV2Controller(
      {} as any,
      entriesService as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const query = {
      month: '2026-11',
      direction: 'EXPENSE' as const,
      category: 'EQUIPMENT',
      page: 2,
      pageSize: 20,
    };
    const result = await controller.getEntries(query);

    expect(entriesService.list).toHaveBeenCalledWith(query);
    expect(result).toBeInstanceOf(ApiResponseDto);
    expect(result.code).toBe(0);
    expect(result.data).toBe(page);
  });

  it('记一笔、改一笔、作废三个接口挂在 manual-entries 下', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminFinanceV2Controller.prototype.createManualEntry,
      ),
    ).toBe('manual-entries');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminFinanceV2Controller.prototype.createManualEntry,
      ),
    ).toBe(RequestMethod.POST);

    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminFinanceV2Controller.prototype.updateManualEntry,
      ),
    ).toBe('manual-entries/:id');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminFinanceV2Controller.prototype.updateManualEntry,
      ),
    ).toBe(RequestMethod.PATCH);

    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AdminFinanceV2Controller.prototype.voidManualEntry,
      ),
    ).toBe('manual-entries/:id/void');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AdminFinanceV2Controller.prototype.voidManualEntry,
      ),
    ).toBe(RequestMethod.POST);
  });

  it('记一笔把当前用户和请求体交给手工条目服务', async () => {
    const manualEntryService = {
      create: jest.fn().mockResolvedValue({ id: 'm1' }),
    };
    const controller = new AdminFinanceV2Controller(
      {} as any,
      {} as any,
      manualEntryService as any,
      {} as any,
      {} as any,
    );
    const body = {
      direction: 'EXPENSE' as const,
      amount: 399,
      occurredAt: '2026-11-05',
      category: 'EQUIPMENT' as const,
      title: '封口机',
    };

    const result = await controller.createManualEntry('u1', body);

    expect(manualEntryService.create).toHaveBeenCalledWith('u1', body);
    expect(result).toBeInstanceOf(ApiResponseDto);
    expect(result.data).toEqual({ id: 'm1' });
  });

  it('改一笔传 id，作废传 id 与原因', async () => {
    const manualEntryService = {
      update: jest.fn().mockResolvedValue({ id: 'm1' }),
      void: jest.fn().mockResolvedValue({ id: 'm1' }),
    };
    const controller = new AdminFinanceV2Controller(
      {} as any,
      {} as any,
      manualEntryService as any,
      {} as any,
      {} as any,
    );

    await controller.updateManualEntry('u1', 'm1', { amount: 20 });
    await controller.voidManualEntry('u1', 'm1', { reason: '录错' });

    expect(manualEntryService.update).toHaveBeenCalledWith('u1', 'm1', {
      amount: 20,
    });
    expect(manualEntryService.void).toHaveBeenCalledWith('u1', 'm1', '录错');
  });
});

describe('AdminFinanceV2Controller 固定费用接口', () => {
  const makeController = (services: Record<string, any> = {}) =>
    new AdminFinanceV2Controller(
      services.summary ?? ({} as any),
      services.entries ?? ({} as any),
      services.manual ?? ({} as any),
      services.templates ?? ({} as any),
      services.bills ?? ({} as any),
    );

  it('七个路由分别挂在 templates / bills 下', () => {
    const expected: Array<[keyof AdminFinanceV2Controller, string, number]> = [
      ['listTemplates', 'templates', RequestMethod.GET],
      ['createTemplate', 'templates', RequestMethod.POST],
      ['updateTemplate', 'templates/:id', RequestMethod.PATCH],
      ['deactivateTemplate', 'templates/:id/deactivate', RequestMethod.POST],
      ['listBills', 'bills', RequestMethod.GET],
      ['generateBills', 'bills/generate', RequestMethod.POST],
      ['payBill', 'bills/:id/pay', RequestMethod.POST],
    ];

    for (const [handler, path, method] of expected) {
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          AdminFinanceV2Controller.prototype[handler],
        ),
      ).toBe(path);
      expect(
        Reflect.getMetadata(
          METHOD_METADATA,
          AdminFinanceV2Controller.prototype[handler],
        ),
      ).toBe(method);
    }
  });

  it('模板列表含停用项，新建把当前用户与请求体交给模板服务', async () => {
    const templates = {
      listTemplates: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 't1' }),
    };
    const controller = makeController({ templates });

    await controller.listTemplates();
    expect(templates.listTemplates).toHaveBeenCalledWith({
      includeInactive: true,
    });

    const body = {
      name: '房租',
      titleTemplate: '{{month}}月房租',
      category: 'RENT' as const,
      payeeName: '房东',
      defaultAmount: 6000,
      interval: 'MONTHLY' as const,
    };
    const result = await controller.createTemplate('u1', body);
    expect(templates.create).toHaveBeenCalledWith('u1', body);
    expect(result.data).toEqual({ id: 't1' });
  });

  it('补生成缺省本月，付款把账单 id 与实付信息交给账单服务', async () => {
    const templates = {
      generateForMonth: jest
        .fn()
        .mockResolvedValue({ created: 2, dueCount: 3 }),
    };
    const bills = {
      listForMonth: jest.fn().mockResolvedValue([]),
      pay: jest.fn().mockResolvedValue({ id: 'b1', status: 'PAID' }),
    };
    const controller = makeController({ templates, bills });
    const month = TimezoneUtil.shanghaiDateKey(new Date()).slice(0, 7);

    const generated = await controller.generateBills('u1', {});
    expect(templates.generateForMonth).toHaveBeenCalledWith(month, 'u1');
    expect(generated.data).toEqual({ created: 2, dueCount: 3 });
    await controller.listBills();
    expect(bills.listForMonth).toHaveBeenCalledWith(month);

    await controller.payBill('u1', 'b1', { paidAmount: 6000 });
    expect(bills.pay).toHaveBeenCalledWith('u1', 'b1', { paidAmount: 6000 });
  });
});
