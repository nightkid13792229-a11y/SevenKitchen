import { describe, expect, it } from 'vitest';
import { resolvePurchaseItemTitle } from './purchase-item-title';

describe('resolvePurchaseItemTitle', () => {
  it('shows the ingredient name for food items instead of the purchase SKU name', () => {
    const item = {
      type: 'FOOD',
      ingredientName: '猪里脊',
      procurementSkuName: '黑猪嫩里脊',
      resolvedProcurementSkuName: '黑猪嫩里脊',
      resolvedSuggestedProductName: '黑猪嫩里脊',
    };

    expect(resolvePurchaseItemTitle(item)).toBe('猪里脊');
  });

  it('shows the ingredient name for supplements and packaging too', () => {
    // 补剂、包材是单层产品：原料名就是商品名，没有另一层商品名可显示
    const base = {
      ingredientName: '鱼油',
      resolvedProcurementSkuName: '鱼油 500ml',
    };

    expect(resolvePurchaseItemTitle({ ...base, type: 'SUPPLEMENT' })).toBe('鱼油');
    expect(resolvePurchaseItemTitle({ ...base, type: 'PACKAGING' })).toBe('鱼油');
  });

  it('falls back to the ingredient relation when the snapshot name is missing', () => {
    expect(
      resolvePurchaseItemTitle({ type: 'FOOD', ingredient: { name: '牛霖' } }),
    ).toBe('牛霖');
  });

  it('ignores the item type when picking the name', () => {
    expect(
      resolvePurchaseItemTitle({ ingredientName: '南瓜', type: null }),
    ).toBe('南瓜');
    expect(
      resolvePurchaseItemTitle({ ingredientName: '南瓜', type: 'UNKNOWN' }),
    ).toBe('南瓜');
  });

  it('keeps the SKU name as a last resort when no ingredient name exists', () => {
    expect(
      resolvePurchaseItemTitle({ type: 'FOOD', resolvedProcurementSkuName: '牛腩块' }),
    ).toBe('牛腩块');
    expect(
      resolvePurchaseItemTitle({ type: 'SUPPLEMENT', resolvedSuggestedProductName: '某某益生菌' }),
    ).toBe('某某益生菌');
  });

  it('shows a safe placeholder when nothing is available', () => {
    expect(resolvePurchaseItemTitle({})).toBe('未知原料');
    expect(resolvePurchaseItemTitle({ ingredientName: '   ', type: 'FOOD' })).toBe(
      '未知原料',
    );
  });
});
