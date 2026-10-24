import { RecipesController } from '../../../src/interfaces/controllers/recipes.controller';

/**
 * 交付版本锁定（P1 · 2026-10-24）
 *
 * 只测控制器这一层的取数分支：
 *   · 带 orderId → 只查交付版本，绝不回退最新版；
 *   · 交付查不到 → null（接口回 404）；
 *   · 不带 orderId → 最新版（橱窗老行为）。
 */
describe('RecipesController.getAccessibleRecipe · delivered version pin', () => {
  function build(overrides: {
    latest?: unknown;
    pinned?: unknown;
    delivered?: unknown;
  }) {
    const recipeRepository = {
      findById: jest.fn().mockResolvedValue(overrides.latest ?? null),
      findByIdAndVersion: jest.fn().mockResolvedValue(overrides.pinned ?? null),
    };
    const deliveryService = {
      resolveDeliveredRecipeVersion: jest
        .fn()
        .mockResolvedValue(overrides.delivered ?? null),
    };
    const controller = new RecipesController(
      recipeRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      deliveryService as any,
    );
    const req = {
      user: { userId: 'user-1', customerId: 'user-1', role: 'CUSTOMER' },
    };
    return { controller, recipeRepository, deliveryService, req };
  }

  const pinnedRecipe = { id: 'recipe-biz', version: 2 } as any;

  it('uses the delivered version when orderId is present', async () => {
    const { controller, recipeRepository, deliveryService, req } = build({
      latest: { id: 'recipe-biz', version: 5 },
      pinned: pinnedRecipe,
      delivered: { version: 2, source: 'BATCH' },
    });

    const result = await (controller as any).getAccessibleRecipe(
      'recipe-biz',
      undefined,
      req,
      'CR202610230224',
    );

    expect(result).toBe(pinnedRecipe);
    expect(deliveryService.resolveDeliveredRecipeVersion).toHaveBeenCalledWith({
      orderNo: 'CR202610230224',
      recipeBusinessId: 'recipe-biz',
      customerId: 'user-1',
    });
    expect(recipeRepository.findByIdAndVersion).toHaveBeenCalledWith(
      'recipe-biz',
      2,
    );
    expect(recipeRepository.findById).not.toHaveBeenCalled();
  });

  it('returns null instead of falling back to latest when no delivery matches', async () => {
    const { controller, recipeRepository, req } = build({
      latest: { id: 'recipe-biz', version: 5 },
      pinned: null,
      delivered: null,
    });

    const result = await (controller as any).getAccessibleRecipe(
      'recipe-biz',
      undefined,
      req,
      'CR202610230999',
    );

    expect(result).toBeNull();
    expect(recipeRepository.findById).not.toHaveBeenCalled();
  });

  it('returns null when the pinned version cannot be loaded', async () => {
    const { controller, req } = build({
      latest: { id: 'recipe-biz', version: 5 },
      pinned: null,
      delivered: { version: 9, source: 'SINGLE' },
    });

    const result = await (controller as any).getAccessibleRecipe(
      'recipe-biz',
      undefined,
      req,
      'CR202610230224',
    );

    expect(result).toBeNull();
  });

  it('keeps the latest-version behaviour when orderId is absent', async () => {
    const latest = { id: 'recipe-biz', version: 5, status: 'PUBLIC' } as any;
    const { controller, recipeRepository, deliveryService, req } = build({
      latest,
      pinned: pinnedRecipe,
      delivered: { version: 2, source: 'BATCH' },
    });

    const result = await (controller as any).getAccessibleRecipe(
      'recipe-biz',
      undefined,
      req,
    );

    expect(result).toBe(latest);
    expect(deliveryService.resolveDeliveredRecipeVersion).not.toHaveBeenCalled();
    expect(recipeRepository.findById).toHaveBeenCalledWith('recipe-biz');
  });
});
