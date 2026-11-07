import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ShippingService } from 'src/application/shipping/shipping.service';

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

describe('ShippingService · 运费模板解析', () => {
  const feeService = {
    calculateShippingFee: jest.fn((_input: unknown, tpl: { id: string }) => ({
      amountShipping: 1,
      templateId: tpl.id,
      ruleAppliedDescription: '',
    })),
  };
  const repo = {
    findById: jest.fn(),
    findActive: jest.fn(),
    findAll: jest.fn(),
  };
  const config = { getGlobalConfig: jest.fn() };
  let service: ShippingService;

  beforeEach(() => {
    jest.clearAllMocks();
    // 配置异常分支会打 ERROR/WARN 日志，测试里静音，保持输出干净
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new ShippingService(feeService as any, repo as any, config as any);
  });

  it('无显式模板时，用后台配置的默认模板', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: 'tpl-23',
    });
    repo.findById.mockResolvedValue(template('tpl-23', '顺丰特快（生鲜）'));

    const result = await service.calculateShippingFeePreview({
      totalWeightG: 1700,
    });

    expect(repo.findById).toHaveBeenCalledWith('tpl-23');
    expect(repo.findActive).not.toHaveBeenCalled();
    expect(result.templateId).toBe('tpl-23');
  });

  it('调用方显式指定模板时优先使用它', async () => {
    repo.findById.mockResolvedValue(template('tpl-9', '指定模板'));

    const result = await service.calculateShippingFeePreview({
      totalWeightG: 1700,
      shippingTemplateId: 'tpl-9',
    });

    expect(repo.findById).toHaveBeenCalledWith('tpl-9');
    expect(config.getGlobalConfig).not.toHaveBeenCalled();
    expect(result.templateId).toBe('tpl-9');
  });

  it('默认模板被删掉、但只剩一张生效模板时，退回它', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: 'tpl-gone',
    });
    repo.findById.mockResolvedValue(null);
    repo.findAll.mockResolvedValue([template('tpl-23', '顺丰特快（生鲜）')]);

    const result = await service.calculateShippingFeePreview({
      totalWeightG: 1700,
    });

    expect(result.templateId).toBe('tpl-23');
  });

  it('默认模板被删掉、但还有多张生效模板时不猜，直接报错', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: 'tpl-gone',
    });
    repo.findById.mockResolvedValue(null);
    repo.findAll.mockResolvedValue([
      template('tpl-23', '顺丰特快（生鲜）'),
      template('tpl-12', 'Default CN Template'),
    ]);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('默认模板已停用时拒绝使用', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: 'tpl-23',
    });
    repo.findById.mockResolvedValue(
      template('tpl-23', '顺丰特快（生鲜）', false),
    );

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('没有默认模板但只有一张生效模板时用它', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: null,
    });
    repo.findAll.mockResolvedValue([template('tpl-only', '唯一模板')]);

    const result = await service.calculateShippingFeePreview({
      totalWeightG: 1700,
    });

    expect(result.templateId).toBe('tpl-only');
  });

  it('没有默认模板且多张生效时报错，不猜', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: null,
    });
    repo.findAll.mockResolvedValue([
      template('tpl-23', '顺丰特快（生鲜）'),
      template('tpl-12', 'Default CN Template'),
    ]);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('一张生效模板都没有时报 404', async () => {
    config.getGlobalConfig.mockResolvedValue({
      defaultShippingTemplateId: null,
    });
    repo.findAll.mockResolvedValue([]);

    await expect(
      service.calculateShippingFeePreview({ totalWeightG: 1700 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
