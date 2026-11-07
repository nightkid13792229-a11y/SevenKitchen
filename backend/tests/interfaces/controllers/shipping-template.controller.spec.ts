import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { StaffGuard } from '../../../src/interfaces/guards/role.guard';
import { ShippingTemplateController } from '../../../src/interfaces/controllers/shipping-template.controller';

/**
 * 后台「激活」运费模板时的联动与权限。
 *
 * 为什么需要：
 * 1. 激活会把其他模板全部停用。如果被停用的那张正好是「默认运费模板」，
 *    算价就会报错、顾客下不了单 —— 2026-11-07 起激活与默认模板同步原子完成。
 * 2. 这个控制器管的是**全站运费**，任何登录顾客都不该能改 —— 必须 STAFF 起。
 */
describe('ShippingTemplateController · 激活模板', () => {
  const template = (id: string, name: string, isActive = true) => ({
    id,
    name,
    baseWeightKg: 1,
    baseFee: 23,
    stepWeightKg: 1,
    stepFee: 13,
    vasFeePerOrder: 5,
    isActive,
  });

  const repo = {
    findById: jest.fn(),
    activateAndSetDefault: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const feeService = {} as any;
  const controller = new (ShippingTemplateController as any)(
    repo,
    feeService,
  ) as ShippingTemplateController;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));
    repo.activateAndSetDefault.mockResolvedValue(
      template('tpl-23', '顺丰特快（生鲜）'),
    );
  });

  it('激活模板时原子地同步默认运费模板', async () => {
    const result = await controller.activateTemplate('tpl-23');

    expect(repo.activateAndSetDefault).toHaveBeenCalledWith('tpl-23');
    expect(result).toBeTruthy();
  });

  it('激活的模板不存在时不动默认模板', async () => {
    repo.findById.mockResolvedValue(null);

    await controller.activateTemplate('tpl-gone');

    expect(repo.activateAndSetDefault).not.toHaveBeenCalled();
  });

  it('整个控制器要求员工身份，普通顾客不能改全站运费', () => {
    const guards =
      Reflect.getMetadata('__guards__', ShippingTemplateController) ?? [];

    expect(guards).toEqual(expect.arrayContaining([AuthGuard, StaffGuard]));
  });
});
