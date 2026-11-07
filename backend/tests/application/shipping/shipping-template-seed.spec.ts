import {
  CANONICAL_SHIPPING_TEMPLATE_ID,
  seedCanonicalShippingTemplate,
} from '../../../src/application/shipping/shipping-template-seed';
import type { ShippingTemplate } from '../../../src/domain/shipping/shipping-fee.service';

/**
 * 内置运费模板的播种规则。
 *
 * 背景：`Default CN Template`（12 元）用固定 id 播种，旧逻辑是"这张不在就建一张并激活"。
 * 运营在后台删掉它之后，下一次后端重启又复活（2026-11-07 两次部署后实测），
 * 而且会多出一张生效模板，让"默认模板失效时退回唯一生效模板"的兜底失效。
 *
 * 新规则：库里已经**有任何**运费模板就不再注入；只有全新环境（一张都没有）才播种。
 */
describe('seedCanonicalShippingTemplate', () => {
  const buildRepo = (templates: Array<Partial<ShippingTemplate>>) => ({
    findAll: jest.fn(async () => templates as ShippingTemplate[]),
    findById: jest.fn(async () => null),
    findActive: jest.fn(async () => null),
    save: jest.fn(async (template: ShippingTemplate) => template),
  });

  it('库里已有其他模板时，不再注入内置模板', async () => {
    const repo = buildRepo([{ id: 'tpl-23', name: '顺丰特快' }]);

    const result = await seedCanonicalShippingTemplate(repo as any);

    expect(result).toBe('skipped');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('内置模板已经存在时也不重复创建', async () => {
    const repo = buildRepo([
      { id: CANONICAL_SHIPPING_TEMPLATE_ID, name: 'Default CN Template' },
    ]);

    const result = await seedCanonicalShippingTemplate(repo as any);

    expect(result).toBe('skipped');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('库里一张模板都没有时，才注入内置模板', async () => {
    const repo = buildRepo([]);

    const result = await seedCanonicalShippingTemplate(repo as any);

    expect(result).toBe('seeded');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: CANONICAL_SHIPPING_TEMPLATE_ID,
        name: 'Default CN Template',
        isActive: true,
      }),
    );
  });
});
