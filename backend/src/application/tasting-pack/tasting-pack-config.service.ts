/**
 * 试吃装设置（单例）
 *
 * 试吃装是"提前做好、现货发售"的第二条鲜食产品线，价格由
 * 「5 道菜合并成本 × 试吃倍率」自动算出（PricingService.calculateTastingPackPrice）。
 *
 * 这里只放**会随成本与销量反复调整**的参数，刻意与鲜食的 GlobalConfig 解耦：
 * 人工时薪、间接成本、批次产能、目标利润率、运费模板等仍复用「全局配置」，
 * 不重复定义，避免同一个人工成本出现两个可调入口。
 *
 * 沿用 supplement_shop_config 的单例模式：id 固定为 'singleton'。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { PriceRoundingMode } from '../../domain/pricing/price-rounding';

export const TASTING_PACK_CONFIG_ID = 'singleton';

/**
 * 定价用哪个成本基数。
 *
 * 现货的两难：货是前几天按当时的价格做好的，售价按"今天的原料价"还是
 * "这批货实际花了多少钱"？两种都说得通，所以做成可切换。
 */
export type TastingPackCostBasis = 'LIVE' | 'STOCK_BATCH';

const COST_BASIS_MODES: TastingPackCostBasis[] = ['LIVE', 'STOCK_BATCH'];

const ROUNDING_MODES: string[] = [
  PriceRoundingMode.NONE,
  PriceRoundingMode.CEIL_TO_0_1,
  PriceRoundingMode.CEIL_TO_0_5,
  PriceRoundingMode.CEIL_TO_1,
];

export interface TastingPackConfigDto {
  enabled: boolean;
  /** 试吃倍率：成本 → 实收 */
  tastingMultiplier: number;
  priceRoundingMode: PriceRoundingMode;
  /** 定价用哪个成本基数（默认今日原料价） */
  costBasisMode: TastingPackCostBasis;
  /** 单次限购套数 */
  maxSetsPerOrder: number;
  /** 补货预警阈值（可用套数低于此值即提醒） */
  lowStockThreshold: number;
  /** 一键备货默认套数 */
  defaultRestockSets: number;
  /** 成品保质期（月） */
  shelfLifeMonths: number;
  defaultBagsPerRecipe: number;
  defaultPackSpecG: number;
  /** 是否允许强制排产（跳过"采购清单已完成"检查） */
  allowForceSchedule: boolean;
  updatedAt: string | null;
}

export type UpdateTastingPackConfigDto = Partial<
  Omit<TastingPackConfigDto, 'updatedAt'>
>;

const INTEGER_BOUNDS: Array<{
  key: keyof UpdateTastingPackConfigDto;
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'maxSetsPerOrder', label: '单次限购套数', min: 1, max: 50 },
  { key: 'lowStockThreshold', label: '补货预警阈值', min: 0, max: 999 },
  { key: 'defaultRestockSets', label: '默认备货套数', min: 1, max: 999 },
  { key: 'shelfLifeMonths', label: '成品保质期', min: 1, max: 24 },
  { key: 'defaultBagsPerRecipe', label: '每道菜袋数', min: 1, max: 20 },
  { key: 'defaultPackSpecG', label: '每袋克重', min: 10, max: 1000 },
];

@Injectable()
export class TastingPackConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取配置；单例不存在时自动落默认值 */
  async getConfig(): Promise<TastingPackConfigDto> {
    const existing = await this.prisma.tastingPackConfig.findUnique({
      where: { id: TASTING_PACK_CONFIG_ID },
    });

    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.prisma.tastingPackConfig.create({
      data: { id: TASTING_PACK_CONFIG_ID },
    });
    return this.toDto(created);
  }

  async updateConfig(
    dto: UpdateTastingPackConfigDto,
  ): Promise<TastingPackConfigDto> {
    this.assertValid(dto);

    const updated = await this.prisma.tastingPackConfig.upsert({
      where: { id: TASTING_PACK_CONFIG_ID },
      create: { id: TASTING_PACK_CONFIG_ID, ...this.toWriteData(dto) },
      update: this.toWriteData(dto),
    });

    return this.toDto(updated);
  }

  async isEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enabled;
  }

  private assertValid(dto: UpdateTastingPackConfigDto): void {
    if (dto.tastingMultiplier !== undefined) {
      const value = dto.tastingMultiplier;
      // 上限 5 是防呆：倍率是"成本 → 实收"的乘数，
      // 设到 5 以上意味着 80% 以上毛利，几乎肯定是误输入。
      if (!Number.isFinite(value) || value <= 0 || value > 5) {
        throw new BadRequestException('试吃倍率必须在 0（不含）到 5 之间');
      }
    }

    if (
      dto.priceRoundingMode !== undefined &&
      !ROUNDING_MODES.includes(dto.priceRoundingMode)
    ) {
      throw new BadRequestException(
        `不支持的圆整规则: ${dto.priceRoundingMode}`,
      );
    }

    if (
      dto.costBasisMode !== undefined &&
      !COST_BASIS_MODES.includes(dto.costBasisMode)
    ) {
      throw new BadRequestException(
        `不支持的成本基数: ${dto.costBasisMode}`,
      );
    }

    for (const { key, label, min, max } of INTEGER_BOUNDS) {
      const value = dto[key] as number | undefined;
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new BadRequestException(
          `${label}必须是 ${min}~${max} 的整数`,
        );
      }
    }
  }

  private toWriteData(dto: UpdateTastingPackConfigDto) {
    return {
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      ...(dto.tastingMultiplier !== undefined && {
        tastingMultiplier: dto.tastingMultiplier,
      }),
      ...(dto.priceRoundingMode !== undefined && {
        priceRoundingMode: dto.priceRoundingMode,
      }),
      ...(dto.costBasisMode !== undefined && {
        costBasisMode: dto.costBasisMode,
      }),
      ...(dto.maxSetsPerOrder !== undefined && {
        maxSetsPerOrder: dto.maxSetsPerOrder,
      }),
      ...(dto.lowStockThreshold !== undefined && {
        lowStockThreshold: dto.lowStockThreshold,
      }),
      ...(dto.defaultRestockSets !== undefined && {
        defaultRestockSets: dto.defaultRestockSets,
      }),
      ...(dto.shelfLifeMonths !== undefined && {
        shelfLifeMonths: dto.shelfLifeMonths,
      }),
      ...(dto.defaultBagsPerRecipe !== undefined && {
        defaultBagsPerRecipe: dto.defaultBagsPerRecipe,
      }),
      ...(dto.defaultPackSpecG !== undefined && {
        defaultPackSpecG: dto.defaultPackSpecG,
      }),
      ...(dto.allowForceSchedule !== undefined && {
        allowForceSchedule: dto.allowForceSchedule,
      }),
    };
  }

  private toDto(row: {
    enabled: boolean;
    tastingMultiplier: unknown;
    priceRoundingMode: string;
    costBasisMode: string;
    maxSetsPerOrder: number;
    lowStockThreshold: number;
    defaultRestockSets: number;
    shelfLifeMonths: number;
    defaultBagsPerRecipe: number;
    defaultPackSpecG: number;
    allowForceSchedule: boolean;
    updatedAt: Date;
  }): TastingPackConfigDto {
    return {
      enabled: row.enabled,
      tastingMultiplier: Number(row.tastingMultiplier),
      priceRoundingMode: row.priceRoundingMode as PriceRoundingMode,
      costBasisMode: row.costBasisMode as TastingPackCostBasis,
      maxSetsPerOrder: row.maxSetsPerOrder,
      lowStockThreshold: row.lowStockThreshold,
      defaultRestockSets: row.defaultRestockSets,
      shelfLifeMonths: row.shelfLifeMonths,
      defaultBagsPerRecipe: row.defaultBagsPerRecipe,
      defaultPackSpecG: row.defaultPackSpecG,
      allowForceSchedule: row.allowForceSchedule,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }
}
