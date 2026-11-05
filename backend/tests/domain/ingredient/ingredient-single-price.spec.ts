import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

/**
 * 回归：2026-11-04 小米单价事故 → 2026-11-06「单一来源」改造
 *
 * 事故背景：小米曾被写成 38.30 元/g（正常约 0.0187）。当时算价会在读的时候
 * 用 `withCurrentPrice()` 临时替换价格，而 `getEffectivePricePerPurchaseUnit()`
 * 优先读「生效价」，替换值被旧生效价顶掉，错误价格一路进了订单和食谱参考价。
 *
 * 改造后不再有「读时替换价格」这回事：价格只在采购报销时写进档案，
 * 全系统只有一个价格字段 `currentPricePerPurchaseUnit`。
 *
 * 本文件锁住新的契约：
 *   1. 单价 = 当前价 ÷ 换算比，没有第二个价格参与
 *   2. 已废弃的「生效价」getter 恒等于当前价（就算构造时传了别的值）
 *   3. 算价用的单价与「生效价」永远一致，不会再出现两个价打架
 */
describe('Ingredient 单价契约（单一来源）', () => {
  const buildIngredient = (params: {
    currentPrice: number;
    effectivePrice: number | null;
    ratio?: number;
  }): Ingredient =>
    new Ingredient(
      'ingredient-1',
      '小米',
      IngredientType.FOOD,
      IngredientProcurementStrategy.DAILY_PURCHASE,
      false,
      false,
      null,
      null,
      null,
      null,
      BaseUnit.G,
      'g',
      'g',
      params.ratio ?? 1,
      params.currentPrice,
      params.effectivePrice,
      null,
      null,
      null,
      null,
      null,
      {},
    );

  it('单价 = 当前价 ÷ 换算比', () => {
    const ingredient = buildIngredient({
      currentPrice: 30,
      effectivePrice: null,
      ratio: 1000,
    });

    expect(ingredient.getUnitCost()).toBeCloseTo(0.03, 6);
  });

  it('生效价 getter 恒等于当前价，不再读取已废弃的字段', () => {
    // 故意传一个不同的「生效价」，模拟历史脏数据
    const ingredient = buildIngredient({
      currentPrice: 0.018652,
      effectivePrice: 38.3,
    });

    expect(ingredient.getEffectivePricePerPurchaseUnit()).toBe(0.018652);
    expect(ingredient.getUnitCost()).toBeCloseTo(0.018652, 6);
  });

  it('生效价为空时也算得对', () => {
    const ingredient = buildIngredient({
      currentPrice: 0.018652,
      effectivePrice: null,
    });

    expect(ingredient.getUnitCost()).toBeCloseTo(0.018652, 6);
  });

  it('没有「读时替换价格」的入口了', () => {
    const ingredient = buildIngredient({
      currentPrice: 38.3,
      effectivePrice: 38.3,
    });

    expect(
      (ingredient as unknown as { withCurrentPrice?: unknown }).withCurrentPrice,
    ).toBeUndefined();
  });
});
