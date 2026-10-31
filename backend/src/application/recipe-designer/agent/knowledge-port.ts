/**
 * 知识库只读端口（2026-11-01 新增）。
 *
 * 背景：用户问"能不能看到知识库"，Agent 没有任何工具能读——只能瞎试。
 * 知识库本身是代码里的权威条目（按领域组织），这里只做两件事：
 *   1. 列出可用领域和条数（很小）
 *   2. 按主题做模糊匹配，返回最相关的前 8 条（每条压到一眼能读完）
 *
 * 只读，不写；不把整库塞进上下文。
 */
import { Injectable } from '@nestjs/common';
import { KnowledgeBaseService } from '../knowledge-base.service';
import { KNOWLEDGE_DOMAIN_LABELS, HEALTH_ONLY_DOMAINS } from '../../../domain/recipe-designer/knowledge-base/types';
import type { KnowledgeDomain } from '../../../domain/recipe-designer/knowledge-base/types';

export interface KnowledgeDomainSummary {
  domain: string;
  label: string;
  count: number;
}

export interface KnowledgeHit {
  domain: string;
  title: string;
  summary: string;
  points: string[];
  caveats: string[];
  /** 出处：书名/指南名 · 章节（+ 说明）。内部条目编号不再给模型。 */
  citations: string[];
}

const SEARCH_LIMIT = 8;

@Injectable()
export class RecipeKnowledgePort {
  constructor(private readonly knowledgeBase: KnowledgeBaseService) {}

  /** 可用于食谱设计的领域清单（健康专用领域不暴露给配方设计）。 */
  listDomains(): KnowledgeDomainSummary[] {
    const counts = new Map<string, number>();
    for (const entry of this.knowledgeBase.getAll()) {
      if (HEALTH_ONLY_DOMAINS.includes(entry.domain)) continue;
      counts.set(entry.domain, (counts.get(entry.domain) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([domain, count]) => ({
      domain,
      label: KNOWLEDGE_DOMAIN_LABELS[domain as KnowledgeDomain] ?? domain,
      count,
    }));
  }

  /**
   * 按主题模糊匹配：标题、关键词、领域名、摘要里出现即可。
   * 命中多条时按「标题命中 > 关键词命中 > 摘要命中」排序。
   */
  search(topic: string): KnowledgeHit[] {
    const keyword = topic.trim().toLowerCase();
    if (!keyword) return [];

    const scored: Array<{ score: number; entry: any }> = [];
    for (const entry of this.knowledgeBase.getAll()) {
      if (HEALTH_ONLY_DOMAINS.includes(entry.domain)) continue;
      const title = String(entry.title ?? '').toLowerCase();
      const summary = String(entry.summary ?? '').toLowerCase();
      const domainLabel = String(
        KNOWLEDGE_DOMAIN_LABELS[entry.domain as KnowledgeDomain] ?? '',
      ).toLowerCase();
      const keywords: string[] = Array.isArray(entry.keywords)
        ? entry.keywords.map((item: string) => String(item).toLowerCase())
        : [];

      let score = 0;
      if (title.includes(keyword)) score += 5;
      if (keywords.some((item) => item.includes(keyword) || keyword.includes(item))) {
        score += 4;
      }
      if (domainLabel.includes(keyword) || keyword.includes(domainLabel)) {
        score += 3;
      }
      if (summary.includes(keyword)) score += 1;
      if (score > 0) scored.push({ score, entry });
    }

    return scored
      .sort((left, right) => right.score - left.score)
      .slice(0, SEARCH_LIMIT)
      .map(({ entry }) => ({
        domain: KNOWLEDGE_DOMAIN_LABELS[entry.domain as KnowledgeDomain] ?? entry.domain,
        title: entry.title,
        summary: entry.summary,
        points: Array.isArray(entry.details) ? entry.details.slice(0, 3) : [],
        caveats: Array.isArray(entry.caveats) ? entry.caveats.slice(0, 2) : [],
        citations: Array.isArray(entry.citations)
          ? entry.citations.slice(0, 2).map((citation: any) =>
              [citation.source, citation.chapter]
                .filter(Boolean)
                .join(' · '),
            )
          : [],
      }));
  }
}
