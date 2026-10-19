import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TimezoneUtil } from '../../utils/timezone.util';
import { SupplementShopConfigService } from './supplement-shop-config.service';
import { BusinessCalendarService } from './business-calendar.service';
import { SupplementInventoryService } from './supplement-inventory.service';

export type SupplementActorType = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';
export interface SupplementActor {
  type: SupplementActorType;
  id?: string | null;
}

const MAX_SCHEDULE_LOOKAHEAD_DAYS = 60;

/**
 * 补剂排期（2026-10-20）
 *
 * 规则：
 * - 付款时间（微信 success_time / 人工确认时间）早于当天截单 + 当天营业 + 未满产能 → 当天；
 * - 否则从下一个营业日开始找，直到有产能；
 * - 产能按订单数，补发单也计入，CANCELLED 不计；
 * - 管理员可超排，写入事件 metadata.overbook。
 *
 * 并发：Serializable + P2034 重试；count + update + event 同一事务。
 * 库存预占在 P2 接入，本阶段只落日期和事件。
 */
@Injectable()
export class SupplementSchedulingService {
  private readonly logger = new Logger(SupplementSchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: SupplementShopConfigService,
    private readonly calendar: BusinessCalendarService,
    private readonly inventory?: SupplementInventoryService,
  ) {}

  async resolvePackingDate(paidAt: Date, now = new Date()): Promise<Date> {
    const config = await this.configService.getConfig();
    const cutoff = config.dailyCutoffTime || '17:00';
    const capacity = Math.max(1, Number(config.dailyPackingCapacity) || 30);

    const today = TimezoneUtil.toShanghaiDateOnly(now);
    let paidDate = TimezoneUtil.toShanghaiDateOnly(paidAt);
    // 时钟偏差：付款时间晚于今天，按今天处理，不排到未来
    if (paidDate.getTime() > today.getTime()) {
      paidDate = today;
    }

    let candidate = paidDate;
    if (paidDate.getTime() === today.getTime()) {
      if (!TimezoneUtil.isBeforeCutoff(paidAt, cutoff)) {
        candidate = TimezoneUtil.addDays(today, 1);
      }
    } else {
      candidate = today;
    }

    for (let i = 0; i < MAX_SCHEDULE_LOOKAHEAD_DAYS; i += 1) {
      if (await this.calendar.isOpen(candidate)) {
        const count = await this.countOrdersForDate(candidate);
        if (count < capacity) return candidate;
      }
      candidate = TimezoneUtil.addDays(candidate, 1);
    }

    throw new BadRequestException(
      `未来 ${MAX_SCHEDULE_LOOKAHEAD_DAYS} 天没有可分装的营业日/产能`,
    );
  }

  async countOrdersForDate(dateOnly: Date): Promise<number> {
    return this.prisma.supplementOrder.count({
      where: {
        packingDate: dateOnly,
        status: { not: 'CANCELLED' },
      },
    });
  }

  async scheduleOrder(
    orderId: string,
    actor: SupplementActor,
    opts: { allowOverbook?: boolean; reason?: string } = {},
  ): Promise<Date | null> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, packingDate: true, paidAt: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');
    if (order.status !== 'PAID') {
      throw new BadRequestException('只有已付款、未分装的订单可以排期');
    }
    if (order.packingDate) return order.packingDate;

    const config = await this.configService.getConfig();
    if (!config.autoScheduleEnabled && actor.type === 'SYSTEM') {
      return null;
    }

    const paidAt = order.paidAt ?? new Date();
    try {
      const packingDate = await this.resolvePackingDate(paidAt);
      return await this.applySchedule(orderId, packingDate, actor, opts);
    } catch (error) {
      await this.recordScheduleFailure(orderId, error, actor);
      throw error;
    }
  }

  async rescheduleOrder(
    orderId: string,
    dateOnly: Date,
    actor: SupplementActor,
    opts: { allowOverbook?: boolean; reason?: string } = {},
  ): Promise<Date> {
    const order = await this.prisma.supplementOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, packingDate: true },
    });
    if (!order) throw new NotFoundException('补剂订单不存在');
    if (order.status !== 'PAID') {
      throw new BadRequestException('只有已付款、未分装的订单可以改期');
    }
    if (!(await this.calendar.isOpen(dateOnly))) {
      throw new BadRequestException('目标日期是停发日/休息日，请先在营业日历打开');
    }
    if (order.packingDate?.getTime() === dateOnly.getTime()) {
      return dateOnly;
    }

    const config = await this.configService.getConfig();
    const capacity = Math.max(1, Number(config.dailyPackingCapacity) || 30);
    const count = await this.countOrdersForDate(dateOnly);
    if (count >= capacity && !opts.allowOverbook) {
      throw new BadRequestException(
        `目标日期已排 ${count}/${capacity} 单；如确需超排，请勾选允许超排并填原因`,
      );
    }

    return this.applySchedule(orderId, dateOnly, actor, opts, order.packingDate);
  }

  /**
   * 自动完成：SHIPPED 且发货满 autoCompleteDays。
   * 有未完结售后也照常完成；订单中心会同时显示“已完成 + 售后中”。
   */
  async autoCompleteShippedOrders(limit = 200): Promise<number> {
    const config = await this.configService.getConfig();
    const days = Math.max(0, Number(config.autoCompleteDays) || 0);
    if (days <= 0) return 0;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const orders = await this.prisma.supplementOrder.findMany({
      where: {
        status: 'SHIPPED',
        shippedAt: { not: null, lte: cutoff },
      },
      select: { id: true, shippedAt: true },
      take: limit,
      orderBy: { shippedAt: 'asc' },
    });

    let completed = 0;
    for (const order of orders) {
      const updated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.supplementOrder.updateMany({
          where: { id: order.id, status: 'SHIPPED' },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        if (result.count !== 1) return false;
        await tx.supplementOrderEvent.create({
          data: {
            orderId: order.id,
            type: 'COMPLETED',
            fromValue: 'SHIPPED',
            toValue: 'COMPLETED',
            actorType: 'SYSTEM',
            reason: `发货后 ${days} 天自动完成`,
          },
        });
        return true;
      });
      if (updated) completed += 1;
    }
    return completed;
  }

  /** 支付成功但排期失败/自动排期关闭的订单：定时重试 */
  async retryUnscheduledOrders(limit = 50): Promise<number> {
    const rows = await this.prisma.supplementOrder.findMany({
      where: { status: 'PAID', packingDate: null },
      select: { id: true },
      take: limit,
      orderBy: { paidAt: 'asc' },
    });

    let scheduled = 0;
    for (const row of rows) {
      try {
        const date = await this.scheduleOrder(row.id, { type: 'SYSTEM' });
        if (date) scheduled += 1;
      } catch (error) {
        this.logger.warn(
          `[SupplementScheduling] retry failed order=${row.id}: ${
            (error as Error).message
          }`,
        );
      }
    }
    return scheduled;
  }

  private async applySchedule(
    orderId: string,
    packingDate: Date,
    actor: SupplementActor,
    opts: { allowOverbook?: boolean; reason?: string },
    previousDate?: Date | null,
  ): Promise<Date> {
    const attempt = async () =>
      this.prisma.$transaction(
        async (tx) => {
          const config = await this.configService.getConfig();
          const capacity = Math.max(
            1,
            Number(config.dailyPackingCapacity) || 30,
          );
          const count = await tx.supplementOrder.count({
            where: {
              packingDate,
              status: { not: 'CANCELLED' },
              ...(previousDate ? { id: { not: orderId } } : {}),
            },
          });
          if (count >= capacity && !opts.allowOverbook) {
            throw new BadRequestException(
              `目标日期已排 ${count}/${capacity} 单；如确需超排，请勾选允许超排并填原因`,
            );
          }

          const updated = await tx.supplementOrder.updateMany({
            where: { id: orderId, status: 'PAID' },
            data: {
              packingDate,
              packingDateSource: actor.type === 'ADMIN' ? 'ADMIN' : 'AUTO',
            },
          });
          if (updated.count !== 1) {
            throw new BadRequestException('订单状态已变化，排期未生效');
          }

          await this.inventory?.reserveForOrder(tx, orderId, packingDate);

          await tx.supplementOrderEvent.create({
            data: {
              orderId,
              type: previousDate ? 'RESCHEDULED' : 'SCHEDULED',
              fromValue: previousDate
                ? TimezoneUtil.shanghaiDateKey(previousDate)
                : null,
              toValue: TimezoneUtil.shanghaiDateKey(packingDate),
              actorType: actor.type,
              actorId: actor.id ?? null,
              reason: opts.reason?.trim() || null,
              metadata:
                count >= capacity
                  ? ({ overbook: true, capacity, count } as Prisma.InputJsonValue)
                  : undefined,
            },
          });

          return packingDate;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

    let lastError: unknown;
    for (let i = 0; i < 3; i += 1) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
        if (!this.isSerializationConflict(error)) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, [20, 50, 100][i] ?? 100),
        );
      }
    }
    throw lastError;
  }

  private async recordScheduleFailure(
    orderId: string,
    error: unknown,
    actor: SupplementActor,
  ): Promise<void> {
    try {
      await this.prisma.supplementOrderEvent.create({
        data: {
          orderId,
          type: 'SCHEDULE_FAILED',
          actorType: actor.type,
          actorId: actor.id ?? null,
          reason: (error as Error)?.message?.slice(0, 500) || '排期失败',
        },
      });
    } catch (writeError) {
      this.logger.warn(
        `[SupplementScheduling] failed to record SCHEDULE_FAILED order=${orderId}: ${
          (writeError as Error).message
        }`,
      );
    }
  }

  private isSerializationConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }
}
