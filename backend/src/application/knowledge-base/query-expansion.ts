/**
 * 查询扩展与焦点识别（检索工程，不是临床判断）。
 *
 * spec: docs/knowledge-base/2026-11-09-kb-minimal-library-design.md §7.1
 *
 * 三条硬规则：
 * 1. 中文单字术语也要扫（磷/钠/钾/氯/镁/碘/钙），不能只靠 2 字切片；
 * 2. `focusTerms` = 内容词减背景词，不做白名单回退（未知营养素天然是焦点）；
 * 3. `topicPhrases` 只在 query 里出现才返回；`stagePhrases` 只扩召回，不做门禁。
 */

export interface QueryFocus {
  /** 可做相关性门禁的高风险短语（vitamin k / vitamin d / fish oil / omega-3 …）。 */
  topicPhrases: string[];
  /** 分期短语，只做召回扩展与软排序，不做门禁（不排除其他分期）。 */
  stagePhrases: string[];
  /** 内容词减背景词。 */
  focusTerms: string[];
  /** 背景词，只参与排序，不做门禁。 */
  backgroundTerms: string[];
}

/**
 * 中文 → 英文检索词。匹配时长词优先：命中后把原文对应位置挖空，
 * 短词不会在长词内部重复命中（蛋白尿 ≠ 蛋白 + 尿）。
 */
const CHINESE_TERMS: Array<[string, string[]]> = [
  ['慢性肾脏病', ['chronic kidney disease', 'ckd']],
  ['慢性肾病', ['chronic kidney disease', 'ckd']],
  ['肾病', ['chronic kidney disease', 'ckd', 'kidney disease']],
  ['磷结合剂', ['phosphate binder']],
  ['处方粮', ['therapeutic diet']],
  ['蛋白尿', ['proteinuria', 'upc']],
  ['血磷', ['phosphorus', 'phosphate']],
  ['维生素d', ['vitamin d']],
  ['维生素k', ['vitamin k']],
  ['亚分期', ['substaging', 'staging']],
  ['鱼油', ['omega-3', 'fish oil']],
  ['高血压', ['hypertension', 'blood pressure']],
  ['血压', ['blood pressure', 'hypertension']],
  ['分期', ['staging']],
  ['蛋白', ['protein']],
  ['能量', ['energy']],
  ['纤维', ['fiber']],
  ['贫血', ['anemia']],
  ['磷', ['phosphorus', 'phosphate']],
  ['钠', ['sodium']],
  ['钾', ['potassium']],
  ['氯', ['chloride']],
  ['镁', ['magnesium']],
  ['碘', ['iodine']],
  ['钙', ['calcium']],
  ['铁', ['iron']],
  ['锌', ['zinc']],
  ['铜', ['copper']],
  ['犬', ['dog', 'canine']],
  ['狗', ['dog', 'canine']],
  ['猫', ['cat', 'feline']],
];

/** 英文同义词（单 token 级）。 */
const ENGLISH_SYNONYMS: Record<string, string[]> = {
  phosphate: ['phosphorus'],
  phosphorus: ['phosphate'],
  upc: ['proteinuria'],
  proteinuria: ['upc'],
  bp: ['blood pressure'],
  hypertension: ['blood pressure'],
  ckd: ['chronic kidney disease'],
  canine: ['dog'],
  dog: ['canine'],
  feline: ['cat'],
  cat: ['feline'],
  renal: ['kidney'],
};

/** 英文短语级扩展（多词 + 连字符归一）。 */
const PHRASE_EXPANSIONS: Array<[RegExp, string[]]> = [
  [/\bblood\s+pressure\b/, ['blood pressure', 'bp']],
  [/\bchronic\s+kidney\s+disease\b/, ['chronic kidney disease', 'ckd']],
  [/\bomega[-\s]?3\b/, ['omega-3', 'omega 3']],
  [/\bfish\s+oil\b/, ['fish oil']],
  [/\bvitamin\s+k\b/, ['vitamin k']],
  [/\bvitamin\s+d\b/, ['vitamin d']],
];

/** 高风险短语：只在 query 里出现才返回，用作相关性门禁。 */
const TOPIC_PHRASES = ['vitamin k', 'vitamin d', 'fish oil', 'omega-3', 'omega 3'];

/** 背景词：只排序，不门禁。 */
const BACKGROUND_TERMS = [
  'ckd',
  'chronic',
  'kidney',
  'disease',
  'dog',
  'dogs',
  'canine',
  'cat',
  'cats',
  'feline',
  'stage',
  'stages',
  // `分期 → staging` 是“意图”词（结构性软加权已单独处理），不能当焦点词：
  // 否则「UPC 怎么分期」「血压 怎么分期」会被通用 staging 章节抢走。
  'staging',
  'target',
  'range',
  'requirement',
  'requirements',
  'recommendation',
  'recommendations',
  'level',
  'table',
  'value',
  'values',
  'patient',
  'patients',
  'management',
  'treatment',
  'diet',
  'dietary',
  'supplementation',
  'substaging',
  'substage',
  'iris',
  'mmol',
  'mg',
];

/** 中文虚词/泛用词：不算内容词。 */
const CJK_GENERIC = new Set([
  '上限',
  '下限',
  '范围',
  '目标',
  '推荐',
  '多少',
  '怎么',
  '如何',
  '需要',
  '标准',
  '数值',
  '剂量',
  '分期',
  '亚分期',
  '肾病',
  '慢性',
  '犬',
  '狗',
  '猫',
  '期',
  // 单字「水」不再映射 water（会误伤「血磷 水平」「水分」），
  // 这些词是泛用词，不算内容词。
  '水平',
  '水分',
]);

const STOP = new Set(
  'a an the and or of to in on for with by is are was were be been being this that these those as at from it its their there can may should could would not no than then when where which who whom whose what how why'.split(
    ' ',
  ),
);

const CN_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };

/** 归一化匹配用：小写、连字符/破折号变空格、压缩空白。 */
export function normalizeForMatch(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEEDLE_PATTERN_CACHE = new Map<string, RegExp | null>();
const NEEDLE_PATTERN_CACHE_LIMIT = 500;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function needlePattern(needle: string): RegExp | null {
  if (NEEDLE_PATTERN_CACHE.has(needle)) {
    return NEEDLE_PATTERN_CACHE.get(needle) ?? null;
  }
  const pattern = /[a-z0-9]/.test(needle)
    ? new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}(?=[^a-z0-9]|$)`)
    : null;
  if (NEEDLE_PATTERN_CACHE.size >= NEEDLE_PATTERN_CACHE_LIMIT) {
    NEEDLE_PATTERN_CACHE.clear();
  }
  NEEDLE_PATTERN_CACHE.set(needle, pattern);
  return pattern;
}

/**
 * 词边界匹配（门禁/标题命中/表格 caption 共用）：
 * - 拉丁词/短语必须整词命中：`protein` 不能命中 `proteinuria`，`stage 3` 不能命中 `stage 30`；
 * - 中文没有词边界，继续用 `includes`（`蛋白` 可以命中 `蛋白尿`）；
 * - 两侧都先 `normalizeForMatch`（小写、连字符归一）。
 */
export function matchesNeedle(haystack: string, needle: string): boolean {
  const hay = normalizeForMatch(haystack);
  const target = normalizeForMatch(needle);
  if (!hay || !target) return false;
  const pattern = needlePattern(target);
  if (!pattern) return hay.includes(target);
  return pattern.test(hay);
}

/** 从 query 里取分期号（英文 stage N / 中文 N 期 / 第 N 期）。 */
export function extractStageNumbers(query: string): number[] {
  const raw = String(query ?? '');
  const stages = new Set<number>();
  for (const match of raw.matchAll(/\bstages?\s*([1-4])\b/gi)) {
    stages.add(Number(match[1]));
  }
  for (const match of raw.matchAll(/([1-4])\s*期/g)) {
    stages.add(Number(match[1]));
  }
  for (const match of raw.matchAll(/第?\s*([一二三四])\s*期/g)) {
    stages.add(CN_DIGITS[match[1]]);
  }
  return [...stages].sort();
}

function canonicalTerm(term: string): string {
  return normalizeForMatch(term).replace(/\s+/g, ' ');
}

/**
 * 查询扩展：中文术语/单字、英文同义词、分期短语 → 检索词表。
 * 扩展词排前（调用方按顺序截断时先保留扩展词）。
 */
export function expandQuery(query: string): string[] {
  const raw = String(query ?? '').trim();
  if (!raw) return [];

  const lower = raw.toLowerCase();
  const flat = lower.replace(/\s+/g, '');

  const expansions: string[] = [];
  const raws: string[] = [];
  const seen = new Set<string>();
  const push = (list: string[], value: string) => {
    const text = String(value ?? '').trim();
    if (!text) return;
    // 按原样去重（保留 `omega-3` / `omega 3` 两种写法：`contains` 匹配不到另一种）
    const key = text.toLowerCase();
    const canonical = canonicalTerm(text);
    if (!canonical || seen.has(key)) return;
    if (key.length < 2) return;
    if (STOP.has(canonical)) return;
    seen.add(key);
    list.push(text);
  };

  // ① 中文术语（长词优先，命中后挖空）
  let masked = flat;
  const chinese = [...CHINESE_TERMS].sort((a, b) => b[0].length - a[0].length);
  for (const [zh, values] of chinese) {
    let index = masked.indexOf(zh);
    if (index < 0) continue;
    while (index >= 0) {
      for (const value of values) push(expansions, value);
      masked = masked.slice(0, index) + ' '.repeat(zh.length) + masked.slice(index + zh.length);
      index = masked.indexOf(zh);
    }
  }

  // ② 英文短语级同义扩展
  for (const [pattern, values] of PHRASE_EXPANSIONS) {
    if (!pattern.test(lower)) continue;
    for (const value of values) push(expansions, value);
  }

  // ③ 英文 token + 单 token 同义扩展
  for (const match of lower.matchAll(/[a-z][a-z0-9-]{1,}/g)) {
    const token = match[0];
    push(raws, token);
    for (const synonym of ENGLISH_SYNONYMS[token] ?? []) {
      push(expansions, synonym);
    }
  }

  // ④ 数字（0.2 / 1.5% 这类才值得检索，单字符会放大候选）
  for (const match of raw.matchAll(/\d+(?:\.\d+)?%?/g)) {
    if (match[0].length >= 3) push(raws, match[0]);
  }

  // ⑤ 中文原文词块（语料若含中文可直接命中）
  for (const match of flat.matchAll(/[\u4e00-\u9fff]{2,}/g)) {
    push(raws, match[0]);
  }

  // ⑥ 分期短语（只扩召回，不做门禁）
  for (const stage of extractStageNumbers(raw)) {
    push(expansions, `stage ${stage}`);
  }

  return [...expansions, ...raws].slice(0, 32);
}

/** 背景词判定：单复数归一、逐词归一再看背景词表。 */
export function isBackgroundTerm(term: string): boolean {
  const key = canonicalTerm(term);
  if (!key) return true;
  if (BACKGROUND_TERMS.includes(key)) return true;
  if (key.endsWith('s') && BACKGROUND_TERMS.includes(key.slice(0, -1))) return true;
  if (CJK_GENERIC.has(key)) return true;
  // 多词短语（如 chronic kidney disease）逐词都在背景词表里 → 整体是背景词
  const parts = key.split(' ').filter(Boolean);
  if (
    parts.length > 1 &&
    parts.every(
      (part) =>
        BACKGROUND_TERMS.includes(part) ||
        (part.endsWith('s') && BACKGROUND_TERMS.includes(part.slice(0, -1))),
    )
  ) {
    return true;
  }
  return false;
}

/**
 * 焦点识别：
 * - `topicPhrases` 只在 query 里出现才返回（不是去语料里找）；
 * - `stagePhrases` 只扩召回，不做门禁；
 * - `focusTerms` = 扩展后的内容词减背景词；未知营养素天然是焦点词。
 */
export function extractQueryFocus(query: string): QueryFocus {
  const raw = String(query ?? '').trim();
  const expanded = expandQuery(raw);
  const haystack = normalizeForMatch(`${raw} ${expanded.join(' ')}`);

  const topicPhrases = TOPIC_PHRASES.filter((phrase) =>
    haystack.includes(normalizeForMatch(phrase)),
  );
  const stagePhrases = extractStageNumbers(raw).map((stage) => `stage ${stage}`);

  const backgroundTerms = expanded.filter((term) => isBackgroundTerm(term));
  const focusTerms: string[] = [];
  const seen = new Set<string>();
  for (const term of expanded) {
    const key = canonicalTerm(term);
    if (!key || key.length < 2) continue;
    if (STOP.has(key)) continue;
    if (stagePhrases.includes(key)) continue;
    if (isBackgroundTerm(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    focusTerms.push(key);
  }

  return {
    topicPhrases,
    stagePhrases,
    focusTerms,
    backgroundTerms: [...new Set(backgroundTerms.map((term) => canonicalTerm(term)))],
  };
}
