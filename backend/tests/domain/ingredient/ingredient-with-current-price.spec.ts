import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

/**
 * 回归：2026-11-04 小米单价事故
 *
 * 成品鲜食算价会先算出一个「本次算价用的采购单价」，再用
 * `withCurrentPrice()` 临时替换到原料对象上。
 * 但 `getEffectivePricePerPurchaseUnit()` 优先读 `effectivePricePerPurchaseUnit`，
 * 之前只替换了 `currentPricePerPurchaseUnit`，导致替换值被旧生效价顶掉，
 * 小米 38.30 元/g 的错误价格就这样一路进了订单和食谱参考价。
 */
describe('Ingredient.withCurrentPrice', () => {
  const buildIngredient = (
    effectivePricePerPurchaseUnit: number | null,
  ): Ingredient =>
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
      1,
      38.3,
      effectivePricePerPurchaseUnit,
      null,
      null,
      null,
      null,
      null,
      {},
    );

  it('替换价必须覆盖已存在的生效价', () => {
    const ingredient = buildIngredient(38.3);

    const priced = ingredient.withCurrentPrice(0.01665);

    expect(priced.getEffectivePricePerPurchaseUnit()).toBe(0.01665);
    expect(priced.getUnitCost()).toBeCloseTo(0.01665, 6);
  });

  it('生效价为空时也按替换价算价', () => {
    const ingredient = buildIngredient(null);

    const priced = ingredient.withCurrentPrice(0.01665);

    expect(priced.getUnitCost()).toBeCloseTo(0.01665, 6);
  });

  it('替换只发生在新对象上，不改动原原料', () => {
    const ingredient = buildIngredient(38.3);

    ingredient.withCurrentPrice(0.01665);

    expect(ingredient.getUnitCost()).toBeCloseTo(38.3, 6);
  });
});
