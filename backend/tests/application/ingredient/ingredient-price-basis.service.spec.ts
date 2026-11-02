import { IngredientPriceBasisService } from 'src/ingredient/ingredient-price-basis.service';
import { Ingredient } from '../../../src/domain/ingredient/ingredient.entity';
import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
} from '../../../src/domain/ingredient/enums';

function buildIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return new Ingredient(
    overrides.id ?? 'ingredient-1',
    overrides.name ?? '鸡胸',
    IngredientType.FOOD,
    IngredientProcurementStrategy.DAILY_PURCHASE,
    false,
    true,
    null,
    null,
    null,
    null,
    BaseUnit.G,
    'g',
    'kg',
    1000,
    overrides.currentPricePerPurchaseUnit ?? 50,
    null,
    null,
    null,
    null,
    null,
    null,
    {} as any,
    null,
    false,
    overrides.initialPricePerPurchaseUnit ?? null,
  );
}

describe('IngredientPriceBasisService', () => {
  function buildService(params: {
    purchases?: Array<Record<string, any>>;
    meta?: Array<Record<string, any>>;
  }) {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(params.purchases ?? []),
      ingredient: {
        findMany: jest.fn().mockResolvedValue(params.meta ?? []),
      },
    } as any;

    return {
      service: new IngredientPriceBasisService(prisma),
      prisma,
    };
  }

  it('按最近一次已完成采购价折算采购单位单价', async () => {
    const { service } = buildService({
      purchases: [
        {
          ingredientId: 'ingredient-1',
          actualCost: 65,
          actualBaseQuantity: 2000,
          actualQuantity: 1,
          purchasedAt: new Date('2026-10-28T03:00:00.000Z'),
        },
      ],
      meta: [
        {
          id: 'ingredient-1',
          purchaseToBaseRatio: 2000,
          initialPricePerPurchaseUnit: 62,
          currentPricePerPurchaseUnit: 70,
        },
      ],
    });

    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')).toEqual(
      expect.objectContaining({
        source: 'LATEST_PURCHASE',
        pricePerPurchaseUnit: 65,
        baseUnitCost: 0.0325,
      }),
    );
  });

  it('没有采购历史时用创建价', async () => {
    const { service } = buildService({
      purchases: [],
      meta: [
        {
          id: 'ingredient-1',
          purchaseToBaseRatio: 1000,
          initialPricePerPurchaseUnit: 42,
          currentPricePerPurchaseUnit: 56,
        },
      ],
    });

    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')).toEqual(
      expect.objectContaining({
        source: 'INITIAL_PRICE',
        pricePerPurchaseUnit: 42,
        purchasedAt: null,
      }),
    );
  });

  it('创建价缺失时回落到当前价并标记来源', async () => {
    const { service } = buildService({
      purchases: [],
      meta: [
        {
          id: 'ingredient-1',
          purchaseToBaseRatio: 1000,
          initialPricePerPurchaseUnit: null,
          currentPricePerPurchaseUnit: 33.5,
        },
      ],
    });

    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')).toEqual(
      expect.objectContaining({
        source: 'CURRENT_PRICE',
        pricePerPurchaseUnit: 33.5,
      }),
    );
  });

  it('没有 actualBaseQuantity 时按 actualQuantity × 换算比例计算', async () => {
    const { service } = buildService({
      purchases: [
        {
          ingredientId: 'ingredient-1',
          actualCost: 80,
          actualBaseQuantity: null,
          actualQuantity: 2,
          purchasedAt: new Date('2026-10-01T03:00:00.000Z'),
        },
      ],
      meta: [
        {
          id: 'ingredient-1',
          purchaseToBaseRatio: 1000,
          initialPricePerPurchaseUnit: 40,
          currentPricePerPurchaseUnit: 40,
        },
      ],
    });

    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')?.pricePerPurchaseUnit).toBe(40);
  });

  it('没有采购记录、创建价和当前价时，按最贵的启用商品价兜底', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { ingredientId: 'ingredient-1', unitCost: 0.04 },
        ]),
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ingredient-1',
            purchaseToBaseRatio: 1000,
            initialPricePerPurchaseUnit: null,
            currentPricePerPurchaseUnit: 0,
          },
        ]),
      },
    } as any;

    const service = new IngredientPriceBasisService(prisma);
    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')).toEqual(
      expect.objectContaining({
        source: 'SKU_REFERENCE',
        pricePerPurchaseUnit: 40,
      }),
    );
  });

  it('保留 6 位小数，避免采购单位是 1g 的原料被抹成 0', async () => {
    const { service } = buildService({
      purchases: [
        {
          ingredientId: 'ingredient-1',
          actualCost: 3.7,
          actualBaseQuantity: 1000,
          actualQuantity: 1,
          purchasedAt: new Date('2026-10-28T03:00:00.000Z'),
        },
      ],
      meta: [
        {
          id: 'ingredient-1',
          purchaseToBaseRatio: 1,
          initialPricePerPurchaseUnit: 0,
          currentPricePerPurchaseUnit: 0,
        },
      ],
    });

    const basis = await service.resolveBasis(['ingredient-1']);

    expect(basis.get('ingredient-1')?.pricePerPurchaseUnit).toBe(0.0037);
  });

  it('applyToIngredients 只替换有算价依据的原料价格，不改原对象', async () => {
    const ingredient = buildIngredient({ currentPricePerPurchaseUnit: 50 });
    const { service } = buildService({
      purchases: [
        {
          ingredientId: ingredient.id,
          actualCost: 65,
          actualBaseQuantity: 2000,
          actualQuantity: 1,
          purchasedAt: new Date('2026-10-28T03:00:00.000Z'),
        },
      ],
      meta: [
        {
          id: ingredient.id,
          purchaseToBaseRatio: 2000,
          initialPricePerPurchaseUnit: 62,
          currentPricePerPurchaseUnit: 50,
        },
      ],
    });

    const priced = await service.applyToIngredients([ingredient]);

    expect(priced.get(ingredient.id)?.currentPricePerPurchaseUnit).toBe(65);
    expect(ingredient.currentPricePerPurchaseUnit).toBe(50);
  });
});
