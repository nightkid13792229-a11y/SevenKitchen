import { Injectable } from '@nestjs/common';
import {
  classifyCookingMethod,
  isCookedSourceAcceptable,
  normalizePreparationState,
  type CookingMethod,
  type PreparationState,
} from '../../domain/ingredient-creation/preparation-state';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import type { NutritionGovernanceSourceType } from '../../domain/nutrition-governance/nutrition-governance.types';
import { scoreIngredientSourceNameMatch } from '../../domain/nutrition-governance/nutrition-governance.utils';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  auditNutritionProfileForImport,
  type NutritionImportNutrientValue,
} from '../standard-ingredient-import/nutrition-audit';
import type {
  CandidateRow,
  CandidateSearchCoverage,
  CandidateSearchResult,
} from './ingredient-creation.types';

export interface FindCandidatesInput {
  /** 中文规范名（必填）。 */
  name: string;
  /** 英文名（口径卡里 AI 给的，或人工填的）；没有时只能匹配中文词条。 */
  nameEn?: string;
  /** 要找的是生档案还是熟档案。 */
  state: PreparationState;
}

/** 补剂标签不是食材来源，不进候选。 */
const NON_FOOD_SOURCE_TYPES: readonly NutritionGovernanceSourceType[] = [
  'SUPPLEMENT_LABEL',
];

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
  names: string[];
  analyses: NameAnalysis[];
  /** 所有查询名字的部位并集，用于跨语言比较（牛肉 vs Beef, liver）。 */
  parts: Set<string>;
}

interface MatchOutcome {
  score: number;
  differentPart: boolean;
}

interface ScoredCandidate {
  record: SourceRecordMeta;
  preparationState: PreparationState | null;
  cookingMethod: CookingMethod | null;
  notes: string[];
  matchScore: number;
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

function buildQueryAnalysis(input: FindCandidatesInput): QueryAnalysis {
  const names = uniqueNonEmptyText([input.name, input.nameEn]);
  const analyses = names.map(analyzeName);
  const parts = new Set<string>();
  for (const analysis of analyses) {
    analysis.parts.forEach((part) => parts.add(part));
  }

  return { names, analyses, parts };
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
 */
function scoreSourceRecord(
  query: QueryAnalysis,
  record: SourceRecordMeta,
): MatchOutcome | null {
  const sourceNames = uniqueNonEmptyText([record.foodName, record.foodNameEn]);

  let bestScore = 0;
  for (const queryName of query.names) {
    for (const sourceName of sourceNames) {
      const { score } = scoreIngredientSourceNameMatch({
        ingredientName: queryName,
        sourceFoodName: sourceName,
        sourceType: record.sourceType,
      });
      if (score > bestScore) {
        bestScore = score;
      }
    }
  }

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
    return { score: DIFFERENT_PART_SCORE, differentPart: true };
  }

  for (const queryAnalysis of query.analyses) {
    if (queryAnalysis.parts.size === 0 || !queryAnalysis.head) continue;

    for (const sourceAnalysis of sourceAnalyses) {
      if (sourceAnalysis.parts.size === 0 || !sourceAnalysis.head) continue;
      if (queryAnalysis.head !== sourceAnalysis.head) continue;
      if (!arePartsDisjoint(queryAnalysis.parts, sourceAnalysis.parts)) {
        continue;
      }

      return { score: DIFFERENT_PART_SCORE, differentPart: true };
    }
  }

  if (bestScore < MIN_MATCH_SCORE) {
    return null;
  }

  return { score: bestScore, differentPart: false };
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

function buildEmptyResult(state: PreparationState): CandidateSearchResult {
  return {
    candidates: [],
    excludedCount: 0,
    coverage: summarizeCoverage(state, []),
  };
}

/**
 * ② 营养依据站的本地候选检索。
 *
 * 只读本地营养库（`nutrition_source_record.status = ACTIVE`），按口径卡的名字
 * 与状态给出候选；不联网、不写库。线上兜底检索是 Task 13 的
 * `IngredientCreationOnlineService`，不在这里做。
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param limit 最多返回多少条候选（默认 50）；截断前已按匹配分、
   * 状态一致、覆盖率、词条名排好序，同样的库状态下结果确定。
   */
  async findCandidates(
    input: FindCandidatesInput,
    limit: number = DEFAULT_CANDIDATE_LIMIT,
  ): Promise<CandidateSearchResult> {
    const query = buildQueryAnalysis(input);
    if (query.names.length === 0) {
      return buildEmptyResult(input.state);
    }

    // 第一段只取元数据：库里有约 1.96 万条来源，整份 normalizedNutrition 是
    // 200MB 量级，必须先按名字筛完，再去取营养档案（见下一段）。
    const records = await this.prisma.nutritionSourceRecord.findMany({
      where: {
        status: 'ACTIVE',
        sourceType: { notIn: [...NON_FOOD_SOURCE_TYPES] },
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
    for (const record of records) {
      const match = scoreSourceRecord(query, record);
      if (match) {
        matched.push({ record, match });
      }
    }

    if (matched.length === 0) {
      return buildEmptyResult(input.state);
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
    };
  }
}
