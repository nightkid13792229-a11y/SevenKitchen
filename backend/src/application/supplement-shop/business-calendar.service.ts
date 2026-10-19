import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';

/**
 * 公司营业日历（补剂排期用）
 *
 * 复用定制食谱的 `custom_recipe_schedule` / `custom_recipe_weekday_rule`：
 * - 具体某天优先；
 * - 再看星期规则；
 * - 都没有 = 默认营业。
 *
 * ⚠️ 刻意**不看**定制容量（capacity/bookedCount/deliveryCapacity）：
 * 定制名额满了不等于公司关门；补剂产能按订单数单独算。
 */
@Injectable()
export class BusinessCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async isOpen(dateOnly: Date): Promise<boolean> {
    const override = await this.prisma.customRecipeSchedule.findUnique({
      where: { date: dateOnly },
      select: { isAvailable: true, isPublicHoliday: true },
    });
    if (override) {
      return override.isAvailable && !override.isPublicHoliday;
    }

    const rule = await this.prisma.customRecipeWeekdayRule.findUnique({
      where: { weekday: TimezoneUtil.weekday(dateOnly) },
      select: { isOpen: true },
    });
    if (rule) {
      return rule.isOpen;
    }

    return true;
  }

  async nextOpen(dateOnly: Date): Promise<Date> {
    let cursor = dateOnly;
    for (let i = 0; i < 366; i += 1) {
      if (await this.isOpen(cursor)) return cursor;
      cursor = TimezoneUtil.addDays(cursor, 1);
    }
    throw new Error('未来 366 天没有营业日');
  }
}
