import { Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSE } from './ingredient-creation-intake.service';
import { extractJsonObject } from '../../domain/ingredient/json-response';
import {
  cleanSurface,
  verifyAgainstPages,
  type ReadPage,
} from '../../domain/ingredient/supplement-kb-form';
import {
  gateVerdict,
  normalizeTermKey,
  type CandidateVerdict,
  type DimensionKey,
  type KbCandidate,
} from '../../domain/ingredient/supplement-form-candidates';
import { SupplementFormTermService } from './supplement-form-term.service';

/**
 * 从知识库原文里抽「这一页提到的形态/来源词」，并带上文中的判断。
 *
 * 与旧做法的区别：旧的是让模型按固定四档打分；这里是**从原文里抽名字**——
 * 原文没提过的形态，根本不会出现，也就谈不上"预测"。
 *
 * 一条硬规矩：surface 与 quote 都必须逐字出现在该页原文里，否则丢。
 */
const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 1800;
const PAGE_TEXT_LIMIT = 2200;

const SYSTEM_PROMPT = `你在读补剂营养素的文献原文片段。请抽出文中提到的「形态 / 来源」词，并给出文中对它的判断。

只抽两类：
- FORM：化学形态或产品形态（oxide、sulfate、carbonate、bisglycinate、proteinate、methylcobalamin、rTG、triglyceride 等）
- SOURCE：来源与原料（fish oil、krill、algae、fermented、synthetic 等）

不要抽：营养素本身（iron、copper）、品牌、剂量、剂型（tablet/softgel）。

只输出 JSON，不要解释：
{"terms":[{"surface":"oxides of iron","labelZh":"氧化铁","dimension":"FORM","documentId":"...","page":10,"quote":"原文逐字","verdict":"AVOID","reason":"一句话"}]}

硬要求：
1. surface 必须**逐字出现在该页片段里**（可以是一个短语）；
2. quote 必须是片段里的**原句**，逐字照抄，不要改写、不要拼接、不要翻译；
3. documentId 与 page 必须来自片段抬头标注，不许自己编；
4. verdict 只能是 RECOMMENDED / ACCEPTABLE / AVOID / NO_EVIDENCE，且必须严格按文中的措辞：
   - AVOID：文中**明确否定**它作为该营养素的来源（如 "should not be used"、"negligible bioavailability"）；
   - ACCEPTABLE：文中把它当作可用的来源/形态描述；
   - RECOMMENDED：文中**明确表示它优于别的形态**；
   - NO_EVIDENCE：其余情况，包括"不稳定""数据有限""吸收一般"这类**注意点**——
     注意点不是否决，写进 reason 里，不要把 verdict 判成 AVOID；
5. 一个都没有就输出 {"terms":[]}。`;

interface RawTermRecord {
  surface: string;
  labelZh: string;
  dimension: DimensionKey;
  documentId: string;
  page: number;
  quote: string;
  verdict: CandidateVerdict;
  reason: string;
}

export interface KbExtractInput {
  nutrientKey: string;
  nutrientEnglish: string;
  pages: ReadPage[];
  /** 用户补充的一句话；有就一起给模型看 */
  question?: string;
  /** documentId → 书名；出处用得上 */
  titles?: Map<string, string>;
}

@Injectable()
export class SupplementKbFormService {
  private readonly logger = new Logger(SupplementKbFormService.name);

  constructor(
    private readonly providerConfig: AgentProviderConfigService,
    private readonly terms: SupplementFormTermService,
  ) {}

  async extract(input: KbExtractInput): Promise<KbCandidate[]> {
    if (input.pages.length === 0) {
      return [];
    }
    const raw = await this.requestModel(await this.loadRuntime(), input);
    const records = this.parse(raw);
    const verified = records.filter((record) =>
      verifyAgainstPages(
        {
          surface: record.surface,
          quote: record.quote,
          documentId: record.documentId,
          page: record.page,
        },
        input.pages,
      ),
    );

    const dropped = records.length - verified.length;
    if (dropped > 0) {
      this.logger.warn(
        `[kb-form] nutrient=${input.nutrientKey} 丢弃 ${dropped} 条（词或原句对不上原文）`,
      );
    }

    const merged = new Map<string, KbCandidate>();
    for (const record of verified) {
      const resolved = await this.terms.resolve(record.dimension, record.surface, {
        nutrientKey: input.nutrientKey,
        labelZh: record.labelZh,
        source: 'KB',
      });
      const key = resolved.key || normalizeTermKey(record.surface);
      const gated = gateVerdict(record.verdict, record.quote);
      const citation = {
        documentId: record.documentId,
        documentName: input.titles?.get(record.documentId) ?? record.documentId,
        page: record.page,
        quote: record.quote,
      };
      const existing = merged.get(key);
      if (existing) {
        if (!existing.citations.some((item) => item.quote === citation.quote)) {
          existing.citations.push(citation);
        }
        // 两份原文互相打架（一个说可用、一个说不推荐）：不挑一个当定论，降级交给人
        if (
          existing.verdict !== 'NO_EVIDENCE' &&
          gated.verdict !== 'NO_EVIDENCE' &&
          existing.verdict !== gated.verdict
        ) {
          existing.verdict = 'NO_EVIDENCE';
          existing.reason = `原文之间存在不同说法：${existing.reason}／${record.reason}`;
          continue;
        }
        // 有表态的结论优先于"没查到"
        if (existing.verdict === 'NO_EVIDENCE' && gated.verdict !== 'NO_EVIDENCE') {
          existing.verdict = gated.verdict;
          existing.reason = record.reason;
        }
        continue;
      }
      merged.set(key, {
        key,
        // 词典里有人确认过的中文名优先，其次模型这次给的，最后退回英文原词
        labelZh: resolved.labelZh || record.labelZh || cleanSurface(record.surface),
        dimension: record.dimension,
        citations: [citation],
        verdict: gated.verdict,
        reason: gated.downgraded
          ? `${record.reason}（原文只是提醒，没有明确否定/比较，按无结论处理）`
          : record.reason,
      });
    }

    return [...merged.values()];
  }

  private parse(raw: string): RawTermRecord[] {
    let data: unknown;
    try {
      data = JSON.parse(extractJsonObject(raw));
    } catch {
      this.logger.warn('[kb-form] 模型没给出可用 JSON');
      return [];
    }
    const list = (data as { terms?: unknown }).terms;
    if (!Array.isArray(list)) {
      return [];
    }

    const result: RawTermRecord[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const surface = cleanSurface(String(record.surface ?? ''));
      const quote = String(record.quote ?? '').trim();
      const documentId = String(record.documentId ?? '').trim();
      const page = Number(record.page ?? 0);
      if (!surface || !quote || !documentId || !Number.isFinite(page) || page <= 0) {
        continue;
      }
      result.push({
        surface,
        labelZh: String(record.labelZh ?? '').trim(),
        dimension: String(record.dimension ?? '').toUpperCase() === 'SOURCE' ? 'SOURCE' : 'FORM',
        documentId,
        page,
        quote,
        verdict: normalizeVerdict(record.verdict),
        reason: String(record.reason ?? '').trim() || '原文提到但没给判断',
      });
    }
    return result;
  }

  private async requestModel(
    runtime: DeepSeekRuntimeConfig,
    input: KbExtractInput,
  ): Promise<string> {
    const fragments = input.pages
      .map(
        (page, index) =>
          `### 片段 ${index + 1}｜documentId=${page.documentId}｜page=${page.page}\n${page.text.slice(0, PAGE_TEXT_LIMIT)}`,
      )
      .join('\n\n');

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
                '以下是原文片段：',
                fragments,
              ]
                .filter(Boolean)
                .join('\n\n'),
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

function normalizeVerdict(value: unknown): CandidateVerdict {
  const text = String(value ?? '').toUpperCase();
  if (text === 'RECOMMENDED' || text === 'ACCEPTABLE' || text === 'AVOID') {
    return text;
  }
  return 'NO_EVIDENCE';
}
