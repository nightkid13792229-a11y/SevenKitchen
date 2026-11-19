import { Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSE } from './ingredient-creation-intake.service';
import { KnowledgeGatewayService } from '../knowledge-v3/knowledge-gateway.service';
import { executeKnowledgeTool } from '../knowledge-v3/knowledge-v3.tools';
import type {
  KbCatalogResult,
  KbFindHit,
  KbFindResult,
  KbReadResult,
} from '../knowledge-v3/knowledge-v3.types';
import {
  enforceCitationRule,
  pageKey,
  type FormAdvice,
  type FormLevel,
} from '../../domain/ingredient/supplement-form-advice';
import {
  nutrientChineseLabel,
  nutrientEnglishName,
} from '../../domain/ingredient/supplement-nutrients';

/**
 * 形态建议：查原文 → 让模型按原文下结论 → 把没有原文支撑的结论按下去。
 *
 * 这是**固定管线**，不是自由 Agent：查什么、读几页、按什么结构输出，都由这里定。
 * 模型只做一件它擅长的事——读英文原文，判断哪一档对狗更合适。
 *
 * 一条硬规矩：**没有原文就没有结论**。校验在 domain 的 `enforceCitationRule` 里，
 * 这里只负责把它接上。
 */
const MAX_FIND_QUERIES = 3;
const MAX_READS = 4;
const PAGE_TEXT_LIMIT = 2200;
const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 1800;

const FORM_LEVELS: FormLevel[] = ['ORGANIC_CHELATE', 'INORGANIC_SALT', 'OXIDE', 'OTHER'];

const SYSTEM_PROMPT = `你是宠物营养知识库的检索员，任务是判断「给狗补某种营养素时，该用哪一档化学形态」。

## 输出
只输出一个 JSON 对象，不要 markdown 代码块、不要解释文字：
{
  "nutrientKey": "原样返回",
  "nutrientLabel": "原样返回",
  "options": [
    {
      "level": "ORGANIC_CHELATE | INORGANIC_SALT | OXIDE | OTHER",
      "labelZh": "这一档的中文说法",
      "examples": ["常见盐名，可空"],
      "verdict": "RECOMMENDED | ACCEPTABLE | AVOID | NO_EVIDENCE",
      "reason": "一句话，不写数字结论",
      "citations": [{ "documentId": "...", "documentName": "...", "page": 123, "quote": "原文逐字" }]
    }
  ],
  "recommendedLevel": "四档之一，或 null",
  "recommendationReason": "一句话",
  "gaps": ["知识库没覆盖到的部分，逐条写"]
}

## 硬规矩
1. **只到档位，不到具体盐名**：不要说"推荐甘氨酸铜"这种点名具体盐的话；具体盐名只能放在 examples 里当例子。
2. 任何 verdict 不是 NO_EVIDENCE 的条目，**必须至少有一条 citations**；quote 必须从给你的片段里**逐字照抄**，不许改写、拼接、翻译。
3. 片段里没有依据的档位，verdict 写 NO_EVIDENCE，reason 写"知识库没查到直接依据"，并把缺什么写进 gaps。
4. 只能引用给你的片段里的 documentId 与 page；不要引用没给你的文档。
5. 原文之间互相矛盾时，如实把两种说法都写出来，不要挑一个当定论。
6. recommendedLevel 必须是 options 里判为可用（RECOMMENDED 或 ACCEPTABLE）的那一档；判不出来就给 null。
7. 不要给剂量、不要给疗程——那超出范围。`;

export interface AdviseInput {
  nutrientKey: string;
  nutrientLabel?: string;
  question?: string;
}

@Injectable()
export class SupplementFormAdviceService {
  private readonly logger = new Logger(SupplementFormAdviceService.name);

  constructor(
    private readonly providerConfig: AgentProviderConfigService,
    private readonly knowledge: KnowledgeGatewayService,
  ) {}

  async advise(input: AdviseInput): Promise<FormAdvice> {
    const nutrientKey = input.nutrientKey.trim();
    const nutrientLabel = input.nutrientLabel?.trim() || nutrientChineseLabel(nutrientKey);
    const english = nutrientEnglishName(nutrientKey);

    const catalog = await executeKnowledgeTool(this.knowledge, 'kb_catalog', {});
    const titles = new Map<string, string>();
    if (catalog.ok) {
      for (const source of (catalog.data as KbCatalogResult).sources) {
        titles.set(source.id, source.title);
      }
    }

    const hits = await this.findPages(english);
    if (hits.length === 0) {
      this.logger.warn(`[form-advice] 知识库没有命中 nutrient=${nutrientKey}`);
      return {
        nutrientKey,
        nutrientLabel,
        options: [],
        recommendedLevel: null,
        recommendationReason: '知识库里没有检索到相关页，这一项得靠人判断',
        gaps: [`知识库没有检索到「${english}」相关的页`],
      };
    }

    const excerpts = await this.readPages(hits);
    if (excerpts.length === 0) {
      return {
        nutrientKey,
        nutrientLabel,
        options: [],
        recommendedLevel: null,
        recommendationReason: '检索到了页，但正文没读出来',
        gaps: [`「${english}」命中的页没有可读正文，换一种说法再试`],
      };
    }

    const runtime = await this.loadRuntime();
    const raw = await this.requestModel(runtime, {
      nutrientKey,
      nutrientLabel,
      english,
      question: input.question?.trim() ?? '',
      excerpts,
    });

    const parsed = parseAdvice(raw, nutrientKey, nutrientLabel);
    const readPages = new Set(excerpts.map((item) => pageKey(item.documentId, item.page)));
    const checked = enforceCitationRule(parsed, readPages, titles);

    this.logger.log(
      `[form-advice] nutrient=${nutrientKey} pages=${excerpts.length} ` +
        `options=${checked.options.length} recommended=${checked.recommendedLevel ?? 'none'}`,
    );

    return checked;
  }

  /** 三条查询：吸收、氧化物、螯合。哪条空都不影响另外两条。 */
  private async findPages(english: string): Promise<KbFindHit[]> {
    const queries = [
      `${english} absorption`,
      `${english} oxide source`,
      `chelated ${english} source`,
    ].slice(0, MAX_FIND_QUERIES);

    const seen = new Set<string>();
    const hits: KbFindHit[] = [];

    for (const query of queries) {
      const outcome = await executeKnowledgeTool(this.knowledge, 'kb_find', {
        query,
        limit: 6,
      });
      if (!outcome.ok) {
        continue;
      }
      for (const hit of (outcome.data as KbFindResult).hits) {
        const key = pageKey(hit.documentId, hit.pageNo);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        hits.push(hit);
      }
    }

    return hits.slice(0, MAX_READS);
  }

  /** 逐页读原文。读不出来就跳过——不要用 snippet 当原文引用。 */
  private async readPages(
    hits: KbFindHit[],
  ): Promise<{ documentId: string; documentName: string; page: number; text: string }[]> {
    const excerpts: { documentId: string; documentName: string; page: number; text: string }[] =
      [];

    for (const hit of hits.slice(0, MAX_READS)) {
      const outcome = await executeKnowledgeTool(this.knowledge, 'kb_read', {
        documentId: hit.documentId,
        pageFrom: hit.pageNo,
        pageTo: hit.pageNo,
        includeImages: false,
        budgetTokens: 4000,
      });
      if (!outcome.ok) {
        continue;
      }
      const page = (outcome.data as KbReadResult).pages[0];
      const text = (page?.text ?? '').trim();
      if (!text) {
        continue;
      }
      excerpts.push({
        documentId: hit.documentId,
        documentName: hit.documentId,
        page: hit.pageNo,
        text: text.slice(0, PAGE_TEXT_LIMIT),
      });
    }

    return excerpts;
  }

  private async requestModel(
    runtime: DeepSeekRuntimeConfig,
    input: {
      nutrientKey: string;
      nutrientLabel: string;
      english: string;
      question: string;
      excerpts: { documentId: string; page: number; text: string }[];
    },
  ): Promise<string> {
    const fragments = input.excerpts
      .map(
        (item, index) =>
          `### 片段 ${index + 1}｜documentId=${item.documentId}｜page=${item.page}\n${item.text}`,
      )
      .join('\n\n');

    const user = [
      `营养素：${input.nutrientLabel}（${input.english}）`,
      input.question ? `补充背景：${input.question}` : '',
      '以下是知识库原文片段，只能引用这些：',
      fragments,
    ]
      .filter(Boolean)
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
            { role: 'user', content: user },
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
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('模型没有返回内容');
      }
      return content;
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

/** 模型偶尔会套 ```json 围栏或写两句前言：只取最外层那一对花括号。 */
export function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('模型没给出 JSON');
  }
  return text.slice(start, end + 1);
}

export function parseAdvice(
  raw: string,
  nutrientKey: string,
  nutrientLabel: string,
): FormAdvice {
  let data: unknown;
  try {
    data = JSON.parse(extractJsonObject(raw));
  } catch (error) {
    throw new Error(`形态建议的结构读不懂：${(error as Error).message}`);
  }

  const source = data as Record<string, unknown>;
  const rawOptions = source.options;
  if (!Array.isArray(rawOptions)) {
    throw new Error('形态建议缺少 options');
  }

  const options = rawOptions
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const level = String(item.level ?? 'OTHER') as FormLevel;
      return {
        level: FORM_LEVELS.includes(level) ? level : ('OTHER' as FormLevel),
        labelZh: String(item.labelZh ?? '').trim() || '未命名档位',
        examples: Array.isArray(item.examples)
          ? item.examples.map((example) => String(example)).slice(0, 6)
          : [],
        verdict: normalizeVerdict(item.verdict),
        reason: String(item.reason ?? '').trim(),
        citations: Array.isArray(item.citations)
          ? item.citations
              .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
              .map((c) => ({
                documentId: String(c.documentId ?? ''),
                documentName: String(c.documentName ?? ''),
                page: Number(c.page ?? 0),
                quote: String(c.quote ?? ''),
              }))
              .filter((c) => c.documentId && Number.isFinite(c.page) && c.page > 0)
          : [],
      };
    });

  const recommendedRaw = source.recommendedLevel;
  const recommendedLevel =
    typeof recommendedRaw === 'string' && FORM_LEVELS.includes(recommendedRaw as FormLevel)
      ? (recommendedRaw as FormLevel)
      : null;

  return {
    nutrientKey,
    nutrientLabel,
    options,
    recommendedLevel,
    recommendationReason: String(source.recommendationReason ?? '').trim(),
    gaps: Array.isArray(source.gaps) ? source.gaps.map((gap) => String(gap)) : [],
  };
}

function normalizeVerdict(value: unknown): FormAdvice['options'][number]['verdict'] {
  const text = String(value ?? '').toUpperCase();
  if (text === 'RECOMMENDED' || text === 'ACCEPTABLE' || text === 'AVOID') {
    return text;
  }
  return 'NO_EVIDENCE';
}
