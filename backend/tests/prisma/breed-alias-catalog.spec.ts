import { mergeBreedAliases, BREED_ALIAS_CATALOG } from '../../prisma/breed-alias-catalog';

/**
 * 品种别名 catalog（2026-09-27 修订）
 *
 * ⚠️ 2026-09-27 发现并修复的一类隐性问题：
 * catalog 的键必须与数据库里的**品种名完全一致**，否则 backfill 脚本会打印
 * 「Missing breed in database, skipped」静默跳过 —— 写了等于没写。
 * 当时存在 8 个这样的失效键（半角括号、错别字、把别名当品种名、以及
 * 把「串串 / 中华田园犬」这种根本不该建品种的名字当键）。
 * 而旧测试恰好断言了这些失效键，所以漂移一直没被发现。
 *
 * 因此这里除了保留原有断言，还显式锁住「不得再出现失效键」。
 */
describe('breed alias catalog', () => {
  it('provides curated aliases for high-frequency breeds', () => {
    // 「边牧」是别名而不是品种名：正确写法是挂在 边境牧羊犬 下
    expect(BREED_ALIAS_CATALOG['边境牧羊犬']).toEqual(
      expect.arrayContaining(['边牧', '边境牧羊']),
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
    // 2026-09-27：老板要求把「迷你品」改译为「迷你宾莎犬」，键名同步更新，
    // 并把顾客实际在用的叫法（小鹿犬 / 鹿犬 / 宾沙 / 宾莎）都收进来
    expect(BREED_ALIAS_CATALOG['迷你宾莎犬']).toEqual(
      expect.arrayContaining([
        '迷你品',
        '迷你宾沙犬',
        '迷你杜宾',
        '迷你杜宾犬',
        '小鹿犬',
        '鹿犬',
      ]),
    );
  });

  it('2026-09-27 新增：生产手填名对应的品种别名', () => {
    expect(BREED_ALIAS_CATALOG['日本尖嘴犬']).toEqual(
      expect.arrayContaining(['银狐', '銀狐', '银狐犬']),
    );
    expect(BREED_ALIAS_CATALOG['英国激飞猎犬']).toEqual(
      expect.arrayContaining(['史宾格']),
    );
    expect(BREED_ALIAS_CATALOG['美国可卡犬']).toEqual(
      expect.arrayContaining(['美卡']),
    );
    // 老板确认：土松 归到 中国本土松狮犬
    expect(BREED_ALIAS_CATALOG['中国本土松狮犬']).toEqual(
      expect.arrayContaining(['土松', '土松犬']),
    );
    // 巨贵 = 巨型贵宾
    expect(BREED_ALIAS_CATALOG['贵宾犬（巨型）']).toEqual(
      expect.arrayContaining(['巨贵']),
    );
  });

  it('不得再出现「键不在数据库里」的失效条目', () => {
    // 这些键曾存在于 catalog 但数据库里没有同名品种，导致静默失效：
    //  - 半角括号：贵宾犬(小型) / 贵宾犬(标准) / 雪纳瑞(小型)
    //  - 错别字：雪纳犬(标准)（漏了「瑞」）
    //  - 别名被当成品种名：泰迪 / 德牧 / 边牧
    //  - 不该建品种：串串 / 中华田园犬（已由建档页「没有明确品种」一键选项承接）
    const removedKeys = [
      '泰迪',
      '贵宾犬(小型)',
      '贵宾犬(标准)',
      '德牧',
      '边牧',
      '雪纳瑞(小型)',
      '雪纳犬(标准)',
      '巨型雪纳瑞',
      '串串',
      '中华田园犬',
      '迷你品',
      // 2026-09-27 第二轮清扫（生产预演又暴露的 5 个）：
      //  - 马犬 / 惠比特：键名与库中真实名称不符（应为 比利时牧羊犬 / 惠比特犬）
      //  - 意大利灵缇 / 罗秦犬 / 墨西哥无毛犬：库里根本没有这三个品种
      '马犬',
      '惠比特',
      '意大利灵缇',
      '罗秦犬',
      '墨西哥无毛犬',
    ];

    for (const key of removedKeys) {
      expect(BREED_ALIAS_CATALOG[key]).toBeUndefined();
    }
  });

  it('merges aliases while preserving existing values and deduplicating', () => {
    expect(
      mergeBreedAliases('边境牧羊犬', ['边牧', '边境牧羊', '边牧']),
    ).toEqual(['边牧', '边境牧羊']);
  });

  it('filters blank aliases and aliases that equal the canonical breed name', () => {
    expect(
      mergeBreedAliases('贵宾犬（小型）', [
        '  ',
        '贵宾犬（小型）',
        '泰迪',
        '贵宾犬',
      ]),
    ).toEqual(['泰迪', '贵宾犬', '迷你贵宾犬', '迷你贵宾']);
  });
});
