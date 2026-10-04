import {
  canonicalizeAllergen,
  isNegativeLevel,
  mapLevelToCertainty,
  mergeCertainty,
  normalizeLevel,
  normalizeResults,
  normalizeTestMethod,
  parseDate,
} from 'src/application/health/allergy-report.service';

/**
 * 过敏检测报告（2026-10-04，过敏重构第二期）
 *
 * 老板第 1 条："可以记录自己狗狗的过敏检查报告，
 * 特别是报告中**有哪些需要注意的、可疑的**过敏原食物。"
 *
 * 这组测试锁住三件事：
 *   1. 报告结论等级 → 系统可信度 的翻译规则（这是唯一一处把报告翻译成判断的地方）
 *   2. **阴性不记成过敏** —— 阴性恰恰说明不过敏，记成过敏是反的
 *   3. 过敏原名称归一 —— 不做归一的话"鸡胸肉"这条记录在推荐避雷里匹配不到东西
 */

const VOCABULARY = {
  termToCode: new Map<string, string>([
    ['鸡肉', 'chicken'],
    ['鸡胸肉', 'chicken'],
    ['鸡', 'chicken'],
    ['牛肉', 'beef'],
    ['牛腩', 'beef'],
  ]),
  entryByCode: new Map<string, { name: string }>([
    ['chicken', { name: '鸡肉' }],
    ['beef', { name: '牛肉' }],
  ]),
};

describe('allergy report', () => {
  describe('mapLevelToCertainty —— 报告结论 → 系统可信度', () => {
    it('明确阳性 → 确诊（会被食谱彻底避开）', () => {
      expect(mapLevelToCertainty('POSITIVE')).toBe('CONFIRMED');
      expect(mapLevelToCertainty('positive')).toBe('CONFIRMED');
    });

    it('弱阳性 / 疑似 / 没写 → 可疑', () => {
      expect(mapLevelToCertainty('WEAK_POSITIVE')).toBe('SUSPECTED');
      expect(mapLevelToCertainty('SUSPECTED')).toBe('SUSPECTED');
      expect(mapLevelToCertainty('UNKNOWN')).toBe('SUSPECTED');
      expect(mapLevelToCertainty(null)).toBe('SUSPECTED');
      expect(mapLevelToCertainty(undefined)).toBe('SUSPECTED');
    });

    it('未知取值按"可疑"处理 —— 宁可多避，不可漏报', () => {
      expect(mapLevelToCertainty('报告上写了个奇怪的词')).toBe('SUSPECTED');
    });
  });

  describe('isNegativeLevel —— 阴性不该被记成过敏', () => {
    it('阴性返回 true（调用方据此跳过写入）', () => {
      expect(isNegativeLevel('NEGATIVE')).toBe(true);
      expect(isNegativeLevel('negative')).toBe(true);
    });

    it('其余等级都返回 false', () => {
      expect(isNegativeLevel('POSITIVE')).toBe(false);
      expect(isNegativeLevel('UNKNOWN')).toBe(false);
      expect(isNegativeLevel(null)).toBe(false);
    });
  });

  describe('normalizeLevel', () => {
    it('只认这五种，其余一律 UNKNOWN（不猜）', () => {
      expect(normalizeLevel('POSITIVE')).toBe('POSITIVE');
      expect(normalizeLevel('WEAK_POSITIVE')).toBe('WEAK_POSITIVE');
      expect(normalizeLevel('SUSPECTED')).toBe('SUSPECTED');
      expect(normalizeLevel('NEGATIVE')).toBe('NEGATIVE');
      expect(normalizeLevel('UNKNOWN')).toBe('UNKNOWN');
      expect(normalizeLevel('强阳性')).toBe('UNKNOWN');
    });
  });

  describe('normalizeTestMethod', () => {
    it('只认这五种（其余一律 UNKNOWN）', () => {
      expect(normalizeTestMethod('SERUM')).toBe('SERUM');
      expect(normalizeTestMethod('serum')).toBe('SERUM');
      expect(normalizeTestMethod('INTRADERMAL')).toBe('INTRADERMAL');
      expect(normalizeTestMethod('ELIMINATION')).toBe('ELIMINATION');
      expect(normalizeTestMethod('OTHER')).toBe('OTHER');
      expect(normalizeTestMethod('血清检测')).toBe('UNKNOWN');
      expect(normalizeTestMethod(null)).toBe('UNKNOWN');
    });
  });

  describe('canonicalizeAllergen —— 归一成词表标准名', () => {
    it('「鸡胸肉」「鸡肉提取物」这类写法归到「鸡肉」', () => {
      expect(canonicalizeAllergen('鸡胸肉', VOCABULARY)).toBe('鸡肉');
      expect(canonicalizeAllergen('牛肉', VOCABULARY)).toBe('牛肉');
      expect(canonicalizeAllergen('牛腩', VOCABULARY)).toBe('牛肉');
    });

    it('词表里没有的词原样保留 —— 顾客确实会写库里没有的东西', () => {
      // 生产数据里真实出现过「鸵鸟肉」「驴肉」「马肉」
      expect(canonicalizeAllergen('鸵鸟肉', VOCABULARY)).toBe('鸵鸟肉');
      expect(canonicalizeAllergen('驴肉', VOCABULARY)).toBe('驴肉');
    });

    it('归一之后才能和原料库里的食材对上（不做归一等于白记）', () => {
      // 这条断言解释了这个函数存在的意义：
      // 记录里存「鸡胸肉」的话，避雷在原料库里既匹配不到「鸡胸」也匹配不到「鸡肉」。
      const canonical = canonicalizeAllergen('鸡胸肉', VOCABULARY);
      expect(canonical).toBe('鸡肉');
      expect(VOCABULARY.termToCode.has(canonical)).toBe(true);
    });
  });

  describe('mergeCertainty —— 可信度只升不降', () => {
    it('已经是确诊的，不会被后来的弱阳性降级', () => {
      expect(mergeCertainty('CONFIRMED', 'WEAK_POSITIVE')).toBe('CONFIRMED');
    });

    it('新报告写了阳性就升到确诊', () => {
      expect(mergeCertainty('SUSPECTED', 'POSITIVE')).toBe('CONFIRMED');
      expect(mergeCertainty('TO_VERIFY', 'POSITIVE')).toBe('CONFIRMED');
    });

    it('已排除的不会被新报告的"没写等级"翻回来', () => {
      expect(mergeCertainty('RULED_OUT', 'UNKNOWN')).toBe('RULED_OUT');
    });
  });

  describe('normalizeResults', () => {
    it('去空白、按过敏原去重、限量', () => {
      const results = normalizeResults([
        { allergen: ' 鸡肉 ', level: 'POSITIVE' },
        { allergen: '鸡肉', level: 'NEGATIVE' },
        { allergen: '牛肉', level: 'WEAK_POSITIVE' },
        { allergen: '', level: 'POSITIVE' },
      ]);

      expect(results).toEqual([
        { allergen: '鸡肉', level: 'POSITIVE', notes: null },
        { allergen: '牛肉', level: 'WEAK_POSITIVE', notes: null },
      ]);
    });

    it('不是数组时返回空数组', () => {
      expect(normalizeResults(null)).toEqual([]);
      expect(normalizeResults('鸡肉')).toEqual([]);
    });

    it('超过 60 项时明确报错，而不是静默截断', () => {
      const tooMany = Array.from({ length: 61 }, (_, index) => ({
        allergen: `过敏原${index}`,
      }));
      expect(() => normalizeResults(tooMany)).toThrow();
    });
  });

  describe('parseDate —— 日期只认格式，不猜', () => {
    it('接受 YYYY-MM-DD 与中文写法', () => {
      expect(parseDate('2026-03-12')?.toISOString()).toBe(
        '2026-03-12T00:00:00.000Z',
      );
      expect(parseDate('2026/3/12')?.toISOString()).toBe(
        '2026-03-12T00:00:00.000Z',
      );
      expect(parseDate('2026年3月12日')?.toISOString()).toBe(
        '2026-03-12T00:00:00.000Z',
      );
    });

    it('看不清的一律当没填，而不是编一个日期', () => {
      expect(parseDate('')).toBeNull();
      expect(parseDate('看不清')).toBeNull();
      expect(parseDate('2026-13-45')).toBeNull();
      expect(parseDate('1899-01-01')).toBeNull();
    });
  });
});
