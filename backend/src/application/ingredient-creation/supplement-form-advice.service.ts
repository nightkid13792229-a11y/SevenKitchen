import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGatewayService } from '../knowledge-v3/knowledge-gateway.service';
import { executeKnowledgeTool } from '../knowledge-v3/knowledge-v3.tools';
import type {
  KbCatalogResult,
  KbFindResult,
  KbReadResult,
} from '../knowledge-v3/knowledge-v3.types';
import type { RetrievalSummary } from '../../domain/ingredient/supplement-form-advice';
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
  type KbCandidate,
  type MarketTerm,
} from '../../domain/ingredient/supplement-form-candidates';
import { SupplementKbFormService } from './supplement-kb-form.service';
import { SupplementMarketFormService } from './supplement-market-form.service';
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
 * 一条硬规矩：**没有原文就没有结论**。校验在 `verifyAgainstPages`（逐字）
 * 与 `gateVerdict`（原句得真的在表态）里，这里只负责把它们接上。
 */
const MAX_FIND_QUERIES = 4;
const MAX_READS = 4;
/** 每条查询至少占 1 页、最多 2 页；同一文档最多 2 页 */
const PER_QUERY_MAX = 2;
const PER_DOCUMENT_MAX = 2;
const PAGE_TEXT_LIMIT = 2200;

export interface AdviseInput {
  nutrientKey: string;
  nutrientLabel?: string;
  question?: string;
}

@Injectable()
export class SupplementFormAdviceService {
  private readonly logger = new Logger(SupplementFormAdviceService.name);

  constructor(
    private readonly knowledge: KnowledgeGatewayService,
    private readonly kbForms: SupplementKbFormService,
    private readonly marketForms: SupplementMarketFormService,
  ) {}

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

  async adviseDimensions(input: AdviseInput): Promise<DimensionsAdvice> {
    const nutrientKey = input.nutrientKey.trim();
    const nutrientLabel = input.nutrientLabel?.trim() || nutrientChineseLabel(nutrientKey);
    const english = nutrientEnglishName(nutrientKey);
    const question = input.question?.trim() || undefined;

    const retrieval = await this.collectPages(english);
    this.logRetrieval('dimensions', nutrientKey, retrieval);

    // 出处要写人能看懂的书名，不能把 nrc-NRC-2006-... 这种内部 id 甩给老板
    const titles = await this.loadDocumentTitles();

    // 两条抽取各自兜底：一边挂了不能把整屏带崩
    let kbTerms: KbCandidate[] = [];
    let market: { terms: MarketTerm[]; compound: boolean } = { terms: [], compound: false };
    const extractionErrors: string[] = [];

    const [kbOutcome, marketOutcome] = await Promise.allSettled([
      this.kbForms.extract({
        nutrientKey,
        nutrientEnglish: english,
        question,
        titles,
        pages: retrieval.excerpts.map((item) => ({
          documentId: item.documentId,
          page: item.page,
          text: item.text,
        })),
      }),
      this.marketForms.extract({ nutrientKey, nutrientEnglish: english, question }),
    ]);

    if (kbOutcome.status === 'fulfilled') {
      kbTerms = kbOutcome.value;
    } else {
      extractionErrors.push('知识库抽词失败（这次没有原文候选）');
      this.logger.warn(`[form-advice:dimensions] kb 抽取失败 ${String(kbOutcome.reason)}`);
    }
    if (marketOutcome.status === 'fulfilled') {
      market = marketOutcome.value;
    } else {
      extractionErrors.push('市场搜索失败（形态清单可能不全）');
      this.logger.warn(`[form-advice:dimensions] 市场抽取失败 ${String(marketOutcome.reason)}`);
    }

    const gaps: string[] = [...extractionErrors];

    // 注意：这里**不做**复方短路。搜索是按营养素来的，结果里混着 B 族复合、
    // 多维矿等复方商品是常态；在这一层按标题判复方会误伤（B12 就被判成复方过一次）。
    // 复方判定留给建档那一步：标签里认得出两种以上营养素才跳过单价排序。

    const merged = mergeCandidates(kbTerms, market.terms);
    const dimensions = groupByDimension(merged);
    const recommendation = pickRecommendation(dimensions);

    if (retrieval.failures?.length) {
      gaps.push(`知识库检索失败：${retrieval.failures.map((item) => item.query).join('、')}`);
    }
    if (kbTerms.length === 0 && !retrieval.failures?.length) {
      gaps.push(`知识库里没有提到「${nutrientLabel}」的形态或来源`);
    }
    if (market.terms.length === 0 && !extractionErrors.length) {
      gaps.push('市场上没搜到这一类的商品标题，形态清单可能不全');
    }
    if (dimensions.length === 0 && gaps.length === 0) {
      gaps.push('两边都没抽到候选，这一项直接进比价');
    }
    if (!recommendation && dimensions.length > 0) {
      const allMarketOnly = merged.every((item) => item.status === 'MARKET_ONLY');
      gaps.push(
        allMarketOnly
          ? '知识库里没有依据，下面都是市场常见说法，请你判断'
          : '有原文，但没有给出可用结论，请你判断',
      );
    }

    this.logger.log(
      `[form-advice:dimensions] nutrient=${nutrientKey} kb=${kbTerms.length} market=${market.terms.length} ` +
        `candidates=${merged.length} recommended=${recommendation ? recommendation.candidateKey : 'none'}`,
    );

    return {
      nutrientKey,
      nutrientLabel,
      dimensions,
      recommendation,
      gaps,
      // 只回"读了哪几页"；整页正文不能随响应回到前端（会话快照会把它存下来）
      retrieval: stripExcerpts(retrieval),
    };
  }

  /** 知识库目录：documentId → 书名。拿不到就算了，出处回退显示 id。 */
  private async loadDocumentTitles(): Promise<Map<string, string>> {
    const titles = new Map<string, string>();
    const catalog = await executeKnowledgeTool(this.knowledge, 'kb_catalog', {});
    if (catalog.ok) {
      for (const source of (catalog.data as KbCatalogResult).sources) {
        titles.set(source.id, source.title);
      }
    }
    return titles;
  }
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

/**
 * 推荐规则：**先形态**。
 *
 * - 有 FORM 维度就只在 FORM 里选（推荐 > 可用），FORM 没结论就不推荐，
 *   免得"形态没定"却在页面上写"建议用：磷虾油"；
 * - 只有完全没有 FORM 维度（比如鱼油）时，才退到 SOURCE。
 */
function pickRecommendation(
  groups: DimensionGroup[],
): { dimensionKey: DimensionKey; candidateKey: string } | null {
  const form = groups.find((group) => group.key === 'FORM');
  if (form) {
    return pickFromGroup(form);
  }
  const source = groups.find((group) => group.key === 'SOURCE');
  return source ? pickFromGroup(source) : null;
}

function pickFromGroup(
  group: DimensionGroup,
): { dimensionKey: DimensionKey; candidateKey: string } | null {
  const recommended = group.candidates.find((item) => item.verdict === 'RECOMMENDED');
  if (recommended) {
    return { dimensionKey: group.key, candidateKey: recommended.key };
  }
  const acceptable = group.candidates.find((item) => item.verdict === 'ACCEPTABLE');
  return acceptable ? { dimensionKey: group.key, candidateKey: acceptable.key } : null;
}

/** 返回给前端/日志时去掉正文，只留"读了哪几页"。 */
function stripExcerpts(retrieval: RetrievalSummary & { excerpts: unknown[] }): RetrievalSummary {
  const { excerpts: _excerpts, ...rest } = retrieval;
  return rest;
}
