/**
 * 形态候选：把「市场标题里出现的词」和「知识库原文里出现的词」变成同一套候选。
 *
 * 这里只做纯计算：归一化、判定某条标题是否真在说这个营养素、合并两边。
 * 抓取与模型调用在 application 层。
 */
import { nutrientEnglishName } from './supplement-nutrients';
import type { Citation } from './supplement-form-advice';

export type DimensionKey = 'FORM' | 'SOURCE';

export type CandidateStatus = 'EVIDENCED' | 'MARKET_ONLY';

export type CandidateVerdict = 'RECOMMENDED' | 'ACCEPTABLE' | 'AVOID' | 'NO_EVIDENCE';

/** 归一化：小写、去掉空格/连字符/标点，中文原样保留。 */
export function normalizeTermKey(raw: string): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

/**
 * 标题里是否真的在说这个营养素。
 *
 * 为什么需要：iHerb 标题里品牌、规格、剂量混在一起，
 * 不过这一关的话，"Zinc Oxide 50 mg" 会被算成铜的一种形态。
 *
 * 别名只解决"正式名之外还怎么叫"（B12 / cobalamin / D3），
 * **不参与**形态判定——形态是抽出来的，不是配置的。
 */
const NUTRIENT_TITLE_ALIASES: Record<string, string[]> = {
  'vitamins.vitaminB12': ['b12', 'cobalamin'],
  'vitamins.vitaminB9': ['b9', 'folate', 'folicacid'],
  'vitamins.vitaminB6': ['b6', 'pyridoxine', 'p5p'],
  'vitamins.vitaminB3': ['b3', 'niacin', 'niacinamide'],
  'vitamins.vitaminB1': ['b1', 'thiamine', 'thiamin'],
  'vitamins.vitaminB2': ['b2', 'riboflavin'],
  'vitamins.vitaminB5': ['b5', 'pantothenic'],
  'vitamins.vitaminB7': ['b7', 'biotin'],
  'vitamins.vitaminD': ['d3', 'd2', 'cholecalciferol', 'ergocalciferol'],
  'vitamins.vitaminA': ['retinol', 'beta carotene'],
  'vitamins.vitaminE': ['tocopherol'],
  'vitamins.vitaminK': ['k2', 'mk7', 'mk4'],
  'vitamins.vitaminC': ['ascorbic'],
  'fattyAcids.epa': ['omega3', 'fishoil', 'epa', 'dha'],
  'fattyAcids.dha': ['omega3', 'fishoil', 'epa', 'dha'],
};

function titleAliases(nutrientKey: string): string[] {
  const english = normalizeTermKey(nutrientEnglishName(nutrientKey));
  const extras = (NUTRIENT_TITLE_ALIASES[nutrientKey] ?? []).map(normalizeTermKey);
  return [english, ...extras].filter(Boolean);
}

export function mentionsNutrient(title: string, nutrientKey: string): boolean {
  const normalized = normalizeTermKey(title);
  if (!normalized) {
    return false;
  }
  return titleAliases(nutrientKey).some((alias) => normalized.includes(alias));
}

export interface RawTerm {
  surface: string;
  title: string;
  nutrientKey: string;
}

export interface FilteredTerm {
  key: string;
  surface: string;
  count: number;
  samples: string[];
}

const SAMPLE_LIMIT = 3;

/** 过滤掉"不在说这个营养素"的标题，再把同一个词的多种写法并成一条。 */
export function filterTermsByNutrient(terms: RawTerm[]): FilteredTerm[] {
  const byKey = new Map<string, FilteredTerm>();
  for (const term of terms) {
    if (!mentionsNutrient(term.title, term.nutrientKey)) {
      continue;
    }
    const key = normalizeTermKey(term.surface);
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.samples.length < SAMPLE_LIMIT && !existing.samples.includes(term.title)) {
        existing.samples.push(term.title);
      }
      continue;
    }
    byKey.set(key, { key, surface: term.surface.trim(), count: 1, samples: [term.title] });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count);
}

export interface MarketTerm {
  key: string;
  labelZh: string;
  dimension: DimensionKey;
  count: number;
  samples: string[];
}

export interface KbCandidate {
  key: string;
  labelZh: string;
  dimension: DimensionKey;
  citations: Citation[];
  verdict: CandidateVerdict;
  reason: string;
}

export interface DimensionCandidate {
  key: string;
  labelZh: string;
  dimension: DimensionKey;
  status: CandidateStatus;
  citations: Citation[];
  verdict: CandidateVerdict;
  reason: string;
  market: { count: number; samples: string[] } | null;
}

const MARKET_ONLY_REASON = '知识库没查到依据；市场上有这个说法，买之前请自己判断';

/**
 * 合并原文与市场两边。
 *
 * 一条硬规矩：**只有市场的候选，verdict 永远是 NO_EVIDENCE**，理由也在这里写死，
 * 免得后面有人顺手给它加个"推荐"。
 */
/**
 * 同一个东西在中英文里名字不同：知识库写 `methylcobalamin`，中文站标题写「甲钴胺」。
 * 只按 key 合并会把同一形态拆成两条（一条有原文、一条"市场有但没依据"）。
 * 所以这里也按中文名对齐一次。
 */
function findMarketMatch(
  market: MarketTerm[],
  key: string,
  labelZh: string,
): MarketTerm | null {
  const byKey = market.find((term) => normalizeTermKey(term.key) === key);
  if (byKey) {
    return byKey;
  }
  const label = normalizeTermKey(labelZh);
  if (!label) {
    return null;
  }
  return market.find((term) => normalizeTermKey(term.labelZh) === label) ?? null;
}

export function mergeCandidates(kb: KbCandidate[], market: MarketTerm[]): DimensionCandidate[] {
  const result: DimensionCandidate[] = [];
  const usedMarket = new Set<string>();

  for (const item of kb) {
    const key = normalizeTermKey(item.key);
    const marketHit = findMarketMatch(market, key, item.labelZh);
    if (marketHit) {
      usedMarket.add(normalizeTermKey(marketHit.key));
    }
    result.push({
      key,
      labelZh: item.labelZh,
      dimension: item.dimension,
      status: 'EVIDENCED',
      citations: item.citations,
      verdict: item.verdict,
      reason: item.reason,
      market: marketHit
        ? { count: marketHit.count, samples: marketHit.samples }
        : null,
    });
  }

  for (const term of market) {
    const key = normalizeTermKey(term.key);
    if (usedMarket.has(key)) {
      continue;
    }
    if (result.some((item) => item.key === key)) {
      continue;
    }
    result.push({
      key,
      labelZh: term.labelZh || term.key,
      dimension: term.dimension,
      status: 'MARKET_ONLY',
      citations: [],
      verdict: 'NO_EVIDENCE',
      reason: MARKET_ONLY_REASON,
      market: { count: term.count, samples: term.samples },
    });
  }

  return collapseByLabel(result);
}

/** 中文名一样的两条合成一条：优先保留有原文的那条，引用与市场计数合并。 */
function collapseByLabel(rows: DimensionCandidate[]): DimensionCandidate[] {
  const byLabel = new Map<string, DimensionCandidate>();
  const passthrough: DimensionCandidate[] = [];

  for (const row of rows) {
    const label = normalizeTermKey(row.labelZh);
    if (!label) {
      passthrough.push(row);
      continue;
    }
    const bucket = `${row.dimension}:${label}`;
    const existing = byLabel.get(bucket);
    if (!existing) {
      byLabel.set(bucket, row);
      continue;
    }
    const evidenced = [existing, row].find((item) => item.status === 'EVIDENCED') ?? existing;
    const marketCount = (existing.market?.count ?? 0) + (row.market?.count ?? 0);
    byLabel.set(bucket, {
      ...evidenced,
      citations: mergeCitations(existing.citations, row.citations),
      market:
        marketCount > 0
          ? {
              count: marketCount,
              samples: [...new Set([...(existing.market?.samples ?? []), ...(row.market?.samples ?? [])])].slice(0, 3),
            }
          : null,
    });
  }

  return [...byLabel.values(), ...passthrough];
}

function mergeCitations(a: Citation[], b: Citation[]): Citation[] {
  const seen = new Set(a.map((item) => `${item.documentId}#${item.page}#${item.quote}`));
  const merged = [...a];
  for (const item of b) {
    const key = `${item.documentId}#${item.page}#${item.quote}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}
