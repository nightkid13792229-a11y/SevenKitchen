import { classifyCookingMethod } from '../../domain/ingredient-creation/preparation-state';
import type {
  NutritionRecordMethod,
  NutritionRecordState,
} from './ingredient-name-classifier.service';

/**
 * 「全部匹配名字一次汇总」的输入 / 输出。
 *
 * 为什么单独做汇总：模糊词（「牛肉」）能命中一两千条，逐条让模型判断会
 * 把输出 token 和 3 分钟预算全部烧光。汇总只要求模型数数 + 给每组 2-3 个
 * 代表名，输出控制在 2000 token 以内；逐条精判只留给最终展示的 ≤10 条。
 */
export interface NameSummaryItem {
  /** `nutrition_source_record.id`；汇总本身不用，但调用方要按 id 回查。 */
  id?: string;
  name: string;
}

export interface NameSummary {
  total: number;
  byState: Record<NutritionRecordState, number>;
  byMethod: Record<NutritionRecordMethod, number>;
  /** 部位 key → 条数；只含真实出现过的 key。 */
  byCutGroup: Record<string, number>;
  /** 部位 key → 2-3 个真实词条名（原样照抄）。 */
  examples: Record<string, string[]>;
  /** 明显不是目标食材的品种 / 副产品代表名。 */
  irrelevantExamples: string[];
}

export interface SummarizeNamesInput {
  /** 用户想找的目标词，例如「牛肉」；只用于给模型消歧。 */
  targetName: string;
  items: NameSummaryItem[];
}

export interface SummarizeNamesResult extends NameSummary {
  /** true = 模型汇总失败 / 输出非法，数字来自名字关键词粗略统计。 */
  degraded: boolean;
  /** 降级原因（给工具提示用）；正常为 null。 */
  notice: string | null;
}

/** 汇总输出硬上限：只数数 + 代表名，2000 token 足够。 */
export const NAME_SUMMARY_MAX_TOKENS = 2000;

/** 汇总请求最多等 60 秒；再长就该降级，不能吃掉整轮 240 秒预算。 */
export const NAME_SUMMARY_TIMEOUT_MS = 60_000;

/** 正常汇总远用不到这么多组 / 例子；超过就按「输出超长」判非法。 */
const MAX_CUT_GROUPS = 50;
const MAX_EXAMPLE_NAMES = 200;
const MAX_IRRELEVANT_EXAMPLES = 50;
/** 解析后实际保留的上限，避免把模型的长输出原样塞回上下文。 */
const KEPT_CUT_GROUPS = 20;
const KEPT_EXAMPLE_GROUPS = 12;
const KEPT_EXAMPLES_PER_GROUP = 3;
const KEPT_IRRELEVANT_EXAMPLES = 5;

const STATE_KEYS: readonly NutritionRecordState[] = [
  'RAW',
  'COOKED',
  'UNKNOWN',
];
const METHOD_KEYS: readonly NutritionRecordMethod[] = [
  'BOILED',
  'STEAMED',
  'GRILLED',
  'FRIED',
  'OTHER',
  'NONE',
];

/**
 * 汇总提示词。
 *
 * 核心约束：只输出小 JSON；不要逐条结果；总数的口径与输入一致。
 * 例子必须原样照抄，方便工具按名字回查 id。
 */
export const NAME_SUMMARY_SYSTEM_PROMPT = [
  '你是营养数据库的词条名汇总员。用户会给一个目标食材（如「牛肉」）和本地库匹配到的全部词条名。',
  '你只读名字做一次汇总，**绝对不要逐条输出判断**；只输出一个小 JSON。',
  '',
  '判断口径（只看名字）：',
  '1) state：RAW=生的（raw / fresh / 生 / 刺身）；COOKED=熟的（cooked / boiled / steamed / grilled / fried / roasted / 蒸 / 煮 / 烤 / 煎 / 炸）；',
  '   名字只写食材本身、看不出加工 → UNKNOWN。不要把「生菜」「花生」里的「生」当成生熟。',
  '2) method：熟食做法。BOILED（水煮/煮/boiled/simmered）、STEAMED（蒸/steamed）、GRILLED（烤/烘烤/烧/grilled/roasted/baked）、',
  '   FRIED（煎/炸/炒/pan-fried/deep-fried）、OTHER（认得出是熟但不属于上四类）、NONE（生 / 未知 / 看不出做法）。',
  '3) cutGroup：部位，用稳定英文 key（ground / tenderloin / loin / round / brisket / shank / chuck / rib / breast / thigh / wing / liver / heart / kidney / other）。',
  '   名字里没有部位信息就归 other；不要硬猜。',
  '4) irrelevantExamples：明显不是目标食材的品种 / 副产品代表名（例如目标是牛肉时的「Beef, variety meats…, liver」「Beef, tongue…」）。没有就给空数组。',
  '',
  '输出要求：',
  '- 只输出一个 JSON 对象，不要 Markdown、不要解释、不要逐条 results；总输出 ≤2000 token。',
  '- total 等于输入词条数；byState 三项之和等于 total；byMethod 六项都要有（没有写 0）。',
  '- byCutGroup 只列条数 >0 的组，最多 8 组；每组必须在 examples 里给 2-3 个**原样照抄**的词条名。',
  '- irrelevantExamples 最多 5 条，原样照抄。',
  '- 形如：{"total":1651,"byState":{"RAW":420,"COOKED":980,"UNKNOWN":251},',
  '  "byMethod":{"BOILED":300,"STEAMED":180,"GRILLED":260,"FRIED":120,"OTHER":120,"NONE":420},',
  '  "byCutGroup":{"ground":210,"chuck":40,"brisket":30},',
  '  "examples":{"ground":["Beef, ground, 85% lean","Beef, ground, raw"],"chuck":["Beef, chuck, boiled"]},',
  '  "irrelevantExamples":["Beef, variety meats and by-products, liver","Beef, tongue, raw"]}',
].join('\n');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCount(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueTexts(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function emptyStateCounts(): Record<NutritionRecordState, number> {
  return { RAW: 0, COOKED: 0, UNKNOWN: 0 };
}

function emptyMethodCounts(): Record<NutritionRecordMethod, number> {
  return {
    BOILED: 0,
    STEAMED: 0,
    GRILLED: 0,
    FRIED: 0,
    OTHER: 0,
    NONE: 0,
  };
}

export function emptyNameSummary(): NameSummary {
  return {
    total: 0,
    byState: emptyStateCounts(),
    byMethod: emptyMethodCounts(),
    byCutGroup: {},
    examples: {},
    irrelevantExamples: [],
  };
}

/**
 * 解析模型汇总。返回 null 表示「输出不可用」：调用方改用关键词粗略统计，
 * 不抛异常、不把一次坏输出变成 500。
 *
 * `itemCount` 是输入的词条数，作为 total 的权威口径 —— 汇总的用途是
 * 生成收窄问句，条数必须和这次真实命中对得上，不能由模型改写。
 */
export function parseNameSummary(
  payload: unknown,
  itemCount: number,
): NameSummary | null {
  if (!isRecord(payload)) {
    return null;
  }

  const rawState = payload.byState;
  if (!isRecord(rawState)) {
    return null;
  }
  const byState = emptyStateCounts();
  let stateNumericKeys = 0;
  for (const key of STATE_KEYS) {
    if (!(key in rawState)) continue;
    const count = readCount(rawState[key]);
    if (count === null) continue;
    stateNumericKeys += 1;
    byState[key] = count;
  }
  if (stateNumericKeys === 0) {
    return null;
  }
  if (itemCount > 0 && byState.RAW + byState.COOKED + byState.UNKNOWN === 0) {
    return null;
  }

  const rawMethod = payload.byMethod;
  const byMethod = emptyMethodCounts();
  if (isRecord(rawMethod)) {
    for (const key of METHOD_KEYS) {
      const count = readCount(rawMethod[key]);
      if (count !== null) byMethod[key] = count;
    }
  }

  const rawGroups = payload.byCutGroup;
  if (rawGroups !== undefined && !isRecord(rawGroups)) {
    return null;
  }
  const groupEntries: Array<[string, number]> = [];
  if (isRecord(rawGroups)) {
    for (const [rawKey, rawCount] of Object.entries(rawGroups)) {
      const key = rawKey.trim().toLowerCase();
      if (!key) continue;
      const count = readCount(rawCount);
      if (count === null) continue;
      groupEntries.push([key, count]);
    }
    // 输出过长：正常汇总不会出现几十个部位组。
    if (groupEntries.length > MAX_CUT_GROUPS) {
      return null;
    }
  }
  const byCutGroup: Record<string, number> = {};
  for (const [key, count] of groupEntries
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, KEPT_CUT_GROUPS)) {
    if (count > 0) byCutGroup[key] = count;
  }

  const rawExamples = payload.examples;
  if (rawExamples !== undefined && !isRecord(rawExamples)) {
    return null;
  }
  const examples: Record<string, string[]> = {};
  if (isRecord(rawExamples)) {
    const entries = Object.entries(rawExamples);
    const totalExampleNames = entries.reduce(
      (total, [, value]) => total + (Array.isArray(value) ? value.length : 0),
      0,
    );
    if (totalExampleNames > MAX_EXAMPLE_NAMES) {
      return null;
    }
    for (const [rawKey, rawNames] of entries) {
      const key = rawKey.trim().toLowerCase();
      if (!key || !Array.isArray(rawNames)) continue;
      const names = uniqueTexts(
        rawNames.map((entry) => normalizeText(entry)),
      ).slice(0, KEPT_EXAMPLES_PER_GROUP);
      if (names.length > 0) {
        examples[key] = names;
      }
    }
  }

  const rawIrrelevant = payload.irrelevantExamples;
  if (rawIrrelevant !== undefined && !Array.isArray(rawIrrelevant)) {
    return null;
  }
  const irrelevantNames = Array.isArray(rawIrrelevant)
    ? rawIrrelevant.map((entry) => normalizeText(entry))
    : [];
  if (irrelevantNames.length > MAX_IRRELEVANT_EXAMPLES) {
    return null;
  }

  return {
    total: itemCount,
    byState,
    byMethod,
    byCutGroup,
    examples,
    irrelevantExamples: uniqueTexts(irrelevantNames).slice(
      0,
      KEPT_IRRELEVANT_EXAMPLES,
    ),
  };
}

/** 部位 key 的粗略识别顺序；先长词后短词，避免 `rib` 抢 `brisket` 之类的误判。 */
const CUT_GROUP_KEYWORDS: ReadonlyArray<readonly [string, RegExp]> = [
  ['ground', /\bground\b/i],
  ['tenderloin', /\btenderloin\b/i],
  ['brisket', /\bbrisket\b/i],
  ['sandwich', /\bsandwich\b/i],
  ['gizzard', /\bgizzard\b/i],
  ['kidney', /\bkidney\b/i],
  ['chuck', /\bchuck\b/i],
  ['shank', /\bshank\b/i],
  ['round', /\bround\b/i],
  ['loin', /\bloin\b/i],
  ['breast', /\bbreast\b/i],
  ['thigh', /\bthigh\b/i],
  ['wing', /\bwing\b/i],
  ['liver', /\bliver\b/i],
  ['heart', /\bheart\b/i],
  ['neck', /\bneck\b/i],
  ['head', /\bhead\b/i],
  ['foot', /\bfoot\b/i],
  ['rib', /\brib\b/i],
];

function detectCutGroup(name: string): string {
  for (const [key, pattern] of CUT_GROUP_KEYWORDS) {
    if (pattern.test(name)) return key;
  }
  return 'other';
}

const RAW_NAME_PATTERN =
  /(?:\braw\b|\bfresh\b|\buncooked\b|生(?!菜|姜|粉|抽|产)|刺身)/iu;
const COOKED_NAME_PATTERN =
  /(?:\bcooked\b|\broasted\b|\bbaked\b|\bbroiled\b|\bsimmered\b|\bstewed\b|\bbraised\b|熟|調理済み|加熱)/iu;

/**
 * 汇总失败时的降级统计：只用名字关键词粗略数生 / 熟 / 做法 / 部位。
 *
 * 这张统计**不冒充 AI 判断**：调用方会同时回一个「分类不可用」提示，
 * 问句里也沿用这些粗略数字，不让整轮检索卡死。
 */
export function buildKeywordNameSummary(
  items: readonly NameSummaryItem[],
): NameSummary {
  const byState = emptyStateCounts();
  const byMethod = emptyMethodCounts();
  const groupCounts = new Map<string, number>();
  const groupNames = new Map<string, string[]>();

  for (const item of items) {
    const name = normalizeText(item.name);
    const method = classifyCookingMethod(name);
    let state: NutritionRecordState;
    if (method) {
      state = 'COOKED';
    } else if (RAW_NAME_PATTERN.test(name)) {
      state = 'RAW';
    } else if (COOKED_NAME_PATTERN.test(name)) {
      state = 'COOKED';
    } else {
      state = 'UNKNOWN';
    }

    const recordMethod: NutritionRecordMethod =
      state === 'RAW' || state === 'UNKNOWN' ? 'NONE' : (method ?? 'OTHER');
    byState[state] += 1;
    byMethod[recordMethod] += 1;

    const group = detectCutGroup(name);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
    const names = groupNames.get(group) ?? [];
    if (names.length < 2) {
      names.push(name);
      groupNames.set(group, names);
    }
  }

  const byCutGroup: Record<string, number> = {};
  for (const [key, count] of [...groupCounts.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )) {
    byCutGroup[key] = count;
  }

  const examples: Record<string, string[]> = {};
  for (const key of Object.keys(byCutGroup).slice(0, KEPT_EXAMPLE_GROUPS)) {
    const names = groupNames.get(key);
    if (names && names.length > 0) examples[key] = [...names];
  }

  return {
    total: items.length,
    byState,
    byMethod,
    byCutGroup,
    examples,
    irrelevantExamples: [],
  };
}
