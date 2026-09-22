/**
 * Supplement Pricing Application Service
 *
 * 补剂分装小份的报价计算器：
 *   补剂费 = Σ(分装量 × 单位成本) × 加价倍率（再按圆整规则处理）
 *   服务费 = 按单固定 / 按袋
 *   包材费 = 按袋
 *   运费   = 一口价 或 套用现有按重量模板，可设包邮门槛
 *
 * 纯计算逻辑与副作用分离：calculateQuote 是纯函数，方便单测与调参预览。
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { ShippingService } from '../shipping/shipping.service';
import {
  SupplementShopConfigService,
  type SupplementPriceRoundingMode,
  type SupplementShopConfigDto,
} from './supplement-shop-config.service';
import type { IngredientPhysicalFormCode } from './supplement-catalog.service';

export interface SupplementQuoteLineInput {
  ingredientId: string;
  name: string;
  /** 展示单位：片 / 粒 / 平勺 / g */
  unit: string;
  /** 制作单上给用户的用量 */
  amount: number;
  /** 元 / 展示单位 */
  unitCost: number;
  physicalForm: IngredientPhysicalFormCode;
  /** 内容物是否油性（鱼油/鱼肝油等），效期取更保守的一档 */
  isOilBased?: boolean;
}

export interface SupplementQuoteLineResult {
  ingredientId: string;
  name: string;
  unit: string;
  physicalForm: IngredientPhysicalFormCode;
  /** 制作单上的原始用量 */
  requestedAmount: number;
  /** 实际分装量（按形态向上取整后） */
  packedAmount: number;
  unitCost: number;
  /** 我们的成本 */
  cost: number;
  /** 对用户的售价 */
  price: number;
  bags: number;
  /** 分装后标示有效期（月） */
  shelfLifeMonths: number;
}

export interface SupplementQuoteShippingInfo {
  fee: number;
  description: string;
}

export interface SupplementQuote {
  lines: SupplementQuoteLineResult[];
  bagCount: number;
  supplementCost: number;
  supplementPrice: number;
  serviceFee: number;
  packagingFee: number;
  goodsSubtotal: number;
  shippingFee: number;
  shippingDescription: string;
  freeShipping: boolean;
  total: number;
  warnings: string[];
}

/** 按"个数"计量的单位，分装量直接向上取整到整数 */
const COUNTABLE_UNIT_KEYWORDS = ['片', '粒', '平勺', '勺', '颗', '袋', '包', '支', '滴', '胶囊'];

/** 浮点误差护栏：先把中间值收敛到 6 位小数，再取整 */
function guardFloat(value: number): number {
  return Number(value.toFixed(6));
}

export function roundPrice(
  value: number,
  mode: SupplementPriceRoundingMode,
): number {
  switch (mode) {
    case 'NONE':
      return Math.round(guardFloat(value) * 100) / 100;
    case 'CEIL_TO_0_1':
      return guardFloat(Math.ceil(guardFloat(value * 10)) / 10);
    case 'CEIL_TO_0_5':
      return guardFloat(Math.ceil(guardFloat(value * 2)) / 2);
    case 'CEIL_TO_1':
      return Math.ceil(guardFloat(value));
    default:
      return Math.round(guardFloat(value) * 100) / 100;
  }
}

/**
 * 分装量取整：
 * - 片 / 粒 / 平勺 这类"数个数"的，向上取整到整数
 * - 克 / 毫升 这类称重的，向上取到 0.1
 */
export function roundUpPackAmount(
  amount: number,
  unit: string,
  enabled: boolean,
): number {
  if (!enabled) return amount;
  const label = (unit || '').trim();
  const countable = COUNTABLE_UNIT_KEYWORDS.some((keyword) =>
    label.includes(keyword),
  );
  if (countable) {
    return Math.ceil(guardFloat(amount));
  }
  return guardFloat(Math.ceil(guardFloat(amount * 10)) / 10);
}

/**
 * 分装后标示有效期（月）。
 * 油性内容物（鱼油/鱼肝油等）最易氧化酸败，优先取油性系数；
 * 其余按物理形态取：粉剂一档、片剂/胶囊一档。
 */
export function resolvePackShelfLifeMonths(
  physicalForm: IngredientPhysicalFormCode,
  config: Pick<
    SupplementShopConfigDto,
    'powderShelfLifeMonths' | 'solidShelfLifeMonths' | 'oilShelfLifeMonths'
  >,
  isOilBased = false,
): number {
  if (isOilBased) {
    return config.oilShelfLifeMonths;
  }
  return physicalForm === 'POWDER'
    ? config.powderShelfLifeMonths
    : config.solidShelfLifeMonths;
}

@Injectable()
export class SupplementPricingService {
  constructor(
    private readonly configService: SupplementShopConfigService,
    private readonly shippingService: ShippingService,
  ) {}

  /** 后台调参预览：按当前配置算一遍报价 */
  async previewQuote(input: {
    lines: SupplementQuoteLineInput[];
    totalWeightG?: number;
  }): Promise<SupplementQuote> {
    const config = await this.configService.getConfig();
    const lines = input.lines || [];

    let shipping: SupplementQuoteShippingInfo = {
      fee: 0,
      description: '无运费',
    };

    if (config.shippingMode === 'FLAT_RATE') {
      shipping = {
        fee: config.flatShippingFee,
        description: `补剂一口价运费 ${config.flatShippingFee.toFixed(2)} 元`,
      };
    } else {
      const result = await this.shippingService.calculateShippingFeePreview({
        totalWeightG: input.totalWeightG ?? 500,
        shippingTemplateId: config.shippingTemplateId,
      });
      shipping = {
        fee: result.amountShipping,
        description: result.ruleAppliedDescription,
      };
    }

    return this.calculateQuote(config, lines, shipping);
  }

  /** 纯计算：给配置 + 明细 + 运费，算出完整报价 */
  calculateQuote(
    config: SupplementShopConfigDto,
    lineInputs: SupplementQuoteLineInput[],
    shipping: SupplementQuoteShippingInfo,
  ): SupplementQuote {
    const warnings: string[] = [];

    const lines: SupplementQuoteLineResult[] = lineInputs.map((line) => {
      if (!Number.isFinite(line.amount) || line.amount <= 0) {
        throw new BadRequestException(`补剂用量必须大于 0: ${line.name}`);
      }
      if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
        throw new BadRequestException(`补剂单位成本不合法: ${line.name}`);
      }

      const packedAmount = roundUpPackAmount(
        line.amount,
        line.unit,
        config.roundUpUsage,
      );
      const cost = guardFloat(packedAmount * line.unitCost);
      const price = roundPrice(cost * config.markupMultiplier, config.priceRoundingMode);
      const shelfLifeMonths = resolvePackShelfLifeMonths(
        line.physicalForm,
        config,
        line.isOilBased === true,
      );

      if (line.physicalForm === 'LIQUID') {
        warnings.push(`${line.name} 是液体补剂，暂不支持分装`);
      }
      if (shelfLifeMonths <= 0) {
        warnings.push(`${line.name} 未配置分装有效期`);
      }

      return {
        ingredientId: line.ingredientId,
        name: line.name,
        unit: line.unit,
        physicalForm: line.physicalForm,
        requestedAmount: line.amount,
        packedAmount,
        unitCost: line.unitCost,
        cost,
        price,
        // 按品种分装：一个补剂一袋
        bags: 1,
        shelfLifeMonths,
      };
    });

    if (lines.length === 0) {
      throw new BadRequestException('补剂清单为空，无法报价');
    }

    const bagCount = lines.reduce((sum, line) => sum + line.bags, 0);
    const supplementCost = guardFloat(
      lines.reduce((sum, line) => sum + line.cost, 0),
    );
    const supplementPrice = guardFloat(
      lines.reduce((sum, line) => sum + line.price, 0),
    );

    const serviceFee =
      config.serviceFeeMode === 'PER_ORDER'
        ? roundPrice(config.serviceFeeAmount, 'NONE')
        : roundPrice(config.serviceFeeAmount * bagCount, 'NONE');
    const packagingFee = roundPrice(
      config.packagingFeePerBag * bagCount,
      'NONE',
    );

    const goodsSubtotal = guardFloat(
      supplementPrice + serviceFee + packagingFee,
    );

    /**
     * 2026-09-22 定价口径调整：运费不再向客户单列收取，改由加价空间吸收。
     *
     * 背景：3 种补剂的货款只有 ¥15.7，而分装服务费 ¥9.9 + 运费 ¥8 = ¥17.9，
     * 费用合计比货本身还高，用户看到的是一张"不划算"的账单。
     *
     * 决策（已与业务确认，方案 A）：
     *   - 配置里的 flatShippingFee **保持原值不变** —— 运费仍是真实成本，照常入账；
     *   - 只是不再作为单独一项向客户收取，客户看到的就是一个「包邮价」；
     *   - 即 total = goodsSubtotal，运费由 2 倍加价产生的毛利覆盖。
     *
     * 实测：示例单合计 ¥33.6 → ¥25.6，客户少付 ¥8，仍有约 ¥9.8 毛利。
     *
     * ⚠️ 不要把这里改回"按门槛收运费"，也不要顺手把 flatShippingFee 改成 0：
     *    前者会让小额单重新暴露费用问题，后者会让运费成本在账上消失。
     */
    const shippingFee = 0;
    const freeShipping = true;

    const total = guardFloat(goodsSubtotal + shippingFee);

    if (config.minOrderAmount > 0 && goodsSubtotal < config.minOrderAmount) {
      warnings.push(
        `商品金额 ${goodsSubtotal.toFixed(2)} 元未达最低起送 ${config.minOrderAmount.toFixed(2)} 元`,
      );
    }

    return {
      lines,
      bagCount,
      supplementCost,
      supplementPrice,
      serviceFee,
      packagingFee,
      goodsSubtotal,
      shippingFee,
      shippingDescription: '全国包邮（运费已含在价格内）',
      freeShipping,
      total,
      warnings,
    };
  }
}
