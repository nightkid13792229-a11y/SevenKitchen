import {
  authorityWeight,
  recencyWeight,
} from '../../../src/application/knowledge-base/knowledge-library.service';
import { parseYear } from '../../../src/application/knowledge-base/section-catalog.service';

describe('authorityWeight', () => {
  it('指南 > 教科书 > 综述 > 内部经验', () => {
    expect(authorityWeight('guideline')).toBeGreaterThan(
      authorityWeight('textbook'),
    );
    expect(authorityWeight('textbook')).toBeGreaterThan(
      authorityWeight('reference'),
    );
    expect(authorityWeight('reference')).toBeGreaterThan(
      authorityWeight('internal'),
    );
  });

  it('未知/空值中性', () => {
    expect(authorityWeight(undefined)).toBe(1);
    expect(authorityWeight(null)).toBe(1);
    expect(authorityWeight('whatever')).toBe(1);
  });
});

describe('recencyWeight', () => {
  it('2020 后加成，2012 前降权', () => {
    expect(recencyWeight(2021)).toBeGreaterThan(1);
    expect(recencyWeight(2010)).toBeLessThan(1);
  });

  it('未知年份不惩罚', () => {
    expect(recencyWeight(null)).toBe(1);
    expect(recencyWeight(undefined)).toBe(1);
  });
});

describe('parseYear', () => {
  it('从版本串里取四位年份', () => {
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear('2021 update')).toBe(2021);
    expect(parseYear('v2 2019')).toBe(2019);
  });

  it('取不到返回 null', () => {
    expect(parseYear('')).toBeNull();
    expect(parseYear(undefined)).toBeNull();
  });
});
