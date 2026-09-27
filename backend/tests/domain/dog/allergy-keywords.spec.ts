import {
  collectAllergyKeywords,
  formatAllergyKeywordsForAi,
  splitAllergyKeywords,
} from 'src/domain/dog/allergy-keywords';

/**
 * 过敏原来源合并（2026-09-27）
 *
 * 背景：过敏信息一直有两个来源，而且读的人各读各的 ——
 *   · `dog.allergyFoods`（旧文本字段）：只有后台设计备注在写，顾客端没有入口
 *   · `allergy_record` 表（结构化记录）：顾客在健康档案/定制单里真正填的那一份
 * 首页推荐与 AI 配方过去只看前者，于是「顾客在健康档案里写了过敏、系统照样推荐含过敏原的食谱」。
 *
 * 这组测试锁住合并规则，避免再次出现只读一侧的回归。
 */
describe('allergy keyword sources', () => {
  describe('splitAllergyKeywords', () => {
    it('按中英文分隔符拆开一句话里的多个过敏原', () => {
      expect(splitAllergyKeywords('鸡肉、牛肉,羊肉；鸭肉;鱼肉')).toEqual([
        '鸡肉',
        '牛肉',
        '羊肉',
        '鸭肉',
        '鱼肉',
      ]);
    });

    it('统一转小写并去掉空白，便于和食材名做包含匹配', () => {
      expect(splitAllergyKeywords('  Chicken , BEEF ')).toEqual([
        'chicken',
        'beef',
      ]);
    });

    it('空值返回空数组', () => {
      expect(splitAllergyKeywords(null)).toEqual([]);
      expect(splitAllergyKeywords(undefined)).toEqual([]);
      expect(splitAllergyKeywords('')).toEqual([]);
      expect(splitAllergyKeywords('   ')).toEqual([]);
    });

    it('支持换行分隔（顾客在文本框里一行写一个）', () => {
      expect(splitAllergyKeywords('鸡肉\n牛肉\r\n羊肉')).toEqual([
        '鸡肉',
        '牛肉',
        '羊肉',
      ]);
    });
  });

  describe('collectAllergyKeywords', () => {
    it('旧文本字段为空时，也能取到顾客在健康档案里填的结构化记录', () => {
      // 这是最关键的一条：新档案的 allergyFoods 恒为 null，
      // 改造前这种情况下降级为「没有过敏」，推荐完全不做避雷。
      expect(
        collectAllergyKeywords({
          allergyFoods: null,
          allergens: ['鸡肉'],
        }),
      ).toEqual(['鸡肉']);
    });

    it('两边都有值时合并，而不是只取其一', () => {
      expect(
        collectAllergyKeywords({
          allergyFoods: '牛肉',
          allergens: ['鸡肉'],
        }),
      ).toEqual(['牛肉', '鸡肉']);
    });

    it('同一过敏原出现在两侧时去重（避免重复扣分与重复提示）', () => {
      expect(
        collectAllergyKeywords({
          allergyFoods: '鸡肉、牛肉',
          allergens: ['鸡肉'],
        }),
      ).toEqual(['鸡肉', '牛肉']);
    });

    it('结构化记录里一条写了多个过敏原时同样拆开', () => {
      expect(
        collectAllergyKeywords({
          allergens: ['鸡肉、牛肉'],
        }),
      ).toEqual(['鸡肉', '牛肉']);
    });

    it('两边都没有时返回空数组', () => {
      expect(collectAllergyKeywords({})).toEqual([]);
      expect(
        collectAllergyKeywords({ allergyFoods: null, allergens: [] }),
      ).toEqual([]);
    });

    it('容忍 allergens 里混入空值', () => {
      expect(
        collectAllergyKeywords({
          allergens: ['鸡肉', null, undefined, '  '],
        }),
      ).toEqual(['鸡肉']);
    });
  });

  describe('formatAllergyKeywordsForAi', () => {
    it('拼成顿号分隔的字符串，保持 AI 侧字段原有形状', () => {
      expect(formatAllergyKeywordsForAi(['鸡肉', '牛肉'])).toBe('鸡肉、牛肉');
    });

    it('空列表返回 null，而不是空字符串或 undefined', () => {
      expect(formatAllergyKeywordsForAi([])).toBeNull();
    });
  });
});
