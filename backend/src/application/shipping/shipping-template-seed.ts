/**
 * 内置运费模板的播种。
 *
 * 从 AppModule 里抽出来，是为了能单测（AppModule 一导入就会拉进整个 DI 图，
 * jest 跑不起来）。规则见 seedCanonicalShippingTemplate。
 */

import type { ShippingTemplateRepository } from '../../domain/shipping/shipping-template.repository';
import type { ShippingTemplate } from '../../domain/shipping/shipping-fee.service';

/** 内置模板的固定 id（历史上就是它，别改，否则老库会被再插一张）。 */
export const CANONICAL_SHIPPING_TEMPLATE_ID =
  '8fa85f64-5717-4562-b3fc-2c963f66afa6';

export type ShippingTemplateSeedResult = 'seeded' | 'skipped';

/**
 * 只有库里**一张运费模板都没有**时，才注入内置的 Default CN Template。
 *
 * 2026-11-07 之前是"这张固定 id 不在就补一张"：运营把它删掉之后，
 * 下一次后端重启又复活（实测两次部署后它又出现了），而且会多出一张生效模板，
 * 让"默认模板失效时退回唯一生效模板"这条兜底失效。
 * 现在已经有任何模板 → 跳过，删掉就是真删掉。
 */
export async function seedCanonicalShippingTemplate(
  repository: ShippingTemplateRepository,
): Promise<ShippingTemplateSeedResult> {
  const existingTemplates = await repository.findAll();
  if (existingTemplates.length > 0) {
    return 'skipped';
  }

  const template: ShippingTemplate = {
    id: CANONICAL_SHIPPING_TEMPLATE_ID,
    name: 'Default CN Template',
    baseWeightKg: 1.0,
    baseFee: 12.0, // CNY
    stepWeightKg: 1.0,
    stepFee: 5.0, // CNY per step
    vasFeePerOrder: 3.0, // CNY
    isActive: true,
  };

  await repository.save(template);
  return 'seeded';
}
