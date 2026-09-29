import { DogBreed } from '../../../src/domain/dog/dog-breed.entity';


/**
 * 体况问卷选项换算表（深胸细腰型犬）的领域校验。
 *
 * 这张表会直接参与体况分换算，写错（长度不对、分数越界）会让小程序
 * 把一个不存在的分数写进狗的档案，所以实体层就要挡住。
 */
describe('DogBreed bcsScoreMap', () => {
  const base = {
    id: 'breed-1',
    name: '灵缇',
    aliases: [],
    sizeCategory: 'LARGE' as any,
    growthCurveType: 'ADULT' as any,
    adultAgeMonths: 12,
    seniorAgeYears: 7,
    averageAdultWeightKg: 30,
    isCommon: false,
  };

  const build = (map: number[]) =>
    new DogBreed(
      base.id, base.name, base.aliases, base.sizeCategory,
      base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
      base.averageAdultWeightKg, base.isCommon, map,
    );

  it('空数组表示用标准分 —— 绝大多数犬种都是这样', () => {
    expect(build([]).bcsScoreMap).toEqual([]);
  });

  it('不传也是空数组（新增犬种时不必关心这个字段）', () => {
    const breed = new DogBreed(
      base.id, base.name, base.aliases, base.sizeCategory,
      base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
      base.averageAdultWeightKg, base.isCommon,
    );
    expect(breed.bcsScoreMap).toEqual([]);
  });

  it('灵缇的换算表 [4,5,6,7,9] 合法', () => {
    expect(build([4, 5, 6, 7, 9]).bcsScoreMap).toEqual([4, 5, 6, 7, 9]);
  });

  it('长度必须与问卷选项数一致（否则小程序会整表忽略）', () => {
    for (const bad of [[4, 5, 6, 7], [4, 5, 6, 7, 9, 9], [1, 2, 3]]) {
      expect(() => build(bad)).toThrow();
    }
  });

  it('每档都必须是 1-9 的整数', () => {
    for (const bad of [[4, 5, 6, 7, 0], [4, 5, 6, 7, 10], [4, 5, 6, 7, 4.5]]) {
      expect(() => build(bad)).toThrow();
    }
  });
});
