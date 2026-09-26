/**
 * Date Helpers
 * Utilities for date calculations, especially for work days and public holidays
 */

/** 第三方节假日接口的超时（毫秒）：排期是主流程，不能被外部接口拖死 */
const HOLIDAY_FETCH_TIMEOUT_MS = 3000;

/**
 * Add work days to a date (excluding public holidays)
 * Note: Weekends are included as per requirements
 *
 * ⚠️ 必须是 async 且 `await isPublicHoliday(...)`。
 * 历史上这里漏了 await：`!isPublicHoliday(result)` 里 isPublicHoliday 返回的是
 * Promise（恒为真），于是 `!Promise` 恒为 false、`daysAdded` 永远不增加 ——
 * **死循环**。后果是任何一次"提交定制订单"都会把 Node 事件循环锁死、
 * Promise 无限堆积直到进程 OOM 崩溃（实测进程涨到 2GB 后被杀）。
 */
export async function addWorkDays(
  startDate: Date,
  workDays: number,
): Promise<Date> {
  const result = new Date(startDate);
  let daysAdded = 0;
  // 天花板保护：即使节假日数据异常，也不会把请求拖死
  const maxIterations = workDays + 400;
  let iterations = 0;

  while (daysAdded < workDays && iterations < maxIterations) {
    iterations++;
    result.setDate(result.getDate() + 1);
    // Only skip public holidays, not weekends
    if (!(await isPublicHoliday(result))) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * 按**本地日历日**归一化成 YYYY-MM-DD。
 *
 * 不能用 getTime() 比：new Date('2026-10-13')（UTC 零点）与本地零点算出来的
 * 毫秒数不同，节假日永远匹配不上。
 */
function toLocalDayKey(date: Date): string {
  return formatDateToYYYYMMDD(date);
}

export interface PublicHoliday {
  date: Date;
  /** 归一化后的 YYYY-MM-DD，用于跨时区稳定比较 */
  dateKey: string;
  name: string;
}

/**
 * Check if a date is a public holiday
 */
export async function isPublicHoliday(date: Date): Promise<boolean> {
  const holidays = await getPublicHolidaysForYear(date.getFullYear());
  const dayKey = toLocalDayKey(date);
  return holidays.some((holiday) => holiday.dateKey === dayKey);
}

/**
 * Get public holidays for a year
 * Cached in memory to avoid repeated API calls
 */
const holidayCache = new Map<number, PublicHoliday[]>();

export async function getPublicHolidaysForYear(
  year: number,
): Promise<PublicHoliday[]> {
  // Check cache first
  if (holidayCache.has(year)) {
    return holidayCache.get(year)!;
  }

  try {
    // ⚠️ 必须带超时。这是第三方公开接口（timor.tech），
    // 没有超时的话对方一慢，整条"提交定制订单"就会一直挂在网络上。
    // 排期是主流程，不能被一个外部接口的可达性决定生死。
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      HOLIDAY_FETCH_TIMEOUT_MS,
    );

    let data: any;
    try {
      const response = await fetch(
        `https://timor.tech/api/holiday/year/${year}`,
        { signal: controller.signal },
      );
      data = await response.json();
    } finally {
      clearTimeout(timeoutId);
    }

    /**
     * ⚠️ timor.tech 的 `holiday` 是 **以 MM-DD 为键的对象**，不是数组。
     * 原实现只判断 `Array.isArray(data.holiday)`，因此永远进不来 ——
     * 节假日实际上从未生效过（配置里的"顺延公众假期"是空话）。
     * 这里兼容对象与数组两种形状，并按 `holiday === true` 过滤掉调休补班日。
     */
    const raw = data?.holiday;
    const entries: any[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw)
        : [];

    const holidays: PublicHoliday[] = entries
      .filter(
        (h: any) =>
          h && h.holiday === true && typeof h.date === 'string' && h.date,
      )
      .map((h: any) => {
        const dateKey = String(h.date).slice(0, 10);
        return {
          date: new Date(`${dateKey}T00:00:00`),
          dateKey,
          name: String(h.name ?? ''),
        };
      });

    // Cache the result
    holidayCache.set(year, holidays);
    return holidays;
  } catch (error) {
    console.error('[DateHelpers] Failed to fetch public holidays:', error);
  }

  // Fallback: return empty array if API fails or times out.
  // 缓存空结果，避免每次下单都去撞一遍不可达的接口。
  holidayCache.set(year, []);
  return [];
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD string to Date
 */
export function parseYYYYMMDD(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the week number of the year
 */
export function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Get start of month
 */
export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get end of month
 */
export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get month range
 */
export function getMonthRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}
