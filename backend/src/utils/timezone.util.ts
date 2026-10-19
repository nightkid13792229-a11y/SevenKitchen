/**
 * 时区处理工具类
 * 统一使用上海时区（Asia/Shanghai, UTC+8）进行业务逻辑判断
 * 数据库和API继续使用UTC时间
 */
export class TimezoneUtil {
  /**
   * 获取上海时区当前小时数（0-23）
   * 用于业务逻辑判断（如制作日期计算）
   */
  static getShanghaiHour(): number {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const shanghaiHour = (utcHour + 8) % 24;
    return shanghaiHour;
  }

  /**
   * 判断当前上海时间是否在指定时间范围内
   * @param startHour 开始小时（0-23）
   * @param endHour 结束小时（0-23）
   */
  static isShanghaiTimeInRange(startHour: number, endHour: number): boolean {
    const hour = this.getShanghaiHour();
    if (startHour < endHour) {
      return hour >= startHour && hour < endHour;
    } else {
      // 跨午夜的情况（如 22:00 - 06:00）
      return hour >= startHour || hour < endHour;
    }
  }

  /**
   * 根据上海时区计算制作日期
   * 规则：0-6点当日制作，6-24点次日制作
   * 返回的是UTC日期对象
   */
  static calculateProductionDate(): Date {
    const hour = this.getShanghaiHour();
    const now = new Date();

    if (hour >= 0 && hour < 6) {
      // 0-6点：当日制作（返回UTC日期）
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    } else {
      // 6-24点：次日制作（返回UTC日期）
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
      );
    }
  }

  /**
   * 将UTC日期转换为上海时区的日期部分（YYYY-MM-DD格式）
   * 用于健康记录等纯日期字段的转换
   */
  static toShanghaiDateString(utcDate: Date): string {
    // 转换为上海时区
    const shanghaiTime = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
    const year = shanghaiTime.getUTCFullYear();
    const month = String(shanghaiTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(shanghaiTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取上海时区的当前时间（Date对象）
   */
  static getShanghaiTime(): Date {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000);
  }

  /**
   * 把任意时间转成“上海日历日”的 date-only（UTC 零点）。
   * 用于 @db.Date 字段：数据库里存 UTC 零点，语义是上海那一天。
   */
  static toShanghaiDateOnly(input: Date): Date {
    const shanghai = new Date(input.getTime() + 8 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(
        shanghai.getUTCFullYear(),
        shanghai.getUTCMonth(),
        shanghai.getUTCDate(),
      ),
    );
  }

  /** YYYY-MM-DD（上海日历日） */
  static shanghaiDateKey(input: Date): string {
    return this.toShanghaiDateOnly(input).toISOString().slice(0, 10);
  }

  /** 解析 YYYY-MM-DD 为 date-only（UTC 零点）；非法格式抛错 */
  static parseDateOnly(input: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((input || '').trim());
    if (!match) throw new Error('日期必须是 YYYY-MM-DD');
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new Error('日期不合法');
    }
    return date;
  }

  static addDays(dateOnly: Date, days: number): Date {
    return new Date(dateOnly.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** 0 = 周日 … 6 = 周六；date-only 必须用 UTC 方法，避免本地时区偏移 */
  static weekday(dateOnly: Date): number {
    return dateOnly.getUTCDay();
  }

  /** 上海时间当天第几分钟（0–1439） */
  static minutesOfDayInShanghai(input: Date): number {
    const shanghai = new Date(input.getTime() + 8 * 60 * 60 * 1000);
    return shanghai.getUTCHours() * 60 + shanghai.getUTCMinutes();
  }

  /** 是否早于截单时间 HH:mm（HH:mm 非法时抛错） */
  static isBeforeCutoff(input: Date, cutoff: string): boolean {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((cutoff || '').trim());
    if (!match) throw new Error('截单时间必须是 HH:mm');
    const cutoffMinutes = Number(match[1]) * 60 + Number(match[2]);
    return this.minutesOfDayInShanghai(input) < cutoffMinutes;
  }
}
