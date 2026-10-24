import {
  DraftHealthTagPolicy,
  lowFatLimit,
} from 'src/application/recipe-designer/agent/draft-health-tag-policy';

function policy(
  overrides: Partial<{
    fatWetPercent: number | null;
    moisturePercent: number | null;
    animalSpecies: string[];
    unknownAnimalProtein: boolean;
  }> = {},
) {
  return new DraftHealthTagPolicy({
    fatWetPercent: 8,
    moisturePercent: 60,
    animalSpecies: ['鸭'],
    unknownAnimalProtein: false,
    ...overrides,
  });
}

describe('DraftHealthTagPolicy', () => {
  it('低脂按水分分档', () => {
    expect(lowFatLimit(19)).toBe(9);
    expect(lowFatLimit(20)).toBe(7);
    expect(lowFatLimit(65)).toBe(7);
    expect(lowFatLimit(66)).toBe(4);
  });

  it('低脂达标/不达标/缺数据', () => {
    expect(
      policy({ fatWetPercent: 7, moisturePercent: 60 }).isAllowedTag('低脂'),
    ).toBe(true);
    expect(
      policy({ fatWetPercent: 7.1, moisturePercent: 60 }).isAllowedTag('低脂'),
    ).toBe(false);
    expect(
      policy({ fatWetPercent: null, moisturePercent: 60 }).isAllowedTag('低脂'),
    ).toBe(false);
    expect(
      policy({ fatWetPercent: 7, moisturePercent: null }).isAllowedTag('低脂'),
    ).toBe(false);
  });

  it('单一动物蛋白只认一种', () => {
    expect(policy({ animalSpecies: ['鸭'] }).isAllowedTag('单一动物蛋白')).toBe(
      true,
    );
    expect(
      policy({ animalSpecies: ['鸭', '鸡'] }).isAllowedTag('单一动物蛋白'),
    ).toBe(false);
    expect(policy({ animalSpecies: [] }).isAllowedTag('单一动物蛋白')).toBe(
      false,
    );
    // trim + 大小写不敏感去重后仍是同一种。
    expect(
      policy({ animalSpecies: ['鸭', ' 鸭 '] }).isAllowedTag('单一动物蛋白'),
    ).toBe(true);
    expect(
      policy({ animalSpecies: ['Chicken', 'chicken'] }).isAllowedTag(
        '单一动物蛋白',
      ),
    ).toBe(true);
  });

  it('有识别不出的蛋白项时单一动物蛋白 fail closed', () => {
    expect(
      policy({
        animalSpecies: ['鸭'],
        unknownAnimalProtein: true,
      }).isAllowedTag('单一动物蛋白'),
    ).toBe(false);
    // 不传（旧调用）按 false 处理，保持原有“恰好一种”的口径。
    expect(
      new DraftHealthTagPolicy({
        fatWetPercent: 8,
        moisturePercent: 60,
        animalSpecies: ['鸭'],
      }).isAllowedTag('单一动物蛋白'),
    ).toBe(true);
  });

  it('易消化永远 false，其他标签 false', () => {
    const passing = policy({ fatWetPercent: 1, animalSpecies: ['鸭'] });
    // 数值和物种都满足低脂/单一动物蛋白时，易消化仍必须 false（只能人工挂）。
    expect(passing.isAllowedTag('低脂')).toBe(true);
    expect(passing.isAllowedTag('单一动物蛋白')).toBe(true);
    expect(passing.isAllowedTag('易消化')).toBe(false);
    expect(policy().isAllowedTag('体重管理')).toBe(false);
  });
});
