import { describe, expect, it } from 'vitest';
import {
  buildIngredientDisplayName,
  buildIngredientBrandText,
  buildIngredientPurchaseChannelText,
} from './ingredientDisplay';

describe('recipe-order ingredient display helpers', () => {
  it('prefers procurement SKU name over standard ingredient name', () => {
    expect(buildIngredientDisplayName({
      name: '牛霖',
      procurementSkuName: '藏区散养牦牛牛霖',
    })).toBe('藏区散养牦牛牛霖');
  });

  it('falls back to standard ingredient name when procurement SKU name is missing', () => {
    expect(buildIngredientDisplayName({
      name: '牛霖',
      procurementSkuName: '',
    })).toBe('牛霖');
  });

  it('shows purchase channel and brand as separate display values', () => {
    expect(buildIngredientPurchaseChannelText({
      purchaseChannel: '沃尔玛',
      brand: '沃集鲜',
    })).toBe('沃尔玛');
    expect(buildIngredientBrandText({
      purchaseChannel: '沃尔玛',
      brand: '沃集鲜',
    })).toBe('沃集鲜');
  });

  it('does not show placeholder brands', () => {
    expect(buildIngredientPurchaseChannelText({
      purchaseChannel: '本地生鲜市场',
      brand: '无',
    })).toBe('本地生鲜市场');
    expect(buildIngredientBrandText({
      purchaseChannel: '本地生鲜市场',
      brand: '无',
    })).toBe('-');
  });
});
