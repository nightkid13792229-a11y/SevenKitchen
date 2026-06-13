import {
  buildFoodWeightRatioMap,
  isFoodRatioTotalNormalized,
  normalizeFoodRatioPercent,
  sumFoodRatioPercent,
} from '../../../src/domain/recipe/food-ratio-normalization';

describe('food ratio normalization', () => {
  it('sums FOOD ratios while ignoring supplements', () => {
    const total = sumFoodRatioPercent([
      { ingredient: { type: 'FOOD' }, ratioPercent: 41.13110539845758 },
      { ingredient: { type: 'FOOD' }, ratioPercent: 10.2827763496144 },
      { ingredient: { type: 'SUPPLEMENT' }, ratioPercent: null },
    ]);

    expect(total).toBeCloseTo(51.41388174807198, 10);
  });

  it('normalizes a legacy partial FOOD ratio total back to 100 percent', () => {
    const foodRatioTotal = 99.33161953727506;

    expect(
      normalizeFoodRatioPercent(41.13110539845758, foodRatioTotal),
    ).toBeCloseTo(41.40786749482401, 10);
    expect(
      normalizeFoodRatioPercent(foodRatioTotal, foodRatioTotal),
    ).toBeCloseTo(100, 10);
  });

  it('detects normalized and non-normalized totals with tolerance', () => {
    expect(isFoodRatioTotalNormalized(100.0000001)).toBe(true);
    expect(isFoodRatioTotalNormalized(99.33161953727506)).toBe(false);
  });

  it('builds published FOOD ratios from FOOD weights only', () => {
    const ratios = buildFoodWeightRatioMap([
      { id: 'pork', type: 'FOOD', effectiveWeightG: 80 },
      { id: 'cod', type: 'FOOD', effectiveWeightG: 20 },
      { id: 'calcium', type: 'SUPPLEMENT', effectiveWeightG: 1.3 },
    ]);

    expect(ratios.get('pork')).toBeCloseTo(80, 10);
    expect(ratios.get('cod')).toBeCloseTo(20, 10);
    expect(ratios.has('calcium')).toBe(false);
    expect(
      Array.from(ratios.values()).reduce((sum, ratio) => sum + ratio, 0),
    ).toBeCloseTo(100, 10);
  });
});
