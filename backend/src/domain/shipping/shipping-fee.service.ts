/**
 * Shipping Fee Service
 * Domain service for calculating shipping fees based on address region and weight
 * Based on 07_Core_Architecture.md Section 3.5 and 04_Domain_Model_and_Algorithms.md Section 3.8
 */

import { ValidationError } from '../common/errors';

export interface ShippingFeeInput {
  region?: {
    province: string;
    city: string;
    district: string;
  };
  totalWeightG: number;
  shippingTemplateId?: string | null;
}

export interface ShippingTemplate {
  id: string;
  name: string;
  baseWeightKg: number;
  baseFee: number;
  stepWeightKg: number;
  stepFee: number;
  vasFeePerOrder: number;
  isActive: boolean;
}

export interface ShippingFeeResult {
  amountShipping: number;
  templateId: string;
  ruleAppliedDescription: string;
}

/**
 * Shipping Fee Service
 * Stateless domain service for calculating shipping fees
 */
export class ShippingFeeService {
  /**
   * Calculate shipping fee based on address region and total weight
   * Implements algorithm from 07_Core_Architecture.md Section 3.5
   *
   * Formula:
   * - Base fee + VAS fee per order
   * - If weight > base_weight_kg, add step fees for each step_weight_kg increment
   */
  calculateShippingFee(
    input: ShippingFeeInput,
    template: ShippingTemplate,
  ): ShippingFeeResult {
    // Validate template is active
    if (!template.isActive) {
      throw new ValidationError(
        `Shipping template ${template.id} is not active`,
      );
    }

    // Validate weight
    if (input.totalWeightG < 0) {
      throw new ValidationError('Total weight must be non-negative');
    }

    // Convert grams to kilograms
    const totalWeightKg = input.totalWeightG / 1000.0;

    // Start with base fee and VAS fee
    let shippingFee = template.baseFee + template.vasFeePerOrder;

    // Calculate additional fees for weight exceeding base weight
    if (totalWeightKg > template.baseWeightKg) {
      const extraWeight = totalWeightKg - template.baseWeightKg;
      // Calculate continuous weight fee (no rounding, charge for actual weight)
      const stepFeePerKg = template.stepFee / template.stepWeightKg;
      shippingFee += extraWeight * stepFeePerKg;
    }

    // Build description
    const ruleAppliedDescription = this.buildRuleDescription(
      template,
      totalWeightKg,
      shippingFee,
    );

    return {
      amountShipping: Number(shippingFee.toFixed(2)), // Round to 2 decimal places
      templateId: template.id,
      ruleAppliedDescription,
    };
  }

  /**
   * Build human-readable description of the shipping fee rule applied
   */
  private buildRuleDescription(
    template: ShippingTemplate,
    weightKg: number,
    finalFee: number,
  ): string {
    const baseAndVas = template.baseFee + template.vasFeePerOrder;
    if (weightKg <= template.baseWeightKg) {
      return `${template.name}: 首重${template.baseWeightKg}kg内 ${template.baseFee}元 + 增值服务费${template.vasFeePerOrder}元 = ${baseAndVas}元`;
    }

    const extraWeight = weightKg - template.baseWeightKg;
    const stepFeePerKg = template.stepFee / template.stepWeightKg;
    const stepFeeTotal = extraWeight * stepFeePerKg;

    return `${template.name}: 首重${template.baseWeightKg}kg内 ${template.baseFee}元 + 续重${extraWeight.toFixed(3)}kg (${stepFeeTotal.toFixed(2)}元) + 增值服务费${template.vasFeePerOrder}元 = ${finalFee}元`;
  }
}
