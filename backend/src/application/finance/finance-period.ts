import { BadRequestException } from '@nestjs/common';
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
 *
 * - `from` 早于起账日时抬到起账日；`to` 晚于今天时收到今天结束。
 * - 整段落在起账日之前：直接报错（起账日之前不统计），不返回空区间——
 *   否则闭区间查询会把 11-01 零点整的那一刻数据带进「查 10 月」的结果里。
 * - 反向输入（from 晚于 to）：报错，不静默造区间。
 */
export function resolvePeriod(
  from?: string,
  to?: string,
  now: Date = new Date(),
): FinancePeriod {
  const startFloor = startOfShanghaiDay(FINANCE_START_DATE);
  const nowEnd = endOfShanghaiDay(TimezoneUtil.shanghaiDateKey(now));

  const requestedFrom = from
    ? startOfShanghaiDay(parseDayKey(from))
    : TimezoneUtil.startOfShanghaiMonth(now);
  const requestedTo = to ? endOfShanghaiDay(parseDayKey(to)) : nowEnd;

  if (requestedTo.getTime() < startFloor.getTime()) {
    throw new BadRequestException(`起账日（${FINANCE_START_DATE}）之前不统计`);
  }
  if (requestedFrom.getTime() > requestedTo.getTime()) {
    throw new BadRequestException('开始日期不能晚于结束日期');
  }

  const upperBound = Math.max(nowEnd.getTime(), startFloor.getTime());
  const clamp = (time: number) =>
    Math.min(Math.max(time, startFloor.getTime()), upperBound);

  return {
    from: new Date(clamp(requestedFrom.getTime())),
    to: new Date(clamp(requestedTo.getTime())),
  };
}

/**
 * 某个月（`YYYY-MM`）的整月区间：1 日 00:00 ~ 月末 23:59:59.999（上海时间）。
 * 起账日之前的月份没有可统计的数据，直接报错而不是返回倒挂区间。
 */
export function monthRange(month: string): FinancePeriod {
  const match = /^(\d{4})-(\d{2})$/.exec((month || '').trim());
  if (!match) throw new BadRequestException('月份必须是 YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new BadRequestException('月份不合法');
  }

  const prefix = `${match[1]}-${match[2]}`;
  // Date.UTC 的 day=0 是上个月最后一天，正好得到本月天数
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const startFloor = startOfShanghaiDay(FINANCE_START_DATE);
  const to = endOfShanghaiDay(`${prefix}-${String(lastDay).padStart(2, '0')}`);
  if (to.getTime() < startFloor.getTime()) {
    throw new BadRequestException(
      `起账日（${FINANCE_START_DATE}）之前的月份不统计`,
    );
  }

  const from = startOfShanghaiDay(`${prefix}-01`);
  return {
    from: from.getTime() < startFloor.getTime() ? startFloor : from,
    to,
  };
}

/**
 * 某个月的 date-only 区间（UTC 零点）。
 *
 * 给 `@db.Date` 字段用：`expense_bill.recognition_start` 存的是 UTC 零点，
 * 用上海时区的 `monthRange` 去卡边界会把上个月最后一天的旧数据也带进来。
 * 返回 `[start, endExclusive)`，正好避开月末最后一天 23:59 的边界歧义。
 */
export type MonthDateOnlyRange = {
  monthKey: string;
  year: number;
  month: number;
  /** 该月天数 */
  daysInMonth: number;
  /** 该月 1 日 00:00（UTC 零点） */
  start: Date;
  /** 下月 1 日 00:00（UTC 零点，开区间上界） */
  endExclusive: Date;
};

export function monthDateOnlyRange(month: string): MonthDateOnlyRange {
  const match = /^(\d{4})-(\d{2})$/.exec((month || '').trim());
  if (!match) throw new BadRequestException('月份必须是 YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new BadRequestException('月份不合法');
  }

  return {
    monthKey: `${match[1]}-${match[2]}`,
    year,
    month: monthNumber,
    daysInMonth: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    endExclusive: new Date(Date.UTC(year, monthNumber, 1)),
  };
}
