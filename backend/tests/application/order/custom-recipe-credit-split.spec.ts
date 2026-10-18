/**
 * 抵扣拆分的算术验证（2026-10-18 · V1：含运费）
 *
 * 上面那条守卫是**源码文本断言**，验证不了"算得对不对"。
 * 这里把拆分逻辑单独跑一遍，锁住三种边界。
 */
function splitCredit(applied: number, productPrice: number, shippingFee: number) {
  const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  // 与 `order.service.ts` 一致：先夹到「货款 + 运费」，再拆
  const safe = Math.min(Math.max(0, applied), round(productPrice + shippingFee));
  const toProduct = Math.min(safe, productPrice);
  const toShipping = round(safe - toProduct);
  return {
    netProduct: round(productPrice - toProduct),
    netShipping: round(shippingFee - toShipping),
    total: round(round(productPrice - toProduct) + round(shippingFee - toShipping)),
  };
}

describe('抵扣拆分算术', () => {
  it('额度小于货款：只抵货款，运费不动', () => {
    const r = splitCredit(50, 200, 20);
    expect(r).toEqual({ netProduct: 150, netShipping: 20, total: 170 });
  });

  it('额度大于货款但小于总额：货款归零，剩余抵运费', () => {
    const r = splitCredit(210, 200, 20);
    expect(r).toEqual({ netProduct: 0, netShipping: 10, total: 10 });
  });

  it('额度够覆盖全部：实付 0', () => {
    const r = splitCredit(300, 200, 20);
    expect(r).toEqual({ netProduct: 0, netShipping: 0, total: 0 });
  });

  it('★ 任何情况下 净货款 + 净运费 = 总额（下游账都靠这条）', () => {
    for (const [applied, p, sh] of [
      [0, 200, 20],
      [50, 200, 20],
      [200, 200, 20],
      [210, 200, 20],
      [999, 200, 20],
      [15.5, 100, 12.3],
    ]) {
      const r = splitCredit(applied, p, sh);
      expect(r.netProduct + r.netShipping).toBeCloseTo(r.total, 2);
      expect(r.total).toBeGreaterThanOrEqual(0);
    }
  });
});
