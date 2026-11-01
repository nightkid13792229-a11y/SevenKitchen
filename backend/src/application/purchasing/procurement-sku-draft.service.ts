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
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ProcurementSkuDraftQuotaService } from './procurement-sku-draft-quota.service';
import {
  normalizeNetContentToBaseUnit,
  type BaseUnitCode,
} from './procurement-sku-net-content';

/** 「AI / Agent 配置」里这一项的用途标识；未单独配置时回退全局默认 */
export const PROCUREMENT_SKU_DRAFT_PURPOSE = 'PROCUREMENT_SKU_DRAFT';

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
  unitPrice: number | null;
  missing: string[];
  confidence: Record<string, DraftConfidence>;
}

const NO_THINKING = { thinking: { type: 'disabled' } };

const SYSTEM_PROMPT = `你是采购助理。用户会给你一张中国商超 App（山姆/沃尔玛/盒马等）的**商品详情页截图**，
你要读出这件商品的信息，输出 JSON。

只认商品详情页：一屏一个商品，图上有商品标题、净含量（如 1kg / 500g / 24×330ml）、单价（如 ¥14.99/袋）。
如果截图其实是**订单列表**（一屏多个商品、每个只有一行），返回 {"productList": [...]}，不要硬猜其中一个。

输出字段（读不到的必须给 null，绝不编造）：
{
  "name": "商品标题原文",
  "brand": "品牌，没有就是 null",
  "purchaseUnit": "按件卖的单位，如 袋/箱/瓶/包",
  "packCount": 一箱里有几件（单件商品给 1；图上没写就 null）,
  "netContent": { "value": 单件净含量的数字, "unit": "单位原文，如 kg/g/ml/L/个" },
  "purchaseChannel": "从品牌或 App 界面推断的商超名，拿不准就给 null",
  "unitPrice": 单价数字（元）,
  "confidence": { "name": "high|low", "purchaseChannel": "high|low", "netContent": "high|low" }
}

规则：
- netContent 填**单件**的净含量；如果图上是"24×330ml"，packCount=24、netContent 填 330ml。
- 图上是"1.5kg"就填 {"value":1.5,"unit":"kg"}，不要自己换算成克。
- 净含量只印在包装图上、正文没有时，也要读出来；实在看不清就 null。
- 单价必须是这件商品的单价，不是合计金额。`;

@Injectable()
export class ProcurementSkuDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: ProcurementSkuDraftQuotaService,
    private readonly agentConfig: AgentProviderConfigService,
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

    const baseUnit = ingredient.baseUnit as BaseUnitCode;

    await this.quota.consume(input.userId);

    const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: PROCUREMENT_SKU_DRAFT_PURPOSE,
    });

    const raw = await this.model.callDeepSeekJson({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      apiKey: runtime.apiKey,
      requestTimeoutMs: runtime.requestTimeoutMs,
      systemPrompt: SYSTEM_PROMPT,
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

    return this.toDraft(raw, baseUnit);
  }

  /** 把模型原始输出收口成草稿：能归一化的归一化，归一不了的一律 null + missing */
  private toDraft(
    raw: Record<string, unknown>,
    baseUnit: BaseUnitCode,
  ): ProcurementSkuDraft {
    const productList = (raw as { productList?: unknown }).productList;

    if (Array.isArray(productList) && productList.length > 0) {
      throw new BadRequestException(
        '这张图看起来是订单列表，不是商品详情页。请截单个商品的详情页（要有标题、净含量和单价），或者直接手动填写。',
      );
    }

    const name = toStringOrNull(raw.name);
    const purchaseChannel = toStringOrNull(raw.purchaseChannel);
    const purchaseUnit = toStringOrNull(raw.purchaseUnit);
    const netContentUnitText = toStringOrNull(
      (raw.netContent as { unit?: unknown } | undefined)?.unit,
    );

    const missing: string[] = [];

    if (!name) missing.push('name');
    if (!purchaseChannel) missing.push('purchaseChannel');
    if (!purchaseUnit) missing.push('purchaseUnit');

    const packCount = toPositiveIntegerOrNull(raw.packCount);
    if (packCount === null) missing.push('packCount');

    const normalizedNetContent = normalizeNetContentToBaseUnit(
      {
        value: toNumberOrNull(
          (raw.netContent as { value?: unknown } | undefined)?.value,
        ),
        unit: netContentUnitText,
      },
      baseUnit,
    );

    const netContentPerPack = normalizedNetContent.ok
      ? normalizedNetContent.inBaseUnit
      : null;

    if (netContentPerPack === null) missing.push('netContentPerPack');

    return {
      name,
      brand: toStringOrNull(raw.brand),
      productModel: toStringOrNull(raw.productModel),
      purchaseChannel,
      purchaseUnit,
      packCount,
      netContentPerPack,
      netContentUnitText,
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
