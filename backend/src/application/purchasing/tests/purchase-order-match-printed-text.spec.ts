import { matchOrderLines } from '../purchase-order-match';
import type {
  ListItemCandidate,
  ListSkuCandidate,
  ParsedOrderLine,
} from '../purchase-order-import.types';

const channels = [{ code: '盒马', label: '盒马', aliases: ['Freshippo'] }];

function candidate(overrides: Partial<ListSkuCandidate>): ListItemCandidate {
  return {
    purchaseItemId: null,
    ingredientId: 'ingredient-egg',
    ingredientName: '鸡蛋',
    skus: [
      {
        id: 'sku-egg',
        name: '鲜鸡蛋',
        productModel: '500g',
        purchaseChannel: '盒马',
        purchaseToBaseRatio: 1590,
        purchaseUnit: '盒',
        ...overrides,
      },
    ],
  };
}

const line: ParsedOrderLine = {
  rawName: '鲜鸡蛋',
  spec: '30枚 1.59kg',
  qty: 1,
  unit: '盒',
  unitPrice: 19.9,
  lineTotal: 19.9,
};

describe('订单行匹配 · 包装原文优先（2026-11-12）', () => {
  it('productModel 对不上、packaging.printedText 对得上时，选这个商品', () => {
    const [matched] = matchOrderLines(
      [line],
      [candidate({ printedText: '30枚 1.59kg' })],
      '盒马',
      channels,
    );

    expect(matched.procurementSkuId).toBe('sku-egg');
    expect(matched.needsNewSku).toBe(false);
    expect(matched.confidence).toBe('HIGH');
  });

  it('没有 printedText 时退回 productModel；对不上就交给人选，不静默挂', () => {
    const [matched] = matchOrderLines(
      [line],
      [candidate({ printedText: null })],
      '盒马',
      channels,
    );

    expect(matched.procurementSkuId).toBeNull();
    expect(matched.needsNewSku).toBe(true);
  });
});
