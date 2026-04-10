import { mergeBreedAliases, BREED_ALIAS_CATALOG } from '../../prisma/breed-alias-catalog';

describe('breed alias catalog', () => {
  it('provides curated aliases for high-frequency breeds', () => {
    expect(BREED_ALIAS_CATALOG['边牧']).toEqual(
      expect.arrayContaining(['边境牧羊犬', '边境牧羊']),
    );
  });

  it('covers the next batch of common pet dog breed aliases', () => {
    expect(BREED_ALIAS_CATALOG['阿拉斯加']).toEqual(
      expect.arrayContaining(['阿拉斯加犬', '阿拉斯加雪橇犬']),
    );
    expect(BREED_ALIAS_CATALOG['巴哥犬']).toEqual(
      expect.arrayContaining(['巴哥', '哈巴狗']),
    );
    expect(BREED_ALIAS_CATALOG['吉娃娃']).toEqual(
      expect.arrayContaining(['吉娃娃犬', '奇娃娃']),
    );
    expect(BREED_ALIAS_CATALOG['迷你品']).toEqual(
      expect.arrayContaining(['迷你杜宾', '迷你杜宾犬']),
    );
  });

  it('merges aliases while preserving existing values and deduplicating', () => {
    expect(
      mergeBreedAliases('边牧', ['边境牧羊犬', '边境牧羊', '边境牧羊犬']),
    ).toEqual(['边境牧羊犬', '边境牧羊']);
  });

  it('filters blank aliases and aliases that equal the canonical breed name', () => {
    expect(
      mergeBreedAliases('泰迪', ['  ', '泰迪', '泰迪犬', '贵宾犬']),
    ).toEqual(['泰迪犬', '贵宾犬', '玩具贵宾犬']);
  });
});
