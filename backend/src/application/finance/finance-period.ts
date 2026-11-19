import { TimezoneUtil } from '../../utils/timezone.util';

/**
 * 财务口径的期间工具
 *
 * 一律按上海时区（UTC+8）切日、切月：边界用
 * `YYYY-MM-DDT00:00:00+08:00` / `YYYY-MM-DDT23:59:59.999+08:00` 构造，
 * 与 `src/utils/timezone.util.ts` 的既有做法保持一致（数据库与 API 继续用 UTC 时刻）。
 */

/** 起账日（上海日历日）：早于该日的查询区间一律裁到该日 */
export const FINANCE_START_DATE = '2026-11-01';

export type FinancePeriod = { from: Date; to: Date };

/** 上海某一天 00:00（返回 UTC 时刻） */
function startOfShanghaiDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

/** 上海某一天 23:59:59.999（返回 UTC 时刻） */
function endOfShanghaiDay(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999+08:00`);
}

/** 校验并返回 YYYY-MM-DD（格式与日期不合法时抛错） */
function parseDayKey(input: string): string {
  return TimezoneUtil.parseDateOnly(input).toISOString().slice(0, 10);
}

/**
 * 解析查询区间；缺省为「本月 1 日 ~ 今天」。
 * `from` 早于起账日时裁到起账日；`to` 缺省为今天结束（上海时间 23:59:59.999）。
 */
export function resolvePeriod(
  from?: string,
  to?: string,
  now: Date = new Date(),
): FinancePeriod {
  const startFloor = startOfShanghaiDay(FINANCE_START_DATE);
  const defaultFrom = TimezoneUtil.startOfShanghaiMonth(now);
  const resolvedFrom = from
    ? startOfShanghaiDay(parseDayKey(from))
    : defaultFrom;
  const resolvedTo = to
    ? endOfShanghaiDay(parseDayKey(to))
    : endOfShanghaiDay(TimezoneUtil.shanghaiDateKey(now));

  return {
    from: new Date(Math.max(resolvedFrom.getTime(), startFloor.getTime())),
    to: resolvedTo,
  };
}

/**
 * 某个月（`YYYY-MM`）的整月区间：1 日 00:00 ~ 月末 23:59:59.999（上海时间）。
 * 早于起账日的月份把 `from` 裁到起账日。
 */
export function monthRange(month: string): FinancePeriod {
  const match = /^(\d{4})-(\d{2})$/.exec((month || '').trim());
  if (!match) throw new Error('月份必须是 YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error('月份不合法');

  const prefix = `${match[1]}-${match[2]}`;
  // Date.UTC 的 day=0 是上个月最后一天，正好得到本月天数
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const startFloor = startOfShanghaiDay(FINANCE_START_DATE);
  const from = startOfShanghaiDay(`${prefix}-01`);

  return {
    from: from.getTime() < startFloor.getTime() ? startFloor : from,
    to: endOfShanghaiDay(`${prefix}-${String(lastDay).padStart(2, '0')}`),
  };
}
