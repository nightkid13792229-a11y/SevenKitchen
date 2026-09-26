import {
  applyPriceRounding,
  PriceRoundingMode,
} from '../../../src/domain/pricing/price-rounding';

describe('售价圆整', () => {
  it('不圆整时保留两位小数', () => {
    expect(applyPriceRounding(137.4832, PriceRoundingMode.NONE)).toBe(137.48);
    expect(applyPriceRounding(137.485, PriceRoundingMode.NONE)).toBe(137.49);
  });

  it('一律向上取整，绝不出现"算出来 1.0001、实收 1.00"', () => {
    expect(applyPriceRounding(137.01, PriceRoundingMode.CEIL_TO_1)).toBe(138);
    expect(applyPriceRounding(137.0, PriceRoundingMode.CEIL_TO_1)).toBe(137);
    expect(applyPriceRounding(137.01, PriceRoundingMode.CEIL_TO_0_1)).toBe(
      137.1,
    );
    expect(applyPriceRounding(137.01, PriceRoundingMode.CEIL_TO_0_5)).toBe(
      137.5,
    );
  });

  it('已对齐的金额不被多加一档', () => {
    expect(applyPriceRounding(137.1, PriceRoundingMode.CEIL_TO_0_1)).toBe(137.1);
    expect(applyPriceRounding(137.5, PriceRoundingMode.CEIL_TO_0_5)).toBe(137.5);
    // 浮点尾差不能导致 137.1 变成 137.2
    expect(applyPriceRounding(0.30000000000000004, PriceRoundingMode.CEIL_TO_0_1)).toBe(0.3);
  });

  it('非法金额直接报错，不静默返回 0', () => {
    expect(() => applyPriceRounding(NaN, PriceRoundingMode.CEIL_TO_1)).toThrow();
    expect(() =>
      applyPriceRounding(Infinity, PriceRoundingMode.CEIL_TO_1),
    ).toThrow();
  });
});
