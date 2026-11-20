import { formAliasesOf, matchesForm } from '../supplement-form-match';

describe('matchesForm', () => {
  it('标题里出现正名就算同形态', () => {
    expect(matchesForm('Source Naturals, 铜, 3 毫克, 120 片', ['硫酸铜'])).toBe(false);
    expect(matchesForm('Solaray, 甘氨酸铜 2 毫克, 60 粒', ['甘氨酸铜'])).toBe(true);
  });

  it('别称也算', () => {
    expect(
      matchesForm('Nutricost, 双甘氨酸铜, 3 毫克, 120 粒', ['甘氨酸铜', '双甘氨酸铜']),
    ).toBe(true);
  });

  it('大小写与分隔符不影响', () => {
    expect(matchesForm('Copper Bisglycinate 2 mg', ['bis-glycinate'])).toBe(true);
  });

  it('没有别称就永远不匹配（宁可标"形态不同"，也不瞎认）', () => {
    expect(matchesForm('任何商品', [])).toBe(false);
  });
});

describe('formAliasesOf', () => {
  it('正名 + 别称去重', () => {
    expect(formAliasesOf('甘氨酸铜', ['双甘氨酸铜', '甘氨酸铜', ''])).toEqual([
      '甘氨酸铜',
      '双甘氨酸铜'
    ]);
  });
});
