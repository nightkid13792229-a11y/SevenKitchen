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

  /**
   * 2026-11-08：老页面（采购商品门禁上线前打开的）提交时整块都不带。
   * 以前这里被 `{...undefined}` 摊成空对象，于是报「一箱几件必须是正整数」——
   * 人看了只会去翻件数，实际是整块采购商品没填。文案要说人话。
   */
  it('整块没带 → 直接说「写入前必须填这条原料的采购商品」', () => {
    expect(() => assertCommitProcurementSku(undefined)).toThrow(
      /写入前必须填这条原料的采购商品/,
    );
    expect(() => assertCommitProcurementSku(null)).toThrow(
      /写入前必须填这条原料的采购商品/,
    );
  });

  it('只缺件数时，报「一箱几件没填」，不写成「必须是正整数」', () => {
    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: undefined as unknown as number,
        netContentPerPack: 500,
        currentPurchasePrice: 39.9,
      }),
    ).toThrow(/「一箱几件」没填/);
  });

  it('只缺净含量 / 只缺价格时，也各说各的', () => {
    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: 1,
        netContentPerPack: undefined as unknown as number,
        currentPurchasePrice: 39.9,
      }),
    ).toThrow(/「每件净含量」没填/);

    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '袋',
        packCount: 1,
        netContentPerPack: 500,
        currentPurchasePrice: undefined as unknown as number,
      }),
    ).toThrow(/「这一件多少钱」没填/);
  });

  it('多处都不对 → 一次把问题列全，不用改一处点一次', () => {
    expect(() =>
      assertCommitProcurementSku({
        name: '糙米',
        purchaseUnit: '  ',
        packCount: 0,
        netContentPerPack: 0,
        currentPurchasePrice: 0,
      }),
    ).toThrow(/一箱几件[\s\S]*每件净含量[\s\S]*这一件多少钱[\s\S]*采购单位/);
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
