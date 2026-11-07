import { resolvePurchaseLineRatio } from '../../../src/domain/purchasing/purchase-line-ratio';

/**
 * 采购明细的换算归属（2026-11-07 成本口径归位 · Task 6 / 复核后收紧）。
 *
 * 原来「选中的商品没填换算」也会退回原料档案，而食材档案的换算是 1，
 * 于是「2 盒」会被记成「2 克」。现在分三种情况：
 *   · 有商品且有换算 → 用商品的
 *   · 有商品但没填换算 → **报错**，绝不退回 1
 *   · 商品在库里查不到（已删除）/ 这行本来就没商品 → 退回原料档案
 */
describe('resolvePurchaseLineRatio', () => {
  it('同一原料两个规格：取所选商品的换算', () => {
    expect(
      resolvePurchaseLineRatio({
        skuExpected: true,
        sku: { id: 'sku-400', purchaseToBaseRatio: 400 },
        ingredientRatio: 1,
      }),
    ).toEqual({ ratio: 400, source: 'SKU' });
  });

  it('选了商品但商品没填换算 → 报缺换算，不退回原料的 1', () => {
    expect(
      resolvePurchaseLineRatio({
        skuExpected: true,
        sku: { id: 'sku-x', purchaseToBaseRatio: null },
        ingredientRatio: 1,
      }),
    ).toEqual({ problem: 'SKU_RATIO_MISSING' });
  });

  it('商品在库里已经查不到（被删了）→ 退回原料档案，不能因此改不动历史记录', () => {
    expect(
      resolvePurchaseLineRatio({
        skuExpected: true,
        sku: null,
        ingredientRatio: 1,
      }),
    ).toEqual({ ratio: 1, source: 'INGREDIENT' });
  });

  it('这行没选商品 → 用原料档案的换算', () => {
    expect(
      resolvePurchaseLineRatio({
        skuExpected: false,
        sku: null,
        ingredientRatio: 500,
      }),
    ).toEqual({ ratio: 500, source: 'INGREDIENT' });
  });

  it('两边都没有合法换算 → 报错，由调用方决定文案', () => {
    expect(
      resolvePurchaseLineRatio({
        skuExpected: false,
        sku: null,
        ingredientRatio: 0,
      }),
    ).toEqual({ problem: 'INGREDIENT_RATIO_MISSING' });
  });
});
