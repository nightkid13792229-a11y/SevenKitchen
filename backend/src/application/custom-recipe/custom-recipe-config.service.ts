/**
 * 食谱定制配置 Application Service
 *
 * 单例配置：定制费、可抵扣金额、交付工作日数、每日接单上限、支付超时。
 *
 * 为什么单独一张表（而不是并进 GlobalConfig）：
 * 定制是独立产品线（顶层设计 v4 产品线 ③），它的价格与产能参数不该和
 * 鲜食、补剂共用一个值 —— 否则调一边会影响另一边。
 * 与 SupplementShopConfig 的做法保持一致。
 *
 * 关键解耦点：**定制费**（feeAmount）与**可抵扣金额**（creditAmount）
 * 是两个独立参数：顾客付多少钱、其中多少钱能抵成品货款，由业务分开定。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export const CUSTOM_RECIPE_CONFIG_ID = 'singleton';

/** 定制费默认 ¥300 */
export const DEFAULT_CUSTOM_RECIPE_FEE = 300;
/** 可抵扣金额默认 ¥300（与定制费一致，即"定制免费"口径） */
export const DEFAULT_CUSTOM_RECIPE_CREDIT = 300;
/** 交付周期默认 3 个工作日 */
export const DEFAULT_CUSTOM_RECIPE_WORK_DAYS = 3;
/** 每日接单上限默认 4 单 */
export const DEFAULT_CUSTOM_RECIPE_DAILY_CAPACITY = 4;
/** 支付超时默认 30 分钟；0 = 不自动关单 */
export const DEFAULT_CUSTOM_RECIPE_PAYMENT_TIMEOUT_MINUTES = 30;

export interface CustomRecipeConfigDto {
  /** 定制费（元） */
  feeAmount: number;
  /** 定制费中可用于抵扣成品货款的金额（元），不超过定制费 */
  creditAmount: number;
  /** 交付周期（工作日） */
  deliveryWorkDays: number;
  /** 每日接单上限 */
  dailyCapacity: number;
  /** 支付超时（分钟）；0 = 不自动关单 */
  paymentTimeoutMinutes: number;
  updatedAt: string | null;
}

/** 对外公开的部分（小程序在未登录时也要能看到价格） */
export interface PublicCustomRecipeConfigDto {
  feeAmount: number;
  creditAmount: number;
  deliveryWorkDays: number;
}

export type UpdateCustomRecipeConfigDto = Partial<
  Omit<CustomRecipeConfigDto, 'updatedAt'>
>;

@Injectable()
export class CustomRecipeConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取配置；首次访问自动建单例并落默认值 */
  async getConfig(): Promise<CustomRecipeConfigDto> {
    const existing = await this.prisma.customRecipeConfig.findUnique({
      where: { id: CUSTOM_RECIPE_CONFIG_ID },
    });

    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.prisma.customRecipeConfig.create({
      data: { id: CUSTOM_RECIPE_CONFIG_ID },
    });
    return this.toDto(created);
  }

  /** 小程序侧只需要价格与交付周期，不暴露接单上限等内部参数 */
  async getPublicConfig(): Promise<PublicCustomRecipeConfigDto> {
    const config = await this.getConfig();
    return {
      feeAmount: config.feeAmount,
      creditAmount: config.creditAmount,
      deliveryWorkDays: config.deliveryWorkDays,
    };
  }

  async updateConfig(
    dto: UpdateCustomRecipeConfigDto,
  ): Promise<CustomRecipeConfigDto> {
    const current = await this.getConfig();
    this.assertValid(dto, current);

    const updated = await this.prisma.customRecipeConfig.upsert({
      where: { id: CUSTOM_RECIPE_CONFIG_ID },
      create: { id: CUSTOM_RECIPE_CONFIG_ID, ...this.toWriteData(dto) },
      update: this.toWriteData(dto),
    });

    return this.toDto(updated);
  }

  /**
   * 校验规则。
   *
   * 抵扣上限必须基于**改完之后**的定制费判断：
   * 后台可能同时提交 feeAmount 与 creditAmount，只拿单边比较会漏判。
   */
  private assertValid(
    dto: UpdateCustomRecipeConfigDto,
    current: CustomRecipeConfigDto,
  ): void {
    if (dto.feeAmount !== undefined) {
      if (!Number.isFinite(dto.feeAmount) || dto.feeAmount < 0) {
        throw new BadRequestException('定制费不能为负数');
      }
      if (dto.feeAmount > 100000) {
        throw new BadRequestException('定制费不能超过 100000 元');
      }
    }

    if (dto.creditAmount !== undefined) {
      if (!Number.isFinite(dto.creditAmount) || dto.creditAmount < 0) {
        throw new BadRequestException('可抵扣金额不能为负数');
      }
    }

    const nextFee = dto.feeAmount ?? current.feeAmount;
    const nextCredit = dto.creditAmount ?? current.creditAmount;
    if (nextCredit > nextFee) {
      throw new BadRequestException(
        `可抵扣金额（¥${nextCredit}）不能超过定制费（¥${nextFee}）；` +
          '如果要做促销，请把定制费一并调高',
      );
    }

    if (dto.deliveryWorkDays !== undefined) {
      const value = dto.deliveryWorkDays;
      // 上限 60 个工作日是防呆：再长就不叫"定制周期"了，只会让顾客流失
      if (!Number.isInteger(value) || value < 1 || value > 60) {
        throw new BadRequestException('交付周期必须是 1~60 的整数（工作日）');
      }
    }

    if (dto.dailyCapacity !== undefined) {
      const value = dto.dailyCapacity;
      if (!Number.isInteger(value) || value < 1 || value > 200) {
        throw new BadRequestException('每日接单上限必须是 1~200 的整数');
      }
    }

    if (dto.paymentTimeoutMinutes !== undefined) {
      const value = dto.paymentTimeoutMinutes;
      // 上限 24 小时，与补剂订单同一口径
      if (!Number.isInteger(value) || value < 0 || value > 1440) {
        throw new BadRequestException(
          '支付超时必须是 0~1440 的整数（分钟）；0 表示不自动关单',
        );
      }
    }
  }

  private toWriteData(dto: UpdateCustomRecipeConfigDto) {
    return {
      ...(dto.feeAmount !== undefined && { feeAmount: dto.feeAmount }),
      ...(dto.creditAmount !== undefined && {
        creditAmount: dto.creditAmount,
      }),
      ...(dto.deliveryWorkDays !== undefined && {
        deliveryWorkDays: dto.deliveryWorkDays,
      }),
      ...(dto.dailyCapacity !== undefined && {
        dailyCapacity: dto.dailyCapacity,
      }),
      ...(dto.paymentTimeoutMinutes !== undefined && {
        paymentTimeoutMinutes: dto.paymentTimeoutMinutes,
      }),
    };
  }

  private toDto(row: {
    feeAmount: unknown;
    creditAmount: unknown;
    deliveryWorkDays: number;
    dailyCapacity: number;
    paymentTimeoutMinutes: number;
    updatedAt: Date | null;
  }): CustomRecipeConfigDto {
    return {
      feeAmount: Number(row.feeAmount),
      creditAmount: Number(row.creditAmount),
      deliveryWorkDays: Number(row.deliveryWorkDays),
      dailyCapacity: Number(row.dailyCapacity),
      paymentTimeoutMinutes: Number(row.paymentTimeoutMinutes),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}
