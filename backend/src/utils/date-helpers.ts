/**
 * Date Helpers
 * Utilities for date calculations, especially for work days and public holidays
 */

/** 第三方节假日接口的超时（毫秒）：排期是主流程，不能被外部接口拖死 */
const HOLIDAY_FETCH_TIMEOUT_MS = 3000;

/**
 * Add work days to a date (excluding weekends and public holidays)
 *
 * 2026-10-05 老板拍板：**周末也跳过**（此前只跳公众假期，周末照算）。
 * 起因：定制页写着"约 3 个工作日"，算出来的交付日却可能落在周六 ——
 * 与"工作日"的叫法自相矛盾，生产端周末也不出货。
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
    // 周六 / 周日不算工作日
    if (isWeekend(result)) continue;
    // 公众假期也不算
    if (await isPublicHoliday(result)) continue;
    daysAdded++;
  }

  return result;
}

/** 周六或周日（按服务器本地日历，与 setDate 的推进口径一致） */
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
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

  /**
   * 上次失败过、且还没到重试时间 → 直接回空，不去撞接口。
   * （排期是主流程，不能被一个不可达的外部接口反复拖慢。）
   */
  const lastFailureAt = holidayFailureCache.get(year);
  if (lastFailureAt && Date.now() - lastFailureAt < HOLIDAY_RETRY_AFTER_MS) {
    return [];
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
    holidayFailureCache.delete(year);
    return holidays;
  } catch (error) {
    console.error('[DateHelpers] Failed to fetch public holidays:', error);
  }

  /**
   * 失败兜底（2026-10-18 改，对应附录 B #4「法定节假日兜底」）。
   *
   * ## 改之前是错的
   *
   * 原实现把**空结果永久写进 `holidayCache`** —— 接口只要在**第一次**调用时
   * 挂了（哪怕只是超时一次），那一年的节假日就**再也不会生效**，
   * 一直到进程重启。而"顺延公众假期"在配置里是打开着的 ——
   * 等于**静默失效**：老板以为在顺延，实际没有。
   *
   * ## 现在
   *
   * 失败**单独记时间**，`HOLIDAY_RETRY_AFTER_MS` 之后重试。
   * 这样：
   *   · 接口短暂抖动 → 几分钟后自动恢复，不用重启
   *   · 接口长期不可达 → 仍然不阻塞排期（每次只用一次失败标记，不撞接口）
   *
   * ## 为什么不内置一份节假日表
   *
   * 中国法定节假日**每年由国务院公布**，内置表必然过期；
   * 而且调休补班日每年都不一样，写死等于制造错误数据。
   */
  holidayFailureCache.set(year, Date.now());
  return [];
}

/**
 * 失败过的那一年什么时候可以重试。
 *
 * 与"成功缓存"分开：成功是永久的（同一年的节假日不会变），
 * 失败是临时的（接口可能只是刚才抖了一下）。
 */
const holidayFailureCache = new Map<number, number>();
const HOLIDAY_RETRY_AFTER_MS = 10 * 60 * 1000;

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
