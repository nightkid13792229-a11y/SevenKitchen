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
  KbFindResult,
  KbReadResult,
} from '../knowledge-v3/knowledge-v3.types';
import {
  enforceCitationRule,
  pageKey,
  type FormAdvice,
  type FormLevel,
  type RetrievalSummary,
} from '../../domain/ingredient/supplement-form-advice';
import {
  looksLikeIndexPage,
  planRetrievalPages,
  type PlannedPage,
  type RetrievalQueryHits,
} from '../../domain/ingredient/kb-retrieval-plan';
import {
  mergeCandidates,
  type DimensionCandidate,
  type DimensionKey,
} from '../../domain/ingredient/supplement-form-candidates';
import { SupplementKbFormService } from './supplement-kb-form.service';
import { SupplementMarketFormService } from './supplement-market-form.service';
import {
  nutrientChineseLabel,
  nutrientEnglishName,
} from '../../domain/ingredient/supplement-nutrients';
import { extractJsonObject } from '../../domain/ingredient/json-response';

/**
 * 形态建议：查原文 → 让模型按原文下结论 → 把没有原文支撑的结论按下去。
 *
 * 这是**固定管线**，不是自由 Agent：查什么、读几页、按什么结构输出，都由这里定。
 * 模型只做一件它擅长的事——读英文原文，判断哪一档对狗更合适。
 *
 * 一条硬规矩：**没有原文就没有结论**。校验在 domain 的 `enforceCitationRule` 里，
 * 这里只负责把它接上。
 */
const MAX_FIND_QUERIES = 4;
const MAX_READS = 4;
/** 每条查询至少占 1 页、最多 2 页；同一文档最多 2 页 */
const PER_QUERY_MAX = 2;
const PER_DOCUMENT_MAX = 2;
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
7. 不要给剂量、不要给疗程——那超出范围。
8. **治疗手段不是形态**：铜螯合剂、排铜药、用锌抑制铜吸收这类属于治疗，不要放进 options；
   如果它和用户的问题相关，写进 gaps 说明"这是治疗手段，不是补铜形态的选择依据"。`;

export { extractJsonObject };

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
    private readonly kbForms: SupplementKbFormService,
    private readonly marketForms: SupplementMarketFormService,
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

    const retrieval = await this.collectPages(english);
    // 先记检索，再调模型：模型超时/解析失败时，至少还能查到"这次读了什么"
    this.logRetrieval('legacy', nutrientKey, retrieval);

    if (retrieval.pages.length === 0) {
      return {
        nutrientKey,
        nutrientLabel,
        options: [],
        recommendedLevel: null,
        recommendationReason: '知识库里没有可用的原文，这一项得靠人判断',
        gaps: [
          retrieval.failures?.length
            ? `知识库检索失败：${retrieval.failures.map((item) => item.query).join('、')}`
            : `知识库没有检索到「${english}」相关的页`,
        ],
        retrieval,
      };
    }

    const excerpts = retrieval.excerpts;
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
      `[form-advice] nutrient=${nutrientKey} options=${checked.options.length} ` +
        `recommended=${checked.recommendedLevel ?? 'none'}`,
    );

    return { ...checked, retrieval };
  }

  /** 逐个读计划里的页；读不出正文、或整页就是目录的，记原因并继续往后读（回填）。 */
  private async readPlannedPages(
    pages: PlannedPage[],
    limit: number,
    dropped: RetrievalSummary['dropped'],
  ): Promise<{ documentId: string; documentName: string; page: number; text: string }[]> {
    const excerpts: { documentId: string; documentName: string; page: number; text: string }[] =
      [];

    for (const planned of pages) {
      if (excerpts.length >= limit) {
        dropped.push({
          documentId: planned.documentId,
          page: planned.pageNo,
          reason: 'TOTAL_LIMIT',
        });
        continue;
      }
      const outcome = await executeKnowledgeTool(this.knowledge, 'kb_read', {
        documentId: planned.documentId,
        pageFrom: planned.pageNo,
        pageTo: planned.pageNo,
        includeImages: false,
        budgetTokens: 4000,
      });
      const page = outcome.ok ? (outcome.data as KbReadResult).pages[0] : undefined;
      const text = (page?.text ?? '').trim();
      if (!text) {
        dropped.push({
          documentId: planned.documentId,
          page: planned.pageNo,
          reason: 'READ_FAILED',
        });
        continue;
      }
      // snippet 被折叠过，判目录页不可靠；拿到整页正文再判一次
      if (looksLikeIndexPage(text)) {
        dropped.push({
          documentId: planned.documentId,
          page: planned.pageNo,
          reason: 'INDEX_PAGE',
        });
        continue;
      }
      excerpts.push({
        documentId: planned.documentId,
        documentName: planned.documentId,
        page: planned.pageNo,
        text: text.slice(0, PAGE_TEXT_LIMIT),
      });
    }

    return excerpts;
  }

  /**
   * 检索 + 取页 + 读正文，一次做完。
   *
   * 多规划 2 页：读的过程中会碰到目录页/读不出正文的页，用后面的补上，
   * 保证真正进上下文的页数尽量接近 MAX_READS。
   */
  private async collectPages(
    english: string,
  ): Promise<RetrievalSummary & { excerpts: { documentId: string; documentName: string; page: number; text: string }[] }> {
    const { groups, failures } = await this.findPages(english);
    const planned = planRetrievalPages(groups, {
      totalPages: MAX_READS + 2,
      perQueryMax: PER_QUERY_MAX + 1,
      perDocumentMax: PER_DOCUMENT_MAX,
    });

    const dropped: RetrievalSummary['dropped'] = planned.dropped.map((item) => ({
      documentId: item.documentId,
      page: item.pageNo,
      reason: item.reason,
    }));

    const excerpts = await this.readPlannedPages(planned.pages, MAX_READS, dropped);

    return {
      queries: groups.map((item) => item.query),
      pages: excerpts.map((item) => ({
        documentId: item.documentId,
        page: item.page,
        score:
          planned.pages.find(
            (page) => page.documentId === item.documentId && page.pageNo === item.page,
          )?.score ?? 0,
      })),
      dropped,
      failures: failures.length > 0 ? failures : undefined,
      excerpts,
    };
  }

  /** 复盘用一行日志：查了什么、读了哪几页（带分）、丢了哪几页（带原因）。 */
  private logRetrieval(scope: string, nutrientKey: string, retrieval: RetrievalSummary): void {
    this.logger.log(
      `[form-advice:${scope}] nutrient=${nutrientKey} ` +
        `queries=[${retrieval.queries.join(' | ')}] ` +
        `pages=[${retrieval.pages.map((page) => `${page.documentId}#p${page.page}@${page.score}`).join(', ')}] ` +
        `dropped=[${retrieval.dropped.map((item) => `${item.documentId}#p${item.page}:${item.reason}`).join(', ')}]` +
        (retrieval.failures?.length
          ? ` failures=[${retrieval.failures.map((item) => item.query).join(' | ')}]`
          : ''),
    );
  }

  /**
   * 四条查询：生物利用度、形态、来源、吸收。
   *
   * 保留 `absorption` 但**不再是第一条**——它命中面太宽（胃肠药指南也讲吸收），
   * 放第一位会把名额占满。
   */
  private async findPages(
    english: string,
  ): Promise<{ groups: RetrievalQueryHits[]; failures: { query: string; error: string }[] }> {
    const queries = [
      `${english} bioavailability`,
      `${english} form`,
      `${english} source`,
      `${english} absorption`,
    ].slice(0, MAX_FIND_QUERIES);

    const groups: RetrievalQueryHits[] = [];
    const failures: { query: string; error: string }[] = [];

    for (const query of queries) {
      const outcome = await executeKnowledgeTool(this.knowledge, 'kb_find', {
        query,
        limit: 6,
      });
      if (!outcome.ok) {
        // 检索失败与"没命中"是两件事：前者要报错，后者是知识库没覆盖
        failures.push({ query, error: outcome.error.message });
        continue;
      }
      groups.push({
        query,
        hits: (outcome.data as KbFindResult).hits.map((hit) => ({
          documentId: hit.documentId,
          pageNo: hit.pageNo,
          score: hit.score,
          snippet: hit.snippet,
        })),
      });
    }

    return { groups, failures };
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

  /**
   * 维度模式：形态/来源的取值由「知识库原文 + 市场标题」长出来，不再按固定四档作答。
   *
   * 只有原文提到的才叫有依据；只有市场的标 MARKET_ONLY，永远不给推荐。
   */
  async adviseDimensions(input: AdviseInput): Promise<DimensionsAdvice> {
    const nutrientKey = input.nutrientKey.trim();
    const nutrientLabel = input.nutrientLabel?.trim() || nutrientChineseLabel(nutrientKey);
    const english = nutrientEnglishName(nutrientKey);

    const retrieval = await this.collectPages(english);
    this.logRetrieval('dimensions', nutrientKey, retrieval);

    // 两条抽取并行：一条读原文，一条读商品标题
    const [kbTerms, marketTerms] = await Promise.all([
      this.kbForms.extract({
        nutrientKey,
        nutrientEnglish: english,
        pages: retrieval.excerpts.map((item) => ({
          documentId: item.documentId,
          page: item.page,
          text: item.text,
        })),
      }),
      this.marketForms.extract({ nutrientKey, nutrientEnglish: english }),
    ]);

    const merged = mergeCandidates(kbTerms, marketTerms);
    const dimensions = groupByDimension(merged);
    const recommendation = pickRecommendation(dimensions);

    const gaps: string[] = [];
    if (kbTerms.length === 0) {
      gaps.push(`知识库里没有提到「${nutrientLabel}」的形态或来源`);
    }
    if (marketTerms.length === 0) {
      gaps.push('市场上没搜到这一类的商品标题，形态清单可能不全');
    }
    if (dimensions.length === 0) {
      gaps.push('两边都没抽到候选，这一项直接进比价');
    }
    if (!recommendation && dimensions.length > 0) {
      gaps.push('知识库里没有给出可用结论，下面都是市场常见说法，请你判断');
    }

    this.logger.log(
      `[form-advice:dimensions] nutrient=${nutrientKey} kb=${kbTerms.length} market=${marketTerms.length} ` +
        `candidates=${merged.length} recommended=${recommendation ? recommendation.candidateKey : 'none'}`,
    );

    return {
      nutrientKey,
      nutrientLabel,
      dimensions,
      recommendation,
      gaps,
      retrieval: stripExcerpts(retrieval),
    };
  }

  private async loadRuntime(): Promise<DeepSeekRuntimeConfig> {
    return this.providerConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: INGREDIENT_INTAKE_AGENT_PURPOSE,
      fallbackToDefault: false,
    });
  }
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


export interface DimensionGroup {
  key: DimensionKey;
  label: string;
  candidates: DimensionCandidate[];
}

export interface DimensionsAdvice {
  nutrientKey: string;
  nutrientLabel: string;
  dimensions: DimensionGroup[];
  recommendation: { dimensionKey: DimensionKey; candidateKey: string } | null;
  gaps: string[];
  retrieval?: RetrievalSummary;
}

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  FORM: '形态',
  SOURCE: '来源',
};

function groupByDimension(candidates: DimensionCandidate[]): DimensionGroup[] {
  const groups: DimensionGroup[] = [];
  for (const key of ['FORM', 'SOURCE'] as DimensionKey[]) {
    const items = candidates.filter((item) => item.dimension === key);
    if (items.length > 0) {
      groups.push({ key, label: DIMENSION_LABELS[key], candidates: items });
    }
  }
  return groups;
}

/** 先看形态、再看来源；有推荐取推荐，没有就取第一个"可用"；都没有就不推荐。 */
function pickRecommendation(
  groups: DimensionGroup[],
): { dimensionKey: DimensionKey; candidateKey: string } | null {
  for (const group of groups) {
    const recommended = group.candidates.find((item) => item.verdict === 'RECOMMENDED');
    if (recommended) {
      return { dimensionKey: group.key, candidateKey: recommended.key };
    }
  }
  for (const group of groups) {
    const acceptable = group.candidates.find((item) => item.verdict === 'ACCEPTABLE');
    if (acceptable) {
      return { dimensionKey: group.key, candidateKey: acceptable.key };
    }
  }
  return null;
}


/** 返回给前端/日志时去掉正文，只留"读了哪几页"。 */
function stripExcerpts(
  retrieval: RetrievalSummary & { excerpts: unknown[] },
): RetrievalSummary {
  const { excerpts: _excerpts, ...rest } = retrieval;
  return rest;
}
