/**
 * 成品鲜食「预约制作日期」的准入规则。
 *
 * 老板 2026-11-08 定：
 *   - 顾客仍按老规矩：每天早上 6 点前下单可约当天，6 点起最早次日制作；
 *   - 管理员 / 客服代客下单可以把制作日期定在今天。
 *
 * 单独放一个纯函数，下单、代客下单、顾客改期三条路共用同一套判断，
 * 避免前端限制住了、后端却还能被绕过。
 */
import { BadRequestException } from '@nestjs/common';
import { TimezoneUtil } from '../../utils/timezone.util';

export type ProductionDateActorRole = 'customer' | 'staff' | 'admin';

/** 制作日期最多可预约到 90 天后（沿用原有上限） */
const MAX_PRODUCTION_DATE_DAYS = 90;

/**
 * 把接口收到的原始日期字符串解析成 Date。
 *
 * 为什么要单独做：`new Date('2026-02-30')` 会被 JavaScript 自动滚到 3 月 2 日，
 * 直接进 service 的话“非法日期”会变成另一个合法日期，顾客/客服看到的日期就变了。
 * 所以 YYYY-MM-DD 走严格按上海日历日解析；完整 ISO 时间串再交给 Date。
 */
export function parseProductionDateInput(
  value: string | null | undefined,
): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    try {
      return TimezoneUtil.parseDateOnly(text);
    } catch {
      throw new BadRequestException('制作日期不合法');
    }
  }

  // 完整 ISO 时间串：先严格校验日期部分，避免 2026-02-30 被 Date 自动滚到 3 月
  const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(text);
  if (isoDateMatch) {
    try {
      TimezoneUtil.parseDateOnly(
        `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`,
      );
    } catch {
      throw new BadRequestException('制作日期不合法');
    }
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('制作日期不合法');
  }
  return parsed;
}

/**
 * 把用户提交的日期归一化为「上海日历日」的 date-only，并校验是否可预约。
 *
 * @param requested 用户提交的制作日期；为空表示不指定（代客下单允许）
 * @param actorRole 下单人角色；只有 customer 受早上 6 点规则限制
 * @param now       当前时刻；测试时注入固定时间
 * @returns date-only（UTC 零点，语义是上海日历日）；未提交日期时返回 null
 * @throws BadRequestException 日期早于今天、顾客 6 点后选今天、或超过 90 天
 */
export function resolveDraftProductionDate(
  requested: Date | null | undefined,
  actorRole: ProductionDateActorRole = 'customer',
  now: Date = new Date(),
): Date | null {
  if (!requested) {
    return null;
  }

  if (Number.isNaN(requested.getTime())) {
    throw new BadRequestException('制作日期不合法');
  }

  const dateOnly = TimezoneUtil.toShanghaiDateOnly(requested);
  const today = TimezoneUtil.toShanghaiDateOnly(now);

  if (dateOnly < today) {
    throw new BadRequestException('制作日期不能早于今天');
  }

  if (actorRole === 'customer') {
    const earliest = TimezoneUtil.getEarliestCustomerProductionDate(now);
    if (dateOnly < earliest) {
      throw new BadRequestException(
        '每天早上 6 点后下单，最早只能预约次日制作；需要当天制作请联系客服',
      );
    }
  }

  const maxDate = TimezoneUtil.addDays(today, MAX_PRODUCTION_DATE_DAYS);
  if (dateOnly > maxDate) {
    throw new BadRequestException('制作日期不能超过90天后');
  }

  return dateOnly;
}
