import { resolvePurchaseLineRatio } from '../../../src/domain/purchasing/purchase-line-ratio';

/**
 * 采购明细的换算归属（2026-11-07 成本口径归位 · Task 6）。
 *
 * 这一条错了，后果是「买 2 件 400g，系统记成 2 克」——
 * 库存、成本、食谱售价会一起错，而且没有任何报错。
 */
describe('resolvePurchaseLineRatio', () => {
  it('同一原料两个规格：取所选商品的换算，不取原料档案的', () => {
    const ratio = resolvePurchaseLineRatio({
      procurementSkuId: 'sku-400',
      skus: [
        { id: 'sku-500', purchaseToBaseRatio: 500 },
        { id: 'sku-400', purchaseToBaseRatio: 400 },
      ],
      ingredientRatio: 500,
    });

    expect(ratio).toBe(400);
  });

  it('这行没选商品时退回原料档案的换算（历史数据）', () => {
    expect(
      resolvePurchaseLineRatio({
        procurementSkuId: null,
        skus: [{ id: 'sku-500', purchaseToBaseRatio: 500 }],
        ingredientRatio: 500,
      }),
    ).toBe(500);
  });

  it('选中的商品没填换算时也退回原料档案', () => {
    expect(
      resolvePurchaseLineRatio({
        procurementSkuId: 'sku-x',
        skus: [{ id: 'sku-x', purchaseToBaseRatio: null }],
        ingredientRatio: 1,
      }),
    ).toBe(1);
  });

  it('两边都没有合法换算时返回 null，由调用方决定怎么报错', () => {
    expect(
      resolvePurchaseLineRatio({
        procurementSkuId: 'sku-x',
        skus: [],
        ingredientRatio: 0,
      }),
    ).toBeNull();
  });
});
