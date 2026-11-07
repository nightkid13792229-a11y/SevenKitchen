import {
  buildCommitProcurementSku,
  assertCommitProcurementSku,
} from '../../../src/application/ingredient-creation/commit-procurement-sku';

/**
 * 建档时「必须带一条采购商品」（2026-11-07 硬门禁）。
 *
 * 这是成本的第一个、也是唯一的初始来源：没有它，原料建出来就没有价，
 * 一进食谱就按 0 元算。所以它必须是同一次提交的一部分，而不是建完再补。
 */
describe('建档携带的采购商品', () => {
  it('换算由服务端算：一箱 6 件 × 500g = 3000', () => {
    const sku = buildCommitProcurementSku({
      name: '山姆 糙米',
      purchaseUnit: '箱',
      packCount: 6,
      netContentPerPack: 500,
      currentPurchasePrice: 240,
    });

    expect(sku.purchaseToBaseRatio).toBe(3000);
    expect(sku.name).toBe('山姆 糙米');
    expect(sku.purchaseUnit).toBe('箱');
  });

  it('没填价 / 没填净含量 / 件数不是正整数 → 拒绝', () => {
    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: 1,
        netContentPerPack: 500,
        currentPurchasePrice: 0,
      }),
    ).toThrow(/价格/);

    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: 1,
        netContentPerPack: 0,
        currentPurchasePrice: 39.9,
      }),
    ).toThrow(/净含量/);

    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: 0,
        netContentPerPack: 500,
        currentPurchasePrice: 39.9,
      }),
    ).toThrow(/件数/);
  });

  it('商品名留空时用原料名兜底（不要建出空名商品）', () => {
    const sku = buildCommitProcurementSku({
      name: '   ',
      purchaseUnit: '袋',
      packCount: 1,
      netContentPerPack: 500,
      currentPurchasePrice: 39.9,
      fallbackName: '糙米',
    });

    expect(sku.name).toBe('糙米');
  });
});
