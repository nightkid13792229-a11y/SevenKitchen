import { callDeepSeekJson } from '../deepseek-chat';
import type { CitationRegistry, CitationRecord } from './citation-registry';

export type ClaimKind =
  | 'clinical'
  | 'numeric'
  | 'recipe_action'
  | 'system_result'
  | 'opinion'
  | 'other';

export interface CitedClaim {
  text: string;
  citationIds: string[];
}

export interface ClassifiedClaim extends CitedClaim {
  kind: ClaimKind;
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

export interface UncitedClinicalClaim {
  claim: string;
  kind: ClaimKind;
}

export interface JudgeAudit {
  model: string;
  totalClaims: number;
  clinicalClaims: number;
  citedClinicalClaims: number;
  uncitedClinicalClaims: number;
  judgedClaims: number;
  claims: JudgeClaimResult[];
  uncitedClinical: UncitedClinicalClaim[];
  supported: number;
  partial: number;
  unsupported: number;
  notCheckable: number;
  error?: string;
}

const MAX_JUDGE_CLAIMS = 6;
const MAX_CLASSIFIED_CLAIMS = 30;

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
    const citationIds = extractCitationIds(sentence);
    if (citationIds.length === 0) continue;
    const key = `${sentence}::${citationIds.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ text: sentence, citationIds });
  }
  return claims;
}

function extractCitationIds(text: string): string[] {
  return [
    ...new Set(
      [...String(text ?? '').matchAll(/\[(K\d+)\]/g)].map(
        (match) => match[1],
      ),
    ),
  ];
}

function normalizeKind(value: unknown): ClaimKind {
  const kind = String(value ?? '').trim().toLowerCase();
  if (kind === 'clinical' || kind === 'clinical_claim') return 'clinical';
  if (kind === 'numeric' || kind === 'number' || kind === 'numeric_claim') {
    return 'numeric';
  }
  if (kind === 'recipe_action' || kind === 'action') return 'recipe_action';
  if (kind === 'system_result' || kind === 'assessment_result') {
    return 'system_result';
  }
  if (kind === 'opinion') return 'opinion';
  return 'other';
}

function isClinicalKind(kind: ClaimKind): boolean {
  return kind === 'clinical' || kind === 'numeric';
}

/** 裁判调用失败时的兜底：只按句号/换行拆句，带数字的算“临床/数值”。 */
function fallbackClassify(answer: string): ClassifiedClaim[] {
  const sentences = String(answer ?? '')
    .split(/(?<=[。！？!?；;])\s*|\r?\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, MAX_CLASSIFIED_CLAIMS).map((text) => ({
    text,
    citationIds: extractCitationIds(text),
    kind: /\d/.test(text) ? 'numeric' : 'other',
  }));
}

const COVERAGE_SYSTEM_PROMPT = `你是“引用覆盖裁判”。只做拆分和分类，不判断真假。
把回答拆成独立的 claim；每个 claim 保留原文，不要改写。
分类只能是：
- clinical：疾病、分期、化验值/目标值、营养上下限、剂量、风险、因果、患者建议；
- numeric：以数字/范围为主的陈述；
- recipe_action：加原料、改克数、删除等配方操作；
- system_result：评估是否通过、系统状态；
- opinion：主观判断/建议，但不涉及具体临床数值；
- other：其它。
只从原文提取 [K#] 引用编号，不要自己补引用，不要用外部知识。
输出 JSON：{"claims":[{"text":"...","kind":"clinical","citationIds":["K1"]}]}。`;

const SUPPORT_SYSTEM_PROMPT = `你是知识库引用裁判。只判断“给定原文”是否支持“给定 claim”。
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

async function classifyAnswer(input: {
  config: {
    baseUrl: string;
    model: string;
    reviewModel: string;
    apiKey: string;
    requestTimeoutMs: number;
  };
  answer: string;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
}): Promise<ClassifiedClaim[]> {
  const response = await callDeepSeekJson({
    baseUrl: input.config.baseUrl,
    model: input.config.reviewModel || input.config.model,
    apiKey: input.config.apiKey,
    requestTimeoutMs: input.config.requestTimeoutMs,
    systemPrompt: COVERAGE_SYSTEM_PROMPT,
    userPayload: { answer: input.answer },
    temperature: 0,
    maxTokens: 1600,
    extraBody: { thinking: { type: 'disabled' } },
    onUsage: input.onUsage,
  });
  const rawClaims = Array.isArray(response.claims) ? response.claims : [];
  const claims: ClassifiedClaim[] = [];
  for (const raw of rawClaims.slice(0, MAX_CLASSIFIED_CLAIMS)) {
    const item = raw as Record<string, unknown>;
    const text = String(item.text ?? '').trim();
    if (!text) continue;
    const citationIds = Array.isArray(item.citationIds)
      ? item.citationIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      : extractCitationIds(text);
    claims.push({
      text,
      kind: normalizeKind(item.kind),
      citationIds: citationIds.length > 0 ? citationIds : extractCitationIds(text),
    });
  }
  if (claims.length === 0) {
    throw new Error('引用覆盖裁判没有返回 claim');
  }
  return claims;
}

async function judgeSupport(input: {
  config: {
    baseUrl: string;
    model: string;
    reviewModel: string;
    apiKey: string;
    requestTimeoutMs: number;
  };
  claims: ClassifiedClaim[];
  registry: CitationRegistry;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
}): Promise<JudgeClaimResult[]> {
  const model = input.config.reviewModel || input.config.model;
  const results: JudgeClaimResult[] = [];
  for (const claim of input.claims.slice(0, MAX_JUDGE_CLAIMS)) {
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
        systemPrompt: SUPPORT_SYSTEM_PROMPT,
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
  return results;
}

/**
 * 两遍裁判：
 * 1. 看完整回答，拆 claim，标出“临床/数值”以及有没有 [K#]；
 * 2. 只对带引用的临床 claim 判“原文是否支持”。
 *
 * 没引用的临床 claim 只标 uncited，不判真假——避免裁判用外部知识补。
 */
export async function judgeAnswer(input: {
  config: {
    baseUrl: string;
    model: string;
    reviewModel: string;
    apiKey: string;
    requestTimeoutMs: number;
  };
  answer: string;
  registry: CitationRegistry;
  onUsage?: (usage: { promptTokens: number; completionTokens: number }) => void;
}): Promise<JudgeAudit> {
  const model = input.config.reviewModel || input.config.model;
  let classified: ClassifiedClaim[] = [];
  let error: string | undefined;
  try {
    classified = await classifyAnswer({
      config: input.config,
      answer: input.answer,
      onUsage: input.onUsage,
    });
  } catch (caught) {
    error = `引用覆盖裁判失败：${(caught as Error)?.message ?? '未知错误'}`;
    classified = fallbackClassify(input.answer);
  }

  // 后端确定性兜底：裁判可能漏掉某句；带数字且没有 [K#] 的句子必须至少被标出来。
  const sentences = String(input.answer ?? '')
    .split(/(?<=[。！？!?；;])\s*|\r?\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (!/\d/.test(sentence)) continue;
    if (extractCitationIds(sentence).length > 0) continue;
    const already = classified.some(
      (claim) => claim.text.includes(sentence) || sentence.includes(claim.text),
    );
    if (!already && classified.length < MAX_CLASSIFIED_CLAIMS) {
      classified.push({ text: sentence, kind: 'numeric', citationIds: [] });
    }
  }

  const clinical = classified.filter((claim) => isClinicalKind(claim.kind));
  const cited = clinical.filter((claim) => claim.citationIds.length > 0);
  const uncited = clinical.filter((claim) => claim.citationIds.length === 0);
  const judged = await judgeSupport({
    config: input.config,
    claims: cited,
    registry: input.registry,
    onUsage: input.onUsage,
  });

  return {
    model,
    totalClaims: classified.length,
    clinicalClaims: clinical.length,
    citedClinicalClaims: cited.length,
    uncitedClinicalClaims: uncited.length,
    judgedClaims: judged.length,
    claims: judged,
    uncitedClinical: uncited.map((claim) => ({
      claim: claim.text,
      kind: claim.kind,
    })),
    supported: judged.filter((item) => item.verdict === 'supported').length,
    partial: judged.filter((item) => item.verdict === 'partial').length,
    unsupported: judged.filter((item) => item.verdict === 'unsupported').length,
    notCheckable: judged.filter((item) => item.verdict === 'not_checkable')
      .length,
    error,
  };
}
