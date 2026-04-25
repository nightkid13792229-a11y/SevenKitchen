/**
 * Global Config Service
 * Provides global configuration values for pricing and costing
 * Based on 07_Core_Architecture.md Section 2.5
 */

import { Injectable } from '@nestjs/common';
import type { GlobalConfig } from '../../domain/pricing/pricing.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

@Injectable()
export class GlobalConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
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
      defaultBatchCapacityG: parseFloat(
        config.defaultBatchCapacityG.toString(),
      ),
      minPotWeightG: config.minPotWeightG,
      targetMargin: parseFloat(config.targetMargin.toString()),
      overheadCostPerKg: parseFloat(config.overheadCostPerKg.toString()),
      targetBatchUtilization: parseFloat(
        config.targetBatchUtilization.toString(),
      ),
      supplementLossRate: parseFloat(config.supplementLossRate.toString()),
      defaultProductLabelId: config.defaultProductLabelId,
      defaultIcePackId: config.defaultIcePackId,
      defaultShippingTemplateId: config.defaultShippingTemplateId,
      packageExampleImageUrl: config.packageExampleImageUrl,
      shippingCompanyLogoUrl: config.shippingCompanyLogoUrl,
      paymentTimeoutMinutes: (config as any).paymentTimeoutMinutes ?? 30,
      ingredientPriceAutoApproveThreshold: parseFloat(
        (config as any).ingredientPriceAutoApproveThreshold?.toString() ??
          this.defaultAutoApproveThreshold().toString(),
      ),
      equipmentRecommendations:
        (config as any).equipmentRecommendations ?? null,
      homeHeaderBgImageUrl: (config as any).homeHeaderBgImageUrl ?? null,
      diySheetHeaderBgImageUrl:
        (config as any).diySheetHeaderBgImageUrl ?? null,
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
      minPotWeightG: number;
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
      homeHeaderBgImageUrl: string | null;
      diySheetHeaderBgImageUrl: string | null;
      paymentTimeoutMinutes: number;
      ingredientPriceAutoApproveThreshold: number;
      equipmentRecommendations: any;
    }>,
  ): Promise<GlobalConfig> {
    const previousDiySheetHeaderBgImageUrl =
      dto.diySheetHeaderBgImageUrl !== undefined
        ? await this.getCurrentDiySheetHeaderBgImageUrl()
        : null;

    // Build update data object with only provided fields
    // Convert empty strings to null for URL fields
    const updateData: any = {};
    if (dto.laborHourlyRate !== undefined)
      updateData.laborHourlyRate = dto.laborHourlyRate;
    if (dto.minOrderWeightG !== undefined)
      updateData.minOrderWeightG = dto.minOrderWeightG;
    if (dto.defaultBatchCapacityG !== undefined)
      updateData.defaultBatchCapacityG = dto.defaultBatchCapacityG;
    if (dto.minPotWeightG !== undefined)
      updateData.minPotWeightG = dto.minPotWeightG;
    if (dto.targetMargin !== undefined)
      updateData.targetMargin = dto.targetMargin;
    if (dto.overheadCostPerKg !== undefined)
      updateData.overheadCostPerKg = dto.overheadCostPerKg;
    if (dto.targetBatchUtilization !== undefined)
      updateData.targetBatchUtilization = dto.targetBatchUtilization;
    if (dto.supplementLossRate !== undefined)
      updateData.supplementLossRate = dto.supplementLossRate;
    if (dto.defaultProductLabelId !== undefined)
      updateData.defaultProductLabelId = dto.defaultProductLabelId;
    if (dto.defaultIcePackId !== undefined)
      updateData.defaultIcePackId = dto.defaultIcePackId;
    if (dto.defaultShippingTemplateId !== undefined)
      updateData.defaultShippingTemplateId = dto.defaultShippingTemplateId;

    // Convert empty strings to null for URL fields
    if (dto.packageExampleImageUrl !== undefined) {
      updateData.packageExampleImageUrl = dto.packageExampleImageUrl || null;
    }
    if (dto.shippingCompanyLogoUrl !== undefined) {
      updateData.shippingCompanyLogoUrl = dto.shippingCompanyLogoUrl || null;
    }

    if (dto.homeHeaderBgImageUrl !== undefined) {
      updateData.homeHeaderBgImageUrl = dto.homeHeaderBgImageUrl || null;
    }

    if (dto.diySheetHeaderBgImageUrl !== undefined) {
      updateData.diySheetHeaderBgImageUrl =
        dto.diySheetHeaderBgImageUrl || null;
    }

    if (dto.paymentTimeoutMinutes !== undefined)
      updateData.paymentTimeoutMinutes = dto.paymentTimeoutMinutes;
    if (dto.ingredientPriceAutoApproveThreshold !== undefined) {
      updateData.ingredientPriceAutoApproveThreshold =
        dto.ingredientPriceAutoApproveThreshold;
    }
    if (dto.equipmentRecommendations !== undefined)
      updateData.equipmentRecommendations = dto.equipmentRecommendations;

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

    if (dto.diySheetHeaderBgImageUrl !== undefined) {
      await this.deleteReplacedDiySheetHeaderBgImage(
        previousDiySheetHeaderBgImageUrl,
        updateData.diySheetHeaderBgImageUrl,
      );
    }

    return {
      laborHourlyRate: parseFloat(config.laborHourlyRate.toString()),
      minOrderWeightG: config.minOrderWeightG,
      defaultBatchCapacityG: parseFloat(
        config.defaultBatchCapacityG.toString(),
      ),
      minPotWeightG: config.minPotWeightG,
      targetMargin: parseFloat(config.targetMargin.toString()),
      overheadCostPerKg: parseFloat(config.overheadCostPerKg.toString()),
      targetBatchUtilization: parseFloat(
        config.targetBatchUtilization.toString(),
      ),
      supplementLossRate: parseFloat(config.supplementLossRate.toString()),
      defaultProductLabelId: config.defaultProductLabelId,
      defaultIcePackId: config.defaultIcePackId,
      defaultShippingTemplateId: config.defaultShippingTemplateId,
      packageExampleImageUrl: config.packageExampleImageUrl,
      shippingCompanyLogoUrl: config.shippingCompanyLogoUrl,
      paymentTimeoutMinutes: (config as any).paymentTimeoutMinutes ?? 30,
      ingredientPriceAutoApproveThreshold: parseFloat(
        (config as any).ingredientPriceAutoApproveThreshold?.toString() ??
          this.defaultAutoApproveThreshold().toString(),
      ),
      equipmentRecommendations:
        (config as any).equipmentRecommendations ?? null,
      homeHeaderBgImageUrl: (config as any).homeHeaderBgImageUrl ?? null,
      diySheetHeaderBgImageUrl:
        (config as any).diySheetHeaderBgImageUrl ?? null,
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
      minPotWeightG: 2000,
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
      homeHeaderBgImageUrl: null,
      diySheetHeaderBgImageUrl: null,
      ingredientPriceAutoApproveThreshold: this.defaultAutoApproveThreshold(),
      equipmentRecommendations: null,
    };
  }

  private async getCurrentDiySheetHeaderBgImageUrl(): Promise<string | null> {
    const config = await this.prisma.globalConfig.findUnique({
      where: { id: 'singleton' },
      select: { diySheetHeaderBgImageUrl: true } as any,
    });

    return (config as any)?.diySheetHeaderBgImageUrl || null;
  }

  private async deleteReplacedDiySheetHeaderBgImage(
    previousUrl: string | null,
    nextUrl: string | null,
  ): Promise<void> {
    if (!previousUrl || previousUrl === nextUrl) {
      return;
    }

    try {
      await this.cosService.deleteImageByUrl(previousUrl);
    } catch (error) {
      console.warn(
        '[GlobalConfigService] Failed to delete previous DIY sheet header background:',
        error,
      );
    }
  }

  private defaultAutoApproveThreshold(): number {
    return 0.08;
  }
}
