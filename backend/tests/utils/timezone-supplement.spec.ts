import { TimezoneUtil } from '../../src/utils/timezone.util';

describe('TimezoneUtil · 补剂 date-only', () => {
  it('把上海时间转成 date-only（UTC 零点）', () => {
    const date = new Date('2026-10-19T00:30:00+08:00');
    expect(TimezoneUtil.toShanghaiDateOnly(date).toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    expect(TimezoneUtil.shanghaiDateKey(date)).toBe('2026-10-19');
  });

  it('解析日期并拒绝非法日期', () => {
    expect(TimezoneUtil.parseDateOnly('2026-10-19').toISOString()).toBe(
      '2026-10-19T00:00:00.000Z',
    );
    expect(() => TimezoneUtil.parseDateOnly('2026-02-30')).toThrow();
    expect(() => TimezoneUtil.parseDateOnly('2026/10/19')).toThrow();
  });

  it('按 UTC 星期几计算，不受本地时区影响', () => {
    expect(TimezoneUtil.weekday(TimezoneUtil.parseDateOnly('2026-10-19'))).toBe(1);
    expect(TimezoneUtil.weekday(TimezoneUtil.parseDateOnly('2026-10-18'))).toBe(0);
  });

  it('截单时间按上海分钟数判断', () => {
    expect(
      TimezoneUtil.isBeforeCutoff(
        new Date('2026-10-19T16:59:00+08:00'),
        '17:00',
      ),
    ).toBe(true);
    expect(
      TimezoneUtil.isBeforeCutoff(
        new Date('2026-10-19T17:00:00+08:00'),
        '17:00',
      ),
    ).toBe(false);
  });
});
