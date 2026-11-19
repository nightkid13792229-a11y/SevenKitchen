import {
  canonicalProductKey,
  cleanProductName,
  dedupeCandidates,
} from '../supplement-offer-candidates';

describe('canonicalProductKey', () => {
  it('同一商品的不同链接归成一个键', () => {
    const a = 'https://www.iherb.com/pr/nutricology-chelated-copper-60-capsules/12345';
    const b = 'https://cn.iherb.com/pr/nutricology-chelated-copper-60-capsules/12345?rcode=XYZ';
    expect(canonicalProductKey(a)).toBe('iherb:12345');
    expect(canonicalProductKey(b)).toBe('iherb:12345');
  });

  it('认不出商品 id 时退回去掉查询串的链接', () => {
    expect(canonicalProductKey('https://www.iherb.com/search?kw=copper')).toBe(
      'https://www.iherb.com/search',
    );
  });
});

describe('cleanProductName', () => {
  it('去掉「您的首选项已更新」这种站点尾巴', () => {
    expect(cleanProductName('Vitacost, Chelated Copper, 60 Capsules - 您的首选项已更新')).toBe(
      'Vitacost, Chelated Copper, 60 Capsules',
    );
  });

  it('正常名字不动', () => {
    expect(cleanProductName("Nature's Way, Zinc, 30 mg, 100 Capsules")).toBe(
      "Nature's Way, Zinc, 30 mg, 100 Capsules",
    );
  });
});

describe('dedupeCandidates', () => {
  it('同一件商品只留第一次出现，并清洗名字', () => {
    const result = dedupeCandidates([
      { url: 'https://www.iherb.com/pr/a/111', name: 'A - 您的首选项已更新' },
      { url: 'https://cn.iherb.com/pr/a/111', name: 'A' },
      { url: 'https://www.iherb.com/pr/b/222', name: 'B' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(['A', 'B']);
  });
});
