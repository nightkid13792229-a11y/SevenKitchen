/**
 * Global Config Service
 * Provides global configuration values for pricing and costing
 * Based on 07_Core_Architecture.md Section 2.5
 */

import { Injectable } from '@nestjs/common';
import type { GlobalConfig } from '../../domain/pricing/pricing.service';
import { PrismaService } from '../../infrastructure/prisma.service';

@Injectable()
export class GlobalConfigService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Get global configuration from database
   * Returns the singleton config record
   */
  async getGlobalConfig(): Promise<GlobalConfig> {
    const config = await this.prisma.globalConfig.findUnique({
      where: { id: 'singleton' },
    });

    if (!config) {
      // Return defaults if not found
      return this.getDefaultConfig();
    }

    return {
      laborHourlyRate: parseFloat(config.laborHourlyRate.toString()),
      minOrderWeightG: config.minOrderWeightG,
      defaultBatchCapacityG: parseFloat(config.defaultBatchCapacityG.toString()),
      targetMargin: parseFloat(config.targetMargin.toString()),
      overheadCostPerKg: parseFloat(config.overheadCostPerKg.toString()),
      targetBatchUtilization: parseFloat(config.targetBatchUtilization.toString()),
      supplementLossRate: parseFloat(config.supplementLossRate.toString()),
      defaultProductLabelId: config.defaultProductLabelId,
      defaultIcePackId: config.defaultIcePackId,
      defaultShippingTemplateId: config.defaultShippingTemplateId,
      packageExampleImageUrl: config.packageExampleImageUrl,
      shippingCompanyLogoUrl: config.shippingCompanyLogoUrl,
      paymentTimeoutMinutes: (config as any).paymentTimeoutMinutes ?? 30,
      equipmentRecommendations: (config as any).equipmentRecommendations ?? null,
    };
  }

  /**
   * Update global configuration
   * Only updates fields that are provided in the DTO
   */
  async updateGlobalConfig(
    dto: Partial<{
      laborHourlyRate: number;
      minOrderWeightG: number;
      defaultBatchCapacityG: number;
      targetMargin: number;
      overheadCostPerKg: number;
      targetBatchUtilization: number;
      supplementLossRate: number;
      defaultVacuumBagId: string | null;
      defaultProductLabelId: string | null;
      defaultShippingLabelId: string | null;
      defaultIcePackId: string | null;
      defaultShippingTemplateId: string | null;
      packageExampleImageUrl: string | null;
      shippingCompanyLogoUrl: string | null;
      paymentTimeoutMinutes: number;
      equipmentRecommendations: any;
    }>,
  ): Promise<GlobalConfig> {
    // Build update data object with only provided fields
    const updateData: any = {};
    if (dto.laborHourlyRate !== undefined) updateData.laborHourlyRate = dto.laborHourlyRate;
    if (dto.minOrderWeightG !== undefined) updateData.minOrderWeightG = dto.minOrderWeightG;
    if (dto.defaultBatchCapacityG !== undefined) updateData.defaultBatchCapacityG = dto.defaultBatchCapacityG;
    if (dto.targetMargin !== undefined) updateData.targetMargin = dto.targetMargin;
    if (dto.overheadCostPerKg !== undefined) updateData.overheadCostPerKg = dto.overheadCostPerKg;
    if (dto.targetBatchUtilization !== undefined) updateData.targetBatchUtilization = dto.targetBatchUtilization;
    if (dto.supplementLossRate !== undefined) updateData.supplementLossRate = dto.supplementLossRate;
    if (dto.defaultProductLabelId !== undefined) updateData.defaultProductLabelId = dto.defaultProductLabelId;
    if (dto.defaultIcePackId !== undefined) updateData.defaultIcePackId = dto.defaultIcePackId;
    if (dto.defaultShippingTemplateId !== undefined) updateData.defaultShippingTemplateId = dto.defaultShippingTemplateId;
    if (dto.packageExampleImageUrl !== undefined) updateData.packageExampleImageUrl = dto.packageExampleImageUrl;
    if (dto.shippingCompanyLogoUrl !== undefined) updateData.shippingCompanyLogoUrl = dto.shippingCompanyLogoUrl;
    if (dto.paymentTimeoutMinutes !== undefined) updateData.paymentTimeoutMinutes = dto.paymentTimeoutMinutes;
    if (dto.equipmentRecommendations !== undefined) updateData.equipmentRecommendations = dto.equipmentRecommendations;

    // Update or create the config record
    const config = await this.prisma.globalConfig.upsert({
      where: { id: 'singleton' },
      update: updateData,
      create: {
        id: 'singleton',
        ...this.getDefaultConfig(),
        ...updateData,
      },
    });

    return {
      laborHourlyRate: parseFloat(config.laborHourlyRate.toString()),
      minOrderWeightG: config.minOrderWeightG,
      defaultBatchCapacityG: parseFloat(config.defaultBatchCapacityG.toString()),
      targetMargin: parseFloat(config.targetMargin.toString()),
      overheadCostPerKg: parseFloat(config.overheadCostPerKg.toString()),
      targetBatchUtilization: parseFloat(config.targetBatchUtilization.toString()),
      supplementLossRate: parseFloat(config.supplementLossRate.toString()),
      defaultProductLabelId: config.defaultProductLabelId,
      defaultIcePackId: config.defaultIcePackId,
      defaultShippingTemplateId: config.defaultShippingTemplateId,
      packageExampleImageUrl: config.packageExampleImageUrl,
      shippingCompanyLogoUrl: config.shippingCompanyLogoUrl,
      paymentTimeoutMinutes: (config as any).paymentTimeoutMinutes ?? 30,
      equipmentRecommendations: (config as any).equipmentRecommendations ?? null,
    };
  }

  /**
   * Get default configuration values
   */
  private getDefaultConfig(): any {
    return {
      laborHourlyRate: 30.0,
      minOrderWeightG: 1000,
      defaultBatchCapacityG: 5000,
      targetMargin: 0.4,
      overheadCostPerKg: 2.0,
      targetBatchUtilization: 0.8,
      supplementLossRate: 1.05,
      defaultProductLabelId: null,
      defaultIcePackId: null,
      defaultShippingTemplateId: null,
      packageExampleImageUrl: null,
      shippingCompanyLogoUrl: null,
      paymentTimeoutMinutes: 30,
      equipmentRecommendations: null,
    };
  }
}

