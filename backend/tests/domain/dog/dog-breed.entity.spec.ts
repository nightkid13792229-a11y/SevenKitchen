import { DogBreed } from '../../../src/domain/dog/dog-breed.entity';


/**
 * 体况分下限（深胸细腰型犬）的领域校验。
 *
 * 这个值会直接参与目标体重换算，写错（比如 0 或 12）会让小程序
 * 把一个不存在的分数写进狗的档案，所以实体层就要挡住。
 */
describe('DogBreed bcsScoreFloor', () => {
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

  it('留空（null）表示不做修正 —— 绝大多数犬种都是这样', () => {
    const breed = new DogBreed(
      base.id, base.name, base.aliases, base.sizeCategory,
      base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
      base.averageAdultWeightKg, base.isCommon, null,
    );
    expect(breed.bcsScoreFloor).toBeNull();
  });

  it('可以设成 1-9 之间的整数', () => {
    for (const floor of [1, 4, 5, 9]) {
      const breed = new DogBreed(
        base.id, base.name, base.aliases, base.sizeCategory,
        base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
        base.averageAdultWeightKg, base.isCommon, floor,
      );
      expect(breed.bcsScoreFloor).toBe(floor);
    }
  });

  it('超出 1-9 或不是整数 → 报错（否则会写出不存在的体况分）', () => {
    for (const floor of [0, 10, -1, 3.5]) {
      expect(
        () =>
          new DogBreed(
            base.id, base.name, base.aliases, base.sizeCategory,
            base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
            base.averageAdultWeightKg, base.isCommon, floor,
          ),
      ).toThrow();
    }
  });

  it('不传就是 null（新增犬种时不必关心这个字段）', () => {
    const breed = new DogBreed(
      base.id, base.name, base.aliases, base.sizeCategory,
      base.growthCurveType, base.adultAgeMonths, base.seniorAgeYears,
      base.averageAdultWeightKg, base.isCommon,
    );
    expect(breed.bcsScoreFloor).toBeNull();
  });
});
