/**
 * Date Helpers
 * Utilities for date calculations, especially for work days and public holidays
 */

/**
 * Add work days to a date (excluding public holidays)
 * Note: Weekends are included as per requirements
 */
export function addWorkDays(startDate: Date, workDays: number): Date {
  const result = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < workDays) {
    result.setDate(result.getDate() + 1);
    // Only skip public holidays, not weekends
    if (!isPublicHoliday(result)) {
      daysAdded++;
    }
  }

  return result;
}

/**
 * Check if a date is a public holiday
 */
export async function isPublicHoliday(date: Date): Promise<boolean> {
  const holidays = await getPublicHolidaysForYear(date.getFullYear());
  return holidays.some(holiday =>
    holiday.date.getTime() === date.getTime()
  );
}

/**
 * Get public holidays for a year
 * Cached in memory to avoid repeated API calls
 */
const holidayCache = new Map<number, Array<{ date: Date; name: string }>>();

export async function getPublicHolidaysForYear(year: number): Promise<Array<{ date: Date; name: string }>> {
  // Check cache first
  if (holidayCache.has(year)) {
    return holidayCache.get(year)!;
  }

  try {
    // Call public holiday API
    const response = await fetch(`https://timor.tech/api/holiday/year/${year}`);
    const data = await response.json();

    if (data.holiday && Array.isArray(data.holiday)) {
      const holidays = data.holiday
        .filter((h: any) => h.holiday)
        .map((h: any) => ({
          date: new Date(h.date),
          name: h.name,
        }));

      // Cache the result
      holidayCache.set(year, holidays);
      return holidays;
    }
  } catch (error) {
    console.error('[DateHelpers] Failed to fetch public holidays:', error);
  }

  // Fallback: return empty array if API fails
  // In production, you might want to have a hardcoded list of major holidays
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
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}
