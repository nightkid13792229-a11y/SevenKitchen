import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

/**
 * 草稿里的 `item.ingredient` 是 Prisma 行（POJO），**没有** getUnitCost()。
 *
 * 2026-11-07 复核发现：原先按 `item.ingredient.getUnitCost?.()` 取成本，
 * 永远拿到 undefined → 成本门槛静默跳过，0 成本食材照样发布。
 * 这条测试锁住「从原始列算」这件事。
 */
describe('RecipeDesignerService · 单行食材成本', () => {
  const service: any = Object.create(RecipeDesignerService.prototype);

  it('用 currentPricePerPurchaseUnit ÷ purchaseToBaseRatio 算，不依赖领域方法', () => {
    const cost = service.resolveItemCostPerBaseUnit({
      ingredient: {
        currentPricePerPurchaseUnit: 39.9,
        purchaseToBaseRatio: 500,
      },
    });

    expect(cost).toBeCloseTo(0.0798, 6);
  });

  it('成本为 0 时返回 0（不是 null）—— null 会被门槛当成「没提供」而跳过', () => {
    const cost = service.resolveItemCostPerBaseUnit({
      ingredient: { currentPricePerPurchaseUnit: 0, purchaseToBaseRatio: 1 },
    });

    expect(cost).toBe(0);
  });

  it('原料没加载出来时返回 null（跳过判断，而不是误判成 0）', () => {
    expect(service.resolveItemCostPerBaseUnit({})).toBeNull();
    expect(
      service.resolveItemCostPerBaseUnit({
        ingredient: { purchaseToBaseRatio: 0 },
      }),
    ).toBeNull();
  });
});
