/**
 * Global Config Service
 * Provides global configuration values for pricing and costing
 * Based on 07_Core_Architecture.md Section 2.5
 */

import { Injectable } from '@nestjs/common';
import type { GlobalConfig } from '../../domain/pricing/pricing.service';

@Injectable()
export class GlobalConfigService {
  /**
   * Get global configuration
   * For MVP, returns default values as per 07_Core_Architecture.md
   * TODO: Load from database GlobalConfig table in future
   */
  getGlobalConfig(): GlobalConfig {
    return {
      laborHourlyRate: 30.0, // CNY per hour
      minOrderWeightG: 1000, // 1kg minimum
      defaultBatchCapacityG: 5000, // 5kg per batch
      targetMargin: 0.4, // 40% gross margin
      overheadCostPerKg: 2.0, // CNY per kg
      targetBatchUtilization: 0.8, // 80% capacity utilization
      supplementLossRate: 1.05, // 5% loss for supplements
      defaultVacuumBagId: null, // TODO: Set from seeded ingredients
      defaultProductLabelId: null, // TODO: Set from seeded ingredients
      defaultShippingLabelId: null,
      defaultIcePackId: null,
    };
  }
}
