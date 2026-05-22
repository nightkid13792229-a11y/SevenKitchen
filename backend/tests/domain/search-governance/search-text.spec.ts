import {
  calculateEditDistance,
  isCjkOnlyQuery,
  normalizeSearchText,
} from '../../../src/domain/search-governance/search-text';

describe('search text helpers', () => {
  it('normalizes whitespace, width, case, and punctuation', () => {
    expect(normalizeSearchText('  Ｃhicken Breast（生） ')).toBe('chickenbreast生');
    expect(normalizeSearchText('鸡 胸-肉')).toBe('鸡胸肉');
  });

  it('recognizes short CJK-only queries for conservative typo matching', () => {
    expect(isCjkOnlyQuery('西蓝花')).toBe(true);
    expect(isCjkOnlyQuery('broccoli')).toBe(false);
    expect(isCjkOnlyQuery('西蓝花broccoli')).toBe(false);
  });

  it('calculates edit distance for Chinese near matches', () => {
    expect(calculateEditDistance('西蓝花', '西兰花')).toBe(1);
    expect(calculateEditDistance('鸡胸肉', '鸡胸')).toBe(1);
  });
});
