import {
  perBaseUnitCost,
  perBaseUnitCostOrInfinity,
} from '../../../src/domain/ingredient/unit-price';

/**
 * 单价换算（2026-11-06「单一来源」改造 · 阶段 D）
 *
 * 全系统只有这一条公式：每基准单位成本 = 价格 ÷ 换算比。
 * 改造前它散在 7 处，到处自己判 0 和 NaN。
 */
describe('perBaseUnitCost', () => {
  it('正常换算：元/克、元/粒、元/片', () => {
    // 30 元 / 1kg（换算比 1000）→ 0.03 元/克
    expect(perBaseUnitCost(30, 1000)).toBeCloseTo(0.03, 10);
    // 128 元 / 100 粒 → 1.28 元/粒
    expect(perBaseUnitCost(128, 100)).toBeCloseTo(1.28, 10);
    // 89.41 元 / 2522 平勺 → 0.03545 元/平勺
    expect(perBaseUnitCost(89.41, 2522)).toBeCloseTo(0.035452, 6);
  });

  it('换算比为 1 时原样返回', () => {
    expect(perBaseUnitCost(0.015346, 1)).toBeCloseTo(0.015346, 10);
  });

  it('换算比非法时返回 null，交由调用方决定', () => {
    expect(perBaseUnitCost(10, 0)).toBeNull();
    expect(perBaseUnitCost(10, -1)).toBeNull();
    expect(perBaseUnitCost(10, null)).toBeNull();
    expect(perBaseUnitCost(10, undefined)).toBeNull();
    expect(perBaseUnitCost(10, Number.NaN)).toBeNull();
  });

  it('价格非法时返回 null（0 元是合法价格，照常换算成 0）', () => {
    expect(perBaseUnitCost(null, 100)).toBeNull();
    expect(perBaseUnitCost(undefined, 100)).toBeNull();
    expect(perBaseUnitCost(Number.NaN, 100)).toBeNull();
    expect(perBaseUnitCost(0, 100)).toBe(0);
  });

  it('排序用变体：非法值沉到最后，不会排到最前被优先推荐', () => {
    expect(perBaseUnitCostOrInfinity(10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(perBaseUnitCostOrInfinity(null, 100)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(perBaseUnitCostOrInfinity(10, 100)).toBeCloseTo(0.1, 10);

    const sorted = [
      { name: '未定价', cost: perBaseUnitCostOrInfinity(10, 0) },
      { name: '贵', cost: perBaseUnitCostOrInfinity(100, 100) },
      { name: '便宜', cost: perBaseUnitCostOrInfinity(10, 100) },
    ].sort((a, b) => a.cost - b.cost);

    expect(sorted.map((item) => item.name)).toEqual(['便宜', '贵', '未定价']);
  });
});
