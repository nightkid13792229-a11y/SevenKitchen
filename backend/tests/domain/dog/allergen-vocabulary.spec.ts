import {
  buildAllergenVocabulary,
  buildTermIndex,
  collectHitAllergenNames,
  findIngredientAllergenHits,
  isIngredientAllergenFree,
  listAllergensByCommonRank,
  normalizeTerm,
  type AllergenVocabulary,
} from 'src/domain/dog/allergen-vocabulary';

/**
 * 过敏原词表匹配（2026-10-04，过敏重构第一期）
 *
 * 背景：在此之前判断"某个食材会不会让这只狗过敏"用的是纯文字包含：
 *     const t = ingredientNames.join(' ').toLowerCase();
 *     allergyFoods.filter((k) => t.includes(k));
 * 而顾客填的过敏原与原料库里的食材名不是一套词：
 *     顾客点「鸡肉」 → 原料库叫「鸡胸」「鸡腿肉」「鸡心」「鸡肝」「鸡胗」
 *     "鸡胸".includes("鸡肉") === false
 * 实测（生产备份库 107 个 FOOD 食材）：12 个常见过敏标签里 **8 个**
 * 匹配不到任何真实食材。顾客认真点了"鸡肉过敏"，首页照样推含鸡胸肉的食谱。
 *
 * 这组测试锁住三件事：
 *   1. 词表路径能正确把「鸡肉」对上「鸡胸」这类不同名的食材；
 *   2. 词表里没有的词（「鸵鸟肉」「海鲜」）**退回文字兜底**，而不是直接放行；
 *   3. 别名冲突能被发现，不会静默覆盖。
 */

// 一份贴近真实原料库的小样本，取自本地库的食材名
const ENTRIES = [
  {
    code: 'chicken',
    name: '鸡肉',
    aliases: ['鸡', '鸡胸肉', '鸡胸', '鸡腿肉', '鸡心', '鸡肝', '鸡胗'],
    commonRank: 60,
  },
  {
    code: 'beef',
    name: '牛肉',
    aliases: ['牛', '牛腩', '牛霖', '牛心', '牛肝'],
    commonRank: 10,
  },
  {
    code: 'poultry',
    name: '禽肉',
    aliases: ['禽肉', '禽类', '家禽'],
    commonRank: 165,
  },
  { code: 'dairy', name: '乳制品', aliases: ['牛奶', '酸奶', '奶酪'], commonRank: 20 },
  { code: 'fish', name: '鱼', aliases: ['鱼肉', '三文鱼', '鳕鱼'], commonRank: 80 },
  { code: 'seafood', name: '海鲜', aliases: ['海产', '水产'], commonRank: 85 },
];

const LINKS = [
  { ingredientName: '鸡胸', allergenCode: 'chicken' },
  { ingredientName: '鸡胸', allergenCode: 'poultry' },
  { ingredientName: '鸡腿肉', allergenCode: 'chicken' },
  { ingredientName: '鸡腿肉', allergenCode: 'poultry' },
  { ingredientName: '鸡肝', allergenCode: 'chicken' },
  { ingredientName: '鸡肝', allergenCode: 'poultry' },
  { ingredientName: '牛霖', allergenCode: 'beef' },
  { ingredientName: '牛肝', allergenCode: 'beef' },
  { ingredientName: '三文鱼', allergenCode: 'fish' },
  { ingredientName: '三文鱼', allergenCode: 'seafood' },
  { ingredientName: '鳕鱼', allergenCode: 'fish' },
  { ingredientName: '鳕鱼', allergenCode: 'seafood' },
  { ingredientName: '希腊酸奶', allergenCode: 'dairy' },
  { ingredientName: '南瓜', allergenCode: '' }, // 占位，实际不会出现空 code
];

function makeVocabulary(): AllergenVocabulary {
  return buildAllergenVocabulary({
    entries: ENTRIES,
    links: LINKS.filter((link) => link.allergenCode),
  });
}

describe('allergen vocabulary', () => {
  describe('normalizeTerm', () => {
    it('去掉空白（含全角空格）并转小写', () => {
      expect(normalizeTerm('  鸡 肉 ')).toBe('鸡肉');
      expect(normalizeTerm('Chicken\u3000Breast')).toBe('chickenbreast');
    });

    it('null / undefined 归一成空串', () => {
      expect(normalizeTerm(null)).toBe('');
      expect(normalizeTerm(undefined)).toBe('');
    });
  });

  describe('buildTermIndex', () => {
    it('标准名与别名都能查到 code', () => {
      const { termToCode } = buildTermIndex(ENTRIES);
      expect(termToCode.get('鸡肉')).toBe('chicken');
      expect(termToCode.get('鸡胸')).toBe('chicken');
      expect(termToCode.get('牛奶')).toBe('dairy');
    });

    it('别名冲突会被报出来，而不是静默覆盖', () => {
      const { termToCode, conflicts } = buildTermIndex([
        { code: 'a', name: '甲', aliases: ['共同词'] },
        { code: 'b', name: '乙', aliases: ['共同词'] },
      ]);

      expect(termToCode.get('共同词')).toBe('a');
      expect(conflicts).toEqual([
        { term: '共同词', kept: 'a', dropped: 'b' },
      ]);
    });
  });

  describe('findIngredientAllergenHits — 词表路径（这次要修好的那一层）', () => {
    const vocabulary = makeVocabulary();

    it('🔴 顾客写「鸡肉」，能挡住原料库里的「鸡胸」「鸡腿肉」「鸡肝」', () => {
      // 这条就是本次改造的核心：改造前 "鸡胸".includes("鸡肉") === false，
      // 顾客点了"鸡肉过敏"，系统照样推含鸡胸肉的食谱。
      const hits = findIngredientAllergenHits({
        dogAllergens: ['鸡肉'],
        ingredientNames: ['鸡胸', '鸡腿肉', '鸡肝', '南瓜'],
        vocabulary,
      });

      expect(collectHitAllergenNames(hits)).toEqual(['鸡肉']);
      expect(hits.map((hit) => hit.ingredientName).sort()).toEqual([
        '鸡肝',
        '鸡胸',
        '鸡腿肉',
      ]);
      expect(hits.every((hit) => hit.via === 'VOCABULARY')).toBe(true);
    });

    it('顾客写「牛肉」，能挡住「牛霖」「牛肝」', () => {
      const hits = findIngredientAllergenHits({
        dogAllergens: ['牛肉'],
        ingredientNames: ['牛霖', '牛肝', '鸡胸'],
        vocabulary,
      });

      expect(hits.map((hit) => hit.ingredientName).sort()).toEqual(['牛肝', '牛霖']);
    });

    it('顾客写别名的写法（「牛奶」），也能对上乳制品', () => {
      const hits = findIngredientAllergenHits({
        dogAllergens: ['牛奶'],
        ingredientNames: ['希腊酸奶'],
        vocabulary,
      });

      // 展示名用词表标准名，而不是顾客的原文 —— 界面统一
      expect(hits).toEqual([
        {
          allergen: '乳制品',
          allergenCode: 'dairy',
          ingredientName: '希腊酸奶',
          via: 'VOCABULARY',
        },
      ]);
    });

    it('类别标签能覆盖具体食材：顾客写「海鲜」挡住所有鱼', () => {
      const hits = findIngredientAllergenHits({
        dogAllergens: ['海鲜'],
        ingredientNames: ['三文鱼', '鳕鱼', '鸡胸'],
        vocabulary,
      });

      expect(hits.map((hit) => hit.ingredientName).sort()).toEqual(['三文鱼', '鳕鱼']);
      expect(hits.every((hit) => hit.allergen === '海鲜')).toBe(true);
    });

    it('一个食材含多种过敏原时，写其中任何一个都能挡住', () => {
      const byChicken = findIngredientAllergenHits({
        dogAllergens: ['鸡肉'],
        ingredientNames: ['鸡胸'],
        vocabulary,
      });
      const byPoultry = findIngredientAllergenHits({
        dogAllergens: ['禽肉'],
        ingredientNames: ['鸡胸'],
        vocabulary,
      });

      expect(byChicken).toHaveLength(1);
      expect(byPoultry).toHaveLength(1);
      expect(byChicken[0].ingredientName).toBe('鸡胸');
      expect(byPoultry[0].ingredientName).toBe('鸡胸');
    });

    it('同一个过敏原被同一个食材命中多次时只算一条', () => {
      const hits = findIngredientAllergenHits({
        dogAllergens: ['鸡肉', '鸡肉'],
        ingredientNames: ['鸡胸', '鸡胸'],
        vocabulary,
      });

      expect(hits).toHaveLength(1);
    });

    it('没有过敏原、或没有食材时直接返回空', () => {
      expect(
        findIngredientAllergenHits({
          dogAllergens: [],
          ingredientNames: ['鸡胸'],
          vocabulary,
        }),
      ).toEqual([]);
      expect(
        findIngredientAllergenHits({
          dogAllergens: ['鸡肉'],
          ingredientNames: [],
          vocabulary,
        }),
      ).toEqual([]);
    });
  });

  describe('findIngredientAllergenHits — 文字兜底（词表没收录时不能放行）', () => {
    const vocabulary = makeVocabulary();

    it('词表里没有的过敏原，退回文字包含匹配', () => {
      // 「鸵鸟肉」不在词表里 —— 生产数据里顾客确实这么写过。
      // 宁可多报，不可漏报：至少要把名字里带这三个字的食材挡住。
      const hits = findIngredientAllergenHits({
        dogAllergens: ['鸵鸟肉'],
        ingredientNames: ['鸵鸟肉', '鸡胸'],
        vocabulary,
      });

      expect(hits).toEqual([
        {
          allergen: '鸵鸟肉',
          allergenCode: null,
          ingredientName: '鸵鸟肉',
          via: 'TEXT',
        },
      ]);
    });

    it('⚠️ 收录过的词不再走文字兜底，避免短词误报', () => {
      // 「鱼」在词表里。若不区分，文字包含会让「鱼」命中「鱼腥草」这类无关食材。
      const hits = findIngredientAllergenHits({
        dogAllergens: ['鱼'],
        ingredientNames: ['鱼腥草', '三文鱼'],
        vocabulary,
      });

      expect(hits.map((hit) => hit.ingredientName)).toEqual(['三文鱼']);
      expect(hits[0].via).toBe('VOCABULARY');
    });

    it('词表与文字兜底可以在同一次调用里并存', () => {
      const hits = findIngredientAllergenHits({
        dogAllergens: ['鸡肉', '鸵鸟肉'],
        ingredientNames: ['鸡胸', '鸵鸟肉'],
        vocabulary,
      });

      expect(hits).toHaveLength(2);
      expect(hits.find((hit) => hit.allergen === '鸡肉')?.via).toBe('VOCABULARY');
      expect(hits.find((hit) => hit.allergen === '鸵鸟肉')?.via).toBe('TEXT');
    });
  });

  describe('isIngredientAllergenFree', () => {
    const vocabulary = makeVocabulary();

    it('含过敏原返回 false，不含返回 true', () => {
      expect(
        isIngredientAllergenFree({
          ingredientName: '鸡胸',
          dogAllergens: ['鸡肉'],
          vocabulary,
        }),
      ).toBe(false);
      expect(
        isIngredientAllergenFree({
          ingredientName: '南瓜',
          dogAllergens: ['鸡肉'],
          vocabulary,
        }),
      ).toBe(true);
    });
  });

  describe('listAllergensByCommonRank', () => {
    it('按常见度排序（牛肉 → 乳制品 → 小麦…，依据知识库 skin-005）', () => {
      const vocabulary = makeVocabulary();
      const sorted = listAllergensByCommonRank(vocabulary);

      expect(sorted.map((entry) => entry.name)).toEqual([
        '牛肉',
        '乳制品',
        '鸡肉',
        '鱼',
        '海鲜',
        '禽肉',
      ]);
    });

    it('可以只取前 N 个（小程序「一点即选」用）', () => {
      const vocabulary = makeVocabulary();
      const top3 = listAllergensByCommonRank(vocabulary, 3);

      expect(top3).toHaveLength(3);
      expect(top3.map((entry) => entry.name)).toEqual(['牛肉', '乳制品', '鸡肉']);
    });

    it('没有 commonRank 的排到最后', () => {
      const vocabulary = buildAllergenVocabulary({
        entries: [
          { code: 'a', name: '甲', aliases: [] },
          { code: 'b', name: '乙', aliases: [], commonRank: 5 },
        ],
        links: [],
      });

      expect(listAllergensByCommonRank(vocabulary).map((e) => e.name)).toEqual([
        '乙',
        '甲',
      ]);
    });
  });

  describe('真实原料库回归：改造前失效的 8 个常见标签', () => {
    /**
     * 这组数据来自本地原料库的真实食材名。
     * 改造前用文字包含判断，「鸡肉」匹配不到「鸡胸」，
     * 12 个标签里有 8 个完全失效。这里逐个锁住。
     */
    const vocabulary = makeVocabulary();

    it.each([
      ['鸡肉', '鸡胸'],
      ['鸡肉', '鸡腿肉'],
      ['鸡肉', '鸡肝'],
      ['牛肉', '牛霖'],
      ['牛肉', '牛肝'],
      ['鱼肉', '三文鱼'],
      ['鱼肉', '鳕鱼'],
    ])('顾客写「%s」，能挡住「%s」', (allergen, ingredient) => {
      const hits = findIngredientAllergenHits({
        dogAllergens: [allergen],
        ingredientNames: [ingredient],
        vocabulary,
      });
      expect(hits).toHaveLength(1);
    });
  });
});
