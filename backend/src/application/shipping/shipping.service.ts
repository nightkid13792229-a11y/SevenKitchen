/**
 * Shipping Application Service
 * Application layer service for shipping operations
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  ShippingFeeService,
  type ShippingFeeInput,
  type ShippingFeeResult,
} from '../../domain/shipping';
import type { ShippingTemplateRepository } from '../../domain/shipping';
import { SHIPPING_TEMPLATE_REPOSITORY } from './shipping.service.tokens';

@Injectable()
export class ShippingService {
  constructor(
    private readonly shippingFeeService: ShippingFeeService,
    @Inject(SHIPPING_TEMPLATE_REPOSITORY)
    private readonly shippingTemplateRepository: ShippingTemplateRepository,
  ) {}

  /**
   * Calculate shipping fee preview
   * Used for preview endpoints before order creation
   */
  async calculateShippingFeePreview(
    input: ShippingFeeInput,
  ): Promise<ShippingFeeResult> {
    // Find shipping template
    let template;
    if (input.shippingTemplateId) {
      template = await this.shippingTemplateRepository.findById(
        input.shippingTemplateId,
      );
      if (!template) {
        throw new NotFoundException(
          `Shipping template not found: ${input.shippingTemplateId}`,
        );
      }
    } else {
      // Use active template as default
      template = await this.shippingTemplateRepository.findActive();
      if (!template) {
        throw new NotFoundException('No active shipping template found');
      }
    }

    return this.shippingFeeService.calculateShippingFee(input, template);
  }
}
