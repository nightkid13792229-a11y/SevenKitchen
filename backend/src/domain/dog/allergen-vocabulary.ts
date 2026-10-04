/**
 * 过敏原词表匹配（2026-10-04，过敏重构第一期）
 *
 * ── 为什么要有这个文件 ──────────────────────────────────────
 *
 *   在此之前，判断"某个食材会不会让这只狗过敏"用的是**纯文字包含**：
 *
 *       const ingredientSearchText = ingredientNames.join(' ').toLowerCase();
 *       const allergyHits = allergyFoods.filter((k) => ingredientSearchText.includes(k));
 *
 *   而顾客填的过敏原与原料库里的食材名不是一套词：
 *       顾客点「鸡肉」 → 原料库叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」
 *       顾客点「牛肉」 → 原料库叫「牛霖」「牛心」「牛肝」「牛脾」
 *       顾客点「鱼肉」 → 原料库叫「三文鱼」「鳕鱼颈背肉」「狭鳕鱼柳」
 *
 *       "鸡胸".includes("鸡肉") === false
 *
 *   实测（生产备份库 107 个 FOOD 食材）：小程序「一点即选」的 12 个标签里
 *   **8 个匹配不到任何真实食材**。顾客认真点了"鸡肉过敏"，
 *   首页照样会推含鸡胸肉的食谱 —— 对"按过敏定制"的产品来说这是食品安全级缺陷。
 *
 * ── 改法：查表，不猜名字 ────────────────────────────────────
 *
 *   过敏原做成受控词表（allergen_tag：标准名 + 别名），
 *   每个食材**显式**挂到它含有的过敏原上（ingredient_allergen_tag）。
 *   判断时先查表；**查不到的仍然退回文字包含**——
 *   宁可多报，不可漏报。
 *
 *   兜底那一层是刻意保留的：顾客会写「鸵鸟肉」「驴肉」这种库里没有的词，
 *   也会写「海鲜」「豆类」这种类别。词表收录不全时，
 *   旧行为至少还能挡住一部分，而不是直接放行。
 *
 * ── 这个模块是纯函数 ────────────────────────────────────────
 *
 *   不碰数据库、不依赖 Nest。词表由调用方加载好传进来，
 *   这样它可以被单元测试完整覆盖（见 tests/domain/dog/allergen-vocabulary.spec.ts）。
 */

/** 词表里的一条过敏原 */
export interface AllergenVocabularyEntry {
  /** 内部标识 */
  code: string;
  /** 标准名（界面展示用） */
  name: string;
  /** 别名 */
  aliases: readonly string[];
  /** 常见度，数字越小越常见；未指定时排到最后 */
  commonRank?: number;
}

/** 一条「食材含某个过敏原」的关联 */
export interface IngredientAllergenLink {
  /** 食材名（与 ingredient.name 一致） */
  ingredientName: string;
  /** 过敏原 code */
  allergenCode: string;
}

/** 加载好、可以直接用于匹配的词表 */
export interface AllergenVocabulary {
  entries: readonly AllergenVocabularyEntry[];
  /** 词条 → code：标准名与别名都在里面，键已小写 */
  termToCode: ReadonlyMap<string, string>;
  /** code → 词条 */
  entryByCode: ReadonlyMap<string, AllergenVocabularyEntry>;
  /** 食材名（小写）→ 它含有的过敏原 code 列表 */
  ingredientIndex: ReadonlyMap<string, readonly string[]>;
}

/**
 * 把别名表展开成"词 → code"的查找表。
 *
 * 标准名也作为词进去（这样「鸡肉」既能匹配别名，也能匹配标准名）。
 * 同一个词被两条过敏原声明时，**先声明的赢**，
 * 并在返回值里带出冲突列表供初始化脚本报警 —— 静默覆盖会让
 * "顾客明明写了这个词却匹配到另一个过敏原"变成查不出来的错。
 */
export function buildTermIndex(entries: readonly AllergenVocabularyEntry[]): {
  termToCode: Map<string, string>;
  conflicts: Array<{ term: string; kept: string; dropped: string }>;
} {
  const termToCode = new Map<string, string>();
  const conflicts: Array<{ term: string; kept: string; dropped: string }> = [];

  for (const entry of entries) {
    const terms = [entry.name, ...entry.aliases];
    for (const rawTerm of terms) {
      const term = normalizeTerm(rawTerm);
      if (!term) continue;

      const existing = termToCode.get(term);
      if (existing && existing !== entry.code) {
        conflicts.push({ term, kept: existing, dropped: entry.code });
        continue;
      }
      termToCode.set(term, entry.code);
    }
  }

  return { termToCode, conflicts };
}

/** 组装词表（纯函数，便于测试与缓存） */
export function buildAllergenVocabulary(params: {
  entries: readonly AllergenVocabularyEntry[];
  links: readonly IngredientAllergenLink[];
}): AllergenVocabulary {
  const { termToCode } = buildTermIndex(params.entries);
  const entryByCode = new Map(params.entries.map((entry) => [entry.code, entry]));

  const ingredientIndex = new Map<string, string[]>();
  for (const link of params.links) {
    const name = normalizeTerm(link.ingredientName);
    if (!name) continue;
    const codes = ingredientIndex.get(name) ?? [];
    if (!codes.includes(link.allergenCode)) {
      codes.push(link.allergenCode);
    }
    ingredientIndex.set(name, codes);
  }

  return {
    entries: params.entries,
    termToCode,
    entryByCode,
    ingredientIndex,
  };
}

/** 归一化一个词：去首尾空白、去全角空格、转小写 */
export function normalizeTerm(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u3000\s]+/g, '')
    .trim()
    .toLowerCase();
}

/** 命中方式 */
export type AllergenHitVia = 'VOCABULARY' | 'TEXT';

export interface AllergenHit {
  /** 命中的过敏原：走词表时是标准名，走文字兜底时是顾客的原文 */
  allergen: string;
  /** 词表里的 code；文字兜底时为 null */
  allergenCode: string | null;
  /** 是哪个食材命中的 */
  ingredientName: string;
  /** 怎么命中的 */
  via: AllergenHitVia;
}

/**
 * 判断一组食材里，哪些会碰到这只狗的过敏原。
 *
 * 两段式：
 *   1. **走词表**：把顾客的过敏原对到 code，再看食材挂了哪些 code。
 *      这是准确的那一层（「鸡胸」属于鸡肉）。
 *   2. **文字兜底**：对不上 code 的过敏原（「鸵鸟肉」「海鲜」），
 *      退回原来的"食材名里包含这段文字"。
 *
 * 同一个过敏原被同一个食材命中多次时只保留一条。
 */
export function findIngredientAllergenHits(params: {
  /** 这只狗的过敏原（已经过 collectAllergyKeywords 合并两个来源） */
  dogAllergens: readonly string[];
  /** 要检查的食材名 */
  ingredientNames: readonly string[];
  vocabulary: AllergenVocabulary;
}): AllergenHit[] {
  const dogAllergens = params.dogAllergens
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
  if (dogAllergens.length === 0 || params.ingredientNames.length === 0) {
    return [];
  }

  // 归一化食材名，保留原样用于展示
  const ingredients = params.ingredientNames
    .map((name) => ({ raw: String(name ?? '').trim(), key: normalizeTerm(name) }))
    .filter((item) => item.key);

  const hits: AllergenHit[] = [];
  const seen = new Set<string>();

  const push = (hit: AllergenHit) => {
    const dedupeKey = `${hit.allergenCode ?? hit.allergen}::${normalizeTerm(hit.ingredientName)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    hits.push(hit);
  };

  // ── 第一段：走词表 ──────────────────────────────────────
  const unresolved: string[] = [];

  for (const allergen of dogAllergens) {
    const code = params.vocabulary.termToCode.get(normalizeTerm(allergen));
    if (!code) {
      unresolved.push(allergen);
      continue;
    }

    const entry = params.vocabulary.entryByCode.get(code);
    const displayName = entry?.name ?? allergen;

    for (const ingredient of ingredients) {
      const codes = params.vocabulary.ingredientIndex.get(ingredient.key);
      if (!codes || !codes.includes(code)) continue;

      push({
        allergen: displayName,
        allergenCode: code,
        ingredientName: ingredient.raw,
        via: 'VOCABULARY',
      });
    }
  }

  // ── 第二段：文字兜底 ────────────────────────────────────
  //
  // 只处理"词表里没有"的过敏原。收录过的词不再走这段 ——
  // 否则「鱼」这类短词会在「鱼腥草」上误报，
  // 而词表路径本来就能正确处理「鱼」。
  for (const allergen of unresolved) {
    const keyword = normalizeTerm(allergen);
    if (!keyword) continue;

    for (const ingredient of ingredients) {
      if (!ingredient.key.includes(keyword)) continue;
      push({
        allergen,
        allergenCode: null,
        ingredientName: ingredient.raw,
        via: 'TEXT',
      });
    }
  }

  return hits;
}

/** 命中涉及到的过敏原名称（去重，保持首次出现顺序） */
export function collectHitAllergenNames(hits: readonly AllergenHit[]): string[] {
  const names: string[] = [];
  for (const hit of hits) {
    if (!names.includes(hit.allergen)) {
      names.push(hit.allergen);
    }
  }
  return names;
}

/**
 * 这个食材能不能给这只狗吃。
 *
 * ⚠️ 只回答"**有没有命中过敏原**"，不回答"要不要拦" ——
 * 确诊 / 可疑 / 待排查 三档的处理方式不同，那是业务判断，
 * 由调用方（推荐、配方、后台）各自决定。
 */
export function isIngredientAllergenFree(params: {
  ingredientName: string;
  dogAllergens: readonly string[];
  vocabulary: AllergenVocabulary;
}): boolean {
  return (
    findIngredientAllergenHits({
      dogAllergens: params.dogAllergens,
      ingredientNames: [params.ingredientName],
      vocabulary: params.vocabulary,
    }).length === 0
  );
}

/**
 * 按常见度排序的过敏原清单 —— 给小程序「一点即选」用。
 *
 * 依据知识库 skin-005：牛肉 / 乳制品 / 小麦合计约 69%，
 * 其次羊肉、鸡蛋、鸡肉、大豆约 25%。commonRank 越小越靠前。
 */
export function listAllergensByCommonRank(
  vocabulary: AllergenVocabulary,
  limit?: number,
): AllergenVocabularyEntry[] {
  const sorted = [...vocabulary.entries].sort((a, b) => {
    const rankA = a.commonRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.commonRank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
}
