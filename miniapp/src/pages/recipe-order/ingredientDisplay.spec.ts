import { describe, expect, it } from 'vitest';
import {
  buildIngredientDisplayName,
  buildIngredientBrandText,
  buildIngredientPurchaseChannelText,
} from './ingredientDisplay';

describe('recipe-order ingredient display helpers', () => {
  it('prefers the standard ingredient name over the procurement SKU name', () => {
    expect(buildIngredientDisplayName({
      name: '土豆',
      procurementSkuName: '土豆 盒马日日鲜去皮新土豆',
    })).toBe('土豆');
    expect(buildIngredientDisplayName({
      name: '鸡胸',
      procurementSkuName: '鸡胸 生鲜鸡大胸',
    })).toBe('鸡胸');
  });

  it('falls back to procurement SKU name when ingredient name is missing', () => {
    expect(buildIngredientDisplayName({
      name: '',
      procurementSkuName: '藏区散养牦牛牛霖',
    })).toBe('藏区散养牦牛牛霖');
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
