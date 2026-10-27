import { Injectable, Logger } from '@nestjs/common';
import {
  classifyCookingMethod,
  isCookedSourceAcceptable,
  normalizePreparationState,
  type CookingMethod,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import type { NutritionGovernanceSourceType } from '../../domain/nutrition-governance/nutrition-governance.types';
import { LOCAL_LIBRARY_SOURCE_TYPES } from '../../domain/nutrition-governance/nutrition-source-registry';
import {
  normalizeNameForMatch,
  scoreIngredientSourceNameMatch,
} from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  auditNutritionProfileForImport,
  type NutritionImportNutrientValue,
} from '../standard-ingredient-import/nutrition-audit';
import type {
  CandidateMatchMethod,
  CandidateRow,
  CandidateSearchCoverage,
  CandidateSearchResult,
} from './ingredient-creation.types';
import {
  AI_TRANSLATION_UNAVAILABLE_NOTICE,
  IngredientNameAliasService,
  type AiTranslationHit,
  type AiTranslationResult,
} from './ingredient-name-alias.service';

export interface FindCandidatesInput {
  /** 中文规范名（必填）。 */
  name: string;
  /** 英文名（口径卡里 AI 给的，或人工填的）；没有时只能匹配中文词条。 */
  nameEn?: string;
  /** 要找的是生档案还是熟档案。 */
  state: PreparationState;
}

/** `listNutritionNames` 的入参：只按名字摆事实，不判断生熟 / 做法 / 部位。 */
export interface ListNutritionNamesInput {
  /** 中文或外文关键词。 */
  keyword: string;
  /** 可选的英文名（口径卡里已有英文名时一起参与匹配）。 */
  nameEn?: string;
  /** 最多返回多少条；默认与上限都是 3000。 */
  limit?: number;
}

/** 一条真实命中的词条名；只有摆事实需要的三列。 */
export interface NutritionNameRow {
  id: string;
  name: string;
  sourceType: string;
}

export interface ListNutritionNamesResult {
  /** 截断前的真实命中总数。 */
  total: number;
  names: NutritionNameRow[];
  /** 本次实际用过的检索词（中文 + 词典展开 + AI 翻译）。 */
  keywords: string[];
  notice?: string | null;
}

/**
 * 候选检索只查登记表里的 L1 本地主库。
 *
 * 这里必须用 `in` 而不是 `notIn`：NEVO/MANUAL/SUPPLEMENT_LABEL 等不在 L1 的
 * 来源都不该进入候选（NEVO 只保留线上长尾）。
 */
const CANDIDATE_SEARCH_SOURCE_TYPES: readonly NutritionGovernanceSourceType[] =
  LOCAL_LIBRARY_SOURCE_TYPES as readonly NutritionGovernanceSourceType[];

/**
 * 名字对不上的下限。与营养治理工作台一致：来源优先级本身只值 0.1~0.15，
 * 光靠优先级不能算命中。
 */
const MIN_MATCH_SCORE = 0.35;

/**
 * 同名不同部位（兔肝 vs 兔肉、鸡肝 vs 鸡胸）的匹配分。
 *
 * 故意压到准入线以下：这种词条只能当「易混项」给人核对，绝不能当同名命中，
 * 所以它靠 `DIFFERENT_PART` 备注单独准入，排在同名候选之后。
 */
const DIFFERENT_PART_SCORE = 0.25;

/**
 * 熟查询里水煮 / 蒸的排序权重。
 *
 * 只加在 `matchScore` 上：同分时让温和做法排前面，但不足以盖过名字匹配本身
 * （同名命中约 0.75~0.9，混淆项只有 0.25）。
 */
const GENTLE_COOKED_METHOD_WEIGHT = 0.05;

/** 候选默认返回条数，避免「牛肉」这类宽泛名字把接口和页面撑爆。 */
const DEFAULT_CANDIDATE_LIMIT = 50;

/** `listNutritionNames` 的默认 / 上限：一次返回全部命中，交给一次汇总，所以给 3000。 */
const DEFAULT_NAME_LIST_LIMIT = 3000;
const MAX_NAME_LIST_LIMIT = 3000;

/** `nutrition_source_record` 里检索候选时需要的列。 */
interface SourceRecordMeta {
  id: string;
  sourceType: NutritionGovernanceSourceType;
  foodName: string;
  foodNameEn: string | null;
}

interface NameAnalysis {
  /** 去掉部位词后的「头部」：兔肝 → 兔，Chicken liver → chicken。 */
  head: string;
  /** 识别到的部位（canonical：liver / meat / breast ...）。 */
  parts: Set<string>;
}

interface QueryAnalysis {
  /** 口径卡带进来的原始名字（中文名 / 英文名），用于部位分析。 */
  names: string[];
  /** 实际参与名称匹配的词：原始名字 + 词典展开词 + AI 翻译候选词。 */
  terms: QueryTerm[];
  analyses: NameAnalysis[];
  /** 所有查询名字的部位并集，用于跨语言比较（牛肉 vs Beef, liver）。 */
  parts: Set<string>;
  /** 回传给页面/模型的关键词，含词典与 AI 翻译展开出的外文词。 */
  keywords: string[];
}

/** 一个参与匹配的词，以及「这个词是怎么来的」。 */
interface QueryTerm {
  text: string;
  /**
   * 来自词典 / AI 翻译的外文词要固定标记命中方式；
   * 原始名字为 null，由 `classifyMatchMethod` 按名字本身判断。
   */
  matchedBy: Extract<
    CandidateMatchMethod,
    'DICTIONARY' | 'AI_TRANSLATION'
  > | null;
}

interface MatchOutcome {
  score: number;
  differentPart: boolean;
  matchedBy: CandidateMatchMethod;
  matchedKeyword: string;
  matchedSourceName: string;
  /** 所有名字对得上的查询词（含词典 / AI 翻译），用于回写词典命中。 */
  matchedTerms: string[];
}

interface ScoredCandidate {
  record: SourceRecordMeta;
  preparationState: PreparationState | null;
  cookingMethod: CookingMethod | null;
  notes: string[];
  matchScore: number;
  matchedBy: CandidateMatchMethod;
  matchedKeyword: string;
  matchedSourceName: string;
  /** 同分时的优先：状态与查询一致（0）排在看不出状态（1）前面。 */
  stateRank: number;
  coveragePercent: number;
  missingFields: string[];
}

/**
 * 部位词表。只收常见可食部位，中英映射到同一个 canonical 名，
 * 这样中文查询和英文词条也能发现部位冲突（如 牛肉 vs Beef, liver）。
 *
 * 这不是「猜」：它是确定性词表，认不出部位的名字 `parts` 为空，
 * 只走名称匹配，不硬套部位规则。
 */
const PART_ALIASES: ReadonlyArray<{
  canonical: string;
  tokens: readonly string[];
}> = [
  { canonical: 'liver', tokens: ['肝脏', '肝', 'liver'] },
  { canonical: 'meat', tokens: ['肉', 'flesh', 'meat'] },
  { canonical: 'breast', tokens: ['胸', 'breast'] },
  { canonical: 'leg', tokens: ['腿', 'thigh', 'drumstick', 'leg'] },
  { canonical: 'wing', tokens: ['翅膀', '翅', 'wing'] },
  { canonical: 'heart', tokens: ['心脏', '心', 'heart'] },
  { canonical: 'gizzard', tokens: ['胗', '肫', 'gizzard'] },
  { canonical: 'kidney', tokens: ['肾脏', '肾', '腰', 'kidney'] },
  { canonical: 'stomach', tokens: ['肚', '胃', 'tripe', 'stomach'] },
  { canonical: 'intestine', tokens: ['肠', 'intestine'] },
  { canonical: 'lung', tokens: ['肺', 'lung'] },
  { canonical: 'brain', tokens: ['脑', 'brain'] },
  { canonical: 'tongue', tokens: ['舌', 'tongue'] },
  { canonical: 'ear', tokens: ['耳', 'ear'] },
  { canonical: 'tail', tokens: ['尾', 'tail'] },
  {
    canonical: 'foot',
    tokens: ['爪', '蹄', '脚', 'feet', 'foot', 'paw', 'trotter'],
  },
  { canonical: 'neck', tokens: ['颈', '脖子', 'neck'] },
  { canonical: 'head', tokens: ['头', 'head'] },
  { canonical: 'skin', tokens: ['皮', 'skin'] },
  { canonical: 'blood', tokens: ['血', 'blood'] },
  { canonical: 'bone', tokens: ['骨头', '骨', 'bone'] },
  { canonical: 'rib', tokens: ['排骨', '肋', 'ribs', 'rib'] },
  { canonical: 'loin', tokens: ['里脊', 'tenderloin', 'loin'] },
  { canonical: 'brisket', tokens: ['腩', 'brisket'] },
  { canonical: 'shoulder', tokens: ['肩', 'shoulder'] },
  { canonical: 'fat', tokens: ['脂肪', '肥', 'fat'] },
  { canonical: 'egg', tokens: ['蛋', 'egg'] },
];

const HAN_SCRIPT = /\p{Script=Han}/u;

const LATIN_PART_BY_TOKEN = new Map<string, string>();
const CJK_PART_ALIASES: Array<{ token: string; canonical: string }> = [];

for (const alias of PART_ALIASES) {
  for (const token of alias.tokens) {
    if (/^[a-z]+$/u.test(token)) {
      LATIN_PART_BY_TOKEN.set(token, alias.canonical);
    } else if (HAN_SCRIPT.test(token)) {
      CJK_PART_ALIASES.push({ token, canonical: alias.canonical });
    }
  }
}

// 长词优先：肝脏 要整体去掉，不能先去掉 肝 只剩 脏。
CJK_PART_ALIASES.sort((left, right) => right.token.length - left.token.length);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 按标点/空白切词，保留中英日文字与数字；全角先归一。 */
function tokenizeName(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** 拉丁部位词按整词匹配，允许简单复数（livers / kidneys）。 */
function latinPartCanonical(token: string): string | null {
  const direct = LATIN_PART_BY_TOKEN.get(token);
  if (direct) return direct;
  if (token.endsWith('s')) {
    return LATIN_PART_BY_TOKEN.get(token.slice(0, -1)) ?? null;
  }
  return null;
}

function analyzeToken(token: string): { head: string; parts: string[] } {
  const directLatin = latinPartCanonical(token);
  if (directLatin) {
    return { head: '', parts: [directLatin] };
  }

  const parts: string[] = [];
  let remainder = token;

  if (HAN_SCRIPT.test(remainder)) {
    for (const alias of CJK_PART_ALIASES) {
      if (!remainder.includes(alias.token)) continue;
      parts.push(alias.canonical);
      remainder = remainder.split(alias.token).join('');
    }

    const trailingLatin = remainder ? latinPartCanonical(remainder) : null;
    if (trailingLatin) {
      return { head: '', parts: [...parts, trailingLatin] };
    }
  }

  return { head: remainder, parts };
}

function analyzeName(value: string): NameAnalysis {
  const parts = new Set<string>();
  const headTokens: string[] = [];

  for (const token of tokenizeName(value)) {
    const analysis = analyzeToken(token);
    analysis.parts.forEach((part) => parts.add(part));
    if (analysis.head) {
      headTokens.push(analysis.head);
    }
  }

  return { head: headTokens.join(''), parts };
}

function uniqueNonEmptyText(
  values: ReadonlyArray<string | null | undefined>,
): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || result.includes(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}

function arePartsDisjoint(left: Set<string>, right: Set<string>): boolean {
  for (const part of left) {
    if (right.has(part)) return false;
  }
  return true;
}

function buildQueryAnalysis(
  input: FindCandidatesInput,
  expansions: readonly QueryTerm[] = [],
): QueryAnalysis {
  const names = uniqueNonEmptyText([input.name, input.nameEn]);
  const analyses = names.map(analyzeName);
  const parts = new Set<string>();
  for (const analysis of analyses) {
    analysis.parts.forEach((part) => parts.add(part));
  }

  // 库里绝大多数词条只有英文名，中文检索词必须靠词典 / AI 翻译展开成外文词。
  // 展开词由调用方先查词典、词典没有再问模型；这里只负责去重与排序。
  const terms: QueryTerm[] = [];
  const seen = new Set<string>();
  for (const term of [
    ...names.map((name) => ({ text: name, matchedBy: null })),
    ...expansions,
  ]) {
    const key = normalizeNameForMatch(term.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
  }

  const keywords = uniqueNonEmptyText(terms.map((term) => term.text));

  return { names, terms, analyses, parts, keywords };
}

/**
 * 说出「这一对名字是怎么对上的」。
 *
 * 只做确定性判断：完全相等 → 部分包含 → 其余算 FUZZY。
 * 词典 / AI 翻译展开词的来源由调用方直接标记，不在这里猜。
 * 分数仍由 `scoreIngredientSourceNameMatch` 给，两者不能互相替代。
 */
function classifyMatchMethod(
  queryName: string,
  sourceName: string,
): CandidateMatchMethod {
  const query = normalizeNameForMatch(queryName);
  const source = normalizeNameForMatch(sourceName);
  if (!query || !source) {
    return 'FUZZY';
  }

  const chinese = HAN_SCRIPT.test(queryName) || HAN_SCRIPT.test(sourceName);
  if (query === source) {
    return chinese ? 'ZH_EXACT' : 'EN_EXACT';
  }
  if (query.includes(source) || source.includes(query)) {
    return chinese ? 'ZH_PARTIAL' : 'EN_PARTIAL';
  }
  return 'FUZZY';
}

/**
 * 名字匹配：先用现有打分器（`scoreIngredientSourceNameMatch`，营养治理工作台同款），
 * 再叠加部位守卫。
 *
 * 两种「同名不同部位」：
 * 1. 名字本身对得上，但部位冲突——如 牛肉 命中 Beef, liver（别名 beef 匹配）。
 * 2. 名字对不上、但去掉部位词后头部相同——如 兔肝 vs 兔肉、鸡肝 vs 鸡胸。
 *
 * 两种情况都压到 `DIFFERENT_PART_SCORE` 并带备注，不当同名命中。
 * 同时保留最高分那一对（关键词 / 词条名 / 匹配方式），供页面展示匹配依据。
 */
function scoreSourceRecord(
  query: QueryAnalysis,
  record: SourceRecordMeta,
): MatchOutcome | null {
  const sourceNames = uniqueNonEmptyText([record.foodName, record.foodNameEn]);

  let bestScore = 0;
  let bestEvidence: Pick<
    MatchOutcome,
    'matchedBy' | 'matchedKeyword' | 'matchedSourceName'
  > | null = null;
  const matchedTerms: string[] = [];
  for (const term of query.terms) {
    for (const sourceName of sourceNames) {
      const { score } = scoreIngredientSourceNameMatch({
        ingredientName: term.text,
        sourceFoodName: sourceName,
        sourceType: record.sourceType,
        // 候选检索只认数据库词典；手写表已经由种子导入，不再参与打分。
        allowStaticChineseEnglishAliases: false,
      });
      if (score >= MIN_MATCH_SCORE && !matchedTerms.includes(term.text)) {
        matchedTerms.push(term.text);
      }
      if (bestEvidence === null || score > bestScore) {
        bestScore = score;
        bestEvidence = {
          matchedBy:
            term.matchedBy ?? classifyMatchMethod(term.text, sourceName),
          matchedKeyword: term.text,
          matchedSourceName: sourceName,
        };
      }
    }
  }

  const evidence = bestEvidence ?? {
    matchedBy: 'FUZZY' as const,
    matchedKeyword: query.terms[0]?.text ?? '',
    matchedSourceName: sourceNames[0] ?? '',
  };

  const sourceAnalyses = sourceNames.map(analyzeName);
  const sourceParts = new Set<string>();
  for (const analysis of sourceAnalyses) {
    analysis.parts.forEach((part) => sourceParts.add(part));
  }

  const partConflict =
    bestScore >= MIN_MATCH_SCORE &&
    query.parts.size > 0 &&
    sourceParts.size > 0 &&
    arePartsDisjoint(query.parts, sourceParts);

  if (partConflict) {
    return {
      score: DIFFERENT_PART_SCORE,
      differentPart: true,
      matchedTerms,
      ...evidence,
    };
  }

  for (const queryAnalysis of query.analyses) {
    if (queryAnalysis.parts.size === 0 || !queryAnalysis.head) continue;

    for (const sourceAnalysis of sourceAnalyses) {
      if (sourceAnalysis.parts.size === 0 || !sourceAnalysis.head) continue;
      if (queryAnalysis.head !== sourceAnalysis.head) continue;
      if (!arePartsDisjoint(queryAnalysis.parts, sourceAnalysis.parts)) {
        continue;
      }

      return {
        score: DIFFERENT_PART_SCORE,
        differentPart: true,
        matchedTerms,
        ...evidence,
      };
    }
  }

  if (bestScore < MIN_MATCH_SCORE) {
    return null;
  }

  return {
    score: bestScore,
    differentPart: false,
    matchedTerms,
    ...evidence,
  };
}

/** 来源记录 `normalizedNutrition.meta.sampleState` 的原文；没有则 null。 */
function readSampleState(profile: unknown): string | null {
  if (!isRecord(profile) || !isRecord(profile.meta)) {
    return null;
  }

  const sampleState = profile.meta.sampleState;
  return typeof sampleState === 'string' && sampleState.trim()
    ? sampleState
    : null;
}

/**
 * 没有可用的 `sampleState` 时，从词条名推生熟：
 *
 * - 词里有 `raw` / `生` 这类整词 → RAW（「花生」「生菜」不会被切成「生」）；
 * - 词里有 `cooked` / `熟` → COOKED；
 * - 认得出水煮/蒸/烤/煎 → COOKED（做法本身说明是熟的）；
 * - 都认不出 → null，由调用方标 `STATE_UNKNOWN`，不猜。
 */
function derivePreparationStateFromName(
  foodName: string | null | undefined,
): PreparationState | null {
  if (!foodName) return null;

  for (const token of tokenizeName(foodName)) {
    const state = normalizePreparationState(token);
    if (state) return state;
  }

  return classifyCookingMethod(foodName) ? 'COOKED' : null;
}

/**
 * 状态优先取来源给的 `sampleState`（库里 2/3 的 USDA 词条没有这一项，
 * 所以必须能回退到名字）；两边都没有就返回 null，不猜。
 */
function derivePreparationState(
  record: SourceRecordMeta,
  profile: unknown,
): PreparationState | null {
  const sampleState = readSampleState(profile);
  if (sampleState) {
    const normalized = normalizePreparationState(sampleState);
    if (normalized) return normalized;
  }

  return (
    derivePreparationStateFromName(record.foodName) ??
    derivePreparationStateFromName(record.foodNameEn)
  );
}

/** 做法只认得出四种；认不出返回 null（不等于「其它做法」）。 */
function resolveCookingMethod(record: SourceRecordMeta): CookingMethod | null {
  return (
    classifyCookingMethod(record.foodName) ??
    classifyCookingMethod(record.foodNameEn)
  );
}

/**
 * 把 `normalizedNutrition` 映射成营养审计函数认识的营养素键。
 *
 * 只做字段搬运，不重算覆盖率：覆盖率与缺失项全部由
 * `auditNutritionProfileForImport` 给出（与导入管线同一套算法）。
 */
function buildAuditNutrients(
  profile: unknown,
): Record<string, NutritionImportNutrientValue> {
  const nutrients: Record<string, NutritionImportNutrientValue> = {};
  if (!isRecord(profile)) return nutrients;

  for (const field of NUTRITION_FIELD_CATALOG) {
    const [tabKey, fieldKey] = field.fieldPath.split('.') as [string, string];
    const tab = profile[tabKey];
    if (!isRecord(tab)) continue;

    const value = tab[fieldKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;

    nutrients[fieldKey] = { value, unit: field.unit };
  }

  return nutrients;
}

function measureCoverage(profile: unknown): {
  coveragePercent: number;
  missingFields: string[];
} {
  const audit = auditNutritionProfileForImport({
    nutrients: buildAuditNutrients(profile),
  });

  return {
    coveragePercent: audit.essentialCoveragePercent,
    missingFields: [...audit.missingEssentialNutrients],
  };
}

/** 调用方传的 limit 收紧成非负整数；非法值回落到默认值。 */
function normalizeCandidateLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_CANDIDATE_LIMIT;
  }

  return Math.max(0, Math.floor(limit));
}

/** `listNutritionNames` 的 limit：默认 3000，上限 3000，非法值回落默认。 */
function normalizeNameListLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_NAME_LIST_LIMIT;
  }
  return Math.min(
    MAX_NAME_LIST_LIMIT,
    Math.max(1, Math.floor(limit)),
  );
}

function toCandidateRow(candidate: ScoredCandidate): CandidateRow {
  return {
    sourceRecordId: candidate.record.id,
    sourceType: candidate.record.sourceType,
    foodName: candidate.record.foodName,
    foodNameEn: candidate.record.foodNameEn,
    preparationState: candidate.preparationState,
    cookingMethod: candidate.cookingMethod,
    coveragePercent: candidate.coveragePercent,
    missingFields: candidate.missingFields,
    matchScore: candidate.matchScore,
    matchedBy: candidate.matchedBy,
    matchedKeyword: candidate.matchedKeyword,
    matchedSourceName: candidate.matchedSourceName,
    notes: candidate.notes,
  };
}

/**
 * 排序：匹配分优先（接口约定）；同分时状态与查询一致的在前，
 * 其次覆盖率高的在前，再按词条名稳定排序。
 *
 * 后两级只影响同分词的先后与截断——宽泛名字（如「牛肉」）同分的词条有上千条，
 * 不能靠 uuid 随机决定谁进前 50。
 */
function compareScoredCandidates(
  left: ScoredCandidate,
  right: ScoredCandidate,
): number {
  return (
    right.matchScore - left.matchScore ||
    left.stateRank - right.stateRank ||
    right.coveragePercent - left.coveragePercent ||
    left.record.foodName.localeCompare(right.record.foodName) ||
    left.record.id.localeCompare(right.record.id)
  );
}

function summarizeCoverage(
  state: PreparationState,
  rows: CandidateRow[],
): CandidateSearchCoverage {
  if (rows.length === 0) {
    return {
      state,
      candidateCount: 0,
      bestCoveragePercent: null,
      bestMissingFieldCount: null,
    };
  }

  const best = rows.reduce((current, row) =>
    row.coveragePercent > current.coveragePercent ? row : current,
  );

  return {
    state,
    candidateCount: rows.length,
    bestCoveragePercent: best.coveragePercent,
    bestMissingFieldCount: best.missingFields.length,
  };
}

function buildEmptyResult(
  state: PreparationState,
  keywords: string[] = [],
  notice: string | null = null,
): CandidateSearchResult {
  return {
    candidates: [],
    excludedCount: 0,
    coverage: summarizeCoverage(state, []),
    keywords: [...keywords],
    ...(notice ? { notice } : {}),
  };
}

/** 一次查询里，某个中文词拿到的模型翻译结果。 */
interface QueryAiTranslation {
  zhTerm: string;
  result: AiTranslationResult;
}

interface QueryExpansions {
  terms: QueryTerm[];
  aiTranslations: QueryAiTranslation[];
  /** 词典没有、模型也不可用时的降级提示；正常情况为 null。 */
  notice: string | null;
}

/**
 * ② 营养依据站的本地候选检索。
 *
 * 只读本地营养库（`nutrition_source_record.status = ACTIVE`），按口径卡的名字
 * 与状态给出候选；线上兜底检索是 Task 13 的
 * `IngredientCreationOnlineService`，不在这里做。
 *
 * 中文检索词的扩展（设计决定 2026-10-24）：
 * - 先查 `ingredient_name_alias` 词典，命中就把该中文词的所有外文词一起检索，
 *   并累加 `hitCount`；
 * - 词典里没有，就让模型翻译 2-4 个外文候选词；
 * - 翻译词真的命中来源才写回词典（`source = AI_TRANSLATION`），
 *   一个都没命中不落库，避免污染；
 * - 模型没配 / 调用失败就只用词典，零命中时返回空结果 + 提示，不报 500。
 *
 * 生熟与做法策略（设计文档决定 #4，2026-10-22）：
 * - 生查询不返回熟词条；熟查询不回退到生词条（熟档案不得由生档案推算）；
 * - 熟查询里烤 / 煎不进候选，水煮 / 蒸排在其它可接受做法前面；
 * - 状态推导不出来就 `preparationState = null` 并标 `STATE_UNKNOWN`，不猜、不丢；
 * - 熟查询里认不出做法（如 `simmered`）的词条保留，但排在可接受做法之后，
 *   并标 `COOKING_METHOD_UNKNOWN`，由人来判断能不能用。
 */
@Injectable()
export class IngredientCreationCandidateService {
  private readonly logger = new Logger(IngredientCreationCandidateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: IngredientNameAliasService,
  ) {}

  /**
   * 只按名字摆事实：返回真实命中的词条名（最多 3000 条），**不做分类**。
   *
   * 中文关键词仍先查词典、词典没有就让模型翻译；翻译词真的命中来源才写回词典
   * （与 `findCandidates` 同一套 alias 服务与落库策略）。
   *
   * 与候选检索的区别：这里不看生熟 / 做法 / 覆盖率，不截断到 50 条，
   * 也不判断这条词条有没有营养数据 —— 这些交给后面的 AI 分类与人的选择。
   */
  async listNutritionNames(
    input: ListNutritionNamesInput,
  ): Promise<ListNutritionNamesResult> {
    const baseNames = uniqueNonEmptyText([input.keyword, input.nameEn]);
    const limit = normalizeNameListLimit(input.limit);
    if (baseNames.length === 0) {
      return { total: 0, names: [], keywords: [], notice: null };
    }

    const chineseNames = baseNames.filter((name) => HAN_SCRIPT.test(name));
    const expansions = await this.resolveQueryExpansions(chineseNames);
    const query = buildQueryAnalysis(
      {
        name: input.keyword,
        ...(input.nameEn ? { nameEn: input.nameEn } : {}),
        state: 'RAW',
      },
      expansions.terms,
    );

    const records = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceType: { in: [...CANDIDATE_SEARCH_SOURCE_TYPES] },
      },
      select: {
        id: true,
        sourceType: true,
        foodName: true,
        foodNameEn: true,
      },
    });

    const matched: Array<{ record: SourceRecordMeta; score: number }> = [];
    const firstSourceRecordIdByTerm = new Map<string, string>();
    for (const record of records) {
      const match = scoreSourceRecord(query, record);
      if (!match) continue;
      matched.push({ record, score: match.score });
      for (const term of match.matchedTerms) {
        if (!firstSourceRecordIdByTerm.has(term)) {
          firstSourceRecordIdByTerm.set(term, record.id);
        }
      }
    }

    await this.recordAiTranslationHits(
      expansions.aiTranslations,
      firstSourceRecordIdByTerm,
    );

    matched.sort(
      (left, right) =>
        right.score - left.score ||
        left.record.foodName.localeCompare(right.record.foodName) ||
        left.record.id.localeCompare(right.record.id),
    );

    return {
      total: matched.length,
      names: matched.slice(0, limit).map(({ record }) => ({
        id: record.id,
        name: record.foodName,
        sourceType: record.sourceType,
      })),
      keywords: query.keywords,
      notice: expansions.notice,
    };
  }

  /**
   * 中文词 → 外文检索词。
   *
   * 词典命中：一次取出该中文词的所有外文词（可能多个同义词），并累加使用次数。
   * 词典没有：交给模型翻译 2-4 个候选词；模型不可用时只返回空展开 + 提示。
   */
  private async resolveQueryExpansions(
    chineseNames: readonly string[],
  ): Promise<QueryExpansions> {
    if (chineseNames.length === 0) {
      return { terms: [], aiTranslations: [], notice: null };
    }

    const aliases = await this.aliasService.findAliases(chineseNames);
    const terms: QueryTerm[] = aliases.map((alias) => ({
      text: alias.foreignTerm,
      matchedBy: 'DICTIONARY',
    }));

    // 「表命中」= 这个中文词在词典里查到了，本次检索确实用了它。
    if (aliases.length > 0) {
      await this.aliasService.markAliasesHit(aliases.map((alias) => alias.id));
    }

    const covered = new Set(aliases.map((alias) => alias.zhTerm));
    const missing = chineseNames.filter((name) => !covered.has(name));
    const aiTranslations: QueryAiTranslation[] = [];
    let unavailable = false;

    for (const zhTerm of missing) {
      const result = await this.aliasService.translateToForeignTerms(zhTerm);
      if (!result) {
        unavailable = true;
        continue;
      }
      aiTranslations.push({ zhTerm, result });
      for (const translation of result.translations) {
        terms.push({
          text: translation.term,
          matchedBy: 'AI_TRANSLATION',
        });
      }
    }

    return {
      terms,
      aiTranslations,
      notice:
        unavailable && aiTranslations.length === 0
          ? AI_TRANSLATION_UNAVAILABLE_NOTICE
          : null,
    };
  }

  /**
   * 只写「真的命中了来源」的翻译词；每个词记第一次命中的来源记录。
   * 写词典失败不能把已经查到的候选打掉，所以这里只记日志。
   */
  private async recordAiTranslationHits(
    aiTranslations: readonly QueryAiTranslation[],
    firstSourceRecordIdByTerm: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const { zhTerm, result } of aiTranslations) {
      const hits: AiTranslationHit[] = [];
      for (const translation of result.translations) {
        const sourceRecordId = firstSourceRecordIdByTerm.get(translation.term);
        if (!sourceRecordId) continue;
        hits.push({ ...translation, sourceRecordId });
      }
      if (hits.length === 0) continue;

      try {
        await this.aliasService.recordAiTranslation({
          zhTerm,
          translations: hits,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[ingredient-candidate] 写词典失败 zh=${zhTerm} terms=${hits
            .map((hit) => hit.term)
            .join(',')}: ${reason}`,
        );
      }
    }
  }

  /**
   * @param limit 最多返回多少条候选（默认 50）；截断前已按匹配分、
   * 状态一致、覆盖率、词条名排好序，同样的库状态下结果确定。
   */
  async findCandidates(
    input: FindCandidatesInput,
    limit: number = DEFAULT_CANDIDATE_LIMIT,
  ): Promise<CandidateSearchResult> {
    const baseNames = uniqueNonEmptyText([input.name, input.nameEn]);
    if (baseNames.length === 0) {
      return buildEmptyResult(input.state);
    }

    // 先把中文词展开成外文词：词典优先，词典没有才问模型。
    const chineseNames = baseNames.filter((name) => HAN_SCRIPT.test(name));
    const expansions = await this.resolveQueryExpansions(chineseNames);
    const query = buildQueryAnalysis(input, expansions.terms);

    // 第一段只取元数据：库里有约 1.96 万条来源，整份 normalizedNutrition 是
    // 200MB 量级，必须先按名字筛完，再去取营养档案（见下一段）。
    const records = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceType: { in: [...CANDIDATE_SEARCH_SOURCE_TYPES] },
      },
      select: {
        id: true,
        sourceType: true,
        foodName: true,
        foodNameEn: true,
      },
    });

    const matched: Array<{ record: SourceRecordMeta; match: MatchOutcome }> =
      [];
    /** 每个查询词第一次命中的来源记录；写词典时记 sourceRecordId 用。 */
    const firstSourceRecordIdByTerm = new Map<string, string>();
    for (const record of records) {
      const match = scoreSourceRecord(query, record);
      if (!match) continue;
      matched.push({ record, match });
      for (const term of match.matchedTerms) {
        if (!firstSourceRecordIdByTerm.has(term)) {
          firstSourceRecordIdByTerm.set(term, record.id);
        }
      }
    }

    // 翻译的词一个都没命中 → 不写词典（避免把错译沉淀进去）。
    await this.recordAiTranslationHits(
      expansions.aiTranslations,
      firstSourceRecordIdByTerm,
    );

    if (matched.length === 0) {
      return buildEmptyResult(input.state, query.keywords, expansions.notice);
    }

    // 第二段只取名字对得上的词条的营养档案：生熟状态要靠 meta.sampleState，
    // 覆盖率要靠档案本身。
    const profiles = await this.prisma.nutritionSourceRecord.findMany({
      where: { id: { in: matched.map((entry) => entry.record.id) } },
      select: { id: true, normalizedNutrition: true },
    });
    const profileById = new Map(
      profiles.map(
        (profile) => [profile.id, profile.normalizedNutrition] as const,
      ),
    );

    let excludedCount = 0;
    const scored: ScoredCandidate[] = [];

    for (const { record, match } of matched) {
      const profile = profileById.get(record.id);
      if (profile === undefined || profile === null) {
        // 没有营养数据就做不了来源，跳过（库里目前没有这种行）。
        continue;
      }

      const preparationState = derivePreparationState(record, profile);

      if (input.state === 'RAW' && preparationState === 'COOKED') {
        continue;
      }
      if (input.state === 'COOKED' && preparationState === 'RAW') {
        // 熟档案不得由生档案推算：生词条不能拿来补熟档案。
        continue;
      }

      const cookingMethod = resolveCookingMethod(record);
      if (
        input.state === 'COOKED' &&
        cookingMethod !== null &&
        !isCookedSourceAcceptable(cookingMethod)
      ) {
        // 只数「名字对得上、因烤/煎被排除」的词条；易混项不算，
        // 页面上的「另有 N 条因烤/煎被排除」才说得准。
        if (!match.differentPart) {
          excludedCount += 1;
        }
        continue;
      }

      const notes: string[] = [];
      if (match.differentPart) {
        notes.push('DIFFERENT_PART');
      }
      if (preparationState === null) {
        notes.push('STATE_UNKNOWN');
      }
      if (cookingMethod !== null) {
        notes.push(`COOKING_METHOD_${cookingMethod}`);
      } else if (input.state === 'COOKED') {
        // 熟查询里认不出做法：保留候选但打标，页面要让人自己判断。
        notes.push('COOKING_METHOD_UNKNOWN');
      }

      const matchScore =
        !match.differentPart &&
        input.state === 'COOKED' &&
        isCookedSourceAcceptable(cookingMethod)
          ? Math.min(1, match.score + GENTLE_COOKED_METHOD_WEIGHT)
          : match.score;

      const { coveragePercent, missingFields } = measureCoverage(profile);

      scored.push({
        record,
        preparationState,
        cookingMethod,
        notes,
        matchScore,
        matchedBy: match.matchedBy,
        matchedKeyword: match.matchedKeyword,
        matchedSourceName: match.matchedSourceName,
        stateRank: preparationState === input.state ? 0 : 1,
        coveragePercent,
        missingFields,
      });
    }

    const rows = scored
      .sort(compareScoredCandidates)
      .slice(0, normalizeCandidateLimit(limit))
      .map((candidate) => toCandidateRow(candidate));

    return {
      candidates: rows,
      excludedCount,
      coverage: summarizeCoverage(input.state, rows),
      keywords: query.keywords,
      // 名字命中了但全被生熟/做法筛掉，也把降级提示带上。
      ...(rows.length === 0 && expansions.notice
        ? { notice: expansions.notice }
        : {}),
    };
  }
}
