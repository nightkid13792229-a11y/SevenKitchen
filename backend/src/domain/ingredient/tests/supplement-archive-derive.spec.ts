import {
  buildPackSpec,
  extractPriceCny,
  inferLabelCategory,
} from '../supplement-archive-derive';

describe('buildPackSpec', () => {
  it('拼出「180粒/瓶，18mg铁/粒」', () => {
    expect(
      buildPackSpec({
        perBottleUnits: 180,
        unitLabel: '粒',
        nutrients: [{ label: '铁', amount: 18, unit: 'mg' }],
      }),
    ).toBe('180粒/瓶，18mg铁/粒');
  });

  it('没有含量时只写瓶规', () => {
    expect(buildPackSpec({ perBottleUnits: 120, unitLabel: '粒', nutrients: [] })).toBe('120粒/瓶');
  });

  it('读不出瓶规就返回 null，不编', () => {
    expect(buildPackSpec({ perBottleUnits: null, unitLabel: '粒', nutrients: [] })).toBeNull();
  });

  it('粉按克', () => {
    expect(
      buildPackSpec({
        perBottleUnits: 500,
        unitLabel: 'g',
        nutrients: [{ label: 'EPA', amount: 180, unit: 'mg' }],
      }),
    ).toBe('500g/瓶，180mgEPA/g');
  });
});

describe('extractPriceCny', () => {
  it('认 ¥ 价格', () => {
    expect(extractPriceCny('¥77.02 已含税')).toBe(77.02);
  });

  it('认「价格：」写法', () => {
    expect(extractPriceCny('价格： 168')).toBe(168);
  });

  it('没有价格返回 null', () => {
    expect(extractPriceCny('180 粒胶囊')).toBeNull();
  });
});

describe('inferLabelCategory', () => {
  it('命中原料目录、没命中添加剂 → 饲料原料', () => {
    expect(
      inferLabelCategory({ modelSaid: null, additiveMatched: false, materialMatched: true }),
    ).toBe('FEED_MATERIAL');
  });

  it('模型说添加剂但只命中原料目录 → 纠成原料', () => {
    expect(
      inferLabelCategory({ modelSaid: 'FEED_ADDITIVE', additiveMatched: false, materialMatched: true }),
    ).toBe('FEED_MATERIAL');
  });

  it('两边都没命中 → 听模型的', () => {
    expect(
      inferLabelCategory({ modelSaid: 'FEED_ADDITIVE', additiveMatched: false, materialMatched: false }),
    ).toBe('FEED_ADDITIVE');
  });

  it('什么都没说、也没命中 → 留空', () => {
    expect(
      inferLabelCategory({ modelSaid: null, additiveMatched: false, materialMatched: false }),
    ).toBeNull();
  });
});
