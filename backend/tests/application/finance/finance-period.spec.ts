import {
  resolvePeriod,
  monthRange,
  FINANCE_START_DATE,
} from 'src/application/finance/finance-period';

const sh = (iso: string) => new Date(`${iso}+08:00`);

describe('finance-period', () => {
  it('默认给本月至今，且起点不早于起账日', () => {
    const p = resolvePeriod(undefined, undefined, sh('2026-11-05T10:00:00'));
    expect(p.from.toISOString()).toBe(sh('2026-11-01T00:00:00').toISOString());
    expect(p.to.toISOString()).toBe(
      sh('2026-11-05T23:59:59.999').toISOString(),
    );
  });

  it('早于起账日的区间被裁到起账日', () => {
    const p = resolvePeriod(
      '2026-10-01',
      '2026-10-31',
      sh('2026-11-05T10:00:00'),
    );
    expect(p.from.toISOString()).toBe(
      sh(FINANCE_START_DATE + 'T00:00:00').toISOString(),
    );
  });

  it('指定月份返回整月边界', () => {
    const p = monthRange('2026-11');
    expect(p.from.toISOString()).toBe(sh('2026-11-01T00:00:00').toISOString());
    expect(p.to.toISOString()).toBe(
      sh('2026-11-30T23:59:59.999').toISOString(),
    );
  });

  it('11 月 30 日深夜的付款仍落在 11 月', () => {
    const p = monthRange('2026-11');
    expect(sh('2026-11-30T23:30:00').getTime()).toBeLessThanOrEqual(
      p.to.getTime(),
    );
  });
});
