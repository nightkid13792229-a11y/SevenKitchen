/**
 * Supplement Shop Config Application Service
 *
 * 补剂商城的可配置项（单例）：加价倍率、分装服务费、包材费、圆整规则、
 * 运费策略、分装有效期系数、售后策略。
 *
 * 刻意与鲜食的 GlobalConfig 解耦，详见 docs/plans/2026-09-18-supplement-shop-design.md
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export const SUPPLEMENT_SHOP_CONFIG_ID = 'singleton';

/** 标签上默认显示的品牌名 */
export const DEFAULT_LABEL_BRAND_NAME = '赛文的食堂';

export type SupplementServiceFeeMode = 'PER_ORDER' | 'PER_BAG';
export type SupplementPriceRoundingMode =
  | 'NONE'
  | 'CEIL_TO_0_1'
  | 'CEIL_TO_0_5'
  | 'CEIL_TO_1';
export type SupplementShippingMode = 'FLAT_RATE' | 'TEMPLATE';

export interface SupplementShopConfigDto {
  enabled: boolean;
  markupMultiplier: number;
  serviceFeeMode: SupplementServiceFeeMode;
  serviceFeeAmount: number;
  packagingFeePerBag: number;
  priceRoundingMode: SupplementPriceRoundingMode;
  minOrderAmount: number;
  roundUpUsage: boolean;
  shippingMode: SupplementShippingMode;
  flatShippingFee: number;
  shippingTemplateId: string | null;
  freeShippingThreshold: number | null;
  powderShelfLifeMonths: number;
  solidShelfLifeMonths: number;
  oilShelfLifeMonths: number;
  minRemainingShelfLifeDays: number;
  aftersalePolicy: string | null;
  labelBrandName: string;
  labelIncludeDesiccantNotice: boolean;
  updatedAt: string | null;
}

export type UpdateSupplementShopConfigDto = Partial<
  Omit<SupplementShopConfigDto, 'updatedAt'>
>;

const SERVICE_FEE_MODES: SupplementServiceFeeMode[] = ['PER_ORDER', 'PER_BAG'];
const ROUNDING_MODES: SupplementPriceRoundingMode[] = [
  'NONE',
  'CEIL_TO_0_1',
  'CEIL_TO_0_5',
  'CEIL_TO_1',
];
const SHIPPING_MODES: SupplementShippingMode[] = ['FLAT_RATE', 'TEMPLATE'];

@Injectable()
export class SupplementShopConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取配置；首次访问自动建单例并落默认值 */
  async getConfig(): Promise<SupplementShopConfigDto> {
    const existing = await this.prisma.supplementShopConfig.findUnique({
      where: { id: SUPPLEMENT_SHOP_CONFIG_ID },
    });

    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.prisma.supplementShopConfig.create({
      data: { id: SUPPLEMENT_SHOP_CONFIG_ID },
    });
    return this.toDto(created);
  }

  async updateConfig(
    dto: UpdateSupplementShopConfigDto,
  ): Promise<SupplementShopConfigDto> {
    this.assertValid(dto);

    if (dto.shippingMode === 'TEMPLATE' && dto.shippingTemplateId) {
      const template = await this.prisma.shippingTemplate.findUnique({
        where: { id: dto.shippingTemplateId },
        select: { id: true, isActive: true },
      });
      if (!template) {
        throw new BadRequestException(
          `运费模板不存在: ${dto.shippingTemplateId}`,
        );
      }
      if (!template.isActive) {
        throw new BadRequestException('所选运费模板已停用，请先启用或换一个');
      }
    }

    // 确保单例存在（Prisma upsert 一次搞定）
    const updated = await this.prisma.supplementShopConfig.upsert({
      where: { id: SUPPLEMENT_SHOP_CONFIG_ID },
      create: { id: SUPPLEMENT_SHOP_CONFIG_ID, ...this.toWriteData(dto) },
      update: this.toWriteData(dto),
    });

    return this.toDto(updated);
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled;
  }

  private assertValid(dto: UpdateSupplementShopConfigDto): void {
    if (dto.serviceFeeMode && !SERVICE_FEE_MODES.includes(dto.serviceFeeMode)) {
      throw new BadRequestException(
        `不支持的分装服务费计费方式: ${dto.serviceFeeMode}`,
      );
    }
    if (
      dto.priceRoundingMode &&
      !ROUNDING_MODES.includes(dto.priceRoundingMode)
    ) {
      throw new BadRequestException(
        `不支持的圆整规则: ${dto.priceRoundingMode}`,
      );
    }
    if (dto.shippingMode && !SHIPPING_MODES.includes(dto.shippingMode)) {
      throw new BadRequestException(`不支持的运费策略: ${dto.shippingMode}`);
    }
    if (dto.shippingMode === 'TEMPLATE' && !dto.shippingTemplateId) {
      throw new BadRequestException('按重量计费时必须选择一个运费模板');
    }

    if (dto.markupMultiplier !== undefined) {
      if (
        !Number.isFinite(dto.markupMultiplier) ||
        dto.markupMultiplier <= 0 ||
        dto.markupMultiplier > 20
      ) {
        throw new BadRequestException('加价倍率必须在 0（不含）到 20 之间');
      }
    }

    for (const [key, label] of [
      ['serviceFeeAmount', '分装服务费'],
      ['packagingFeePerBag', '包材费'],
      ['minOrderAmount', '最低起送金额'],
      ['flatShippingFee', '一口价运费'],
    ] as const) {
      const value = dto[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${label}不能为负数`);
      }
    }

    if (dto.freeShippingThreshold !== undefined && dto.freeShippingThreshold !== null) {
      if (!Number.isFinite(dto.freeShippingThreshold) || dto.freeShippingThreshold < 0) {
        throw new BadRequestException('包邮门槛不能为负数');
      }
    }

    for (const [key, label] of [
      ['powderShelfLifeMonths', '粉剂分装有效期'],
      ['solidShelfLifeMonths', '片剂/胶囊分装有效期'],
      ['oilShelfLifeMonths', '油性软胶囊分装有效期'],
    ] as const) {
      const value = dto[key];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value <= 0 || value > 60) {
        throw new BadRequestException(`${label}必须是 1~60 的整数（月）`);
      }
    }

    if (dto.labelBrandName !== undefined && dto.labelBrandName.length > 100) {
      throw new BadRequestException('标签品牌名不能超过 100 个字');
    }

    if (dto.minRemainingShelfLifeDays !== undefined) {
      const value = dto.minRemainingShelfLifeDays;
      if (!Number.isInteger(value) || value < 0 || value > 3650) {
        throw new BadRequestException(
          '最短可售剩余保质期必须是 0~3650 的整数（天）',
        );
      }
    }
  }

  private toWriteData(dto: UpdateSupplementShopConfigDto) {
    return {
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.markupMultiplier !== undefined && {
        markupMultiplier: dto.markupMultiplier,
      }),
      ...(dto.serviceFeeMode !== undefined && {
        serviceFeeMode: dto.serviceFeeMode,
      }),
      ...(dto.serviceFeeAmount !== undefined && {
        serviceFeeAmount: dto.serviceFeeAmount,
      }),
      ...(dto.packagingFeePerBag !== undefined && {
        packagingFeePerBag: dto.packagingFeePerBag,
      }),
      ...(dto.priceRoundingMode !== undefined && {
        priceRoundingMode: dto.priceRoundingMode,
      }),
      ...(dto.minOrderAmount !== undefined && {
        minOrderAmount: dto.minOrderAmount,
      }),
      ...(dto.roundUpUsage !== undefined && { roundUpUsage: dto.roundUpUsage }),
      ...(dto.shippingMode !== undefined && { shippingMode: dto.shippingMode }),
      ...(dto.flatShippingFee !== undefined && {
        flatShippingFee: dto.flatShippingFee,
      }),
      ...(dto.shippingTemplateId !== undefined && {
        shippingTemplateId: dto.shippingTemplateId,
      }),
      ...(dto.freeShippingThreshold !== undefined && {
        freeShippingThreshold: dto.freeShippingThreshold,
      }),
      ...(dto.powderShelfLifeMonths !== undefined && {
        powderShelfLifeMonths: dto.powderShelfLifeMonths,
      }),
      ...(dto.solidShelfLifeMonths !== undefined && {
        solidShelfLifeMonths: dto.solidShelfLifeMonths,
      }),
      ...(dto.oilShelfLifeMonths !== undefined && {
        oilShelfLifeMonths: dto.oilShelfLifeMonths,
      }),
      ...(dto.minRemainingShelfLifeDays !== undefined && {
        minRemainingShelfLifeDays: dto.minRemainingShelfLifeDays,
      }),
      ...(dto.aftersalePolicy !== undefined && {
        aftersalePolicy: dto.aftersalePolicy?.trim() || null,
      }),
      ...(dto.labelBrandName !== undefined && {
        labelBrandName: dto.labelBrandName.trim() || DEFAULT_LABEL_BRAND_NAME,
      }),
      ...(dto.labelIncludeDesiccantNotice !== undefined && {
        labelIncludeDesiccantNotice: dto.labelIncludeDesiccantNotice,
      }),
    };
  }

  private toDto(row: {
    enabled: boolean;
    markupMultiplier: unknown;
    serviceFeeMode: string;
    serviceFeeAmount: unknown;
    packagingFeePerBag: unknown;
    priceRoundingMode: string;
    minOrderAmount: unknown;
    roundUpUsage: boolean;
    shippingMode: string;
    flatShippingFee: unknown;
    shippingTemplateId: string | null;
    freeShippingThreshold: unknown;
    powderShelfLifeMonths: number;
    solidShelfLifeMonths: number;
    oilShelfLifeMonths: number;
    minRemainingShelfLifeDays: number;
    aftersalePolicy: string | null;
    labelBrandName: string;
    labelIncludeDesiccantNotice: boolean;
    updatedAt: Date;
  }): SupplementShopConfigDto {
    return {
      enabled: row.enabled,
      markupMultiplier: Number(row.markupMultiplier),
      serviceFeeMode: row.serviceFeeMode as SupplementServiceFeeMode,
      serviceFeeAmount: Number(row.serviceFeeAmount),
      packagingFeePerBag: Number(row.packagingFeePerBag),
      priceRoundingMode: row.priceRoundingMode as SupplementPriceRoundingMode,
      minOrderAmount: Number(row.minOrderAmount),
      roundUpUsage: row.roundUpUsage,
      shippingMode: row.shippingMode as SupplementShippingMode,
      flatShippingFee: Number(row.flatShippingFee),
      shippingTemplateId: row.shippingTemplateId,
      freeShippingThreshold:
        row.freeShippingThreshold === null ||
        row.freeShippingThreshold === undefined
          ? null
          : Number(row.freeShippingThreshold),
      powderShelfLifeMonths: row.powderShelfLifeMonths,
      solidShelfLifeMonths: row.solidShelfLifeMonths,
      oilShelfLifeMonths: row.oilShelfLifeMonths,
      minRemainingShelfLifeDays: row.minRemainingShelfLifeDays,
      aftersalePolicy: row.aftersalePolicy,
      labelBrandName: row.labelBrandName || DEFAULT_LABEL_BRAND_NAME,
      labelIncludeDesiccantNotice: row.labelIncludeDesiccantNotice,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}
