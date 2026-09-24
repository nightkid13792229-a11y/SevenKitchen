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

/**
 * 一个可选份数的结果（2026-09-24）。
 *
 * 用途：界面上直接在份数选项里显示「总价 + 多少天量 + 是否包邮」，
 * 让顾客零点击就看到"再加一份就免 8 块运费"。
 * 金额由服务端算好，前端只负责渲染，不做乘法。
 */
export interface SupplementPortionOption {
  /** 份数（1 = 不加量） */
  multiplier: number;
  /** 覆盖的总天数；没有 cycleDays 时为 null */
  totalDays: number | null;
  /** 订单金额（补剂费 + 服务费 + 包材费，不含运费） */
  goodsSubtotal: number;
  shippingFee: number;
  total: number;
  freeShipping: boolean;
  perDayCost: number | null;
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
  /** 包邮门槛；null = 没设门槛（一律收运费）。界面用它显示"再买 X 可包邮" */
  freeShippingThreshold: number | null;
  total: number;
  warnings: string[];
  /** 本次购买几份（1 = 不加量） */
  portionMultiplier: number;
  /** 本次购买覆盖的总天数；没有 cycleDays 时为 null */
  totalDays: number | null;
  /** 总价 ÷ 总天数。界面用它讲"多买几份，每天更便宜" */
  perDayCost: number | null;
  /** 当前这张制作单最多能选几份（受份数上限与天数上限双重约束） */
  maxPortionMultiplier: number;
  /**
   * 每个可选份数的结果（含总价与是否包邮），供界面直接渲染成选项卡片。
   * 与主报价同源同逻辑，不会出现两处口径漂移。
   */
  portionOptions: SupplementPortionOption[];
}

/**
 * 一张制作单最多能加量到几份。
 *
 * 两条约束同时生效，谁也替代不了谁：
 *   - maxPortionMultiplier：管选项别太多、单日产能可控
 *   - maxTotalDays：管效期安全红线
 *
 * 只靠天数上限的话，7 天的制作单会算出 12 份（90÷7）；
 * 只靠份数上限的话，40 天的制作单选 3 份就是 120 天，贴到效期红线。
 *
 * 兜底至少返回 1：不管制作单多长，用户总得能按原量买一份。
 */
export function resolveMaxPortionMultiplier(
  config: Pick<SupplementShopConfigDto, 'maxPortionMultiplier' | 'maxTotalDays'>,
  cycleDays: number | null | undefined,
): number {
  const cap = Math.max(1, Math.floor(config.maxPortionMultiplier));
  const days = Number(cycleDays);
  if (!Number.isFinite(days) || days <= 0) return cap;
  const byShelfLife = Math.floor(config.maxTotalDays / days);
  return Math.max(1, Math.min(cap, byShelfLife));
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
    portionMultiplier?: number;
    cycleDays?: number | null;
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

    return this.calculateQuote(config, lines, shipping, {
      portionMultiplier: input.portionMultiplier,
      cycleDays: input.cycleDays,
    });
  }

  /** 纯计算：给配置 + 明细 + 运费，算出完整报价 */
  calculateQuote(
    config: SupplementShopConfigDto,
    lineInputs: SupplementQuoteLineInput[],
    shipping: SupplementQuoteShippingInfo,
    options: { portionMultiplier?: number; cycleDays?: number | null } = {},
  ): SupplementQuote {
    const cycleDays =
      Number.isFinite(Number(options.cycleDays)) && Number(options.cycleDays) > 0
        ? Math.floor(Number(options.cycleDays))
        : null;
    const maxPortionMultiplier = resolveMaxPortionMultiplier(config, cycleDays);

    /**
     * 份数。服务端**不信任客户端**：这里只做兜底收敛，
     * 真正的拒绝（超出上限就报错）在 order service 里做，
     * 免得分装工单被一个越界的份数写坏。
     */
    const rawMultiplier = Math.floor(Number(options.portionMultiplier ?? 1));
    const portionMultiplier =
      Number.isFinite(rawMultiplier) && rawMultiplier >= 1
        ? rawMultiplier
        : 1;
    const effectiveMultiplier = Math.min(portionMultiplier, maxPortionMultiplier);

    const primary = this.buildQuoteForMultiplier(
      config,
      lineInputs,
      shipping,
      effectiveMultiplier,
      cycleDays,
      maxPortionMultiplier,
    );
    if (portionMultiplier > maxPortionMultiplier) {
      primary.warnings.unshift(
        `加量份数 ${portionMultiplier} 超出上限，按 ${maxPortionMultiplier} 份计价`,
      );
    }

    /**
     * 把每个可选份数的结果一次算好返回（2026-09-24）。
     *
     * 为什么要多算这几遍：界面上要直接在份数选项里显示「总价 + 多少天量 + 是否包邮」，
     * 顾客零点击就能看到"再加一份就免 8 块运费"，不用来回点着试。
     *
     * 这是**纯计算、没有 IO** —— 成本和运费都已经在手上，多算 2 遍的开销可以忽略。
     * 关键是复用了同一个 buildQuoteForMultiplier，保证选项里的金额
     * 与真正下单时的金额**出自同一套逻辑**，不会出现两处口径漂移。
     */
    const portionOptions: SupplementPortionOption[] = [];
    for (let m = 1; m <= maxPortionMultiplier; m += 1) {
      const quote =
        m === effectiveMultiplier
          ? primary
          : this.buildQuoteForMultiplier(
              config,
              lineInputs,
              shipping,
              m,
              cycleDays,
              maxPortionMultiplier,
            );
      portionOptions.push({
        multiplier: m,
        totalDays: quote.totalDays,
        goodsSubtotal: quote.goodsSubtotal,
        shippingFee: quote.shippingFee,
        total: quote.total,
        freeShipping: quote.freeShipping,
        perDayCost: quote.perDayCost,
      });
    }

    return { ...primary, portionOptions };
  }

  /**
   * 按指定的份数算一遍完整报价。
   * 纯函数、无副作用，供 calculateQuote 复用（主结果 + 各个选项）。
   */
  private buildQuoteForMultiplier(
    config: SupplementShopConfigDto,
    lineInputs: SupplementQuoteLineInput[],
    shipping: SupplementQuoteShippingInfo,
    effectiveMultiplier: number,
    cycleDays: number | null,
    maxPortionMultiplier: number,
  ): Omit<SupplementQuote, 'portionOptions'> {
    const warnings: string[] = [];

    const lines: SupplementQuoteLineResult[] = lineInputs.map((line) => {
      if (!Number.isFinite(line.amount) || line.amount <= 0) {
        throw new BadRequestException(`补剂用量必须大于 0: ${line.name}`);
      }
      if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
        throw new BadRequestException(`补剂单位成本不合法: ${line.name}`);
      }

      // ⚠️ 加量的语义是「多做几袋同样规格的小袋」，**不是**「同一袋装更多」。
      //    袋子规格是按一个制作周期的用量选的（碳酸钙粉 10x15 袋本来就装 114g），
      //    把 packedAmount 乘上份数会直接撑爆袋子。所以这里乘的是 cost，不是 amount。
      const packedAmount = roundUpPackAmount(
        line.amount,
        line.unit,
        config.roundUpUsage,
      );
      const cost = guardFloat(
        packedAmount * line.unitCost * effectiveMultiplier,
      );
      const price = roundPrice(
        cost * config.markupMultiplier,
        config.priceRoundingMode,
      );
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
        // 按品种分装：一个补剂一袋；加量则是"一个补剂 N 袋"
        bags: effectiveMultiplier,
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
     * 运费与费用透明化（2026-09-24，**翻转** 2026-09-22 的口径）
     *
     * 2026-09-22 的原决定：运费不向客户单列，由加价空间吸收，客户只看到一个「包邮价」。
     * 当时的理由是：3 种补剂货款只有 ¥15.7，而服务费 ¥9.9 + 运费 ¥8 = ¥17.9，
     * 费用比货本身还贵，用户看到的是一张"不划算"的账单。
     *
     * 2026-09-24 改为向客户收取并**逐项展示**（服务费、运费都列出来）。业务侧的决定。
     * 之所以现在可以这么做，是因为当初那个"不划算"的根因已经被解决：
     *   1) 加价倍率从 2.0 提到 2.5；
     *   2) 承运商从顺丰（约 ¥18/单）换成聚合渠道（约 ¥6.5/单）；
     *   3) 新增「加量」功能 —— 固定费用被摊薄，用户多买几份即可显著降低每天成本。
     * 费用明细摆出来，反而让加量的价值变得可计算：用户能亲眼看到
     * "服务费和运费不随份数变"。
     *
     * 计费规则：
     *   - 商品金额（补剂费 + 服务费 + 包材费）达到 freeShippingThreshold 即包邮；
     *   - 未达到则按 flatShippingFee（或按重量模板）收取。
     *
     * ⚠️ 门槛比对的是 goodsSubtotal，也就是**含服务费**的订单金额 ——
     *    与用户在小程序上看到的"合计（不含运费）"一致，避免两处口径不一样。
     */
    const threshold = config.freeShippingThreshold;
    const freeShipping =
      threshold !== null && threshold > 0 && goodsSubtotal >= threshold;
    const shippingFee = freeShipping ? 0 : roundPrice(shipping.fee, 'NONE');

    const shippingDescription = freeShipping
      ? threshold !== null && threshold > 0
        ? `已满 ${threshold.toFixed(2)} 元包邮`
        : '包邮'
      : shippingFee > 0
        ? shipping.description
        : '包邮';

    const total = guardFloat(goodsSubtotal + shippingFee);
    const totalDays =
      cycleDays === null ? null : cycleDays * effectiveMultiplier;
    // 每天成本：界面靠它讲清楚"多买几份，每天更便宜"。四舍五入到分。
    const perDayCost =
      totalDays === null || totalDays <= 0
        ? null
        : Math.round((total / totalDays) * 100) / 100;

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
      shippingDescription,
      freeShipping,
      freeShippingThreshold: threshold ?? null,
      total,
      warnings,
      portionMultiplier: effectiveMultiplier,
      totalDays,
      perDayCost,
      maxPortionMultiplier,
    };
  }
}
