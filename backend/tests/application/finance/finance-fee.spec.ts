import { computeFeeAmount } from 'src/application/finance/finance-fee';

describe('finance-fee', () => {
  it('无退款时按全额计', () =>
    expect(computeFeeAmount(1000, 0, 0.006)).toBe(6));
  it('退款部分不计手续费', () =>
    expect(computeFeeAmount(1000, 500, 0.006)).toBe(3));
  it('全额退款得到负数，等于把手续费退回', () =>
    expect(computeFeeAmount(0, 500, 0.006)).toBe(-3));
  it('四舍五入到分', () =>
    expect(computeFeeAmount(428, 0, 0.006)).toBe(2.57));
  it('同一单两次部分退款，冲回之和等于全额退款的手续费', () => {
    const a = computeFeeAmount(0, 200, 0.006);
    const b = computeFeeAmount(0, 300, 0.006);
    expect(Number((a + b).toFixed(2))).toBe(computeFeeAmount(0, 500, 0.006));
  });
});
