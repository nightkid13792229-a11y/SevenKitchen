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
    const controller = new AdminFinanceV2Controller(summaryService as any);

    const result = await controller.getDashboard({ month: '2026-11' });

    expect(summaryService.getSummary).toHaveBeenCalledWith({
      month: '2026-11',
    });
    expect(result).toBeInstanceOf(ApiResponseDto);
    expect(result.code).toBe(0);
    expect(result.data).toBe(summary);
  });
});
