/**
 * InMemory Shipping Template Repository Implementation
 * Temporary implementation for development/testing without database
 */

import { Injectable } from '@nestjs/common';
import type { ShippingTemplateRepository } from '../../domain/shipping/shipping-template.repository';
import type { ShippingTemplate } from '../../domain/shipping/shipping-fee.service';

@Injectable()
export class InMemoryShippingTemplateRepository implements ShippingTemplateRepository {
  private templates: Map<string, ShippingTemplate> = new Map();

  async findById(id: string): Promise<ShippingTemplate | null> {
    const template = this.templates.get(id);
    return Promise.resolve(template || null);
  }

  async findActive(): Promise<ShippingTemplate | null> {
    // Find first active template
    const activeTemplates = Array.from(this.templates.values()).filter(
      (t) => t.isActive,
    );
    if (activeTemplates.length === 0) {
      return Promise.resolve(null);
    }
    return Promise.resolve(activeTemplates[0]);
  }

  async save(template: ShippingTemplate): Promise<ShippingTemplate> {
    this.templates.set(template.id, template);
    return Promise.resolve(template);
  }
}
