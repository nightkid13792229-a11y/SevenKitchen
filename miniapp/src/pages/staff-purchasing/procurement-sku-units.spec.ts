import { describe, expect, it } from 'vitest';

import {
  initialPurchaseUnit,
  isUnitAllowed,
  withSelectedUnit,
} from './procurement-sku-spec-chain';

const seven = ['袋', '箱', '包', '瓶', '盒', '桶', '份'];

describe('withSelectedUnit', () => {
  it('选中的单位在前 5 个时不动', () => {
    expect(withSelectedUnit(seven, '盒')).toEqual(['袋', '箱', '包', '瓶', '盒']);
  });

  it('选中的单位被折叠时必须提到第一个（份排第 7）', () => {
    expect(withSelectedUnit(seven, '份')).toEqual(['份', '袋', '箱', '包', '瓶']);
  });

  it('没选时只返回前 5 个', () => {
    expect(withSelectedUnit(seven, '')).toEqual(['袋', '箱', '包', '瓶', '盒']);
  });

  it('选中的单位不在候选里（老数据/字典外）也照样显示出来', () => {
    expect(withSelectedUnit(seven, '斤')).toEqual(['斤', '袋', '箱', '包', '瓶']);
  });

  it('清单为空时仍然把选中的显示出来（宁可看得见，也不要静默消失）', () => {
    expect(withSelectedUnit([], '份')).toEqual(['份']);
    expect(withSelectedUnit(null, '份')).toEqual(['份']);
    expect(withSelectedUnit(null, '')).toEqual([]);
  });
});

describe('initialPurchaseUnit', () => {
  it('不再默认选中「袋」：AI 没读出单位就留空', () => {
    expect(initialPurchaseUnit(null, seven)).toBe('');
    expect(initialPurchaseUnit({ purchaseUnit: '' }, seven)).toBe('');
  });

  it('AI 给出的单位在字典里才预填', () => {
    expect(initialPurchaseUnit({ purchaseUnit: '份' }, seven)).toBe('份');
  });

  it('字典外的单位不预填（留给页面提示，而不是假装选中）', () => {
    expect(initialPurchaseUnit({ purchaseUnit: '提' }, seven)).toBe('');
  });
});

describe('isUnitAllowed', () => {
  it('在清单里才算', () => {
    expect(isUnitAllowed([{ code: '袋' }, { code: '份' }], '份')).toBe(true);
    expect(isUnitAllowed([{ code: '袋' }], '提')).toBe(false);
    expect(isUnitAllowed([], '')).toBe(false);
  });
});
