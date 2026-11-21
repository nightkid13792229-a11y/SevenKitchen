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

  it('粉按克：写每份多少克含多少', () => {
    expect(
      buildPackSpec({
        perBottleUnits: 227,
        unitLabel: 'g',
        servingUnits: 0.9,
        nutrients: [{ label: '牛磺酸', amount: 0.875, unit: 'g' }],
      }),
    ).toBe('227g/瓶，每份0.9g含0.875g牛磺酸');
  });

  it('胶囊每份 2 粒时写「每份2粒含」', () => {
    expect(
      buildPackSpec({
        perBottleUnits: 180,
        unitLabel: '粒',
        servingUnits: 2,
        nutrients: [{ label: '铁', amount: 18, unit: 'mg' }],
      }),
    ).toBe('180粒/瓶，每份2粒含18mg铁');
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
