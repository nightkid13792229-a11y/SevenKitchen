import { Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSE } from './ingredient-creation-intake.service';
import { SupplementLinkPreviewService } from './supplement-link-preview.service';
import { extractJsonObject } from '../../domain/ingredient/json-response';
import {
  filterTermsByNutrient,
  mentionsNutrient,
  normalizeTermKey,
  type DimensionKey,
  type MarketTerm,
} from '../../domain/ingredient/supplement-form-candidates';
import { SupplementFormTermService } from './supplement-form-term.service';

/**
 * 市场形态抽取：从 iHerb 商品标题里读出「这瓶到底是哪种形态」。
 *
 * 为什么从标题抽：商品标题里就写着 `Copper Bisglycinate` / `Methylcobalamin` /
 * `rTG Omega-3`，比让模型凭知识编要可靠，而且天然反映"现在真的买得到什么"。
 *
 * 两条防线：
 * 1. 模型只说词，**判定"这个词是不是这个营养素的"由代码做**（标题必须提到该营养素）；
 * 2. surface 必须逐字出现在标题里，模型没见过的词一律丢。
 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** 复方判据要用到的"别的营养素"清单；只做粗判，不求全 */
const SEARCH_LIMIT = 20;
const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 1200;

const SYSTEM_PROMPT = `你是补剂商品标题的信息抽取器。下面是 iHerb 上某一种营养素的商品标题。

只抽两类词：
- "FORM"：化学形态或产品形态（例如 bisglycinate、oxide、sulfate、glycinate、methylcobalamin、cyanocobalamin、rTG、triglyceride、citrate、picolinate）
- "SOURCE"：来源与原料（例如 fish oil、krill oil、algae、fermented、synthetic、plant-based）

不要抽：品牌名、规格（120 Capsules）、剂量（1000 mcg）、剂型（softgel/tablet）、营销词（Premium、Extra Strength）。

只输出 JSON，不要解释：
{"terms":[{"surface":"bisglycinate","labelZh":"双甘氨酸盐","dimension":"FORM"}]}

要求：
1. surface 必须**逐字出现在标题里**（英文原样，不要改写、不要翻译）；
2. labelZh 给中文说法，没有通用中文就留空串；
3. 同一个词只出现一次；
4. 一个都没抽到就输出 {"terms":[]}。`;

export interface MarketExtractInput {
  nutrientKey: string;
  nutrientEnglish: string;
  question?: string;
}

export interface MarketExtractResult {
  terms: MarketTerm[];
  /** 标题里普遍出现两种以上营养素 → 这是复方商品，不按形态判断 */
  compound: boolean;
}

@Injectable()
export class SupplementMarketFormService {
  private readonly logger = new Logger(SupplementMarketFormService.name);
  private readonly cache = new Map<string, { at: number; value: MarketExtractResult }>();

  constructor(
    private readonly preview: SupplementLinkPreviewService,
    private readonly providerConfig: AgentProviderConfigService,
    private readonly terms: SupplementFormTermService,
  ) {}

  async extract(input: MarketExtractInput): Promise<MarketExtractResult> {
    const cached = this.cache.get(input.nutrientKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value;
    }

    const candidates = await this.preview.searchCandidates(
      input.nutrientEnglish,
      SEARCH_LIMIT,
      'cn.iherb.com',
    );
    const titles = candidates.map((item) => item.name).filter(Boolean);
    if (titles.length === 0) {
      const empty: MarketExtractResult = { terms: [], compound: false };
      this.cache.set(input.nutrientKey, { at: Date.now(), value: empty });
      return empty;
    }

    const raw = await this.requestModel(await this.loadRuntime(), input, titles);
    const terms = await this.toMarketTerms(raw, titles, input.nutrientKey);

    // 解析失败不写缓存：否则接下来半小时这个人怎么点都是"市场没搜到"
    if (terms === null) {
      this.logger.warn(`[market-form] nutrient=${input.nutrientKey} 解析失败，本次不缓存`);
      return { terms: [], compound: false };
    }

    // 复方不在这一层判（见 pipeline 里的说明）；这里恒为 false，字段保留给调用方
    const value: MarketExtractResult = { terms, compound: false };
    this.cache.set(input.nutrientKey, { at: Date.now(), value });
    this.logger.log(
      `[market-form] nutrient=${input.nutrientKey} titles=${titles.length} terms=${terms.length}`,
    );
    return value;
  }

  /**
   * 模型只给词；这里负责三道过滤：逐字出现在标题里、标题确实在说这个营养素、同一个词不重复。
   *
   * 返回 null 表示"模型输出读不懂"（与"确实没抽到"区分开，前者不写缓存）。
   */
  private async toMarketTerms(
    raw: string,
    titles: string[],
    nutrientKey: string,
  ): Promise<MarketTerm[] | null> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch {
      return null;
    }

    const list = (parsed as { terms?: unknown }).terms;
    if (!Array.isArray(list)) {
      return null;
    }

    const rows: { surface: string; title: string; nutrientKey: string }[] = [];
    const meta = new Map<string, { dimension: DimensionKey; labelZh: string; surface: string }>();

    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const surface = typeof record.surface === 'string' ? record.surface.trim() : '';
      const key = normalizeTermKey(surface);
      if (!key || meta.has(key)) {
        continue;
      }
      // 一条标题一条记录：这样"多少商品在用这个说法"才是真的计数
      const matching = titles.filter(
        (title) =>
          normalizeTermKey(title).includes(key) && mentionsNutrient(title, nutrientKey),
      );
      if (matching.length === 0) {
        continue;
      }
      const dimension: DimensionKey =
        String(record.dimension ?? '').toUpperCase() === 'SOURCE' ? 'SOURCE' : 'FORM';
      meta.set(key, {
        dimension,
        labelZh: typeof record.labelZh === 'string' ? record.labelZh.trim() : '',
        surface,
      });
      for (const title of matching) {
        rows.push({ surface, title, nutrientKey });
      }
    }

    const filtered = filterTermsByNutrient(rows);
    const result: MarketTerm[] = [];
    for (const term of filtered) {
      const info = meta.get(term.key);
      if (!info) {
        continue;
      }
      // 市场侧也走词典：同一个东西的不同写法（甲钴胺 / 甲基钴胺素）靠它并成一条
      const resolved = await this.terms.resolve(info.dimension, info.surface, {
        nutrientKey,
        labelZh: info.labelZh,
        source: 'MARKET',
      });
      result.push({
        key: resolved.key || term.key,
        labelZh: resolved.labelZh || info.labelZh,
        dimension: info.dimension,
        count: term.count,
        samples: term.samples,
      });
    }

    // 归一化后可能出现重复键，合并计数
    const merged = new Map<string, MarketTerm>();
    for (const term of result) {
      const existing = merged.get(term.key);
      if (!existing) {
        merged.set(term.key, term);
        continue;
      }
      existing.count += term.count;
      existing.samples = [...new Set([...existing.samples, ...term.samples])].slice(0, 3);
    }

    return [...merged.values()];
  }

  private async requestModel(
    runtime: DeepSeekRuntimeConfig,
    input: MarketExtractInput,
    titles: string[],
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${runtime.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: runtime.model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                `营养素：${input.nutrientEnglish}`,
                input.question ? `用户补充：${input.question}` : '',
                '商品标题：',
                ...titles.map((title, index) => `${index + 1}. ${title}`),
              ]
                .filter(Boolean)
                .join('\n'),
            },
          ],
          temperature: 0.1,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'disabled' },
        }),
      });
      if (!response.ok) {
        throw new Error(`模型返回 ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : '';
    } finally {
      clearTimeout(timer);
    }
  }

  private async loadRuntime(): Promise<DeepSeekRuntimeConfig> {
    return this.providerConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: INGREDIENT_INTAKE_AGENT_PURPOSE,
      fallbackToDefault: false,
    });
  }
}
