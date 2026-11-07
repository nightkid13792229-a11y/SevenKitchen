/**
 * 采购明细的「数量 → 基准单位」换算该用谁的（2026-11-07 成本口径归位）。
 *
 * 结论：**跟采购商品走**。实际买的是某个商品，一件 400g 和一件 500g 是两回事。
 *
 * ⚠️ 复核后收紧（同日）：原来「选中的商品没填换算」也退回原料档案，
 * 而食材档案的换算被钉成了 1 —— 于是「2 盒」会被记成「2 克」，库存和成本差 500 倍。
 * 现在只有两种情况才退回原料档案：
 *   ① 这一行根本没有采购商品；
 *   ② 商品在库里已经查不到（被删除，历史记录还要能改）。
 * 「有商品但没填换算」直接报错，绝不静默兜底。
 */

export type PurchaseLineRatioProblem =
  | 'SKU_RATIO_MISSING'
  | 'INGREDIENT_RATIO_MISSING';

export type PurchaseLineRatioResolution =
  | { ratio: number; source: 'SKU' | 'INGREDIENT' }
  | { problem: PurchaseLineRatioProblem };

export interface PurchaseLineRatioInput {
  /** 这一行是否指定了采购商品 */
  skuExpected: boolean;
  /** 指定商品的记录；查不到（已删除）时为空 */
  sku?: { id: string; purchaseToBaseRatio?: number | null } | null;
  /** 原料档案自己的换算（仅在前两种情况下使用） */
  ingredientRatio?: number | null;
}

export function toPositiveRatio(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

export function resolvePurchaseLineRatio(
  input: PurchaseLineRatioInput,
): PurchaseLineRatioResolution {
  if (input.skuExpected && input.sku) {
    const skuRatio = toPositiveRatio(input.sku.purchaseToBaseRatio);
    if (skuRatio === null) {
      return { problem: 'SKU_RATIO_MISSING' };
    }
    return { ratio: skuRatio, source: 'SKU' };
  }

  const ingredientRatio = toPositiveRatio(input.ingredientRatio);
  if (ingredientRatio === null) {
    return { problem: 'INGREDIENT_RATIO_MISSING' };
  }
  return { ratio: ingredientRatio, source: 'INGREDIENT' };
}
