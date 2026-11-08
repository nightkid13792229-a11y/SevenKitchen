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
