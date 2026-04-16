import {
  INGREDIENT_SOURCE_PLANS,
  IngredientSourcePlanCode,
  matchSourcePlanChannel,
  normalizeIngredientSourcePlan,
} from '../../../src/domain/order/ingredient-source-plan';

describe('ingredient-source-plan', () => {
  it('defaults to MARKET_PREMIUM', () => {
    expect(normalizeIngredientSourcePlan(undefined)).toBe('MARKET_PREMIUM');
    expect(INGREDIENT_SOURCE_PLANS.MARKET_PREMIUM.label).toBe(
      '尽量山姆、盒马、沃集鲜',
    );
  });

  it('matches organic, premium market, and wholesale channels', () => {
    expect(matchSourcePlanChannel('有机农场', 'ORGANIC')).toBe(true);
    expect(matchSourcePlanChannel('Sam 山姆会员店', 'MARKET_PREMIUM')).toBe(
      true,
    );
    expect(matchSourcePlanChannel('盒马鲜生', 'MARKET_PREMIUM')).toBe(true);
    expect(matchSourcePlanChannel('沃集鲜', 'MARKET_PREMIUM')).toBe(true);
    expect(matchSourcePlanChannel('生鲜批发商', 'WHOLESALE')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(() =>
      normalizeIngredientSourcePlan('RANDOM' as IngredientSourcePlanCode),
    ).toThrow('Unknown ingredientSourcePlan');
  });
});
