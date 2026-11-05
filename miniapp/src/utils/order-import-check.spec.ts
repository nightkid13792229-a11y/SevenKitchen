import { describe, expect, it } from 'vitest';
import { checkOrderImportAmount } from './order-import-check';

describe('checkOrderImportAmount', () => {
  it('各行合计与商品小计一致 → 金额一致，没有提示', () => {
    const check = checkOrderImportAmount({
      subtotal: 15,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10, 5],
    });
    expect(check.diff).toBe(0);
    expect(check.statusText).toBe('金额一致');
    expect(check.incompleteNotice).toBeNull();
  });

  it('盒马特价：小计按原价、商品行按实付价 → 状态行只写差额，不再解释原因', () => {
    const check = checkOrderImportAmount({
      subtotal: 148.33,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10.9, 99.8, 9.9, 2.99, 4.99, 4.79, 5.97, 7.99],
    });
    expect(check.diff).toBe(1);
    expect(check.statusText).toBe('与商品小计差 ¥1.00');
    expect(check.incompleteNotice).toBeNull();
  });

  it('模型说截图不完整 → 单独给一句提示（原因用模型给的）', () => {
    const check = checkOrderImportAmount({
      subtotal: 15,
      incomplete: true,
      incompleteReason: '商品列表被折叠，只看到 3 行',
      lineTotals: [10, 5],
    });
    expect(check.incompleteNotice).toBe('商品列表被折叠，只看到 3 行');
  });

  it('模型说不完整但没给原因 → 用兜底文案', () => {
    const check = checkOrderImportAmount({
      subtotal: 15,
      incomplete: true,
      incompleteReason: '   ',
      lineTotals: [10, 5],
    });
    expect(check.incompleteNotice).toContain('没读完整');
  });

  it('没读到商品金额 → 状态行写「没读到商品金额」', () => {
    const check = checkOrderImportAmount({
      subtotal: null,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10, 5],
    });
    expect(check.diff).toBeNull();
    expect(check.statusText).toBe('没读到商品金额');
  });

  it('差额不到 1 分钱（四舍五入噪音）→ 算一致', () => {
    const check = checkOrderImportAmount({
      subtotal: 0.3,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [0.1, 0.2],
    });
    expect(check.diff).toBe(0);
    expect(check.statusText).toBe('金额一致');
  });
});
