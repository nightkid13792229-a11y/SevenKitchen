import { PURCHASE_UNIT_SEED } from '../purchase-unit-catalog';
import {
  isPlaceholderLineUnit,
  resolveLineUnitFromSku,
} from '../purchase-line-unit';

const resolve = (lineUnit: string | null, skuPurchaseUnit: string | null) =>
  resolveLineUnitFromSku({
    lineUnit,
    skuPurchaseUnit,
    unitOptions: PURCHASE_UNIT_SEED,
  });

describe('占位单位跟随采购商品（2026-11-14）', () => {
  it('空值 / 「件」算占位；真实单位不算', () => {
    expect(isPlaceholderLineUnit(null)).toBe(true);
    expect(isPlaceholderLineUnit('  ')).toBe(true);
    expect(isPlaceholderLineUnit('件')).toBe(true);
    expect(isPlaceholderLineUnit('份')).toBe(false);
    expect(isPlaceholderLineUnit('斤')).toBe(false);
  });

  it('识别只写了规格（单位空/件）→ 用商品的单位（份/盒）', () => {
    expect(resolve(null, '份')).toBe('份');
    expect(resolve('件', '份')).toBe('份');
    expect(resolve('件', '盒')).toBe('盒');
  });

  it('商品按整件卖时不动：「2件」不能自动变成「2箱」', () => {
    expect(resolve('件', '箱')).toBe('件');
    expect(resolve(null, '箱')).toBeNull();
    expect(resolve('件', '提')).toBe('件');
  });

  it('真实单位原样保留，绝不悄悄换算', () => {
    expect(resolve('斤', 'kg')).toBe('斤');
    expect(resolve('份', '盒')).toBe('份');
    expect(resolve('3斤', 'kg')).toBe('3斤');
  });

  it('商品没填单位 / 商品就是按件卖 → 不动', () => {
    expect(resolve('件', null)).toBe('件');
    expect(resolve(null, null)).toBeNull();
    expect(resolve('件', '件')).toBe('件');
  });
});
