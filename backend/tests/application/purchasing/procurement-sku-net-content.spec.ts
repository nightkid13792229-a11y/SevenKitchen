import {
  normalizeNetContentToBaseUnit,
  composePackSpec,
} from '../../../src/application/purchasing/procurement-sku-net-content';

describe('normalizeNetContentToBaseUnit', () => {
  it('把 kg 换算成克', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1, unit: 'kg' }, 'G')).toEqual({
      ok: true,
      inBaseUnit: 1000,
    });
  });

  it('把 L 换算成毫升', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1.5, unit: 'L' }, 'ML')).toEqual({
      ok: true,
      inBaseUnit: 1500,
    });
  });

  it('按个记账时原样返回', () => {
    expect(
      normalizeNetContentToBaseUnit({ value: 30, unit: '个' }, 'PCS'),
    ).toEqual({ ok: true, inBaseUnit: 30 });
  });

  it('跨维度不换算，判 CROSS_DIMENSION', () => {
    expect(
      normalizeNetContentToBaseUnit({ value: 330, unit: 'ml' }, 'G'),
    ).toEqual({ ok: false, reason: 'CROSS_DIMENSION' });
  });

  it('斤、两这类不自动转，判 UNSUPPORTED_UNIT', () => {
    expect(normalizeNetContentToBaseUnit({ value: 1, unit: '斤' }, 'G')).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_UNIT',
    });
  });

  it('缺值判 MISSING', () => {
    expect(
      normalizeNetContentToBaseUnit({ value: null, unit: 'g' }, 'G'),
    ).toEqual({ ok: false, reason: 'MISSING' });
  });

  it('非正数判 INVALID_VALUE', () => {
    expect(normalizeNetContentToBaseUnit({ value: 0, unit: 'g' }, 'G')).toEqual({
      ok: false,
      reason: 'INVALID_VALUE',
    });
  });
});

describe('composePackSpec', () => {
  it('多件装写成 24×330ml', () => {
    expect(
      composePackSpec({ packCount: 24, value: 330, unit: 'ml' }),
    ).toBe('24×330ml');
  });

  it('单件不写乘号', () => {
    expect(composePackSpec({ packCount: 1, value: 1, unit: 'kg' })).toBe('1kg');
  });
});
