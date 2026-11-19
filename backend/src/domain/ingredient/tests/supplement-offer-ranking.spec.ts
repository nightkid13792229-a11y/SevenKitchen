import {
  rankOffers,
  recommendOffer,
  resolvePriceBasis,
  sumBasisAmount,
  type LabelNutrient,
  type OfferFacts,
} from '../supplement-offer-ranking';

function offer(overrides: Partial<OfferFacts> = {}): OfferFacts {
  return {
    url: 'https://www.iherb.com/pr/x/1',
    name: 'Copper Bisglycinate 2 mg',
    priceCny: 120,
    unitsPerBottle: 120,
    servingUnitsPerDose: 2,
    amountPerServing: 2,
    formLevel: 'ORGANIC_CHELATE',
    compound: false,
    ...overrides,
  };
}

describe('resolvePriceBasis', () => {
  it('矿物质按元素量，每 1000mg', () => {
    const rule = resolvePriceBasis('minerals.copper');
    expect(rule.unit).toBe('MG');
    expect(rule.per).toBe(1000);
    expect(rule.basisLabel).toBe('元素量');
    expect(rule.fieldPaths).toEqual(['minerals.copper']);
  });

  it('鱼油按 EPA+DHA 合计', () => {
    const rule = resolvePriceBasis('fattyAcids.epa');
    expect(rule.basisLabel).toBe('EPA+DHA 合计');
    expect(rule.fieldPaths).toEqual(['fattyAcids.epa', 'fattyAcids.dha']);
  });

  it('维生素 D 按 IU', () => {
    const rule = resolvePriceBasis('vitamins.vitaminD');
    expect(rule.unit).toBe('IU');
    expect(rule.basisLabel).toBe('标示量');
  });

  it('认不出的字段按标示量处理，不抛错', () => {
    const rule = resolvePriceBasis('macros.protein');
    expect(rule.basisLabel).toBe('标示量');
    expect(rule.fieldPaths).toEqual(['macros.protein']);
  });
});

describe('sumBasisAmount', () => {
  const nutrients: LabelNutrient[] = [
    { fieldPath: 'fattyAcids.epa', value: 0.65, unit: 'g' },
    { fieldPath: 'fattyAcids.dha', value: 0.45, unit: 'g' },
  ];

  it('EPA 与 DHA 相加，g 换成 mg', () => {
    const rule = resolvePriceBasis('fattyAcids.epa');
    expect(sumBasisAmount(nutrients, rule)).toBeCloseTo(1100);
  });

  it('µg 换成 mg', () => {
    const rule = resolvePriceBasis('minerals.selenium');
    expect(
      sumBasisAmount([{ fieldPath: 'minerals.selenium', value: 200, unit: 'µg' }], rule),
    ).toBeCloseTo(0.2);
  });

  it('一行都没命中就是 null，不拿 0 充数', () => {
    const rule = resolvePriceBasis('minerals.zinc');
    expect(sumBasisAmount(nutrients, rule)).toBeNull();
  });

  it('单位看不懂就是 null', () => {
    const rule = resolvePriceBasis('minerals.zinc');
    expect(
      sumBasisAmount([{ fieldPath: 'minerals.zinc', value: 15, unit: 'drops' }], rule),
    ).toBeNull();
  });
});

describe('rankOffers', () => {
  it('120 粒/瓶、每份 2 粒、每份 2mg、¥120 → 60 份、每份 ¥2、每 1000mg ¥1000', () => {
    const [row] = rankOffers([offer()], 'ORGANIC_CHELATE');
    expect(row.servingsPerBottle).toBe(60);
    expect(row.pricePerServing).toBe(2);
    expect(row.pricePerThousand).toBe(1000);
    expect(row.missing).toEqual([]);
  });

  it('缺价格就算不出，并写明缺价格', () => {
    const [row] = rankOffers([offer({ priceCny: null })], null);
    expect(row.pricePerThousand).toBeNull();
    expect(row.missing).toContain('PRICE');
  });

  it('缺每瓶粒数、缺每份粒数、缺含量分别写清楚', () => {
    expect(rankOffers([offer({ unitsPerBottle: null })], null)[0].missing).toContain(
      'UNITS_PER_BOTTLE',
    );
    expect(rankOffers([offer({ servingUnitsPerDose: null })], null)[0].missing).toContain(
      'SERVING_UNITS',
    );
    expect(rankOffers([offer({ amountPerServing: null })], null)[0].missing).toContain(
      'AMOUNT',
    );
  });

  it('复合配方单列，不参与单价排序', () => {
    const [row] = rankOffers([offer({ compound: true, amountPerServing: null })], null);
    expect(row.missing).toContain('COMPOUND_PRODUCT');
    expect(row.pricePerThousand).toBeNull();
  });

  it('同档按单价升序，算不出的排最后且不淘汰', () => {
    const cheap = offer({ url: 'cheap', priceCny: 60 });
    const pricey = offer({ url: 'pricey', priceCny: 240 });
    const unknown = offer({ url: 'unknown', priceCny: null });
    const rows = rankOffers([pricey, unknown, cheap], 'ORGANIC_CHELATE');
    expect(rows.map((row) => row.url)).toEqual(['cheap', 'pricey', 'unknown']);
    expect(rows).toHaveLength(3);
  });

  it('形态不同档的排在后面，但仍然保留', () => {
    const same = offer({ url: 'same', priceCny: 240 });
    const other = offer({ url: 'other', priceCny: 60, formLevel: 'INORGANIC_SALT' });
    const rows = rankOffers([other, same], 'ORGANIC_CHELATE');
    expect(rows.map((row) => row.url)).toEqual(['same', 'other']);
  });
});

describe('recommendOffer', () => {
  const rule = resolvePriceBasis('minerals.copper');

  it('推荐同档里能算出单价的最便宜那瓶，理由带两位小数', () => {
    const rows = rankOffers(
      [
        offer({ url: 'a', name: 'A 牌', priceCny: 120 }),
        offer({ url: 'b', name: 'B 牌', priceCny: 240 }),
      ],
      'ORGANIC_CHELATE',
    );
    const result = recommendOffer(rows, rule);
    expect(result.url).toBe('a');
    expect(result.reason).toContain('A 牌');
    expect(result.reason).toContain('¥1000.00');
  });

  it('一瓶都算不出就不推荐，并说清楚', () => {
    const rows = rankOffers([offer({ priceCny: null })], null);
    const result = recommendOffer(rows, rule);
    expect(result.url).toBeNull();
    expect(result.reason).toContain('比不出单价');
  });

  it('只推荐同一档位的，不把别的档位当备选', () => {
    const rows = rankOffers(
      [
        offer({ url: 'other', priceCny: 10, formLevel: 'OXIDE' }),
        offer({ url: 'same', priceCny: 200 }),
      ],
      'ORGANIC_CHELATE',
    );
    expect(recommendOffer(rows, rule).url).toBe('same');
  });
});
