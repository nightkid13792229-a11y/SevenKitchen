import { callDeepSeekJson } from '../deepseek-chat';
import type { CitationRegistry, CitationRecord } from './citation-registry';

export interface CitedClaim {
  text: string;
  citationIds: string[];
}

export type JudgeVerdict =
  | 'supported'
  | 'partial'
  | 'unsupported'
  | 'not_checkable';

export interface JudgeClaimResult {
  claim: string;
  citationIds: string[];
  verdict: JudgeVerdict;
  reason: string;
  quote: string;
}

export interface JudgeAudit {
  model: string;
  totalClaims: number;
  judgedClaims: number;
  claims: JudgeClaimResult[];
  supported: number;
  partial: number;
  unsupported: number;
  notCheckable: number;
  error?: string;
}

const MAX_JUDGE_CLAIMS = 6;

/** 只取“带 [K#] 的句子”；没有引用的句子不进入语义裁判。 */
export function extractCitedClaims(answer: string): CitedClaim[] {
  const text = String(answer ?? '');
  const sentences = text
    .split(/(?<=[。！？!?；;])\s*|\r?\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const claims: CitedClaim[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const citationIds = [
      ...new Set(
        [...sentence.matchAll(/\[(K\d+)\]/g)].map((match) => match[1]),
      ),
    ];
    if (citationIds.length === 0) continue;
    const key = `${sentence}::${citationIds.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ text: sentence, citationIds });
  }
  return claims;
}

const JUDGE_SYSTEM_PROMPT = `你是知识库引用裁判。只判断“给定原文”是否支持“给定 claim”。
禁止使用原文之外的任何知识。
特别注意：
- 某个指标的目标范围不等于分期标准；原文只给目标时，不能支持“属于/不属于某期”的结论。
- 数字对但用法错（单位、域、分期、因果）也要判 partial 或 unsupported。
- 不允许用常识补全原文没有的内容。
输出 JSON：{"verdict":"supported|partial|unsupported|not_checkable","reason":"一句话理由","quote":"原文中支持或不支持的那一句"}。`;

function normalizeVerdict(value: unknown): JudgeVerdict {
  const verdict = String(value ?? '').trim();
  if (
    verdict === 'supported' ||
    verdict === 'partial' ||
    verdict === 'unsupported' ||
    verdict === 'not_checkable'
  ) {
    return verdict;
  }
  return 'not_checkable';
}

export async function judgeCitedClaims(input: {
  config: {
    baseUrl: string;
    model: string;
    reviewModel: string;
    apiKey: string;
    requestTimeoutMs: number;
  };
  claims: CitedClaim[];
  registry: CitationRegistry;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
}): Promise<JudgeAudit> {
  const selected = input.claims.slice(0, MAX_JUDGE_CLAIMS);
  const model = input.config.reviewModel || input.config.model;
  const results: JudgeClaimResult[] = [];

  for (const claim of selected) {
    const citations = claim.citationIds
      .map((id) => input.registry.get(id))
      .filter((item): item is CitationRecord => Boolean(item));
    if (citations.length === 0) {
      results.push({
        claim: claim.text,
        citationIds: claim.citationIds,
        verdict: 'not_checkable',
        reason: '引用编号在本次会话里找不到',
        quote: '',
      });
      continue;
    }

    try {
      const response = await callDeepSeekJson({
        baseUrl: input.config.baseUrl,
        model,
        apiKey: input.config.apiKey,
        requestTimeoutMs: input.config.requestTimeoutMs,
        systemPrompt: JUDGE_SYSTEM_PROMPT,
        userPayload: {
          claim: claim.text,
          citations: citations.map((citation) => ({
            citationId: citation.citationId,
            source: citation.sourceName ?? citation.sourceId,
            section: citation.sectionTitle,
            page: citation.pageStart,
            text: citation.text,
          })),
        },
        temperature: 0,
        maxTokens: 800,
        extraBody: { thinking: { type: 'disabled' } },
        onUsage: input.onUsage,
      });
      results.push({
        claim: claim.text,
        citationIds: claim.citationIds,
        verdict: normalizeVerdict(response.verdict),
        reason: String(response.reason ?? '').slice(0, 500),
        quote: String(response.quote ?? '').slice(0, 500),
      });
    } catch (error) {
      results.push({
        claim: claim.text,
        citationIds: claim.citationIds,
        verdict: 'not_checkable',
        reason: `裁判调用失败：${(error as Error)?.message ?? '未知错误'}`,
        quote: '',
      });
    }
  }

  return {
    model,
    totalClaims: input.claims.length,
    judgedClaims: selected.length,
    claims: results,
    supported: results.filter((item) => item.verdict === 'supported').length,
    partial: results.filter((item) => item.verdict === 'partial').length,
    unsupported: results.filter((item) => item.verdict === 'unsupported').length,
    notCheckable: results.filter((item) => item.verdict === 'not_checkable')
      .length,
  };
}
