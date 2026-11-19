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
  normalizeTermKey,
  type DimensionKey,
  type MarketTerm,
} from '../../domain/ingredient/supplement-form-candidates';

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
}

@Injectable()
export class SupplementMarketFormService {
  private readonly logger = new Logger(SupplementMarketFormService.name);
  private readonly cache = new Map<string, { at: number; terms: MarketTerm[] }>();

  constructor(
    private readonly preview: SupplementLinkPreviewService,
    private readonly providerConfig: AgentProviderConfigService,
  ) {}

  async extract(input: MarketExtractInput): Promise<MarketTerm[]> {
    const cached = this.cache.get(input.nutrientKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.terms;
    }

    const candidates = await this.preview.searchCandidates(
      input.nutrientEnglish,
      SEARCH_LIMIT,
      'cn.iherb.com',
    );
    const titles = candidates.map((item) => item.name).filter(Boolean);
    if (titles.length === 0) {
      this.cache.set(input.nutrientKey, { at: Date.now(), terms: [] });
      return [];
    }

    const raw = await this.requestModel(await this.loadRuntime(), input, titles);
    const terms = this.toMarketTerms(raw, titles, input.nutrientKey);

    this.cache.set(input.nutrientKey, { at: Date.now(), terms });
    this.logger.log(
      `[market-form] nutrient=${input.nutrientKey} titles=${titles.length} terms=${terms.length}`,
    );
    return terms;
  }

  /** 模型只给词；这里负责"逐字出现在标题里"与"确实是这个营养素的"两道过滤。 */
  private toMarketTerms(raw: string, titles: string[], nutrientKey: string): MarketTerm[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(raw));
    } catch {
      this.logger.warn('[market-form] 模型没给出可用 JSON，本次按无候选处理');
      return [];
    }

    const list = (parsed as { terms?: unknown }).terms;
    if (!Array.isArray(list)) {
      return [];
    }

    const rows: { surface: string; title: string; nutrientKey: string }[] = [];
    const dimensionOf = new Map<string, DimensionKey>();
    const labelOf = new Map<string, string>();

    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const surface = typeof record.surface === 'string' ? record.surface.trim() : '';
      if (!surface) {
        continue;
      }
      const key = normalizeTermKey(surface);
      if (!key || dimensionOf.has(key)) {
        continue;
      }
      // 逐字出现在某条标题里才算数
      const hit = titles.find((title) => normalizeTermKey(title).includes(key));
      if (!hit) {
        continue;
      }
      const dimension: DimensionKey =
        String(record.dimension ?? '').toUpperCase() === 'SOURCE' ? 'SOURCE' : 'FORM';
      dimensionOf.set(key, dimension);
      labelOf.set(key, typeof record.labelZh === 'string' ? record.labelZh.trim() : '');
      rows.push({ surface, title: hit, nutrientKey });
    }

    return filterTermsByNutrient(rows).map((term) => ({
      key: term.key,
      labelZh: labelOf.get(term.key) ?? '',
      dimension: dimensionOf.get(term.key) ?? 'FORM',
      count: term.count,
      samples: term.samples,
    }));
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
                '商品标题：',
                ...titles.map((title, index) => `${index + 1}. ${title}`),
              ].join('\n'),
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
