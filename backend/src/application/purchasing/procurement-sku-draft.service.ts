/**
 * 「从商品详情页截图识别采购商品」草稿服务（2026-11-01）。
 *
 * 老板的场景：采购都在山姆/沃尔玛/盒马的 App 上完成，员工手上就有商品详情页截图。
 * 让他照着手打（品名 + 净含量 + 单价 + 渠道）既慢又容易错，所以让视觉模型读图。
 *
 * 三条硬约束（老板定「账目准确优先」）：
 *   1. **只出草稿，不落库** —— 员工核对、补齐后才调创建接口；
 *   2. **读不出来的一律 null 并进 missing**，绝不用猜测值填坑，
 *      尤其净含量：填错会让库存差几十倍，且系统不会报错；
 *   3. 识别不像"商品详情页"（比如是一屏多件的订单列表）就**判失败**，让他重截或手填。
 *
 * 失败处理：这里**照直抛错**，由控制器降级成「手填」，不阻断员工。
 */

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { DeepSeekChatOptions } from '../recipe-designer/deepseek-chat';
import {
  AgentProviderConfigService,
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ProcurementSkuDraftQuotaService } from './procurement-sku-draft-quota.service';
import {
  normalizeNetContentToBaseUnit,
  type BaseUnitCode,
} from './procurement-sku-net-content';
import {
  BASE_UNIT_LABEL,
  parseSpecLinks,
  resolveSpecChain,
  type SpecChainSource,
  type SpecLink,
} from './procurement-sku-spec-chain';
import { ProcurementSkuDraftNoticeException } from './procurement-sku-draft.errors';
import {
  canonicalChannelCode,
  type ChannelOption,
} from './channel-catalog';
import { PlatformOptionsService } from '../platform-options/platform-options.service';
import { PURCHASE_CHANNEL_SET } from '../platform-options/option-sets.registry';

/** 采购报销 Agent 共用配置的用途标识；未单独配置时回退全局默认 */
export const PROCUREMENT_SKU_DRAFT_PURPOSE =
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE;

/** 视觉模型调用口子（测试里替换掉，避免真打网络） */
export const PROCUREMENT_SKU_DRAFT_MODEL = Symbol(
  'PROCUREMENT_SKU_DRAFT_MODEL',
);

export interface ProcurementSkuDraftModelPort {
  callDeepSeekJson(
    options: DeepSeekChatOptions,
  ): Promise<Record<string, unknown>>;
}

export type DraftConfidence = 'high' | 'low';

export interface ProcurementSkuDraft {
  name: string | null;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseUnit: string | null;
  packCount: number | null;
  netContentPerPack: number | null;
  netContentUnitText: string | null;
  /** 规格链；最后一层一定已折算成基准单位（如 30 枚 × 53 克） */
  specChain: SpecLink[] | null;
  /** 包装规格原文（如 30枚 1.59kg），存进 productModel 给订单匹配用 */
  specText: string | null;
  /** perUnit 是包装上印的（printed）还是用整件总重折算出来的（derived） */
  netContentSource: SpecChainSource | null;
  /** 一采购单位合计（基准单位），用在页面"整盒 1590 克"那句提示上 */
  totalNetContentInBase: number | null;
  /** 最后一层用什么单位说话（按个记账时可能是「张/枚」，其余是基准单位） */
  amountUnitText: string | null;
  unitPrice: number | null;
  missing: string[];
  confidence: Record<string, DraftConfidence>;
}

const NO_THINKING = { thinking: { type: 'disabled' } };

const SYSTEM_PROMPT = `你是采购助理。用户会给你一张中国商超/网店 App 的**商品详情页截图**，
你要读出这件商品的信息，输出 JSON。

只认商品详情页：一屏一个商品，图上有商品标题、包装规格（如 30枚 1.59kg / 500g×2袋 / 24×330ml）、
单价（如 ¥21.8/盒）。
如果截图其实是**订单列表**（一屏多个商品、每个只有一行），返回 {"productList": [...]}，不要硬猜其中一个。

输出字段（读不到的必须给 null，绝不编造）：
{
  "name": "商品标题原文",
  "brand": "品牌，没有就是 null",
  "purchaseUnit": "你要买的这一整件的包装单位，如 盒/袋/箱/瓶",
  "specText": "包装规格原文，照抄，如 30枚 1.59kg",
  "specChain": [{"count": 30, "unit": "枚"}],
  "totalNetContent": { "value": 1.59, "unit": "kg" },
  "purchaseChannel": "从下面的渠道清单里选一个；看不出就给 null，不要自己编店名",
  "unitPrice": 单价数字（元）,
  "confidence": { "name": "high|low", "purchaseChannel": "high|low", "specChain": "high|low" }
}

specChain 怎么写：
- 从「一{purchaseUnit}」往下一层层写，每一层是 {"count": 数量, "unit": 那一层的单位}。
- 最后一层写**单件**的重量/体积/个数（如 500g、330ml、1 个）。
- **只写包装上真的印出来的层**。印的是整件总重，就不要写进链条，写进 totalNetContent。

中国商超的写法怎么读（最容易错，务必按这个来）：
- 「30枚 1.59kg」= 一盒 30 枚、**整盒一共** 1.59kg。1.59kg 不是一枚的重量！
  这时 specChain 只填 [{"count":30,"unit":"枚"}]，totalNetContent 填 1.59kg，**不要自己去除**。
- 「500g×2袋」= 2 袋、每袋 500g：specChain 填 [{"count":2,"unit":"袋"},{"count":500,"unit":"g"}]，totalNetContent 填 null。
- 「24×330ml」= 24 瓶、每瓶 330ml：specChain 填 [{"count":24,"unit":"瓶"},{"count":330,"unit":"ml"}]。
- 「10捆×50张」= 一箱 10 捆、每捆 50 张：specChain 填 [{"count":10,"unit":"捆"},{"count":50,"unit":"张"}]。
- 「净含量 5kg」= 一袋 5kg：specChain 填 [{"count":5,"unit":"kg"}]。
- 只有单价、没有任何规格：specChain 填 null。

规则：
- 件数和总重是两件事，不要混：件数写在 specChain 里，整件总重写在 totalNetContent 里。
- totalNetContent 只在包装上明确写"整件/整箱/整盒总共多少"时给；不确定就 null。
- 图上是 1.5kg 就填 {"value":1.5,"unit":"kg"}，不要自己换算成克。
- 单价必须是这件商品的单价，不是合计金额；页面有多个价格（原价/折后价/券后价）时选"这件商品的到手单价"，
  不要自己乘、也不要填整单合计。`;

@Injectable()
export class ProcurementSkuDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: ProcurementSkuDraftQuotaService,
    private readonly agentConfig: AgentProviderConfigService,
    private readonly platformOptions: PlatformOptionsService,
    @Inject(PROCUREMENT_SKU_DRAFT_MODEL)
    private readonly model: ProcurementSkuDraftModelPort,
  ) {}

  async draftFromScreenshot(input: {
    imageUrl: string;
    ingredientId: string;
    userId: string;
  }): Promise<ProcurementSkuDraft> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: input.ingredientId },
      select: { id: true, type: true, baseUnit: true },
    });

    if (!ingredient) {
      throw new BadRequestException('原料不存在');
    }

    if (ingredient.type !== 'FOOD') {
      throw new BadRequestException('只有食材可以新增采购商品');
    }

    return this.draftFromScreenshotForBaseUnit({
      imageUrl: input.imageUrl,
      baseUnit: ingredient.baseUnit,
      userId: input.userId,
    });
  }

  /**
   * 同一套识别，但只认**基准单位**（2026-11-08 AI 建档收尾）。
   *
   * AI 建档时原料和采购商品是一次提交，识别时原料还没建出来，没有 ingredientId
   * 可传；草稿里只有 ingredient.baseUnit，归一净含量的口径就是它。
   * 提示词、渠道字典、配额、降级策略与员工端**完全共用一份**——
   * 两个入口各接一套必然漂移（一个能认、一个认不出）。
   */
  async draftFromScreenshotForBaseUnit(input: {
    imageUrl: string;
    baseUnit: string;
    userId: string;
  }): Promise<ProcurementSkuDraft> {
    const baseUnit = toBaseUnitCode(input.baseUnit);
    if (!baseUnit) {
      // 归一不了就别花钱调模型：错单位的净含量会让库存差几十倍。
      throw new BadRequestException(
        `这条原料的基准单位「${input.baseUnit}」不是 G / ML / PCS，无法折算净含量`,
      );
    }

    await this.quota.consume(input.userId);

    const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: PROCUREMENT_SKU_DRAFT_PURPOSE,
    });

    // 渠道清单从字典取：员工端「在哪买的」只认这些项，AI 也必须从这里面选。
    const channels = await this.loadChannelOptions();

    const raw = await this.model.callDeepSeekJson({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      apiKey: runtime.apiKey,
      requestTimeoutMs: runtime.requestTimeoutMs,
      systemPrompt: this.buildSystemPrompt(channels),
      userContent: [
        {
          type: 'text',
          text: '这是商品详情页截图，请按约定输出 JSON。',
        },
        { type: 'image_url', image_url: { url: input.imageUrl } },
      ],
      temperature: 0,
      extraBody: NO_THINKING,
    });

    return this.toDraft(raw, baseUnit, channels);
  }

  private async loadChannelOptions(): Promise<ChannelOption[]> {
    const items = await this.platformOptions.listSet(PURCHASE_CHANNEL_SET);
    return items.map((item) => {
      const extra =
        item.extra && typeof item.extra === 'object'
          ? (item.extra as Record<string, unknown>)
          : null;
      const aliases =
        extra && Array.isArray(extra.aliases)
          ? extra.aliases.filter((alias): alias is string => typeof alias === 'string')
          : [];
      return { code: item.code, label: item.label, aliases };
    });
  }

  private buildSystemPrompt(channels: ChannelOption[]): string {
    const list = channels.map((item) => item.code).join('、');
    return `${SYSTEM_PROMPT}

渠道清单（purchaseChannel 只能填这里的原文，或者 null）：
${list}`;
  }

  /** 把模型原始输出收口成草稿：能归一化的归一化，归一不了的一律 null + missing */
  private toDraft(
    raw: Record<string, unknown>,
    baseUnit: BaseUnitCode,
    channels: ChannelOption[],
  ): ProcurementSkuDraft {
    const productList = (raw as { productList?: unknown }).productList;

    if (Array.isArray(productList) && productList.length > 0) {
      throw new ProcurementSkuDraftNoticeException(
        '这张图看起来是订单列表，不是商品详情页。请截单个商品的详情页（要有标题、净含量和单价），或者直接手动填写。',
      );
    }

    const name = toStringOrNull(raw.name);
    // 模型可能写「山姆」这种简称；归一到字典项，认不出来就当没读到，
    // 员工端只显示标准渠道，不能存一个清单外的写法。
    const purchaseChannel = canonicalChannelCode(
      toStringOrNull(raw.purchaseChannel),
      channels,
    );
    const purchaseUnit = toStringOrNull(raw.purchaseUnit);

    const missing: string[] = [];

    if (!name) missing.push('name');
    if (!purchaseChannel) missing.push('purchaseChannel');
    if (!purchaseUnit) missing.push('purchaseUnit');

    // 规格链是主路径：件数、单件重量、整件总重都由它一次算清
    // （30枚 1.59kg → 30 × 53 克，折算来源标成 derived 让页面提示核对）。
    const chain = resolveSpecChain({
      links: raw.specChain,
      totalNetContent: raw.totalNetContent as
        | { value: unknown; unit: unknown }
        | null
        | undefined,
      baseUnit,
    });

    let packCount: number | null = null;
    let netContentPerPack: number | null = null;
    let netContentUnitText: string | null = null;
    let specChain: SpecLink[] | null = null;
    let netContentSource: SpecChainSource | null = null;
    let totalNetContentInBase: number | null = null;
    let amountUnitText: string | null = null;

    if (chain.ok) {
      packCount = chain.value.packCount;
      netContentPerPack = chain.value.perUnitAmount;
      netContentUnitText = BASE_UNIT_LABEL[baseUnit];
      specChain = chain.value.links;
      netContentSource = chain.value.source;
      totalNetContentInBase = chain.value.totalInBaseUnit;
      amountUnitText = chain.value.amountUnitText;
    } else {
      // 兼容旧口径（或模型仍按老格式作答）：件数 + 单件净含量两个平铺字段
      packCount = toPositiveIntegerOrNull(raw.packCount);
      netContentUnitText = toStringOrNull(
        (raw.netContent as { unit?: unknown } | undefined)?.unit,
      );
      const normalized = normalizeNetContentToBaseUnit(
        {
          value: toNumberOrNull(
            (raw.netContent as { value?: unknown } | undefined)?.value,
          ),
          unit: netContentUnitText,
        },
        baseUnit,
      );
      netContentPerPack = normalized.ok ? normalized.inBaseUnit : null;
      netContentSource = netContentPerPack === null ? null : 'printed';
      amountUnitText = netContentUnitText;
      // 重量没读出来，件数层该留还得留：表单要显示"30 枚 × ? 克"，
      // 只留一个空重量，员工才补得上（2026-11-09）。重量读出来了就
      // 走"件数 + 单件净含量"的老口径，不再拼半条链。
      if (netContentPerPack === null) {
        const partial = parseSpecLinks(raw.specChain);
        specChain = partial.length > 0 ? partial : null;
      }
      totalNetContentInBase =
        packCount !== null && netContentPerPack !== null
          ? packCount * netContentPerPack
          : null;
    }

    if (packCount === null) missing.push('packCount');
    if (netContentPerPack === null) missing.push('netContentPerPack');

    const specText = toStringOrNull(raw.specText);

    return {
      name,
      brand: toStringOrNull(raw.brand),
      // 规格原文优先：订单截图那边也按同一段文字认规格，
      // 存成 30×53克 反而对不上 1.59kg(30枚) 那种写法（2026-11-09）。
      productModel: toStringOrNull(raw.productModel) ?? specText,
      purchaseChannel,
      purchaseUnit,
      packCount,
      netContentPerPack,
      netContentUnitText,
      specChain,
      specText,
      netContentSource,
      totalNetContentInBase,
      amountUnitText,
      unitPrice: toNumberOrNull(raw.unitPrice),
      missing,
      confidence: normalizeConfidence(raw.confidence),
    };
  }
}

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toPositiveIntegerOrNull = (value: unknown): number | null => {
  const parsed = toNumberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeConfidence = (
  value: unknown,
): Record<string, DraftConfidence> => {
  const result: Record<string, DraftConfidence> = {};
  if (!value || typeof value !== 'object') return result;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    result[key] = raw === 'low' ? 'low' : 'high';
  }

  return result;
};

/** 基准单位只认这三个（与 `BaseUnitCode` 一致）；其它一律判无法折算。 */
const toBaseUnitCode = (value: string): BaseUnitCode | null =>
  value === 'G' || value === 'ML' || value === 'PCS' ? value : null;
