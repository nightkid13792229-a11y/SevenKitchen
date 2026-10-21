/**
 * Global Config Service
 * Provides global configuration values for pricing and costing
 * Based on 07_Core_Architecture.md Section 2.5
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import type { GlobalConfig } from '../../domain/pricing/pricing.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

/**
 * 识别（每次都要调模型）的每日上限默认值：500 次/天（2026-10-16 B5）。
 *
 * ⚠️ 它只是"库里这一列读不到时"的兜底，**不是**上限的唯一来源：
 * 真正的值存在 global_config.health_extraction_daily_limit，
 * 后台 `PUT /api/v1/admin/global-config` 随时可改、即时生效（不用重启）。
 */
export const DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT = 500;

/**
 * 内部生产损耗系数的兜底值（2026-10-21）。
 *
 * 与 `CustomRecipeConfig` 历史上用的默认值一致（1.07 = 损耗 7%）：
 * 迁移只换“从哪里读”，**不改变任何既有数值**。
 */
export const DEFAULT_PRODUCTION_LOSS_RATE = 1.07;
/** 损耗率是 ≥1 的系数：小于 1 等于“做出来比投料还多”，物理上不成立 */
export const MIN_PRODUCTION_LOSS_RATE = 1;
/** 上限 2 是防呆：超过 100% 的损耗只可能是填错了 */
export const MAX_PRODUCTION_LOSS_RATE = 2;

/**
 * 把任意来源的损耗率归一化成可用的系数。
 *
 * 读库与写库共用这一条：库里的值可能是 Decimal、字符串、null，
 * 也可能被人手工改坏。非法时一律回落到 1.07 —— **绝不把荒谬值写进新食谱**。
 */
export function normalizeProductionLossRate(value: unknown): number {
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_PRODUCTION_LOSS_RATE ||
    parsed > MAX_PRODUCTION_LOSS_RATE
  ) {
    return DEFAULT_PRODUCTION_LOSS_RATE;
  }
  return parsed;
}

/**
 * 疫苗板块开关的对外形状（B4）。
 *
 * 只给小程序这两样 —— 开关状态 + 一句人话说明。
 * 不给任何"能不能改"的口子：改只有一条路（admin 接口，带登录）✓
 */
export interface VaccineFeatureFlag {
  /** true = 疫苗书签照常出现；false = 整个板块不出现 */
  enabled: boolean;
  /** 关掉时给顾客看的一句话；空字符串 = 不解释 */
  notice: string;
}

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
      productionLossRate: normalizeProductionLossRate(
        config.productionLossRate,
      ),
      autoDeductInventoryOnProduction:
        (config as any).autoDeductInventoryOnProduction ?? false,
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
      vaccineFeatureEnabled: (config as any).vaccineFeatureEnabled ?? true,
      vaccineFeatureNotice: (config as any).vaccineFeatureNotice ?? null,
      healthExtractionDailyLimit: this.normalizeDailyLimit(
        (config as any).healthExtractionDailyLimit,
      ),
    };
  }

  /**
   * 疫苗板块的开关（2026-10-16 B4）。
   *
   * 这是小程序唯一需要的那一份：`{ enabled, notice }`。
   *
   * 默认值只能是 **true**（保留现状）：
   *   · 开关是"应急关停"用的，不是"灰度放量"用的 —— 谁都没动过它的时候，
   *     疫苗板块就该是开着的（这一列刚加上去时线上正开着）；
   *   · 真出事时后台会把它改成 false，那一行**一定存在**，
   *     所以"读不到 → 当成开"不会把已经关掉的板块又放出来。
   *
   * ⚠️ 小程序那条"拉不到就按关处理"的兜底不在这里 —— 见
   *    miniapp/src/utils/vaccine-feature.ts（两个默认值方向相反，各有各的理由）。
   */
  async getVaccineFeatureFlag(): Promise<VaccineFeatureFlag> {
    const row = await this.prisma.globalConfig.findUnique({
      where: { id: 'singleton' },
      select: {
        vaccineFeatureEnabled: true,
        vaccineFeatureNotice: true,
      } as any,
    });

    return {
      enabled: (row as any)?.vaccineFeatureEnabled ?? true,
      notice: String((row as any)?.vaccineFeatureNotice ?? '').trim(),
    };
  }

  /**
   * 识别的全局每日上限（2026-10-16 B5）。
   *
   * 放在这张单例配置表里 → 后台改一下即时生效，不用改代码、不用重启 ✓。
   * 0 = 不限量。
   */
  async getHealthExtractionDailyLimit(): Promise<number> {
    const row = await this.prisma.globalConfig.findUnique({
      where: { id: 'singleton' },
      select: { healthExtractionDailyLimit: true } as any,
    });

    return this.normalizeDailyLimit((row as any)?.healthExtractionDailyLimit);
  }

  /**
   * 上限归一化：读不到 / 不是数字 → 用默认 500；
   * 负数 → 0（= 不限量，与"把关掉"同一个方向，不会变成"全部拒绝" ✗）。
   */
  private normalizeDailyLimit(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT;
    }
    return Math.max(0, Math.floor(parsed));
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
      /** 内部生产损耗系数（1–2，1.07 = 损耗 7%）；只影响之后新建的食谱 */
      productionLossRate: number;
      autoDeductInventoryOnProduction: boolean;
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
      /** 疫苗板块开关（B4）；true = 开、false = 整个板块关掉 */
      vaccineFeatureEnabled: boolean;
      /** 关掉时给顾客看的一句话；传空串 = 清掉 */
      vaccineFeatureNotice: string | null;
      /** 识别每日上限（B5）；0 = 不限量 */
      healthExtractionDailyLimit: number;
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
    if (dto.autoDeductInventoryOnProduction !== undefined)
      updateData.autoDeductInventoryOnProduction =
        dto.autoDeductInventoryOnProduction;
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
    if (dto.productionLossRate !== undefined) {
      const value = Number(dto.productionLossRate);
      if (
        !Number.isFinite(value) ||
        value < MIN_PRODUCTION_LOSS_RATE ||
        value > MAX_PRODUCTION_LOSS_RATE
      ) {
        throw new BadRequestException(
          '内部生产损耗系数必须是 1~2 的系数（1.07 表示损耗 7%）',
        );
      }
      updateData.productionLossRate = value;
    }
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

    /**
     * 疫苗板块开关（2026-10-16 B4）。
     *
     * ⚠️ 只认 `true` / `false` 两个值：`false` 必须真的关掉，
     * 不能因为"传了个空字符串"就当成没传（那就是关了又被打开 ✗）。
     * 其他任何值（undefined 除外）= 拒绝，不静默当没发生。
     */
    if (dto.vaccineFeatureEnabled !== undefined) {
      if (typeof dto.vaccineFeatureEnabled !== 'boolean') {
        throw new BadRequestException('疫苗板块开关只能是 true 或 false');
      }
      updateData.vaccineFeatureEnabled = dto.vaccineFeatureEnabled;
    }

    if (dto.vaccineFeatureNotice !== undefined) {
      const notice = String(dto.vaccineFeatureNotice ?? '').trim();
      if (notice.length > 200) {
        throw new BadRequestException('给顾客看的说明不能超过 200 个字');
      }
      updateData.vaccineFeatureNotice = notice || null;
    }

    if (dto.healthExtractionDailyLimit !== undefined) {
      const limit = Number(dto.healthExtractionDailyLimit);
      // 上限必须是 0~100000 的整数：0 = 不限量；负数没有意义（防呆）
      if (!Number.isInteger(limit) || limit < 0 || limit > 100000) {
        throw new BadRequestException(
          '识别每日上限必须是 0~100000 的整数；0 表示不限量',
        );
      }
      updateData.healthExtractionDailyLimit = limit;
    }

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
      productionLossRate: normalizeProductionLossRate(
        config.productionLossRate,
      ),
      autoDeductInventoryOnProduction:
        (config as any).autoDeductInventoryOnProduction ?? false,
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
      vaccineFeatureEnabled: (config as any).vaccineFeatureEnabled ?? true,
      vaccineFeatureNotice: (config as any).vaccineFeatureNotice ?? null,
      healthExtractionDailyLimit: this.normalizeDailyLimit(
        (config as any).healthExtractionDailyLimit,
      ),
    };
  }

  /**
   * Get default configuration values
   */
  private getDefaultConfig(): any {
    return {
      laborHourlyRate: 30.0,
      minOrderWeightG: 1000,
      autoDeductInventoryOnProduction: false,
      defaultBatchCapacityG: 5000,
      minPotWeightG: 2000,
      targetMargin: 0.4,
      overheadCostPerKg: 2.0,
      targetBatchUtilization: 0.8,
      supplementLossRate: 1.05,
      productionLossRate: DEFAULT_PRODUCTION_LOSS_RATE,
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
      // 疫苗板块的应急开关（B4）：默认开 —— 没人动过它时，线上行为与加这一列之前一致
      vaccineFeatureEnabled: true,
      vaccineFeatureNotice: null,
      // 识别每日上限（B5）：默认 500 次/天
      healthExtractionDailyLimit: DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT,
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
