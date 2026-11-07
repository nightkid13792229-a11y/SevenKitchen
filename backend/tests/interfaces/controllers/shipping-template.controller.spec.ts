import { ShippingTemplateController } from '../../../src/interfaces/controllers/shipping-template.controller';

/**
 * 后台「激活」运费模板时的联动。
 *
 * 为什么需要：激活会把其他模板全部停用。如果被停用的那张正好是
 * 「默认运费模板」，算价就会报错、顾客下不了单。2026-11-07 起，
 * 激活某张模板时把默认模板一起改成它，两者永远一致。
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
    activate: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const feeService = {} as any;
  const configService = { updateGlobalConfig: jest.fn() };
  const controller = new (ShippingTemplateController as any)(
    repo,
    feeService,
    configService,
  ) as ShippingTemplateController;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));
    repo.activate.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));
    configService.updateGlobalConfig.mockResolvedValue({});
  });

  it('激活模板后把默认运费模板同步成它', async () => {
    const result = await controller.activateTemplate('tpl-23');

    expect(repo.activate).toHaveBeenCalledWith('tpl-23');
    expect(configService.updateGlobalConfig).toHaveBeenCalledWith({
      defaultShippingTemplateId: 'tpl-23',
    });
    expect(result).toBeTruthy();
  });

  it('激活的模板不存在时不改默认模板', async () => {
    repo.findById.mockResolvedValue(null);

    await controller.activateTemplate('tpl-gone');

    expect(repo.activate).not.toHaveBeenCalled();
    expect(configService.updateGlobalConfig).not.toHaveBeenCalled();
  });
});
