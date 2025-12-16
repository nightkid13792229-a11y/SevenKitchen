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
   * Save shipping template
   */
  save(template: ShippingTemplate): Promise<ShippingTemplate>;
}
