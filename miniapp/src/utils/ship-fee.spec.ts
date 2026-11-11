import { describe, expect, it } from 'vitest';
import { parseShipFee } from './ship-fee';

describe('实际运费校验', () => {
  it('整数和小数都收', () => {
    expect(parseShipFee('12')).toEqual({ ok: true, value: 12 });
    expect(parseShipFee('12.5')).toEqual({ ok: true, value: 12.5 });
    expect(parseShipFee('0.05')).toEqual({ ok: true, value: 0.05 });
  });

  it('空值：提示必填（合并发货页以前漏的就是这一条）', () => {
    expect(parseShipFee('')).toEqual({ ok: false, error: '请填写实际运费' });
    expect(parseShipFee(null)).toEqual({ ok: false, error: '请填写实际运费' });
  });

  it('0 元运费：合法（内部单/包邮），别当成空值', () => {
    expect(parseShipFee('0')).toEqual({ ok: true, value: 0 });
    expect(parseShipFee('0.00')).toEqual({ ok: true, value: 0 });
    expect(parseShipFee(0)).toEqual({ ok: true, value: 0 });
  });

  it('首尾空格自动忽略', () => {
    expect(parseShipFee(' 12.50 ')).toEqual({ ok: true, value: 12.5 });
  });

  it('超过两位小数 / 负数 / 乱填：拒绝', () => {
    for (const bad of ['12.345', '-1', '12元', 'abc', '.5']) {
      const result = parseShipFee(bad);
      expect(result.ok).toBe(false);
      expect(result.error).toBe('运费最多两位小数，例如 12.50');
    }
  });
});
