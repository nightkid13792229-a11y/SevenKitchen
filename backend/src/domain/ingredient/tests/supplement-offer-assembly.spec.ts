import { buildOfferFacts, parseUnitsPerBottle } from '../supplement-offer-assembly';
import { resolvePriceBasis, type LabelNutrient } from '../supplement-offer-ranking';

const copperNutrients: LabelNutrient[] = [
  { fieldPath: 'minerals.copper', value: 2, unit: 'mg' },
];

describe('parseUnitsPerBottle', () => {
  it.each([
    ['120 Softgels', 120],
    ['100 Tablets', 100],
    ['90 Veggie Capsules', 90],
    ['2 fl oz', null],
    ['1 g', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(parseUnitsPerBottle(input)).toBe(expected);
  });
});

describe('buildOfferFacts', () => {
  const rule = resolvePriceBasis('minerals.copper');

  it('正常一瓶：每份含量从标签取，价格与规格原样带过来', () => {
    const result = buildOfferFacts(
      {
        url: 'https://www.iherb.com/pr/x/1',
        name: 'Copper Bisglycinate',
        priceCny: 89,
        unitsPerBottle: 120,
        servingUnitsPerDose: 2,
        nutrients: copperNutrients,
        formLevel: 'ORGANIC_CHELATE',
      },
      rule,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offer.amountPerServing).toBe(2);
    expect(result.offer.compound).toBe(false);
    expect(result.offer.formLevel).toBe('ORGANIC_CHELATE');
  });

  it('标签里没有这个营养素 → 失败并说清楚，不返回半条', () => {
    const result = buildOfferFacts(
      {
        url: 'https://www.iherb.com/pr/x/1',
        name: 'Zinc Picolinate',
        priceCny: 89,
        unitsPerBottle: 120,
        servingUnitsPerDose: 1,
        nutrients: [{ fieldPath: 'minerals.zinc', value: 15, unit: 'mg' }],
        formLevel: null,
      },
      rule,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('标签里没有铜');
  });

  it('一瓶十几种营养素的复合配方：标成复合，每份含量留空', () => {
    const multi: LabelNutrient[] = [
      { fieldPath: 'minerals.copper', value: 2, unit: 'mg' },
      { fieldPath: 'minerals.zinc', value: 15, unit: 'mg' },
      { fieldPath: 'minerals.iron', value: 18, unit: 'mg' },
      { fieldPath: 'vitamins.vitaminA', value: 5000, unit: 'IU' },
      { fieldPath: 'vitamins.vitaminC', value: 60, unit: 'mg' },
      { fieldPath: 'vitamins.vitaminD', value: 400, unit: 'IU' },
    ];
    const result = buildOfferFacts(
      {
        url: 'https://www.iherb.com/pr/x/2',
        name: 'Daily Multi',
        priceCny: 99,
        unitsPerBottle: 60,
        servingUnitsPerDose: 1,
        nutrients: multi,
        formLevel: null,
      },
      rule,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offer.compound).toBe(true);
    expect(result.offer.amountPerServing).toBeNull();
  });
});
