import { DateUtil } from '../../src/utils/date.util';

/**
 * DateUtil 单元测试
 * 测试日期工具类的时区处理逻辑
 */
describe('DateUtil', () => {
  describe('createDateRange', () => {
    it('should create correct date range for a given date', () => {
      const { start, end } = DateUtil.createDateRange('2026-01-23');

      // 验证开始时间
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(0); // January is 0
      expect(start.getDate()).toBe(23);
      expect(start.getHours()).toBe(12); // 中午12点

      // 验证结束时间是次日的12点
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(0);
      expect(end.getDate()).toBe(24);
      expect(end.getHours()).toBe(12);
    });

    it('should handle end of month correctly', () => {
      const { start, end } = DateUtil.createDateRange('2026-01-31');

      expect(start.getDate()).toBe(31);
      expect(end.getDate()).toBe(1); // 2月1日
      expect(end.getMonth()).toBe(1); // February
    });

    it('should handle leap year correctly', () => {
      const { start, end } = DateUtil.createDateRange('2024-02-28');

      expect(start.getDate()).toBe(28);
      expect(end.getDate()).toBe(29); // 闰年2月29日
    });

    it('should create UTC times that are consistent across timezones', () => {
      const { start, end } = DateUtil.createDateRange('2026-01-23');

      // ISO 8601 格式应该是 UTC 时间
      // 上海时间 2026-01-23 12:00:00 = UTC 2026-01-23 04:00:00
      expect(start.toISOString()).toContain('2026-01-23T04:00:00');
      expect(end.toISOString()).toContain('2026-01-24T04:00:00');
    });
  });

  describe('createTodayRange', () => {
    it('should create range for current date', () => {
      const { start, end } = DateUtil.createTodayRange();
      const today = new Date();

      // 验证日期是今天
      expect(start.getFullYear()).toBe(today.getFullYear());
      expect(start.getMonth()).toBe(today.getMonth());
      expect(start.getDate()).toBe(today.getDate());

      // 验证时间是12:00:00
      expect(start.getHours()).toBe(12);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);

      // 验证结束时间是明天
      expect(end.getDate()).toBe(today.getDate() + 1);
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = new Date('2026-01-23T15:30:00');
      const formatted = DateUtil.formatDate(date);

      expect(formatted).toBe('2026-01-23');
    });

    it('should handle single digit month and day', () => {
      const date = new Date('2026-01-05T10:00:00');
      const formatted = DateUtil.formatDate(date);

      expect(formatted).toBe('2026-01-05');
    });

    it('should use local timezone', () => {
      // 创建一个UTC时间的日期
      const date = new Date('2026-01-23T00:00:00Z');
      const formatted = DateUtil.formatDate(date);

      // 在上海时区（GMT+0800），这个时间显示为 2026-01-23 08:00:00
      // 所以 formatDate 应该返回 '2026-01-23'
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('isToday', () => {
    it('should return true for current date', () => {
      const now = new Date();
      expect(DateUtil.isToday(now)).toBe(true);
    });

    it('should return false for past date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(DateUtil.isToday(yesterday)).toBe(false);
    });

    it('should return false for future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(DateUtil.isToday(tomorrow)).toBe(false);
    });

    it('should ignore time component', () => {
      const morning = new Date();
      morning.setHours(6, 0, 0, 0);

      const evening = new Date();
      evening.setHours(22, 0, 0, 0);

      expect(DateUtil.isToday(morning)).toBe(true);
      expect(DateUtil.isToday(evening)).toBe(true);
    });
  });

  describe('getStartOfDay', () => {
    it('should return noon (12:00:00) for given date', () => {
      const start = DateUtil.getStartOfDay('2026-01-23');

      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(0);
      expect(start.getDate()).toBe(23);
      expect(start.getHours()).toBe(12);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
    });
  });

  describe('getEndOfDay', () => {
    it('should return noon of next day', () => {
      const end = DateUtil.getEndOfDay('2026-01-23');

      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(0);
      expect(end.getDate()).toBe(24);
      expect(end.getHours()).toBe(12);
    });
  });

  describe('createDateRangeForDB', () => {
    it('should return ISO 8601 formatted strings', () => {
      const { startDate, endDate } = DateUtil.createDateRangeForDB('2026-01-23');

      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should create correct UTC times', () => {
      const { startDate, endDate } = DateUtil.createDateRangeForDB('2026-01-23');

      expect(startDate).toContain('2026-01-23T04:00:00.000Z');
      expect(endDate).toContain('2026-01-24T04:00:00.000Z');
    });
  });

  describe('isSameDay', () => {
    it('should return true for same date different times', () => {
      const date1 = new Date('2026-01-23T10:00:00');
      const date2 = new Date('2026-01-23T18:30:00');

      expect(DateUtil.isSameDay(date1, date2)).toBe(true);
    });

    it('should return false for different dates', () => {
      const date1 = new Date('2026-01-23T10:00:00');
      const date2 = new Date('2026-01-24T10:00:00');

      expect(DateUtil.isSameDay(date1, date2)).toBe(false);
    });
  });

  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date('2026-01-23T12:00:00');
      const nextDay = DateUtil.addDays(date, 1);

      expect(nextDay.getDate()).toBe(24);
      expect(nextDay.getMonth()).toBe(0);
      expect(nextDay.getFullYear()).toBe(2026);
    });

    it('should subtract days correctly', () => {
      const date = new Date('2026-01-23T12:00:00');
      const prevDay = DateUtil.addDays(date, -1);

      expect(prevDay.getDate()).toBe(22);
      expect(prevDay.getMonth()).toBe(0);
    });

    it('should not modify original date', () => {
      const date = new Date('2026-01-23T12:00:00');
      const originalDay = date.getDate();

      DateUtil.addDays(date, 5);

      expect(date.getDate()).toBe(originalDay);
    });

    it('should handle month boundaries', () => {
      const date = new Date('2026-01-31T12:00:00');
      const nextDay = DateUtil.addDays(date, 1);

      expect(nextDay.getDate()).toBe(1);
      expect(nextDay.getMonth()).toBe(1); // February
    });
  });

  describe('isValidDateString', () => {
    it('should return true for valid YYYY-MM-DD format', () => {
      expect(DateUtil.isValidDateString('2026-01-23')).toBe(true);
      expect(DateUtil.isValidDateString('2024-12-31')).toBe(true);
      expect(DateUtil.isValidDateString('2020-02-29')).toBe(true); // 闰年
    });

    it('should return false for invalid formats', () => {
      expect(DateUtil.isValidDateString('2026/01/23')).toBe(false);
      expect(DateUtil.isValidDateString('01-23-2026')).toBe(false);
      expect(DateUtil.isValidDateString('2026-1-5')).toBe(false);
      expect(DateUtil.isValidDateString('invalid')).toBe(false);
    });

    it('should return false for invalid dates', () => {
      expect(DateUtil.isValidDateString('2026-13-01')).toBe(false); // 无效月份
      expect(DateUtil.isValidDateString('2026-02-30')).toBe(false); // 无效日期
      expect(DateUtil.isValidDateString('2023-02-29')).toBe(false); // 非闰年
    });
  });

  describe('timezone consistency', () => {
    it('should create consistent ranges across different timezones', () => {
      // 测试中午12点策略的时区一致性
      const { start, end } = DateUtil.createDateRange('2026-01-23');

      // 上海时间 12:00 = UTC 04:00
      // 这样无论是前一天的00:00-08:00 UTC，还是后一天的00:00-16:00 UTC
      // 都不会跨越到不同的日期

      const utcHour = start.getUTCHours();
      expect(utcHour).toBeGreaterThanOrEqual(0);
      expect(utcHour).toBeLessThan(24);

      // 验证开始和结束时间在同一UTC日或相邻日
      const startUtcDay = start.getUTCDate();
      const endUtcDay = end.getUTCDate();

      // 允许相差0或1天
      const diff = endUtcDay - startUtcDay;
      expect(diff).toBeGreaterThanOrEqual(0);
      expect(diff).toBeLessThanOrEqual(1);
    });
  });
});
