/**
 * 统一的日期处理工具类
 * 解决时区转换问题，提供一致的日期处理API
 *
 * **设计原则：**
 * 1. 所有"日期"（如制作日期、采购日期）使用中午12点作为基准
 * 2. 避免00:00:00的跨天问题（UTC时区转换）
 * 3. 统一查询范围，确保不同模块结果一致
 *
 * **为什么选择中午12点？**
 * - 上海时间 2026-01-23 12:00:00 = UTC 2026-01-23 04:00:00
 * - 无论是前一天还是后一天，UTC时间仍是同一天（00:00-16:00）
 * - 查询范围稳定：T12:00:00 到次日 T12:00:00
 *
 * **使用示例：**
 * ```typescript
 * // 查询1月23号的订单
 * const { start, end } = DateUtil.createDateRange('2026-01-23');
 * const orders = await orderRepo.find({ targetDate: { gte: start, lte: end } });
 *
 * // 判断某个日期是否是今天
 * const isToday = DateUtil.isToday(someDate);
 *
 * // 格式化日期为 YYYY-MM-DD
 * const dateStr = DateUtil.formatDate(new Date());
 * ```
 */

export class DateUtil {
  /**
   * 创建日期查询范围（用于数据库查询）
   *
   * **说明：**
   * - 开始时间：指定日期的中午12点（本地时间）
   * - 结束时间：次日的中午12点（本地时间）
   * - 这样确保查询覆盖完整的24小时，避免时区转换导致的日期偏差
   *
   * **示例：**
   * ```typescript
   * const { start, end } = DateUtil.createDateRange('2026-01-23');
   * // start: 2026-01-23 12:00:00 本地时间 = 2026-01-23 04:00:00 UTC
   * // end:   2026-01-24 12:00:00 本地时间 = 2026-01-24 04:00:00 UTC
   * ```
   *
   * @param dateStr 日期字符串，格式：YYYY-MM-DD
   * @returns 开始和结束时间（Date对象）
   */
  static createDateRange(dateStr: string): { start: Date; end: Date } {
    const start = new Date(`${dateStr}T12:00:00`);
    const end = new Date(`${dateStr}T12:00:00`);
    end.setDate(end.getDate() + 1);

    return { start, end };
  }

  /**
   * 创建今日的日期查询范围
   *
   * **说明：**
   * - 基于当前系统时间的本地日期
   * - 返回今天 00:00:00 到 23:59:59.999 的范围（使用中午12点逻辑）
   *
   * **示例：**
   * ```typescript
   * const { start, end } = DateUtil.createTodayRange();
   * // 如果今天是 2026-01-23
   * // start: 2026-01-23 12:00:00 本地时间
   * // end:   2026-01-24 12:00:00 本地时间
   * ```
   *
   * @returns 今日的开始和结束时间（Date对象）
   */
  static createTodayRange(): { start: Date; end: Date } {
    const today = new Date();
    const dateStr = this.formatDate(today);
    return this.createDateRange(dateStr);
  }

  /**
   * 格式化日期为 YYYY-MM-DD 字符串
   *
   * **说明：**
   * - 使用本地时区进行格式化
   * - 不受UTC时区影响
   *
   * **示例：**
   * ```typescript
   * const date = new Date('2026-01-23T15:30:00');
   * const dateStr = DateUtil.formatDate(date); // '2026-01-23'
   * ```
   *
   * @param date Date对象
   * @returns YYYY-MM-DD 格式的字符串
   */
  static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 判断给定日期是否是今天
   *
   * **说明：**
   * - 使用本地时区进行比较
   * - 只比较日期部分，不比较时间
   *
   * **示例：**
   * ```typescript
   * const now = new Date();
   * DateUtil.isToday(now); // true
   *
   * const yesterday = new Date();
   * yesterday.setDate(yesterday.getDate() - 1);
   * DateUtil.isToday(yesterday); // false
   * ```
   *
   * @param date Date对象
   * @returns 是否是今天
   */
  static isToday(date: Date): boolean {
    const today = this.formatDate(new Date());
    const target = this.formatDate(date);
    return today === target;
  }

  /**
   * 获取日期的开始时间（中午12点）
   *
   * **说明：**
   * - 返回指定日期的中午12:00:00
   * - 用于查询的起始时间
   *
   * **示例：**
   * ```typescript
   * const start = DateUtil.getStartOfDay('2026-01-23');
   * // 2026-01-23 12:00:00 本地时间
   * ```
   *
   * @param dateStr 日期字符串，格式：YYYY-MM-DD
   * @returns 中午12点的Date对象
   */
  static getStartOfDay(dateStr: string): Date {
    return new Date(`${dateStr}T12:00:00`);
  }

  /**
   * 获取日期的结束时间（次日中午12点）
   *
   * **说明：**
   * - 返回次日的中午12:00:00
   * - 用于查询的结束时间
   *
   * **示例：**
   * ```typescript
   * const end = DateUtil.getEndOfDay('2026-01-23');
   * // 2026-01-24 12:00:00 本地时间
   * ```
   *
   * @param dateStr 日期字符串，格式：YYYY-MM-DD
   * @returns 次日中午12点的Date对象
   */
  static getEndOfDay(dateStr: string): Date {
    const end = new Date(`${dateStr}T12:00:00`);
    end.setDate(end.getDate() + 1);
    return end;
  }

  /**
   * 为数据库查询创建时间范围（使用ISO 8601格式）
   *
   * **说明：**
   * - 直接使用ISO字符串进行查询，避免Date对象转换
   * - 适用于Prisma等ORM的原始查询
   *
   * **示例：**
   * ```typescript
   * const { startDate, endDate } = DateUtil.createDateRangeForDB('2026-01-23');
   * const orders = await prisma.order.findMany({
   *   where: {
   *     targetDate: {
   *       gte: new Date(startDate),
   *       lte: new Date(endDate)
   *     }
   *   }
   * });
   * ```
   *
   * @param dateStr 日期字符串，格式：YYYY-MM-DD
   * @returns ISO 8601格式的开始和结束时间字符串
   */
  static createDateRangeForDB(dateStr: string): {
    startDate: string;
    endDate: string;
  } {
    const { start, end } = this.createDateRange(dateStr);
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }

  /**
   * 比较两个日期是否是同一天
   *
   * **说明：**
   * - 使用本地时区比较日期部分
   * - 忽略时间部分
   *
   * **示例：**
   * ```typescript
   * const date1 = new Date('2026-01-23T10:00:00');
   * const date2 = new Date('2026-01-23T18:30:00');
   * DateUtil.isSameDay(date1, date2); // true
   *
   * const date3 = new Date('2026-01-24T10:00:00');
   * DateUtil.isSameDay(date1, date3); // false
   * ```
   *
   * @param date1 第一个日期
   * @param date2 第二个日期
   * @returns 是否是同一天
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return this.formatDate(date1) === this.formatDate(date2);
  }

  /**
   * 添加天数到指定日期
   *
   * **说明：**
   * - 返回添加天数后的新Date对象
   * - 不修改原Date对象
   *
   * **示例：**
   * ```typescript
   * const date = new Date('2026-01-23T12:00:00');
   * const nextDay = DateUtil.addDays(date, 1);
   * // nextDay: 2026-01-24T12:00:00
   * ```
   *
   * @param date 原始日期
   * @param days 要添加的天数（可为负数）
   * @returns 新的Date对象
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * 验证日期字符串格式
   *
   * **说明：**
   * - 检查是否为有效的 YYYY-MM-DD 格式
   * - 检查日期是否真实存在（如2月30日会返回false）
   *
   * **示例：**
   * ```typescript
   * DateUtil.isValidDateString('2026-01-23'); // true
   * DateUtil.isValidDateString('2026/01/23'); // false
   * DateUtil.isValidDateString('invalid');    // false
   * DateUtil.isValidDateString('2026-02-30'); // false (2月没有30日)
   * ```
   *
   * @param dateStr 日期字符串
   * @returns 是否有效
   */
  static isValidDateString(dateStr: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) {
      return false;
    }

    // 检查日期格式是否正确
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    // 验证月份范围
    if (month < 1 || month > 12) {
      return false;
    }

    // 验证日期范围
    const maxDaysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (day < 1 || day > maxDaysInMonth[month - 1]) {
      return false;
    }

    // 验证2月29日只存在于闰年
    if (month === 2 && day === 29) {
      const isLeapYear =
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      if (!isLeapYear) {
        return false;
      }
    }

    // 最后使用 Date 对象验证
    const date = new Date(dateStr);
    // 检查 Date 对象是否解析为输入的日期
    // 如果日期无效，JavaScript 会自动调整（如 2026-02-30 变成 2026-03-02）
    const parsedYear = date.getFullYear();
    const parsedMonth = date.getMonth() + 1;
    const parsedDay = date.getDate();

    return parsedYear === year && parsedMonth === month && parsedDay === day;
  }
}
