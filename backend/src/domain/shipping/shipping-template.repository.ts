/**
 * Shipping Template Repository Interface
 * Domain repository interface for shipping templates
 */

import type { ShippingTemplate } from './shipping-fee.service';

export interface ShippingTemplateRepository {
  /**
   * Find shipping template by ID
   */
  findById(id: string): Promise<ShippingTemplate | null>;

  /**
   * Find active shipping template
   * Returns the first active template found
   */
  findActive(): Promise<ShippingTemplate | null>;

  /**
   * 全部模板（不过滤生效状态）。
   *
   * 用途：未配置默认模板时判断"生效模板是否唯一" —— 多于一张必须报错，
   * 不能像 findActive 那样静默取第一张，否则价格会随数据库返回顺序漂移。
   */
  findAll(): Promise<ShippingTemplate[]>;

  /**
   * Save shipping template
   */
  save(template: ShippingTemplate): Promise<ShippingTemplate>;
}
