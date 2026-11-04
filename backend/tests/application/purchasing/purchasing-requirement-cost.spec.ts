import { PurchasingService } from '../../../src/application/purchasing/purchasing.service';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));
import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

/**
 * 采购预估成本口径（2026-11-04 小米事故后改）
 *
 * 旧口径直接读订单下单时的成本快照，价格一旦有历史错误就会一直带进采购单；
 * 新口径按原料档案的当前单价重算，只有取不到价格时才回退到快照。
 */
function buildService(): PurchasingService {
  return new PurchasingService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    undefined as any,
  );
}

function buildIngredient(overrides: {
  baseUnit?: BaseUnit;
  pricePerUnit: number;
  purchaseToBaseRatio?: number;
  properties?: Record<string, any>;
}): Ingredient {
  return new Ingredient(
    'ingredient-1',
    '测试原料',
    IngredientType.FOOD,
    IngredientProcurementStrategy.DAILY_PURCHASE,
    false,
    true,
    null,
    null,
    null,
    null,
    overrides.baseUnit ?? BaseUnit.G,
    'g',
    'g',
    overrides.purchaseToBaseRatio ?? 1,
    overrides.pricePerUnit,
    overrides.pricePerUnit,
    null,
    null,
    null,
    null,
    null,
    (overrides.properties ?? {}) as any,
  );
}

describe('PurchasingService · 采购预估成本按当前原料价', () => {
  it('按克计价的原料：500g × 0.015346 元/g = 7.67 元', () => {
    const service = buildService();

    const cost = (service as any).resolveRequirementCostFromCurrentPrice({
      ingredient: buildIngredient({ pricePerUnit: 0.015346 }),
      type: 'FOOD',
      quantity: 0.5,
      fallbackCost: 999,
    });

    expect(cost).toBeCloseTo(7.67, 2);
  });

  it('按毫升计价的原料按密度换算后再算成本', () => {
    const service = buildService();

    const cost = (service as any).resolveRequirementCostFromCurrentPrice({
      ingredient: buildIngredient({
        baseUnit: BaseUnit.ML,
        pricePerUnit: 0.01,
        properties: { density_g_per_ml: 1 },
      }),
      type: 'FOOD',
      quantity: 0.5,
      fallbackCost: 999,
    });

    expect(cost).toBeCloseTo(5, 2);
  });

  it('补剂按件数 × 单价算成本', () => {
    const service = buildService();

    const cost = (service as any).resolveRequirementCostFromCurrentPrice({
      ingredient: buildIngredient({
        baseUnit: BaseUnit.PCS,
        pricePerUnit: 0.5,
      }),
      type: 'SUPPLEMENT',
      quantity: 3,
      fallbackCost: 999,
    });

    expect(cost).toBeCloseTo(1.5, 2);
  });

  it('取不到原料或价格时回退到订单快照成本', () => {
    const service = buildService();

    const withoutIngredient = (
      service as any
    ).resolveRequirementCostFromCurrentPrice({
      ingredient: undefined,
      type: 'FOOD',
      quantity: 0.5,
      fallbackCost: 123.45,
    });
    const withoutPrice = (
      service as any
    ).resolveRequirementCostFromCurrentPrice({
      ingredient: buildIngredient({ pricePerUnit: 0 }),
      type: 'FOOD',
      quantity: 0.5,
      fallbackCost: 123.45,
    });

    expect(withoutIngredient).toBe(123.45);
    expect(withoutPrice).toBe(123.45);
  });
});
