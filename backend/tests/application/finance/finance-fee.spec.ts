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
  it('正负对称：按绝对值四舍五入（按笔取整，允许与整单合计差 1 分）', () => {
    expect(computeFeeAmount(82.5, 0, 0.006)).toBe(0.5);
    expect(computeFeeAmount(0, 82.5, 0.006)).toBe(-0.5);
  });
});
