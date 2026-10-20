/**
 * 食谱定制多份报价 Application Service（2026-10-20）
 *
 * 这里是「一笔订单要付多少钱」的唯一实现：
 *   · 配置服务只负责把价格与优惠档位读对、写对；
 *   · 报价接口与下单都必须调用 quote()，禁止前端或其它服务自行算折扣；
 *   · 金额一律四舍五入到分，避免 900 × 8% 出现 827.99 / 828.01。
 *
 * 本服务不涉及成品抵扣：2026-10-20 起抵扣已整体取消，报价里没有、
 * 也不允许再加 credit/deduction 之类的字段。
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MAX_MULTI_RECIPE_DISCOUNT_RATE,
  MAX_MULTI_RECIPE_QUANTITY,
} from './custom-recipe-config.service';
import type {
  CustomRecipeConfigDto,
  MultiRecipeDiscountTier,
} from './custom-recipe-config.service';

/**
 * 必须齐全的优惠档位：2/3/4/5 份。
 *
 * 少一档会让对应份数静默变成「无优惠」——顾客看到的价格与后台预期不符，
 * 所以报价侧和配置保存侧都按「四档齐全」校验。
 */
const REQUIRED_DISCOUNT_QUANTITIES = [2, 3, 4, 5] as const;

/** 对外报价结果（字段与订单价格快照一一对应） */
export interface CustomRecipeQuote {
  quantity: number;
  unitAmount: number;
  originalAmount: number;
  discountRate: number;
  discountAmount: number;
  payableAmount: number;
}

/** 金额统一舍入到分；不使用 Decimal，避免把 Prisma Decimal 带进应用层 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class CustomRecipePricingService {
  /**
   * 计算一笔多份订单的权威报价。
   *
   * 规则（设计文档 5.2）：
   *   · 1 份永远不打折；
   *   · 2–5 份按**达到的最高档**计算整单折扣（不是逐份叠加）；
   *   · discountAmount = round2(originalAmount × discountRate)；
   *   · payableAmount = round2(originalAmount − discountAmount)。
   *
   * 任何一份坏配置都直接抛错，绝不「猜一个看起来合理的价格」——
   * 报价是支付金额的来源，静默兜底会让顾客付错钱。
   */
  quote(quantity: number, config: CustomRecipeConfigDto): CustomRecipeQuote {
    const unitAmount = this.resolveUnitAmount(config);
    const maxQuantity = this.resolveMaxQuantity(config);
    this.assertQuantity(quantity, maxQuantity);

    // 即使 1 份用不到优惠，也要先校验整份配置：坏档位不允许进入报价链路
    const tiers = this.resolveDiscountTiers(config.multiRecipeDiscounts);
    const discountRate =
      quantity === 1 ? 0 : this.findHighestDiscountRate(quantity, tiers);

    const originalAmount = round2(unitAmount * quantity);
    const discountAmount = round2(originalAmount * discountRate);
    const payableAmount = round2(originalAmount - discountAmount);

    return {
      quantity,
      unitAmount,
      originalAmount,
      discountRate,
      discountAmount,
      payableAmount,
    };
  }

  /**
   * 单价来自后台「食谱定制费」。
   *
   * 这里必须校验有限且非负：一个 NaN 会让原价、优惠、应付全部变成 NaN，
   * 而支付接口只会报一句看不懂的错误。
   */
  private resolveUnitAmount(config: CustomRecipeConfigDto): number {
    const feeAmount = config.feeAmount;
    if (
      typeof feeAmount !== 'number' ||
      !Number.isFinite(feeAmount) ||
      feeAmount < 0
    ) {
      throw new BadRequestException(
        '优惠配置不合法：定制费必须是非负的有限数字',
      );
    }
    return round2(feeAmount);
  }

  /**
   * 当前生效的最多份数。
   *
   * 业务硬上限固定为 5，后台只能在 1–5 之间调低。读到越界/非整数值时
   * 直接报错而不是夹回 5：坏配置不能悄悄变成「还能买 5 份」。
   */
  private resolveMaxQuantity(config: CustomRecipeConfigDto): number {
    const value = config.maxRecipeQuantity;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > MAX_MULTI_RECIPE_QUANTITY
    ) {
      throw new BadRequestException(
        `优惠配置不合法：最多份数必须是 1~${MAX_MULTI_RECIPE_QUANTITY} 的整数`,
      );
    }
    return value;
  }

  private assertQuantity(quantity: number, maxQuantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      throw new BadRequestException(`份数必须是 1~${maxQuantity} 的整数`);
    }
  }

  /**
   * 校验并返回优惠档位。
   *
   * 规则与后台保存（CustomRecipeConfigService.assertValid）保持一致：
   *   · 必须是数组，每档必须是对象；
   *   · 份数只能是 2~5 的整数（1 份不允许折扣），且不能重复；
   *   · 每档折扣率必须是 (0, 20%] 之间的有限数字；
   *   · 2/3/4/5 四档必须齐全；
   *   · 按份数升序后，折扣不能下降（可以持平）。
   */
  private resolveDiscountTiers(value: unknown): MultiRecipeDiscountTier[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('优惠配置不合法：优惠档位必须是数组');
    }

    const tiers = value.map((item) => this.parseTier(item));

    const seen = new Set<number>();
    for (const tier of tiers) {
      if (seen.has(tier.quantity)) {
        throw new BadRequestException(
          `优惠配置不合法：${tier.quantity} 份的优惠档位重复了`,
        );
      }
      seen.add(tier.quantity);
    }

    const missing = REQUIRED_DISCOUNT_QUANTITIES.filter(
      (quantity) => !seen.has(quantity),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `优惠配置不合法：优惠档位必须覆盖 2/3/4/5 份，缺少 ${missing.join(
          '、',
        )} 份`,
      );
    }

    // 排序后再判断「折扣不能降低」，库里/请求里的顺序不影响结果
    tiers.sort((a, b) => a.quantity - b.quantity);
    for (let index = 1; index < tiers.length; index += 1) {
      if (tiers[index].discountRate < tiers[index - 1].discountRate) {
        throw new BadRequestException(
          `优惠配置不合法：份数越高折扣不能降低（${tiers[index].quantity} 份的折扣低于上一档）`,
        );
      }
    }

    return tiers;
  }

  private parseTier(raw: unknown): MultiRecipeDiscountTier {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('优惠配置不合法：每一档优惠必须是一个对象');
    }

    const { quantity, discountRate, label } = raw as Record<string, unknown>;

    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 2 ||
      quantity > MAX_MULTI_RECIPE_QUANTITY
    ) {
      throw new BadRequestException(
        `优惠配置不合法：优惠份数必须是 2~${MAX_MULTI_RECIPE_QUANTITY} 的整数`,
      );
    }

    if (
      typeof discountRate !== 'number' ||
      !Number.isFinite(discountRate) ||
      discountRate <= 0 ||
      discountRate > MAX_MULTI_RECIPE_DISCOUNT_RATE
    ) {
      throw new BadRequestException(
        `优惠配置不合法：${quantity} 份的折扣率必须大于 0 且不超过 ${
          MAX_MULTI_RECIPE_DISCOUNT_RATE * 100
        }%`,
      );
    }

    if (typeof label !== 'string') {
      throw new BadRequestException(
        `优惠配置不合法：${quantity} 份的展示文案必须是字符串`,
      );
    }

    return { quantity, discountRate, label };
  }

  /**
   * 取得「达到的最高档」。
   *
   * 档位已按份数升序且四档齐全，所以从低到高扫、最后一个命中的就是最高档。
   * 1 份没有对应档位，返回 0（调用方也会显式跳过）。
   */
  private findHighestDiscountRate(
    quantity: number,
    tiers: MultiRecipeDiscountTier[],
  ): number {
    let discountRate = 0;
    for (const tier of tiers) {
      if (quantity < tier.quantity) {
        break;
      }
      discountRate = tier.discountRate;
    }
    return discountRate;
  }
}
