import { describe, expect, it } from 'vitest';
import { formatWeightG } from './format';

describe('现场重量格式', () => {
  it('1kg 以上用 kg，两位小数', () => {
    expect(formatWeightG(2576)).toBe('2.58kg');
    expect(formatWeightG(1750)).toBe('1.75kg');
    expect(formatWeightG(1000)).toBe('1.00kg');
    expect(formatWeightG(999.5)).toBe('1.00kg');
  });

  it('1kg 以下用整数 g', () => {
    expect(formatWeightG(260.63)).toBe('261g');
    expect(formatWeightG(0)).toBe('0g');
  });

  it('无效值给占位', () => {
    expect(formatWeightG(null)).toBe('-');
    expect(formatWeightG(undefined)).toBe('-');
  });
});
