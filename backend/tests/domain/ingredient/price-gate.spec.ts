import { evaluatePriceGate } from '../../../src/domain/ingredient/price-gate';

/**
 * 价格写入闸（2026-11-06 单一来源改造）
 *
 * 三道闸：必须为正 → 不得离谱（5 倍）→ 波动可控（8%）。
 * 边界值都是「不拦」：正好 8% 放行，正好 5 倍放行。
 */
describe('evaluatePriceGate', () => {
  const base = { thresholdRate: 0.08 };

  it('0 元与负数一律拒绝', () => {
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = evaluatePriceGate({
        ...base,
        proposedPrice: price,
        anchorPrice: 1,
      });
      expect(result.action).toBe('REJECT');
      expect(result.reason).toContain('必须大于 0');
    }
  });

  it('没有基准价时直接放行（首次定价）', () => {
    for (const anchor of [null, undefined, 0, -5, Number.NaN]) {
      const result = evaluatePriceGate({
        ...base,
        proposedPrice: 0.0123,
        anchorPrice: anchor as number | null,
      });
      expect(result.action).toBe('APPLY');
      expect(result.reason).toBeNull();
      expect(result.deltaRate).toBeNull();
    }
  });

  it('正好 5 倍放行，超过 5 倍拒绝', () => {
    const ok = evaluatePriceGate({
      ...base,
      proposedPrice: 5,
      anchorPrice: 1,
    });
    // 5 倍本身已经超过 8% 阈值，所以是挂起而不是通过
    expect(ok.action).toBe('HOLD');

    const tooHigh = evaluatePriceGate({
      ...base,
      proposedPrice: 5.01,
      anchorPrice: 1,
    });
    expect(tooHigh.action).toBe('REJECT');
    expect(tooHigh.reason).toContain('疑似单位或数量录错');

    const tooLow = evaluatePriceGate({
      ...base,
      proposedPrice: 0.19,
      anchorPrice: 1,
    });
    expect(tooLow.action).toBe('REJECT');
  });

  it('正好 8% 放行，超过 8% 挂起', () => {
    const atThreshold = evaluatePriceGate({
      ...base,
      proposedPrice: 1.08,
      anchorPrice: 1,
    });
    expect(atThreshold.action).toBe('APPLY');

    const overThreshold = evaluatePriceGate({
      ...base,
      proposedPrice: 1.0801,
      anchorPrice: 1,
    });
    expect(overThreshold.action).toBe('HOLD');
    expect(overThreshold.reason).toContain('超过自动生效阈值 8%');
  });

  it('降价同样受阈值约束', () => {
    const drop = evaluatePriceGate({
      ...base,
      proposedPrice: 0.8,
      anchorPrice: 1,
    });
    expect(drop.action).toBe('HOLD');
    expect(drop.deltaRate).toBeCloseTo(-0.2, 6);
  });

  it('阈值为 0 时任何变动都挂起', () => {
    const result = evaluatePriceGate({
      proposedPrice: 1.001,
      anchorPrice: 1,
      thresholdRate: 0,
    });
    expect(result.action).toBe('HOLD');
  });

  it('阈值非法时按不拦处理，避免配置坏了把价格全冻住', () => {
    const result = evaluatePriceGate({
      proposedPrice: 1.05,
      anchorPrice: 1,
      thresholdRate: Number.NaN,
    });
    expect(result.action).toBe('APPLY');
  });

  it('返回相对基准的变动率与倍数，供后台展示', () => {
    const result = evaluatePriceGate({
      ...base,
      proposedPrice: 2,
      anchorPrice: 1,
    });
    expect(result.deltaRate).toBeCloseTo(1, 6);
    expect(result.multiple).toBeCloseTo(2, 6);
  });
});
