import { Injectable } from '@nestjs/common';
import type {
  KnowledgeDomain,
  KnowledgeEntry,
} from '../../domain/recipe-designer/knowledge-base/types';
import { KNOWLEDGE_DOMAIN_LABELS } from '../../domain/recipe-designer/knowledge-base/types';
import { GENERAL_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/general';
import { GROWTH_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/growth';
import { SENIOR_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/senior';
import { WEIGHT_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/weight-management';
import { RENAL_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/renal';
import { PANCREATITIS_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/pancreatitis';
import { GI_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/gi';
import { SKIN_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/skin';
import { UROLITH_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/urolith';
import { ENDOCRINE_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/endocrine';
import { HEPATIC_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/hepatic';
import { CARDIO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/cardio';
import { ORTHO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/ortho';
import { ONCO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/onco';
import { NEURO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/neuro';
import { DENTAL_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/dental';

const DOMAIN_DATA: Record<KnowledgeDomain, KnowledgeEntry[]> = {
  GENERAL: GENERAL_KNOWLEDGE,
  GROWTH: GROWTH_KNOWLEDGE,
  SENIOR: SENIOR_KNOWLEDGE,
  WEIGHT: WEIGHT_KNOWLEDGE,
  RENAL: RENAL_KNOWLEDGE,
  PANCREATITIS: PANCREATITIS_KNOWLEDGE,
  GI: GI_KNOWLEDGE,
  SKIN: SKIN_KNOWLEDGE,
  UROLITH: UROLITH_KNOWLEDGE,
  ENDOCRINE: ENDOCRINE_KNOWLEDGE,
  HEPATIC: HEPATIC_KNOWLEDGE,
  CARDIO: CARDIO_KNOWLEDGE,
  ORTHO: ORTHO_KNOWLEDGE,
  ONCO: ONCO_KNOWLEDGE,
  NEURO: NEURO_KNOWLEDGE,
  DENTAL: DENTAL_KNOWLEDGE,
};

/**
 * 结构化知识库服务：加载全部领域知识条目，并按犬的档案标签检索。
 * AI 生成建议时，将检索到的条目序列化进提示词，AI 只引用这些条目并保留出处。
 */
@Injectable()
export class KnowledgeBaseService {
  private readonly entries: KnowledgeEntry[];

  constructor() {
    this.entries = Object.values(DOMAIN_DATA).flat();
    this.validateEntries();
  }

  getAll(): KnowledgeEntry[] {
    return this.entries;
  }

  getByDomain(domain: KnowledgeDomain): KnowledgeEntry[] {
    return DOMAIN_DATA[domain] ?? [];
  }

  /**
   * 按标签检索：条目 applicableTo 命中任一标签即返回。
   * 命中优先级排序：HIGH 在前，同优先级按 id 稳定排序。
   */
  searchByTags(tags: string[]): KnowledgeEntry[] {
    const normalized = new Set(
      tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    );
    if (normalized.size === 0) return [];
    return this.entries
      .filter((entry) =>
        entry.applicableTo.some((tag) => normalized.has(tag.toLowerCase())),
      )
      .sort(
        (a, b) =>
          priorityRank(a.priority) - priorityRank(b.priority) ||
          a.id.localeCompare(b.id),
      );
  }

  /**
   * 关键词检索（用于提示词内补充命中）。
   */
  searchByKeywords(keywords: string[]): KnowledgeEntry[] {
    const normalized = keywords.map((k) => k.trim().toLowerCase());
    if (normalized.length === 0) return [];
    return this.entries.filter((entry) =>
      entry.keywords.some((kw) => normalized.includes(kw.toLowerCase())),
    );
  }

  /**
   * 序列化为提示词上下文。每条包含 ID、领域、标题、建议、要点、注意、出处。
   */
  buildPromptContext(
    tags: string[],
    extraKeywords: string[] = [],
  ): string {
    const matched = this.searchByTags(tags);
    const extraMatched = this.searchByKeywords(extraKeywords).filter(
      (entry) => !matched.includes(entry),
    );
    const selected = [...matched, ...extraMatched];
    if (selected.length === 0) return '';

    const lines: string[] = [
      '【可引用的权威知识条目（请仅基于这些条目给出建议，引用时标注条目 ID 与出处）】',
    ];
    for (const entry of selected) {
      lines.push(
        [
          `- [${entry.id}]（领域：${KNOWLEDGE_DOMAIN_LABELS[entry.domain]}）${entry.title}`,
          `  建议：${entry.summary}`,
          ...entry.details.map((detail) => `  要点：${detail}`),
          ...entry.caveats.map((caveat) => `  注意：${caveat}`),
          `  出处：${formatCitations(entry.citations)}`,
        ].join('\n'),
      );
    }
    return lines.join('\n');
  }

  private validateEntries(): void {
    for (const entry of this.entries) {
      if (!entry.id || !entry.title) {
        throw new Error('知识库条目缺少 id 或 title');
      }
      if (entry.citations.length === 0) {
        throw new Error(`知识库条目 ${entry.id} 缺少出处`);
      }
    }
  }
}

function priorityRank(priority: KnowledgeEntry['priority']): number {
  if (priority === 'HIGH') return 0;
  if (priority === 'MEDIUM') return 1;
  return 2;
}

function formatCitations(citations: KnowledgeEntry['citations']): string {
  return citations
    .map((citation) => {
      const parts = [citation.source];
      if (citation.chapter) parts.push(citation.chapter);
      if (citation.note) parts.push(citation.note);
      return parts.join('，');
    })
    .join('；');
}
