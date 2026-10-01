import { Injectable } from '@nestjs/common';
import type {
  KnowledgeDomain,
} from '../../domain/recipe-designer/knowledge-base/types';
import { KNOWLEDGE_DOMAIN_LABELS } from '../../domain/recipe-designer/knowledge-base/types';
import {
  isKnownTag,
  isRetrievalTag,
} from '../../domain/recipe-designer/knowledge-base/tag-vocabulary';
import {
  isKnownSourceId,
  sourceOrganization,
} from '../../domain/recipe-designer/knowledge-base/source-registry';
import {
  HEALTH_ONLY_DOMAINS,
  KNOWLEDGE_QUESTION_TYPE_LABELS,
  KNOWLEDGE_URGENCY_LABELS,
  type KnowledgeEntry,
} from '../../domain/recipe-designer/knowledge-base/types';

/**
 * 一次塞进提示词的条目上限（2026-10-01 新增）。
 *
 * 为什么必须有上限：在此之前是"命中多少塞多少"，实测一只多系统疾病犬
 * 命中 121 / 202 条 ≈ 7.4 万 tokens —— 跑不动，而且条数一多 AI 会忽略
 * 中间的内容。库里涨到几千条也不怕，只要每次只挑最相关的这一小撮。
 */
export const KNOWLEDGE_PROMPT_ENTRY_LIMIT = 24;

/**
 * 面向谁生成提示词。
 *
 * 老板把边界定死了：**未审核的兽医内容不得对顾客开放**。
 * 营养师侧看得到全部（他们看得懂"这条还没审"），顾客侧只给已审核的。
 */
export type KnowledgeAudience = 'nutritionist' | 'customer';

/**
 * 这次检索是给谁用的。
 *
 * 食谱设计只关心营养，免疫/化验/就医时机对配方没有输入价值 ——
 * 放进去只会占名额。默认仍是食谱设计，保持既有调用方行为不变。
 */
export type KnowledgePurpose = 'recipe-design' | 'health';
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
import { REPRO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/repro';
import { SAFE_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/safe';
import { CRITICAL_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/critical';
import { HEMO_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/hemo';
import { IMMUNE_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/immune';
import { LAB_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/lab';
import { CLINICAL_KNOWLEDGE } from '../../domain/recipe-designer/knowledge-base/data/clinical';

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
  REPRO: REPRO_KNOWLEDGE,
  SAFE: SAFE_KNOWLEDGE,
  CRITICAL: CRITICAL_KNOWLEDGE,
  HEMO: HEMO_KNOWLEDGE,
  IMMUNE: IMMUNE_KNOWLEDGE,
  LAB: LAB_KNOWLEDGE,
  CLINICAL: CLINICAL_KNOWLEDGE,
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
   *
   * 排序改成**相关度优先**（2026-10-01）：原先只按"引用优先级 + id"排，
   * 不看跟这只狗有多相关 —— 命中 5 个标签的条目和命中 1 个的排在一起。
   * 现在命中标签越多越靠前，同分再比优先级。
   */
  searchByTags(tags: string[]): KnowledgeEntry[] {
    const normalized = new Set(
      tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    );
    if (normalized.size === 0) return [];

    return this.entries
      .map((entry) => ({
        entry,
        hits: entry.applicableTo.filter((tag) =>
          normalized.has(tag.toLowerCase()),
        ).length,
      }))
      .filter((item) => item.hits > 0)
      .sort(
        (a, b) =>
          b.hits - a.hits ||
          priorityRank(a.entry.priority) - priorityRank(b.entry.priority) ||
          a.entry.id.localeCompare(b.entry.id),
      )
      .map((item) => item.entry);
  }

  /** 用途过滤：食谱设计不看免疫/化验/就医时机 */
  private filterByPurpose(
    entries: KnowledgeEntry[],
    purpose: KnowledgePurpose,
  ): KnowledgeEntry[] {
    if (purpose === 'health') {
      return entries;
    }
    const excluded = new Set<string>(HEALTH_ONLY_DOMAINS);
    return entries.filter((entry) => !excluded.has(entry.domain));
  }

  /** 受众过滤：未审核的条目不给顾客看（老板定的边界） */
  private filterByAudience(
    entries: KnowledgeEntry[],
    audience: KnowledgeAudience,
  ): KnowledgeEntry[] {
    if (audience === 'nutritionist') {
      return entries;
    }
    // 未审核 / 被驳回的一律过滤；缺省（没写 reviewStatus）视为未审核
    return entries.filter((entry) => entry.reviewStatus === 'APPROVED');
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
    options: {
      audience?: KnowledgeAudience;
      limit?: number;
      purpose?: KnowledgePurpose;
    } = {},
  ): string {
    const audience = options.audience ?? 'nutritionist';
    const purpose = options.purpose ?? 'recipe-design';
    const limit = options.limit ?? KNOWLEDGE_PROMPT_ENTRY_LIMIT;

    // 先按用途与受众过滤，再做关键词补充 —— 否则名额会被不相干的条目占满
    const scoped = (entries: KnowledgeEntry[]) =>
      this.filterByAudience(this.filterByPurpose(entries, purpose), audience);

    const matched = scoped(this.searchByTags(tags));
    const extraMatched = scoped(
      this.searchByKeywords(extraKeywords).filter(
        (entry) => !matched.includes(entry),
      ),
    );

    // 上限：标签命中优先于关键词命中（前者是这只狗的真实情况）
    const selected = [...matched, ...extraMatched].slice(0, limit);
    if (selected.length === 0) return '';

    const lines: string[] = [
      '【可引用的权威知识条目（请仅基于这些条目给出建议，引用时标注条目 ID 与出处）】',
    ];
    for (const entry of selected) {
      lines.push(
        [
          `- [${entry.id}]（领域：${KNOWLEDGE_DOMAIN_LABELS[entry.domain]}` +
            (entry.questionType
              ? `／类型：${KNOWLEDGE_QUESTION_TYPE_LABELS[entry.questionType]}`
              : '') +
            '）' +
            entry.title +
            (entry.urgency
              ? `\n  **紧急程度：${KNOWLEDGE_URGENCY_LABELS[entry.urgency]}**（照用，不要自行判断）`
              : ''),
          `  建议：${entry.summary}`,
          ...entry.details.map((detail) => `  要点：${detail}`),
          ...entry.caveats.map((caveat) => `  注意：${caveat}`),
          `  出处：${
            entry.sources && entry.sources.length > 0
              ? entry.sources
                  .map((source) =>
                    [source.sourceId, source.locator, source.note]
                      .filter(Boolean)
                      .join(' '),
                  )
                  .join('；')
              : formatCitations(entry.citations)
          }`,
        ].join('\n'),
      );
    }
    return lines.join('\n');
  }

  private validateEntries(): void {
    const seenIds = new Set<string>();
    const problems: string[] = [];

    for (const entry of this.entries) {
      if (!entry.id || !entry.title) {
        problems.push('存在缺少 id 或 title 的条目');
        continue;
      }
      if (seenIds.has(entry.id)) {
        problems.push(`条目 id 重复：${entry.id}`);
      }
      seenIds.add(entry.id);

      if (entry.citations.length === 0) {
        problems.push(`条目 ${entry.id} 缺少出处`);
      }

      // 标签必须来自受控词表
      const unknownTags = entry.applicableTo.filter((tag) => !isKnownTag(tag));
      if (unknownTags.length > 0) {
        problems.push(
          `条目 ${entry.id} 使用了词表外的标签：${unknownTags.join('、')}` +
            '（新增标签请按 docs/knowledge-base/intake-sop.md 走审核）',
        );
      }

      // 必须至少有一个"系统会产出"的检索标签，否则永远检索不到
      if (!entry.applicableTo.some((tag) => isRetrievalTag(tag))) {
        problems.push(
          `条目 ${entry.id} 没有任何检索标签，系统永远检索不到它：` +
            `[${entry.applicableTo.join('、')}]`,
        );
      }

      problems.push(...validateStructuredEntry(entry));
    }

    if (problems.length > 0) {
      throw new Error(
        `知识库校验未通过（${problems.length} 项）：\n- ${problems.join('\n- ')}`,
      );
    }
  }
}

/**
 * 走新结构的条目（填了 questionType 的）要满足的额外要求。
 *
 * 旧 202 条不填 questionType，这里一条都不查 —— 落实"旧条目先不动"。
 */
function validateStructuredEntry(entry: KnowledgeEntry): string[] {
  if (!entry.questionType) {
    return [];
  }

  const problems: string[] = [];

  if (!entry.riskLevel) {
    problems.push(`条目 ${entry.id} 走新结构但缺 riskLevel（风险等级）`);
  }

  if (!entry.sources || entry.sources.length === 0) {
    problems.push(`条目 ${entry.id} 走新结构但缺结构化出处 sources`);
  } else {
    const unknown = entry.sources
      .map((source) => source.sourceId)
      .filter((sourceId) => !isKnownSourceId(sourceId));
    if (unknown.length > 0) {
      problems.push(
        `条目 ${entry.id} 引用了登记表里没有的来源：${unknown.join('、')}` +
          '（新增来源见 docs/knowledge-base/intake-sop.md）',
      );
    }

    // 交叉验证按风险分级：高风险必须两个**不同机构**的来源
    const organizations = new Set(
      entry.sources
        .filter((source) => isKnownSourceId(source.sourceId))
        .map((source) => sourceOrganization(source.sourceId)),
    );
    if (entry.riskLevel === 'HIGH' && organizations.size < 2) {
      problems.push(
        `条目 ${entry.id} 是高风险结论，但只有一个来源机构（${[...organizations].join('、') || '无'}）` +
          '—— 高风险必须有 ≥2 个互相独立的来源',
      );
    }
  }

  // 分诊类必须写死紧急程度：这是唯一不能让 AI 自己判断的东西
  if (entry.questionType === 'TRIAGE' && !entry.urgency) {
    problems.push(
      `条目 ${entry.id} 是分诊类，必须写明 urgency（立即就医 / 尽快就医 / 可观察）`,
    );
  }

  // 有没有写审核状态必须明确：缺省视为未审核，顾客侧看不到
  if (!entry.reviewStatus) {
    problems.push(
      `条目 ${entry.id} 走新结构但没写 reviewStatus（缺省视为未审核，顾客侧看不到）`,
    );
  }

  if (!entry.reviewBy) {
    problems.push(`条目 ${entry.id} 走新结构但没写 reviewBy（下次复核日期）`);
  }

  if (entry.riskLevel === 'HIGH' && entry.questionType === 'TRIAGE' && entry.urgency === 'OBSERVE') {
    // 高风险 + 可观察 是自相矛盾的组合，多半是填错了
    problems.push(
      `条目 ${entry.id} 标了高风险却给"可观察"—— 两者矛盾，请核对`,
    );
  }

  return problems;
}

/** 由出处推导证据强度（不用人填） */
export function resolveEvidenceStrength(
  entry: KnowledgeEntry,
): 'SINGLE_SOURCE' | 'TWO_SOURCES' | 'MULTI_SOURCE' | 'CONFLICT' {
  if (entry.conflicts && entry.conflicts.length > 0) {
    return 'CONFLICT';
  }
  const organizations = new Set(
    (entry.sources || []).map((source) => sourceOrganization(source.sourceId)),
  );
  if (organizations.size >= 3) return 'MULTI_SOURCE';
  if (organizations.size === 2) return 'TWO_SOURCES';
  return 'SINGLE_SOURCE';
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
