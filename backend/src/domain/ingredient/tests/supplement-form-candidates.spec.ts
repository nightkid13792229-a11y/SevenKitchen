import {
  filterTermsByNutrient,
  mentionsNutrient,
  normalizeTermKey,
} from '../supplement-form-candidates';

describe('normalizeTermKey', () => {
  it('大小写、连字符、空格都归一成同一个键', () => {
    expect(normalizeTermKey('Bis-Glycinate')).toBe('bisglycinate');
    expect(normalizeTermKey('  methyl cobalamin ')).toBe('methylcobalamin');
    expect(normalizeTermKey('re-esterified triglyceride')).toBe('reesterifiedtriglyceride');
  });

  it('中文词原样保留', () => {
    expect(normalizeTermKey('双甘氨酸盐')).toBe('双甘氨酸盐');
  });

  it('空串不抛错', () => {
    expect(normalizeTermKey('   ')).toBe('');
  });
});

describe('mentionsNutrient', () => {
  it('标题里没提到这个营养素 → 不算它的形态', () => {
    expect(mentionsNutrient('B-Complex 50 mg', 'vitamins.vitaminB12')).toBe(false);
  });

  it('完整名能命中', () => {
    expect(mentionsNutrient('Vitamin B12 Methylcobalamin 1000 mcg', 'vitamins.vitaminB12')).toBe(
      true,
    );
  });

  it('缩写与别称也能命中（B12 / cobalamin）', () => {
    expect(mentionsNutrient('B12 1000 mcg', 'vitamins.vitaminB12')).toBe(true);
    expect(mentionsNutrient('Methylcobalamin 1000 mcg', 'vitamins.vitaminB12')).toBe(true);
  });

  it('连字符写法能命中', () => {
    expect(mentionsNutrient('Vitamin B-12 Complex', 'vitamins.vitaminB12')).toBe(true);
  });

  it('铜不会因为标题里有 copper 之外的东西被误判', () => {
    expect(mentionsNutrient('Zinc Picolinate 15 mg', 'minerals.copper')).toBe(false);
    expect(mentionsNutrient('Copper Bisglycinate 2 mg', 'minerals.copper')).toBe(true);
  });
});

describe('filterTermsByNutrient', () => {
  it('只留下标题里确实提到该营养素的词，并按归一化键去重计数', () => {
    const terms = [
      { surface: 'Bisglycinate', title: 'Copper Bisglycinate 2 mg', nutrientKey: 'minerals.copper' },
      { surface: 'bis-glycinate', title: 'Copper Bis-Glycinate 3 mg', nutrientKey: 'minerals.copper' },
      { surface: 'Oxide', title: 'Zinc Oxide 50 mg', nutrientKey: 'minerals.copper' },
    ];
    const kept = filterTermsByNutrient(terms);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ key: 'bisglycinate', count: 2 });
  });
});
