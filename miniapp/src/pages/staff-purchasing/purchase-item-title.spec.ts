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

  it('falls back to the ingredient relation when the snapshot name is missing', () => {
    expect(
      resolvePurchaseItemTitle({ type: 'FOOD', ingredient: { name: '牛霖' } }),
    ).toBe('牛霖');
  });

  it('keeps the purchase SKU name for supplements and packaging', () => {
    const base = {
      ingredientName: '鱼油',
      resolvedProcurementSkuName: '挪威小鱼油 500ml',
    };

    expect(resolvePurchaseItemTitle({ ...base, type: 'SUPPLEMENT' })).toBe(
      '挪威小鱼油 500ml',
    );
    expect(resolvePurchaseItemTitle({ ...base, type: 'PACKAGING' })).toBe(
      '挪威小鱼油 500ml',
    );
  });

  it('falls back to the suggested product name for non-food items', () => {
    expect(
      resolvePurchaseItemTitle({
        type: 'SUPPLEMENT',
        ingredientName: '益生菌',
        resolvedSuggestedProductName: '某某益生菌',
      }),
    ).toBe('某某益生菌');
  });

  it('treats unknown or missing types as food', () => {
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
  });

  it('shows a safe placeholder when nothing is available', () => {
    expect(resolvePurchaseItemTitle({})).toBe('未知原料');
    expect(resolvePurchaseItemTitle({ ingredientName: '   ', type: 'FOOD' })).toBe(
      '未知原料',
    );
  });
});
