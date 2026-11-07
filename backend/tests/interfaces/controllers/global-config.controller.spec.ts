import { BadRequestException } from '@nestjs/common';
import { GlobalConfigController } from '../../../src/interfaces/controllers/global-config.controller';

/**
 * 后台保存「默认运费模板」时的守卫。
 *
 * 为什么需要：算价把"默认模板"当成唯一口径（2026-11-07）。如果保存了一个
 * 不存在或已停用的 id，下单预览会直接报错 —— 这个校验把问题挡在保存那一刻，
 * 而不是等顾客结账时才发现。
 */
describe('GlobalConfigController · 默认运费模板校验', () => {
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

  const repo = { findById: jest.fn() };
  const configService = {
    updateGlobalConfig: jest
      .fn()
      .mockImplementation(async (dto: Record<string, unknown>) => dto),
  };
  const controller = new (GlobalConfigController as any)(
    configService,
    repo,
  ) as GlobalConfigController;

  beforeEach(() => {
    jest.clearAllMocks();
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));
    configService.updateGlobalConfig.mockImplementation(
      async (dto: Record<string, unknown>) => dto,
    );
  });

  it('默认模板不存在时拒绝保存', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      controller.updateConfig({ defaultShippingTemplateId: 'tpl-gone' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(configService.updateGlobalConfig).not.toHaveBeenCalled();
  });

  it('默认模板已停用时拒绝保存', async () => {
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）', false));

    await expect(
      controller.updateConfig({ defaultShippingTemplateId: 'tpl-23' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(configService.updateGlobalConfig).not.toHaveBeenCalled();
  });

  it('默认模板有效时正常保存', async () => {
    await controller.updateConfig({
      defaultShippingTemplateId: 'tpl-23',
    } as any);

    expect(repo.findById).toHaveBeenCalledWith('tpl-23');
    expect(configService.updateGlobalConfig).toHaveBeenCalledWith({
      defaultShippingTemplateId: 'tpl-23',
    });
  });

  it('清空默认模板（null）时允许保存', async () => {
    await controller.updateConfig({ defaultShippingTemplateId: null } as any);

    expect(repo.findById).not.toHaveBeenCalled();
    expect(configService.updateGlobalConfig).toHaveBeenCalledWith({
      defaultShippingTemplateId: null,
    });
  });
});
