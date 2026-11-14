import {
  checkQuantityUnitMatches,
  describeQuantityUnitMismatch,
  describeQuantityUnitMissing,
} from '../purchase-unit-guard';

describe('checkQuantityUnitMatches', () => {
  it('单位一致 → 通过', () => {
    expect(
      checkQuantityUnitMatches({ lineUnit: '盒', skuPurchaseUnit: '盒' }),
    ).toEqual({ ok: true });
  });

  it('空格/大小写不同也算一致', () => {
    expect(
      checkQuantityUnitMatches({ lineUnit: ' KG ', skuPurchaseUnit: 'kg' }),
    ).toEqual({ ok: true });
  });

  it('单位不一致 → 拒绝（份 vs 盒）', () => {
    expect(
      checkQuantityUnitMatches({ lineUnit: '份', skuPurchaseUnit: '盒' }),
    ).toEqual({ ok: false, reason: 'UNIT_NOT_MATCH' });
  });

  it('商品没填单位/这行没写单位 → 放行（老数据，调用方兜底）', () => {
    expect(
      checkQuantityUnitMatches({ lineUnit: '份', skuPurchaseUnit: null }),
    ).toEqual({ ok: true });
    expect(
      checkQuantityUnitMatches({ lineUnit: '', skuPurchaseUnit: '盒' }),
    ).toEqual({ ok: true });
  });

  it('这行没写单位、商品按整件卖（箱）→ 拒绝，不能默认算成一箱', () => {
    expect(
      checkQuantityUnitMatches({
        lineUnit: '',
        skuPurchaseUnit: '箱',
        skuUnitIsMultipack: true,
      }),
    ).toEqual({ ok: false, reason: 'UNIT_MISSING' });
  });

  it('这行没写单位、商品按单件包装卖（盒）→ 仍放行', () => {
    expect(
      checkQuantityUnitMatches({
        lineUnit: null,
        skuPurchaseUnit: '盒',
        skuUnitIsMultipack: false,
      }),
    ).toEqual({ ok: true });
  });
});

describe('describeQuantityUnitMismatch', () => {
  it('说清是什么、怎么办', () => {
    const text = describeQuantityUnitMismatch({
      lineName: '鸡蛋',
      lineUnit: '份',
      skuPurchaseUnit: '盒',
    });
    expect(text).toContain('份');
    expect(text).toContain('盒');
    expect(text).toContain('请把单位改成');
  });
});

describe('describeQuantityUnitMissing', () => {
  it('说清这行没写单位、商品按什么买、怎么改', () => {
    const text = describeQuantityUnitMissing({
      lineName: '整箱牛奶',
      skuPurchaseUnit: '箱',
    });
    expect(text).toContain('没写按什么卖');
    expect(text).toContain('箱');
  });
});
