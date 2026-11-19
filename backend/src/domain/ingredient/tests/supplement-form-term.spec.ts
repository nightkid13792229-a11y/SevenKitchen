import { buildAliases } from '../supplement-form-term';

describe('buildAliases', () => {
  it('覆盖连字符与空格写法', () => {
    expect(buildAliases('Bis-Glycinate')).toEqual(
      expect.arrayContaining(['Bis-Glycinate', 'bis-glycinate', 'bisglycinate']),
    );
  });

  it('中文原样保留', () => {
    expect(buildAliases('双甘氨酸盐')).toEqual(expect.arrayContaining(['双甘氨酸盐']));
  });

  it('空串返回空数组', () => {
    expect(buildAliases('   ')).toEqual([]);
  });

  it('不会产生重复别名', () => {
    const aliases = buildAliases('oxide');
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
