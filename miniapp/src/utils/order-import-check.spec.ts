import { describe, expect, it } from 'vitest';
import { checkOrderImportAmount } from './order-import-check';

describe('checkOrderImportAmount', () => {
  it('各行合计与商品小计一致 → 没有提示', () => {
    const check = checkOrderImportAmount({
      subtotal: 15,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10, 5],
    });
    expect(check.diff).toBe(0);
    expect(check.warnings).toEqual([]);
  });

  it('盒马特价：小计按原价、商品行按实付价 → 提示差额，但不判不完整', () => {
    const check = checkOrderImportAmount({
      subtotal: 148.33,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10.9, 99.8, 9.9, 2.99, 4.99, 4.79, 5.97, 7.99],
    });
    expect(check.diff).toBe(1);
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain('1.00');
    expect(check.warnings[0]).toContain('147.33');
  });

  it('模型说截图不完整 → 把模型给的理由当提示', () => {
    const check = checkOrderImportAmount({
      subtotal: 15,
      incomplete: true,
      incompleteReason: '商品列表被折叠，只看到 3 行',
      lineTotals: [10, 5],
    });
    expect(check.warnings).toEqual(['商品列表被折叠，只看到 3 行']);
  });

  it('没读到商品金额 → 提示无法核对', () => {
    const check = checkOrderImportAmount({
      subtotal: null,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [10, 5],
    });
    expect(check.diff).toBeNull();
    expect(check.warnings).toHaveLength(1);
    expect(check.warnings[0]).toContain('没读到商品金额');
  });

  it('差额不到 1 分钱（四舍五入噪音）→ 不提示', () => {
    const check = checkOrderImportAmount({
      subtotal: 0.3,
      incomplete: false,
      incompleteReason: null,
      lineTotals: [0.1, 0.2],
    });
    expect(check.diff).toBe(0);
    expect(check.warnings).toEqual([]);
  });
});
