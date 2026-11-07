import { PurchasingService } from '../../../src/application/purchasing/purchasing.service';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

/**
 * 没有采购商品的原料，采购执行怎么描述（2026-11-07 成本口径归位 · Task 7）。
 *
 * 食材档案的换算固定为 1 之后，「买几袋」这件事只能由采购商品回答。
 * 没有商品时不能再拿档案的换算假装出「2 袋」—— 要明确标出来，让采购的人去补。
 *
 * 这里不建 Nest 模块：被测的是不依赖 IO 的纯决策，用原型对象即可。
 */
describe('PurchasingService · 缺采购商品时的执行口径', () => {
  const service: any = Object.create(PurchasingService.prototype);

  const ingredient = {
    id: 'i1',
    name: '糙米',
    baseUnit: 'G',
    purchaseUnit: 'g',
    purchaseToBaseRatio: 1,
    purchaseChannel: '山姆',
    productModel: null,
  };

  it('有采购商品时：单位与换算都用商品的，不标待补', () => {
    const profile = service.resolveProcurementExecutionProfile({
      ingredient,
      procurementSkus: [
        {
          id: 'sku1',
          name: '糙米 1kg',
          purchaseUnit: '袋',
          purchaseToBaseRatio: 1000,
          currentPurchasePrice: 25,
          purchaseChannel: '山姆',
          productModel: '1kg',
          isActive: true,
        },
      ],
    });

    expect(profile.purchaseUnit).toBe('袋');
    expect(profile.purchaseToBaseRatio).toBe(1000);
    expect(profile.needsProcurementSku).toBe(false);
  });

  it('没有采购商品时：退回基准单位并标记待补', () => {
    const profile = service.resolveProcurementExecutionProfile({
      ingredient,
      procurementSkus: [],
    });

    expect(profile.purchaseUnit).toBe('G');
    expect(profile.purchaseToBaseRatio).toBe(1);
    expect(profile.needsProcurementSku).toBe(true);
  });
});
