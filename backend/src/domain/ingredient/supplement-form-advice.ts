/**
 * 形态建议：把模型给的结论按住，只让**读过原文**的结论站得住。
 *
 * 这是「基于知识库」这句话唯一能被验证的地方，所以它是纯函数、可单测：
 * - 引用了没读过的页 → 丢掉；
 * - 引用了知识库里不存在的文档 → 丢掉；
 * - 引用被丢光的结论 → 降级成「证据不足」，理由前加说明；
 * - 推荐档位被降级 → 不给推荐，交回人判断。
 */

import type { DropReason } from './kb-retrieval-plan';

export type FormLevel = 'ORGANIC_CHELATE' | 'INORGANIC_SALT' | 'OXIDE' | 'OTHER';

export type FormVerdict = 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE';

export interface Citation {
  documentId: string;
  documentName: string;
  page: number;
  quote: string;
}

export interface FormOption {
  level: FormLevel;
  labelZh: string;
  examples: string[];
  verdict: FormVerdict;
  reason: string;
  citations: Citation[];
}

/** 这次读了哪几页、丢了哪些页：复盘用（2026-11-20 加，铁那次就是因为没有页码查不清） */
export interface RetrievalSummary {
  queries: string[];
  pages: { documentId: string; page: number; score: number }[];
  dropped: { documentId: string; page: number; reason: DropReason }[];
  /** 检索本身失败的查询（DB 故障/超时），与"没命中"分开报 */
  failures?: { query: string; error: string }[];
}

export interface FormAdvice {
  nutrientKey: string;
  nutrientLabel: string;
  options: FormOption[];
  recommendedLevel: FormLevel | null;
  recommendationReason: string;
  gaps: string[];
  retrieval?: RetrievalSummary;
}

export const NO_EVIDENCE_PREFIX = '知识库没查到直接依据：';
export const NO_RECOMMENDATION_REASON = '这一档没有原文支撑，请你判断';

export function pageKey(documentId: string, page: number): string {
  return `${documentId}#${page}`;
}

/**
 * @param readPages 本次真正读过的页（`pageKey` 的集合）
 * @param documentTitles 知识库里真实存在的文档 id → 标题；传了就会顺手把文档名校正过来
 */
export function enforceCitationRule(
  advice: FormAdvice,
  readPages: Set<string>,
  documentTitles: Map<string, string> = new Map(),
): FormAdvice {
  const gaps = new Set(advice.gaps);

  const options: FormOption[] = advice.options.map((option) => {
    const kept = option.citations.filter((citation) => {
      if (!readPages.has(pageKey(citation.documentId, citation.page))) {
        return false;
      }
      // 传了文档清单就以清单为准：清单里没有的文档 id 是编的
      if (documentTitles.size > 0 && !documentTitles.has(citation.documentId)) {
        return false;
      }
      return true;
    });

    const citations = kept.map((citation) => ({
      ...citation,
      documentName: documentTitles.get(citation.documentId) ?? citation.documentName,
    }));

    if (option.verdict === 'NO_EVIDENCE') {
      return { ...option, citations };
    }

    if (citations.length === 0) {
      gaps.add(`${option.labelZh}这一档没有可引用的原文`);
      return {
        ...option,
        citations,
        verdict: 'NO_EVIDENCE' as const,
        reason: `${NO_EVIDENCE_PREFIX}${option.reason}`,
      };
    }

    return { ...option, citations };
  });

  const recommended = advice.recommendedLevel
    ? options.find((option) => option.level === advice.recommendedLevel)
    : undefined;

  const recommendedLevel =
    recommended && recommended.verdict !== 'NO_EVIDENCE' ? advice.recommendedLevel : null;

  return {
    ...advice,
    options,
    recommendedLevel,
    recommendationReason:
      recommendedLevel === null && advice.recommendedLevel !== null
        ? NO_RECOMMENDATION_REASON
        : advice.recommendationReason,
    gaps: [...gaps],
  };
}
